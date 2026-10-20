import { Fragment, type CSSProperties } from 'react';
import Paginador, { type Bloco } from './Paginador';
import Anexo from './Anexo';
import { st, mv, lim, rico, vazio, tendencia, Rodape, CabecalhoInterno } from './comum';
import AjustePagina1 from './AjustePagina1';
import { REDES, type Relatorio as Dados, type ItemTimeline, type Tom } from '@/lib/relatorio';

/* ============================== página 1 ============================== */

function Grafico({ r }: { r: Dados }) {
  const dias = r.grafico;
  // Geometria do original (pt). A barra mais alta nunca passa de --altmax (121,2pt, menos o que a
  // página elástica tirar), seja o maior dia 6 ou 600.
  const X0 = 43, X1 = 552.4, BASE = 741.2, LARG_MAX = 25.3;
  if (!dias.length) {
    return <span className="t z8 i c-cinza c" style={st(690, 32.4, { width: '530.6pt' })}>Nenhuma menção ao Sicoob com data registrada.</span>;
  }
  const passo = (X1 - X0) / dias.length;
  const larg = Math.min(LARG_MAX, passo * 0.646);
  const maior = Math.max(...dias.map(d => d.total));
  const cadaRotulo = Math.max(1, Math.ceil(24 / passo)); // evita datas sobrepostas
  const mostrarValor = passo >= 11;
  const caixa = (l: number, t: number | string, w: number, h: number | string, bg: string, key: string) =>
    <div key={key} style={{ position: 'absolute', left: `${l}pt`, top: typeof t === 'number' ? `${t}pt` : t, width: `${w}pt`, height: typeof h === 'number' ? `${h}pt` : h, background: bg }} />;
  // altura de 1 menção: no máximo 17,3pt (como no modelo) e encolhe para a maior barra caber
  const unid = (n: number) => `calc(${n} * var(--unid))`;

  return (
    <div className="grafico" style={{ left: 0, top: 0, width: '100%', height: '100%', '--unid': `min(17.3pt, calc(var(--altmax) / ${maior}))` } as CSSProperties}>
      {caixa(X0, BASE - 0.5, X1 - X0, 0.99, 'var(--linha)', 'eixo')}
      {dias.map((_, i) => caixa(X0 + passo * i - 0.5, BASE, 0.99, 4.3, 'var(--linha)', `m${i}`))}
      {caixa(X1 - 0.5, BASE, 0.99, 4.3, 'var(--linha)', 'mfim')}
      {dias.map((d, i) => {
        const x = X0 + passo * i + (passo - larg) / 2;
        let acum = 0;
        const barras = REDES.map(rede => {
          const n = d.porRede[rede.chave];
          if (!n) return null;
          acum += n;
          return caixa(x, `calc(${BASE}pt - ${unid(acum)})`, larg, unid(n), rede.cor, `${i}-${rede.chave}`);
        });
        const cx = x + larg / 2;
        return (
          <div key={`d${i}`}>
            {barras}
            {mostrarValor && <span className="t c z8 c-texto" style={st(`calc(${BASE - 4.3}pt - ${unid(d.total)})`, cx - 30, { width: '60pt' })}>{d.total}</span>}
            {i % cadaRotulo === 0 && <span className="t c z75 c-cinza" style={st(755, cx - 30, { width: '60pt' })}>{d.rotulo}</span>}
          </div>
        );
      })}
    </div>
  );
}

