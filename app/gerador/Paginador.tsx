'use client';

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { avisarRelatorio } from './avisos-cliente';

/**
 * Distribui blocos de conteúdo em folhas A4, criando páginas de continuação quando não cabem.
 *
 * Blocos consecutivos do mesmo `grupo` são colocados juntos: 'tl' (linha do tempo),
 * 'tab' (linhas <tr> da tabela, com o cabeçalho repetido em cada página) e 'ul' (lista de gatilhos).
 *
 * Como funciona: tudo é desenhado uma vez numa folha invisível, a altura de cada bloco é
 * medida com as fontes reais e então os blocos são empacotados página a página.
 */

export interface Bloco {
  id: string;
  no: ReactNode;
  grupo?: 'tl' | 'tab' | 'ul';
  /** título: não fica sozinho no pé da página */
  manterComProximo?: boolean;
  /** nome da seção, usado no título "(continuação)" quando a seção quebra de página */
  secao?: string;
  /** primeiro bloco da seção (o próprio título) */
  inicioSecao?: boolean;
}

interface Props {
  /** elementos fixos de cada folha: fundo do cabeçalho, títulos, logo e rodapé */
  moldura: ReactNode;
  blocos: Bloco[];
  /** <colgroup> e linha <tr> de cabeçalho da tabela, repetidos em cada página */
  tabela?: { colgroup: ReactNode; cabecalho: ReactNode };
  nome: string;
}

export default function Paginador({ moldura, blocos, tabela, nome }: Props) {
  const [paginas, setPaginas] = useState<number[][] | null>(null);
  const medida = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    let cancelado = false;
    const medir = () => {
      const corpo = medida.current;
      if (!corpo || cancelado) return;
      const base = corpo.getBoundingClientRect().top;
      const els = blocos.map((_, i) => corpo.querySelector<HTMLElement>(`[data-i="${i}"]`));
      const topo = els.map((el, i) => {
        if (!el) return 0;
        const g = blocos[i].grupo;
        const primeiro = g && (i === 0 || blocos[i - 1].grupo !== g);
        const ref = primeiro ? (el.parentElement as HTMLElement) || el : el;
        return ref.getBoundingClientRect().top - base;
      });
      const ultimo = els[els.length - 1];
      const ultimoRef = ultimo && blocos[blocos.length - 1].grupo ? (ultimo.parentElement as HTMLElement) || ultimo : ultimo;
      const fim = ultimoRef ? Math.max(ultimoRef.getBoundingClientRect().bottom, ultimo!.getBoundingClientRect().bottom) - base : 0;
      const alt = topo.map((t, i) => (i + 1 < topo.length ? topo[i + 1] : fim) - t);
      const disponivel = corpo.clientHeight - 10; // folga para arredondamentos de linha
      const altCabTabela = corpo.querySelector('thead')?.getBoundingClientRect().height || 0;
      const altTitulo = (corpo.querySelector('.h2') as HTMLElement | null)?.getBoundingClientRect().height || 0;
      const extraInicio = (i: number) => {
        const b = blocos[i];
        let e = 0;
        if (b.grupo === 'tab' && i > 0 && blocos[i - 1].grupo === 'tab') e += altCabTabela;
        if (b.secao && !b.inicioSecao) e += altTitulo + 26; // título "(continuação)" + espaço até o conteúdo (px)
        return e;
      };

      const res: number[][] = [];
      let atual: number[] = [];
      let usado = 0;
      blocos.forEach((b, i) => {
        let precisa = alt[i];
        if (atual.length && b.manterComProximo && i + 1 < blocos.length) precisa += alt[i + 1];
        if (atual.length && usado + precisa > disponivel) {
          res.push(atual); atual = []; usado = extraInicio(i);
        } else if (!atual.length) {
          usado = extraInicio(i);
        }
        if (usado + alt[i] > disponivel) {
          avisarRelatorio(`${nome}: um bloco é maior que uma página inteira e foi cortado. Encurte o texto na planilha.`);
        }
        atual.push(i); usado += alt[i];
      });
      if (atual.length) res.push(atual);
      setPaginas(res);
    };
    // mede com as fontes definitivas carregadas
    (document.fonts?.ready ?? Promise.resolve()).then(() => requestAnimationFrame(medir));
    return () => { cancelado = true; };
  }, [blocos, nome]);

  // cada bloco ganha um invólucro com data-i, usado na medição
  const marcar = (i: number) => {
    const b = blocos[i];
    if (b.grupo === 'tab') return <tbody key={b.id} data-i={i}>{b.no}</tbody>;
    const classe = b.grupo === 'tl' ? 'tl-item' : b.grupo === 'ul' ? 'gat-item' : 'bloco';
    return <div key={b.id} data-i={i} className={classe}>{b.no}</div>;
  };

  const montar = (indices: number[], comContinuacao: boolean) => {
    const saida: ReactNode[] = [];
    const primeiro = blocos[indices[0]];
    if (comContinuacao && primeiro?.secao && !primeiro.inicioSecao) {
      saida.push(<div key="cont" className="h2">{primeiro.secao} <span className="cont">(continuação)</span></div>);
    }
    for (let k = 0; k < indices.length; ) {
      const g = blocos[indices[k]].grupo;
      if (!g) { saida.push(marcar(indices[k])); k++; continue; }
      const grupo: number[] = [];
      while (k < indices.length && blocos[indices[k]].grupo === g) grupo.push(indices[k++]);
      const filhos = grupo.map(marcar);
      if (g === 'tl') saida.push(<div key={`g${grupo[0]}`} className="tl">{filhos}</div>);
      else if (g === 'ul') saida.push(<div key={`g${grupo[0]}`} className="gat">{filhos}</div>);
      else saida.push(
        <table key={`g${grupo[0]}`} className="tab">
          {tabela?.colgroup}
          <thead>{tabela?.cabecalho}</thead>
          {filhos}
        </table>,
      );
    }
    return saida;
  };

  const todas = blocos.map((_, i) => i);
  const lista = paginas ?? [todas];

  return (
    <>
      {lista.map((indices, p) => (
        <section className="page" key={p}>
          {moldura}
          <div className="corpo">{montar(indices, p > 0)}</div>
        </section>
      ))}
      {/* folha invisível usada só para medir */}
      <div className="folha-medida" aria-hidden="true">
        <div className="corpo" ref={medida} style={{ height: '712.9pt', overflow: 'visible' }}>
          {montar(todas, false)}
        </div>
      </div>
    </>
  );
}
