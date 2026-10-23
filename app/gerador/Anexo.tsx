'use client';

import { useEffect, useRef, useState } from 'react';
import { nomeRede, type Clipping } from '@/lib/relatorio';
import { CabecalhoInterno, Rodape, COR_TOM, extrairId, rico, vazio } from './comum';
import { fatiarArquivo, type Fatia } from './fatiar';
import { anexoPendente, avisarRelatorio } from './avisos-cliente';

/**
 * Anexo de uma publicação: a página com os dados da matéria e o início do print, seguida de
 * quantas páginas de continuação forem necessárias para mostrar o print inteiro
 * ("Parte 2 de 3", "Parte 3 de 3"...). O print aparece como imagem, igual na tela e no PDF.
 *
 * Para a tela não ficar pesada, cada print só é baixado e convertido quando o anexo chega perto
 * da área visível (ou quando alguém clica em "Gerar Relatório Final"), no máximo 2 ao mesmo tempo.
 */

// no máximo 2 conversões simultâneas
let emAndamento = 0;
const fila: (() => void)[] = [];
async function naFila<T>(tarefa: () => Promise<T>): Promise<T> {
  if (emAndamento >= 2) await new Promise<void>(ok => fila.push(ok));
  emAndamento++;
  try { return await tarefa(); } finally { emAndamento--; fila.shift()?.(); }
}
interface Props { clip: Clipping; indice: number; total: number; linha: string; protagonismo: string; planilha: string }

function AreaPrint({ children, cheia, refArea }: { children: React.ReactNode; cheia?: boolean; refArea?: React.Ref<HTMLDivElement> }) {
  return (
    <div className={`area-print${cheia ? ' cheia' : ''}`} ref={refArea}>
      <svg aria-hidden="true"><rect rx="5.76" fill="none" stroke="#A9B5B9" strokeWidth=".99" strokeDasharray="3.97 2.98" /></svg>
      {children}
    </div>
  );
}