function Pagina1({ r }: { r: Dados }) {
  const pr = r.acumulado.porRede;
  const legenda = [
    ['Imprensa', pr.imp, 332.5, 367.5], ['Instagram', pr.ins, 332.5, 383.3], ['X/Twitter', pr.x, 332.5, 399.1],
    ['Facebook', pr.fb, 394.4, 367.5], ['LinkedIn', pr.li, 394.4, 383.3], ['YouTube', pr.yt, 394.4, 399.1],
  ] as const;
  const quadrados = [[321.7, 361, 'roxo'], [321.7, 376.9, 'turquesa'], [321.7, 392.7, 'petroleo'], [383.5, 361, 'verde'], [383.5, 376.9, 'lima'], [383.5, 392.7, 'laranja']] as const;
  const legGrafico = [[32.4, 43.9], [102.2, 113.8], [176.8, 188.3], [251.3, 262.8], [321.1, 332.6], [391, 402.5]] as const;
  const nAc = r.acionamentos.linhas.length;
  // deslocamentos da página elástica (ver gerador.css e AjustePagina1)
  const H1 = '--dh1', H2 = '--dh2', H3 = '--dh3', C1 = '--dc1', C2 = '--dc2', K1 = '--dk1', K2 = '--dk2', T = '--dt', SEP = '--dsep', G = '--dg';
  const card = (left: number, top: number, w: number, h: number, vTop: string, vAlt: string, extra?: CSSProperties) =>
    <div className="card" style={{ left: `${left}pt`, top: mv(top, vTop), width: `${w}pt`, height: mv(h, vAlt, '-'), ...extra }} />;

  return (
    <section className="page" id="p1">
      <AjustePagina1 />
      <div className="bg" style={{ height: mv(205.2, '--rbg', '-') }} />
      <span className="t z10 c-branco lim" data-limite="Área responsável (titulo_orgao)" style={st(mv(31.6, H1), 32.4, { ...lim(2, 370), textTransform: 'uppercase' })}>{r.orgao}</span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="logo" src="/logo-sicoob.svg" alt="Sicoob" style={{ left: '447.85pt', top: mv(25.88, H1), width: '115.17pt', height: '29.99pt' }} />

      <span className="t z95 b c-lima" style={st(mv(70.4, H1), 32.4)}>RELATÓRIO DE MONITORAMENTO DE CRISE</span>
      <span className="t z24 b c-branco lim1" data-limite="Título do caso (titulo_crise)" style={st(mv(117.2, H2), 32.4, { width: '530.6pt' })}>{vazio(r.titulo, '[Título do caso]')}</span>
      <span className="t z15 b c-lima lim1" data-limite="Unidade (subtitulo_unidade)" style={st(mv(147.8, H2), 32.4, { width: '530.6pt' })}>{vazio(r.unidade, '[Unidade]')}</span>
      <span className="t z85 c-branco lim1" data-limite="Linha de datas do cabeçalho" style={st(mv(182.7, H3), 32.4, { width: '530.6pt' })}>
        {`Início do monitoramento: ${vazio(r.inicio)}   ·   Edição nº ${vazio(r.edicao)}   ·   Período: ${vazio(r.periodoDe)} a ${vazio(r.periodoAte)}   ·   Última atualização: ${vazio(r.ultimaAtualizacao)}`}
      </span>

      {/* risco e status */}
      {card(32.4, 219.6, 258.1, 95, C1, '--rcr')}
      <span className="t z75 b sp c-cinza" style={st(mv(238.6, C1), 46.8)}>RISCO PARA A INSTITUIÇÃO</span>
      <span className="t z75 b c-cinza r" style={st(mv(238.6, C1), undefined, { right: 'calc(var(--W) - 276.1pt)' })}>{tendencia(r.risco.tendencia)}</span>
      <span className="t z26 b lim1" data-limite="Nível de risco" style={st(mv(273.5, C2), 46.8, { color: r.risco.cor, width: '229.3pt' })}>{r.risco.nivel}</span>
      <span className="t wrap z8 c-cinza lim" data-limite="Texto do risco (risco_texto)" style={st(mv(290.9, C2), 46.8, lim(2, 229.3))}>{r.risco.texto}</span>

      {card(304.9, 219.6, 258.1, 95, C1, '--rcr')}
      <span className="t z75 b sp c-cinza" style={st(mv(238.6, C1), 319.3)}>STATUS DA CRISE</span>
      <span className="t z75 b c-cinza r" style={st(mv(238.6, C1), undefined, { right: 'calc(var(--W) - 548.7pt)' })}>{tendencia(r.status.tendencia)}</span>
      <span className="t z19 b c-roxo lim1" data-limite="Status da crise" style={st(mv(270.7, C2), 319.3, { width: '229.3pt' })}>{vazio(r.status.nivel.toUpperCase(), '[STATUS]')}</span>
      <span className="t wrap z8 c-cinza lim" data-limite="Texto do status (status_texto)" style={st(mv(290.9, C2), 319.3, lim(2, 229.3))}>{r.status.texto}</span>

      {/* indicadores */}
      {card(32.4, 327.6, 99.6, 86.4, K1, '--rck', { background: 'var(--petroleo)' })}
      <span className="t z7 b c-branco" style={st(mv(343.2, K1), 43.2)}>{'NOVAS MENÇÕES\nAO SICOOB'}</span>
      <span className="t z26 b c-branco" style={st(mv(387.7, K2), 43.2)}>{r.novas.qtd}</span>
      {/* "Última: 19/10 (Veículo)": se não couber numa linha, o veículo desce para a 2ª linha (AjustePagina1) */}
      {(() => {
        const i = r.novas.detalhe.indexOf(' (');
        const [a, b] = i > 0 ? [r.novas.detalhe.slice(0, i), r.novas.detalhe.slice(i + 1)] : [r.novas.detalhe, ''];
        return (
          <span className="t z7 c-lima det" data-encaixe="Detalhe de novas menções" style={st(mv(401.5, K2), 43.2, { width: '78pt' })}>
            {a}{b && <> <span className="det-b">{b}</span></>}
          </span>
        );
      })()}

      {card(142.8, 327.6, 99.6, 86.4, K1, '--rck')}
      <span className="t z7 b c-cinza" style={st(mv(343.2, K1), 153.6)}>{'MENÇÕES GERAIS\nAO TEMA'}</span>
      <span className="t z26 b c-pet" style={st(mv(387.7, K2), 153.6)}>{r.gerais.qtd}</span>
      <span className="t z7 c-cinza" style={st(mv(401.5, K2), 153.6)}>desde {r.gerais.desde}</span>

      {card(253.3, 327.6, 199.3, 86.4, K1, '--rck')}
      <span className="t z7 b c-cinza" style={st(mv(343.2, K1), 264.1)}>MENÇÕES AO SICOOB ACUMULADAS</span>
      <span className="t z26 b c-pet" style={st(mv(387.7, K2), 264.1)}>{r.acumulado.qtd}</span>
      <span className="t z7 c-cinza" style={st(mv(401.5, K2), 264.1)}>desde {r.acumulado.desde}</span>
      {quadrados.map(([l, t, c]) => <div key={c} className="sq" style={{ left: `${l}pt`, top: mv(t, K2), background: `var(--${c})` }} />)}
      {legenda.map(([nome, n, l, b]) => <span key={nome} className="t z7 c-texto" style={st(mv(b, K2), l)}>{nome}  <b>{n}</b></span>)}

      {card(463.4, 327.6, 99.6, 86.4, K1, '--rck')}
      <span className="t z7 b c-cinza" style={st(mv(343.2, K1), 474.2)}>{'ACIONAMENTOS\nDE IMPRENSA'}</span>
      <span className="t z26 b c-pet" style={st(mv(387.7, K2), 474.2)}>{nAc}</span>
      <span className="t z7 c-cinza" style={st(mv(401.5, K2), 474.2)}>{nAc ? `${r.acionamentos.abertos} em aberto` : 'no período'}</span>

      {/* o que mudou (tamanho controlado pelo AjustePagina1) */}
      <div className="col-esq" style={{ top: mv(432.45, T) }}>
        <div className="tit lim" data-limite="Título “O que mudou”" style={{ '--linhas': 3 } as CSSProperties}>{r.tituloMudou}</div>
      </div>
      <span className="t wrap z9 lh119 c-texto lim" data-elastico="O que mudou" data-ideal="4" style={st(mv(442.1, T), 162, lim(4, 404))}>{rico(r.mudou)}</span>

      <div style={{ left: '32.4pt', top: mv(492.83, SEP), width: '530.6pt', height: '.74pt', background: 'var(--linha)' }} />

      {/* o que significa: o título quebra linha dentro de 96pt e o protagonismo desce junto */}
      <div className="col-esq" style={{ top: mv(499.35, SEP) }}>
        <div className="tit lim" data-limite="Título “O que significa”" style={{ '--linhas': 3 } as CSSProperties}>{r.tituloSignifica}</div>
        {r.protagonismo && <div className="prot lim" data-limite="Protagonismo" style={{ '--linhas': 2 } as CSSProperties}>Protagonismo: {r.protagonismo.toLowerCase()}</div>}
      </div>
      <span className="t wrap z9 lh119 c-texto lim" data-elastico="O que significa para o Sicoob" data-ideal="5" style={st(mv(509, SEP), 162, lim(5, 404))}>{rico(r.significa)}</span>

      {/* gráfico */}
      <span className="t z75 b sp c-pet" style={st(mv(579.9, G), 32.4)}>MENÇÕES AO SICOOB POR DIA DE COLETA, POR REDE</span>
      <span className="t z7 i c-cinza r" style={st(mv(579.4, G), undefined, { right: 'calc(var(--W) - 563pt)' })}>O total acumulado ({r.acumulado.qtd}) fica no indicador acima, fora do gráfico</span>
      {legGrafico.map(([q, t], i) => (
        <Fragment key={i}>
          <div style={{ left: `${q}pt`, top: mv(594, G), width: '7.9pt', height: '7.9pt', background: REDES[i].cor }} />
          <span className="t z75 c-texto" style={st(mv(600.9, G), t)}>{REDES[i].nome}</span>
        </Fragment>
      ))}
      <Grafico r={r} />

      <span className="t wrap z7 c-cinza" style={st(783.1, 32.4, { width: '531pt' })}><b>Legenda.</b>  Risco (define a frequência de monitoramento): Baixo · Médio · Alto.  Status: Sinais · Fase aguda · Em desdobramento · Controlado · Encerrado.  Protagonismo: Protagonista · Parte envolvida · Citação incidental · Sem menção.</span>
      <Rodape />
    </section>
  );
}

