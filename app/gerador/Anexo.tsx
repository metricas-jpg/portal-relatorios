'use client';

import { useEffect, useRef, useState } from 'react';
import { nomeRede, type Clipping } from '@/lib/relatorio';
import { CabecalhoInterno, Rodape, COR_TOM, extrairId, rico, vazio } from './comum';
import { fatiarArquivo } from './fatiar';
import { anexoPendente, avisarRelatorio } from './avisos-cliente';

/**
 * Anexo de uma publicação: a página com os dados da matéria e o início do print, seguida de
 * quantas páginas de continuação forem necessárias para mostrar o print inteiro
 * ("Parte 2 de 3", "Parte 3 de 3"...). O print aparece como imagem, igual na tela e no PDF.
 */
interface Props { clip: Clipping; indice: number; total: number; linha: string; protagonismo: string }

function AreaPrint({ children, cheia, refArea }: { children: React.ReactNode; cheia?: boolean; refArea?: React.Ref<HTMLDivElement> }) {
  return (
    <div className={`area-print${cheia ? ' cheia' : ''}`} ref={refArea}>
      <svg aria-hidden="true"><rect rx="5.76" fill="none" stroke="#A9B5B9" strokeWidth=".99" strokeDasharray="3.97 2.98" /></svg>
      {children}
    </div>
  );
}

export default function Anexo({ clip, indice, total, linha, protagonismo }: Props) {
  const id = extrairId(clip.printUrl);
  const imprensa = clip.rede === 'imp';
  const [fatias, setFatias] = useState<string[] | null>(null);
  const [erro, setErro] = useState('');
  const areaRef = useRef<HTMLDivElement>(null);
  const contRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;
    let vivo = true;
    anexoPendente(+1);
    (async () => {
      try {
        await (document.fonts?.ready ?? Promise.resolve());
        const a = areaRef.current, c = contRef.current;
        if (!a || !c) return;
        // proporção (altura/largura) das áreas de print; a imagem tem borda de ~1pt
        const prop = (el: HTMLElement) => (el.clientHeight - 4) / el.clientWidth;
        const res = await fetch(`/api/relatorios/file?id=${id}&download=true`);
        if (!res.ok) throw new Error(res.status === 404 ? 'arquivo não encontrado ou fora das planilhas do portal' : `o servidor respondeu ${res.status}`);
        const blob = await res.blob();
        if (!blob.type.startsWith('image/') && blob.type !== 'application/pdf') throw new Error(`formato não suportado (${blob.type || 'desconhecido'}); use PDF, PNG ou JPG`);
        const f = await fatiarArquivo(blob, [prop(a), prop(c)]);
        if (!f.length) throw new Error('o arquivo está em branco');
        if (vivo) setFatias(f);
      } catch (e) {
        const msg = (e as Error).message || 'erro desconhecido';
        if (vivo) setErro(msg);
        avisarRelatorio(`Anexo ${indice + 1} ("${clip.titulo.slice(0, 60)}"): não foi possível carregar o print (${msg}).`);
      } finally {
        anexoPendente(-1);
      }
    })();
    return () => { vivo = false; };
  }, [id, indice, clip.titulo]);

  const partes = fatias?.length || 1;
  const posicao = (k: number) => `Publicação ${indice + 1} de ${total}${partes > 1 ? `  ·  Parte ${k} de ${partes}` : ''}`;
  const topo = (k: number) => (
    <div className="anexo-topo">
      <span className="pilula">{nomeRede(clip.rede)}</span>
      <span className="pos">{posicao(k)}</span>
    </div>
  );
  const continuacao = (k: number, conteudo: React.ReactNode, ref?: React.Ref<HTMLDivElement>) => (
    <>
      <CabecalhoInterno titulo="ANEXO · REGISTRO DE PUBLICAÇÃO" linha={linha} />
      <div className="corpo-anexo">
        {topo(k)}
        <div className="anexo-cont">{[clip.veiculo, clip.titulo].filter(Boolean).join(' · ')} <span>(continuação)</span></div>
        <AreaPrint cheia refArea={ref}>{conteudo}</AreaPrint>
      </div>
      <Rodape />
    </>
  );

  let conteudoInicial: React.ReactNode;
  if (!id) conteudoInicial = <div className="vazio"><b>{imprensa ? 'MATÉRIA NA ÍNTEGRA' : 'PUBLICAÇÃO NA ÍNTEGRA'}</b>Nenhum print na COLUNA PRINT da planilha.</div>;
  else if (erro) conteudoInicial = <div className="vazio"><b>PRINT NÃO CARREGADO</b>{`Não foi possível carregar o arquivo: ${erro}.`}</div>;
  else if (!fatias) conteudoInicial = <div className="vazio print-hidden">Carregando o print…</div>;
  else {
    // eslint-disable-next-line @next/next/no-img-element
    conteudoInicial = <img className="fatia" src={fatias[0]} alt={`Print da publicação ${indice + 1}, parte 1`} />;
  }

  return (
    <>
      <section className="page" id={`clipping-page-${clip.idUnico}`}>
        <CabecalhoInterno titulo="ANEXO · REGISTRO DE PUBLICAÇÃO" linha={linha} />
        <div className="corpo-anexo">
          {topo(1)}
          {clip.veiculo && <div className="veiculo">{clip.veiculo}</div>}
          <div className="anexo-tit">{vazio(clip.titulo, '[Título da publicação]')}</div>
          <div className="meta4">
            <div><div className="k">PUBLICAÇÃO</div><div className="v">{vazio(clip.dataPost, '—')}</div></div>
            <div><div className="k">COLETA</div><div className="v">{vazio(clip.dataColeta, '—')}</div></div>
            <div><div className="k">AUTORIA</div><div className="v">{vazio(clip.autoria, '—')}</div></div>
            <div><div className="k">LINK</div><div className="v link">{clip.link ? <a href={clip.link}>{clip.link.replace(/^https?:\/\/(www\.)?/, '')}</a> : '[inserir link]'}</div></div>
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

      {fatias?.slice(1).map((src, k) => (
        <section className="page" key={k}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {continuacao(k + 2, <img className="fatia" src={src} alt={`Print da publicação ${indice + 1}, parte ${k + 2}`} />)}
        </section>
      ))}

      {/* folha invisível: mede a área de print das páginas de continuação */}
      {id && !fatias && !erro && <div className="folha-medida" aria-hidden="true">{continuacao(2, null, contRef)}</div>}
    </>
  );
}