export default function Anexo({ clip, indice, total, linha, protagonismo, planilha }: Props) {
  const id = extrairId(clip.printUrl);
  const imprensa = clip.rede === 'imp';
  // linha verde só para imprensa (em rede social a rede já está na etiqueta roxa e a autoria na caixa abaixo)
  const linhaVerde = imprensa ? clip.veiculo : '';
  const [fatias, setFatias] = useState<Fatia[] | null>(null);
  const [erro, setErro] = useState('');
  const [carregar, setCarregar] = useState(false);
  const secaoRef = useRef<HTMLElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const contRef = useRef<HTMLDivElement>(null);
  const pedidoRef = useRef(false); // já entrou na contagem de pendentes
  const iniciadoRef = useRef(false); // o carregamento já foi disparado (só acontece uma vez)

  // começa a carregar quando o anexo chega perto da tela, ou quando o relatório vai ser gerado
  useEffect(() => {
    if (!id) return;
    const pedir = () => {
      if (iniciadoRef.current) return;
      iniciadoRef.current = true;
      pedidoRef.current = true; anexoPendente(+1);
      setCarregar(true);
    };
    const obs = new IntersectionObserver(e => { if (e.some(x => x.isIntersecting)) pedir(); }, { rootMargin: '1200px 0px' });
    if (secaoRef.current) obs.observe(secaoRef.current);
    window.addEventListener('gerar-relatorio', pedir);
    return () => { obs.disconnect(); window.removeEventListener('gerar-relatorio', pedir); };
  }, [id]);

  useEffect(() => {
    if (!id || !carregar) return;
    let vivo = true;
    let criadas: Fatia[] = [];
    (async () => {
      try {
        await (document.fonts?.ready ?? Promise.resolve());
        const a = areaRef.current, c = contRef.current;
        if (!a || !c) return;
        // proporção (altura/largura) das áreas de print; a imagem tem borda de ~1pt
        const prop = (el: HTMLElement) => (el.clientHeight - 4) / el.clientWidth;
        const f = await naFila(async () => {
          const res = await fetch(`/api/relatorios/file?id=${id}&download=true&planilha=${encodeURIComponent(planilha)}`);
          if (!res.ok) throw new Error(res.status === 404 ? 'arquivo não encontrado ou fora das planilhas do portal' : `o servidor respondeu ${res.status}`);
          const blob = await res.blob();
          if (!blob.type.startsWith('image/') && blob.type !== 'application/pdf') throw new Error(`formato não suportado (${blob.type || 'desconhecido'}); use PDF, PNG ou JPG`);
          return fatiarArquivo(blob, [prop(a), prop(c)]);
        });
        criadas = f;
        if (!f.length) throw new Error('o arquivo está em branco');
        if (vivo) setFatias(f);
      } catch (e) {
        const msg = (e as Error).message || 'erro desconhecido';
        if (vivo) setErro(msg);
        avisarRelatorio(`Anexo ${indice + 1} ("${clip.titulo.slice(0, 60)}"): não foi possível carregar o print (${msg}).`);
      } finally {
        if (pedidoRef.current) { pedidoRef.current = false; anexoPendente(-1); }
      }
    })();
    return () => { vivo = false; criadas.forEach(x => URL.revokeObjectURL(x.src)); };
  }, [id, carregar, indice, clip.titulo, planilha]);

  const partes = fatias?.length || 1;
  const posicao = (k: number) => `Publicação ${indice + 1} de ${total}${partes > 1 ? `  ·  Parte ${k} de ${partes}` : ''}`;
  const topo = (k: number) => (
    <div className="anexo-topo">
      <span className="anexo-topo-esq">
        <span className="pilula">{nomeRede(clip.rede)}</span>
        {clip.nova && <span className="selo-nova">Nova nesta edição</span>}
      </span>
      <span className="pos">{posicao(k)}</span>
    </div>
  );
  const continuacao = (k: number, conteudo: React.ReactNode, ref?: React.Ref<HTMLDivElement>) => (
    <>
      <CabecalhoInterno titulo="ANEXO · REGISTRO DE PUBLICAÇÃO" linha={linha} />
      <div className="corpo-anexo">
        {topo(k)}
        <div className="anexo-cont">{[linhaVerde || (imprensa ? '' : nomeRede(clip.rede)), clip.titulo].filter(Boolean).join(' · ')} <span>(continuação)</span></div>
        <AreaPrint cheia refArea={ref}>{conteudo}</AreaPrint>
      </div>
      <Rodape />
    </>
  );

  let conteudoInicial: React.ReactNode;
  if (!id) conteudoInicial = <div className="vazio"><b>{imprensa ? 'MATÉRIA NA ÍNTEGRA' : 'PUBLICAÇÃO NA ÍNTEGRA'}</b>Nenhum print na COLUNA PRINT da planilha.</div>;
  else if (erro) conteudoInicial = <div className="vazio"><b>PRINT NÃO CARREGADO</b>{`Não foi possível carregar o arquivo: ${erro}.`}</div>;
  else if (!fatias) conteudoInicial = <div className="vazio">{carregar ? 'Carregando o print…' : 'O print será carregado ao rolar até aqui ou ao gerar o relatório.'}</div>;
  else {
    // eslint-disable-next-line @next/next/no-img-element
    conteudoInicial = <img className={`fatia${fatias[0].reduzida ? ' reduzida' : ''}`} src={fatias[0].src} alt={`Print da publicação ${indice + 1}, parte 1`} />;
  }

  return (
    <>
      <section className="page" id={`clipping-page-${clip.idUnico}`} ref={secaoRef}>
        <CabecalhoInterno titulo="ANEXO · REGISTRO DE PUBLICAÇÃO" linha={linha} />
        <div className="corpo-anexo">
          {topo(1)}
          {/* linha verde: só imprensa (nome do veículo) */}
          {linhaVerde && <div className="veiculo">{linhaVerde}</div>}
          <div className="anexo-tit">{vazio(clip.titulo, '[Título da publicação]')}</div>
          <div className="meta3">
            <div><div className="k">PUBLICAÇÃO</div><div className="v">{vazio(clip.dataPost, '—')}</div></div>
            <div><div className="k">COLETA</div><div className="v">{vazio(clip.dataColeta, '—')}</div></div>
            <div><div className="k">AUTORIA</div><div className="v">{vazio(clip.autoria, '—')}</div></div>
          </div>
          <div className="tags">
            {protagonismo && <span style={{ borderColor: 'var(--petroleo)', color: 'var(--petroleo)' }}>Protagonismo: {protagonismo}</span>}
            {clip.tonalidade && <span style={{ borderColor: COR_TOM[clip.tom], color: COR_TOM[clip.tom] }}>Tonalidade: {clip.tonalidade}</span>}
          </div>
          <div className="resumo">
            <div className="rot">{`O que a ${imprensa ? 'matéria' : 'publicação'} diz sobre o Sicoob`}</div>
            <p>{rico(vazio(clip.trecho, '[Trecho sobre o Sicoob]'))}</p>
          </div>
          <AreaPrint cheia={!!fatias} refArea={areaRef}>{conteudoInicial}</AreaPrint>
        </div>
        <Rodape />
      </section>

      {fatias?.slice(1).map((f, k) => (
        <section className="page" key={k}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {continuacao(k + 2, <img className={`fatia${f.reduzida ? ' reduzida' : ''}`} src={f.src} alt={`Print da publicação ${indice + 1}, parte ${k + 2}`} />)}
        </section>
      ))}

      {/* folha invisível: mede a área de print das páginas de continuação */}
      {id && !fatias && !erro && <div className="folha-medida" aria-hidden="true">{continuacao(2, null, contRef)}</div>}
    </>
  );
}