/* ============================== página 2 ============================== */

const TAG: Partial<Record<Tom, [string, string]>> = {
  neg: ['NEGATIVA', 'c-verm'], neu: ['NEUTRA', 'c-neutra'], pos: ['POSITIVA', 'c-verde'], acl: ['[A CLASSIFICAR]', 'c-cinza'],
};

function LinhaTimeline({ item }: { item: ItemTimeline }) {
  const ponto = item.tom === 'next' ? 'next' : item.tom === 'ctx' ? 'p' : `g ${item.tom}`;
  const tag = TAG[item.tom];
  return (
    <div className={`tl-row ${item.tom}`}>
      <span className="data">{item.tom === 'next' ? 'Próximo' : item.data}</span>
      <i className={`ponto ${ponto}`} />
      <div className="txt">{rico(item.texto)}{item.complemento && <> <b>[{item.complemento}]</b></>}</div>
      {tag && <span className={`tag ${tag[1]}`}>{tag[0]}</span>}
    </div>
  );
}

function legendaTimeline() {
  const pontos: [number, string | null, boolean][] = [[63.4, 'var(--vermelho)', false], [119.5, 'var(--neutra)', false], [175.7, 'var(--verde-escuro)', false], [249.18, null, true], [407.58, 'var(--roxo)', true]];
  const textos: [number, string][] = [[75.6, 'negativa'], [131.7, 'neutra'], [187.9, 'positiva'], [262.1, 'Sem menção ao Sicoob (contexto)'], [420.5, 'Próximo marco']];
  return (
    <div className="tl-leg">
      <b style={{ left: 0 }}>Cita o Sicoob:</b>
      {pontos.map(([l, c, o], i) => (
        <i key={i} className={`ponto${o ? ' o' : ''}`} style={{ left: `${l}pt`, ...(o ? (c ? { borderColor: c } : {}) : { background: c! }) }} />
      ))}
      {textos.map(([l, t]) => <span key={t} style={{ left: `${l}pt` }}>{t}</span>)}
    </div>
  );
}

function Pagina2({ r, linha }: { r: Dados; linha: string }) {
  const S1 = 'Linha do tempo das menções', S2 = 'Acionamentos de imprensa';
  const blocos: Bloco[] = [
    { id: 'h-tl', no: <div className="h2">{S1}</div>, manterComProximo: true, secao: S1, inicioSecao: true },
    { id: 'leg', no: legendaTimeline(), manterComProximo: true, secao: S1 },
    ...(r.timeline.length
      ? r.timeline.map((item, i) => ({ id: `tl${i}`, no: <LinhaTimeline item={item} />, grupo: 'tl' as const, secao: S1 }))
      : [{ id: 'tl-vazio', no: <p className="nota">Nenhum item marcado com “Mostrar Timeline? = SIM”.</p>, secao: S1 }]),
    { id: 'h-ac', no: <div className="h2 secao2">{S2}</div>, manterComProximo: true, secao: S2, inicioSecao: true },
    ...(r.acionamentos.linhas.length
      ? r.acionamentos.linhas.map((a, i) => ({
          id: `ac${i}`, grupo: 'tab' as const, secao: S2,
          no: <tr><td>{a.data}</td><td>{a.veiculo}</td><td>{a.jornalista}</td><td>{a.demanda}</td><td>{a.prazo}</td><td>{a.resposta}</td><td>{a.status}</td></tr>,
        }))
      : [{ id: 'ac-vazio', no: <p className="nota">Nenhum acionamento no período.</p>, secao: S2 }]),
    ...(r.leitura ? [{ id: 'leitura', secao: S2, no: <div className="leitura"><b>LEITURA</b><span>{rico(r.leitura)}</span></div> }] : []),
  ];
  return (
    <Paginador
      nome="Evolução e acionamentos"
      moldura={<><CabecalhoInterno titulo="EVOLUÇÃO · ACIONAMENTOS" linha={linha} /><Rodape /></>}
      blocos={blocos}
      tabela={{
        colgroup: <colgroup><col style={{ width: '44.6pt' }} /><col style={{ width: '68.4pt' }} /><col style={{ width: '68.4pt' }} /><col style={{ width: '126pt' }} /><col style={{ width: '57.6pt' }} /><col style={{ width: '100.8pt' }} /><col style={{ width: '64.8pt' }} /></colgroup>,
        cabecalho: <tr><th>Data</th><th>Veículo</th><th>Jornalista</th><th>Demanda</th><th>Prazo</th><th>Resposta</th><th>Status</th></tr>,
      }}
    />
  );
}

/* ============================== página 3 ============================== */

function Pagina3({ r, linha }: { r: Dados; linha: string }) {
  const a = r.analise;
  const S1 = 'Análise do caso', S2 = 'Gatilhos de escalada';
  const blocos: Bloco[] = [
    { id: 'h', no: <div className="h2">{S1}</div>, manterComProximo: true, secao: S1, inicioSecao: true },
    { id: 'ref', no: <p className="ref">{`Texto de referência: escrito na abertura do caso e revisado só quando o papel do Sicoob mudar.  ${a.revisao.trim() ? `  Última revisão: ${a.revisao.trim()}.` : ''}`}</p>, secao: S1 },
    { id: 'man', no: <p className="manchete">{rico(vazio(a.manchete, '[Mensagem principal sobre a posição do Sicoob no caso]'))}</p>, secao: S1 },
    {
      id: 'cards', secao: S1, no: (
        <div className="cards2">
          <div><div className="rot">Papel do Sicoob</div><p>{rico(a.papel)}</p></div>
          <div><div className="rot">Quem está no centro da pauta</div><p>{rico(a.centro)}</p></div>
        </div>
      ),
    },
    { id: 'h-gat', no: <div className="rot pet">{S2}</div>, manterComProximo: true, secao: S2, inicioSecao: true },
    ...(a.gatilhos.length
      ? a.gatilhos.map((g, i) => ({ id: `g${i}`, grupo: 'ul' as const, secao: S2, no: <>{rico(g)}</> }))
      : [{ id: 'g-vazio', secao: S2, no: <p className="nota">Nenhum gatilho cadastrado.</p> }]),
  ];
  return (
    <Paginador
      nome="Contexto do caso"
      moldura={<><CabecalhoInterno titulo="CONTEXTO DO CASO" linha={linha} /><Rodape /></>}
      blocos={blocos}
    />
  );
}

/* ============================== documento ============================== */

export default function Relatorio({ r }: { r: Dados }) {
  const linha = `${vazio(r.titulo, '[Título]')} · ${vazio(r.unidade, '[Unidade]')} · EDIÇÃO DE ${vazio(r.ultimaAtualizacao)}`.toUpperCase();
  return (
    <>
      <Pagina1 r={r} />
      <Pagina2 r={r} linha={linha} />
      <Pagina3 r={r} linha={linha} />
      {r.clippings.map((c, i) => (
        <Anexo key={c.idUnico} clip={c} indice={i} total={r.clippings.length} linha={linha} protagonismo={r.protagonismo} />
      ))}
    </>
  );
}
