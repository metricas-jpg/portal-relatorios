import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { obterDadosDoRelatorio } from '@/lib/google-sheets';
import Script from 'next/script';
import Link from 'next/link';
import PrintController from './PrintController';
import './gerador.css';

function extractId(url: string) {
  if (!url) return '';
  const match = url.match(/[-\w]{25,}/);
  return match ? match[0] : '';
}

export default async function GeradorPage() {
  // 1. SEGURANÇA BASEADA NO DOMÍNIO
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !session.user.email.toLowerCase().endsWith('@loggia.com.br')) {
    return (
      <div className="min-h-screen bg-[#00262e] flex flex-col items-center justify-center text-center px-4">
        <h1 className="text-4xl font-bold text-white mb-4">Acesso Restrito</h1>
        <p className="text-slate-300 mb-8 max-w-md">O e-mail <strong>{session?.user?.email || 'Desconhecido'}</strong> não possui o domínio autorizado.</p>
        <Link href="/" className="bg-[#00AE9D] text-white px-6 py-3 rounded-xl font-bold">Voltar</Link>
      </div>
    );
  }

  // 2. BUSCA DE DADOS & FALLBACKS
  const dados = await obterDadosDoRelatorio();
  const { geral = {}, registros = [], acionamentos = [] } = dados;

  const alertasDebug: string[] = [];
  if (!geral.titulo_crise) alertasDebug.push('Aba Geral: titulo_crise');
  if (registros.length === 0) alertasDebug.push('Aba Registro_Central: Nenhum dado preenchido.');

  const titulo = geral.titulo_crise || 'TÍTULO NÃO DEFINIDO';
  const subtitulo = geral.subtitulo_unidade || 'UNIDADE NÃO DEFINIDA';
  const ultimaAtualizacao = geral.ultima_atualizacao || '--/--/----';
  const edicao = geral.edicao_numero || '--';
  const protagonismo = geral.protagonismo || 'Não informado';
  
  const inicioMon = geral.inicio_monitoramento || '';
  const inicioData = inicioMon.includes(',') ? inicioMon.split(',')[0] : inicioMon;
  const mesAno = inicioMon.includes('/') ? `${inicioMon.split('/')[0]}/${inicioMon.split('/')[1]}` : inicioMon;

  const mencoesGerais = geral.mencoes_gerais_tema || '';
  const mencoesQtd = mencoesGerais.split(' ')[0] || '0';
  const mencoesTxt = mencoesGerais.replace(/^\d+\s/, '') || '';

  const acionamentosCard = geral.acionamentos_imprensa_card || '';
  const acionamentosQtd = acionamentosCard.split(' ')[0] || '0';
  const acionamentosTxt = acionamentosCard.replace(/^\d+\s/, '') || '';

  const gatilhos = (geral.gatilhos_escalada || '').split('\n').filter(g => g.trim() !== '');
  const nivelRisco = geral.nivel_risco || 'BAIXO';

  // 3. MATEMÁTICA E AGRUPAMENTOS
  const totalAcumulado = registros.reduce((acc, curr) => acc + (curr.volume || 1), 0);
  const platMap: Record<string, number> = { Imprensa: 0, Instagram: 0, 'X/Twitter': 0, Facebook: 0, LinkedIn: 0, YouTube: 0 };
  registros.forEach(r => { if (r.plataforma && r.plataforma !== '-') platMap[r.plataforma] = (platMap[r.plataforma] || 0) + (r.volume || 1); });

  const timelineItens = registros.filter(r => r.mostrarTimeline);
  const clippings = registros.filter(r => r.gerarClipping).map((c, i) => ({ ...c, idUnico: `clip_${i}` }));

  const graficoDias = Array.from(new Set(registros.map(r => r.dataPost))).filter(d => d && d !== '-' && d.includes('/'));
  const X0 = 43, X1 = 552.4, BASE = 741.2, LARG = 25.3, UNID = 17.3;
  const passo = graficoDias.length > 0 ? (X1 - X0) / graficoDias.length : 0;
  
  const coresPlataforma: Record<string, string> = { Imprensa: 'var(--roxo)', Instagram: 'var(--turquesa)', 'X/Twitter': 'var(--petroleo)', Facebook: 'var(--verde)', LinkedIn: 'var(--lima)', YouTube: 'var(--laranja)' };

  const getCorPontoTimeline = (ton: string) => { const t = (ton||'').toUpperCase(); return t==='NEGATIVA'?'neg':t==='NEUTRA'?'neu':t==='POSITIVA'?'pos':'acl'; };
  const getCorTextoTimeline = (ton: string) => { const t = (ton||'').toUpperCase(); return t==='NEGATIVA'?'c-verm':t==='NEUTRA'?'c-neutra':'c-cinza'; };
  const st = (b: string | number, left?: string | number, extra?: any) => ({ '--b': typeof b === 'number' ? `${b}pt` : b, ...(left && { left: typeof left === 'number' ? `${left}pt` : left }), ...extra } as React.CSSProperties);

  return (
    <div className="doc">
      {/* Script Oficial do PDF.js */}
      <Script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js" strategy="lazyOnload" />

      {/* BARRA SUPERIOR WEB */}
      <header className="print-hidden w-full max-w-[595pt] bg-[#003641] text-white p-4 rounded-xl flex justify-between items-center shadow-lg">
        <div className="flex gap-4 items-center">
          <Link href="/" className="text-sm text-slate-300 hover:text-white">← Voltar</Link>
          <div className="h-6 w-px bg-white/20"></div>
          <span className="font-bold">Gerador de Relatórios</span>
        </div>
        <PrintController clippings={clippings} />
      </header>

      {alertasDebug.length > 0 && (
        <div className="print-hidden w-full max-w-[595pt] bg-[#FFF6CC] border border-[#E8D277] text-[#6B5300] p-4 rounded-xl shadow-sm mb-4">
          <h3 className="font-bold text-sm mb-2">Faltam dados na Planilha</h3>
          <ul className="text-[11px] grid grid-cols-2 gap-1 list-disc pl-5 opacity-80 font-mono">
            {alertasDebug.map((alerta, i) => (<li key={i}>{alerta}</li>))}
          </ul>
        </div>
      )}

      {/* ================= PÁGINA 1: RESUMO ================= */}
      <section className="page" id="p1">
        <div className="bg" style={{ height: '205.2pt' }}></div>
        <span className="t wrap z10 c-branco" style={st('31.6pt', '32.4pt', { width: '370pt' })}>Presidência - Superintendência Negócios Digitais, Marketing e Experiência do Cooperado</span>
        <img className="logo" src="/logo-sicoob.svg" alt="Sicoob" style={{ position: 'absolute', left: '447.85pt', top: '25.88pt', width: '115.17pt', height: '29.99pt' }} />
        
        <span className="t z95 b c-lima" style={st('70.4pt', '32.4pt')}>RELATÓRIO DE MONITORAMENTO DE CRISE</span>
        <span className="t z24 b c-branco" style={st('117.2pt', '32.4pt')}>{titulo}</span>
        <span className="t z15 b c-lima" style={st('147.8pt', '32.4pt')}>{subtitulo}</span>
        <span className="t z85 c-branco" style={st('182.7pt', '32.4pt')}>Início do monitoramento: {inicioMon}   ·   Edição nº {edicao}   ·   Período: {inicioData} a {ultimaAtualizacao}   ·   Última atualização: {ultimaAtualizacao}</span>

        <div className="card" style={{ position:'absolute', left:'32.4pt', top:'219.6pt', width:'258.1pt', height:'95pt' }}></div>
        <span className="t z75 b sp c-cinza" style={st('238.6pt', '46.8pt')}>RISCO PARA A INSTITUIÇÃO</span>
        <span className="t z75 b c-cinza r" style={st('238.6pt', undefined, { right: 'calc(var(--W) - 276.1pt)' })}>→ {geral.risco_tendencia || ''}</span>
        <span className={`t z26 b ${nivelRisco === 'ALTO' ? 'c-verm' : 'c-turq'}`} style={st('273.5pt', '46.8pt')}>{nivelRisco}</span>
        <span className="t wrap z8 c-cinza" style={st('290.9pt', '46.8pt', { width: '229.3pt' })}>{geral.risco_texto || ''}</span>

        <div className="card" style={{ position:'absolute', left:'304.9pt', top:'219.6pt', width:'258.1pt', height:'95pt' }}></div>
        <span className="t z75 b sp c-cinza" style={st('238.6pt', '319.3pt')}>STATUS DA CRISE</span>
        <span className="t z75 b c-cinza r" style={st('238.6pt', undefined, { right: 'calc(var(--W) - 548.7pt)' })}>→ {geral.status_tendencia || ''}</span>
        <span className="t z19 b c-roxo" style={st('270.7pt', '319.3pt')}>{geral.status_crise || ''}</span>
        <span className="t wrap z8 c-cinza" style={st('290.9pt', '319.3pt', { width: '229.3pt' })}>{geral.status_texto || ''}</span>

        <div className="card" style={{ position:'absolute', left:'32.4pt', top:'327.6pt', width:'99.6pt', height:'86.4pt', background:'var(--petroleo)' }}></div>
        <span className="t z7 b c-branco" style={st('343.2pt', '43.2pt')}>NOVAS MENÇÕES<br/>AO SICOOB</span>
        <span className="t z26 b c-branco" style={st('387.7pt', '43.2pt')}>{geral.novas_mencoes_qtd || '0'}</span>
        <span className="t z7 c-lima" style={st('401.5pt', '43.2pt')}>{geral.novas_mencoes_detalhe || ''}</span>

        <div className="card" style={{ position:'absolute', left:'142.8pt', top:'327.6pt', width:'99.6pt', height:'86.4pt' }}></div>
        <span className="t z7 b c-cinza" style={st('343.2pt', '153.6pt')}>MENÇÕES GERAIS<br/>AO TEMA</span>
        <span className="t z26 b c-claro" style={st('387.7pt', '153.6pt')}>{mencoesQtd}</span>
        <span className="t z7 c-cinza" style={st('401.5pt', '153.6pt')}>{mencoesTxt}</span>

        <div className="card" style={{ position:'absolute', left:'253.3pt', top:'327.6pt', width:'199.3pt', height:'86.4pt' }}></div>
        <span className="t z7 b c-cinza" style={st('343.2pt', '264.1pt')}>MENÇÕES AO SICOOB ACUMULADAS</span>
        <span className="t z26 b c-pet" style={st('387.7pt', '264.1pt')}>{totalAcumulado}</span>
        <span className="t z7 c-cinza" style={st('401.5pt', '264.1pt')}>desde {mesAno}</span>
        <div className="sq" style={{ position:'absolute', left:'321.7pt', top:'361pt', background:'var(--roxo)' }}></div>
        <div className="sq" style={{ position:'absolute', left:'321.7pt', top:'376.9pt', background:'var(--turquesa)' }}></div>
        <div className="sq" style={{ position:'absolute', left:'321.7pt', top:'392.7pt', background:'var(--petroleo)' }}></div>
        <div className="sq" style={{ position:'absolute', left:'383.5pt', top:'361pt', background:'var(--verde)' }}></div>
        <div className="sq" style={{ position:'absolute', left:'383.5pt', top:'376.9pt', background:'var(--lima)' }}></div>
        <div className="sq" style={{ position:'absolute', left:'383.5pt', top:'392.7pt', background:'var(--laranja)' }}></div>
        <span className="t z7 c-texto" style={st('367.5pt', '332.5pt')}>Imprensa <b>{platMap['Imprensa']}</b></span>
        <span className="t z7 c-texto" style={st('383.3pt', '332.5pt')}>Instagram <b>{platMap['Instagram']}</b></span>
        <span className="t z7 c-texto" style={st('399.1pt', '332.5pt')}>X/Twitter <b>{platMap['X/Twitter']}</b></span>
        <span className="t z7 c-texto" style={st('367.5pt', '394.4pt')}>Facebook <b>{platMap['Facebook']}</b></span>
        <span className="t z7 c-texto" style={st('383.3pt', '394.4pt')}>LinkedIn <b>{platMap['LinkedIn']}</b></span>
        <span className="t z7 c-texto" style={st('399.1pt', '394.4pt')}>YouTube <b>{platMap['YouTube']}</b></span>

        <div className="card" style={{ position:'absolute', left:'463.4pt', top:'327.6pt', width:'99.6pt', height:'86.4pt' }}></div>
        <span className="t z7 b c-cinza" style={st('343.2pt', '474.2pt')}>ACIONAMENTOS<br/>DE IMPRENSA</span>
        <span className="t z26 b c-claro" style={st('387.7pt', '474.2pt')}>{acionamentosQtd}</span>
        <span className="t z7 c-cinza" style={st('401.5pt', '474.2pt')}>{acionamentosTxt}</span>

        <span className="t z85 b c-turq" style={st('440.5pt', '32.4pt')}>O QUE MUDOU</span>
        <span className="t wrap z9 lh119 c-texto" style={st('442.1pt', '162pt', { width: '404pt' })}>{geral.o_que_mudou || ''}</span>
        <div style={{ position:'absolute', left:'32.4pt', top: '492.83pt', width: '530.6pt', height: '.74pt', background: 'var(--linha)' }}></div>
        
        <span className="t z85 b c-turq" style={st('507.4pt', '32.4pt')}>O QUE SIGNIFICA<br/>PARA O SICOOB</span>
        <span className="t z7 i c-cinza" style={st('534.7pt', '32.4pt')}>Protagonismo: {protagonismo}</span>
        <span className="t wrap z9 lh119 c-texto" style={st('509pt', '162pt', { width: '404pt' })}>{geral.o_que_significa || ''}</span>

        <span className="t z75 b sp c-pet" style={st('579.9pt', '32.4pt')}>MENÇÕES AO SICOOB POR DIA DE COLETA, POR REDE</span>
        <div style={{ position:'absolute', left:'32.4pt', top:'594pt', width:'7.9pt', height:'7.9pt', background:'var(--roxo)' }}></div>
        <div style={{ position:'absolute', left:'102.2pt', top:'594pt', width:'7.9pt', height:'7.9pt', background:'var(--turquesa)' }}></div>
        <div style={{ position:'absolute', left:'176.8pt', top:'594pt', width:'7.9pt', height:'7.9pt', background:'var(--petroleo)' }}></div>
        <div style={{ position:'absolute', left:'251.3pt', top:'594pt', width:'7.9pt', height:'7.9pt', background:'var(--verde)' }}></div>
        <div style={{ position:'absolute', left:'321.1pt', top:'594pt', width:'7.9pt', height:'7.9pt', background:'var(--lima)' }}></div>
        <div style={{ position:'absolute', left:'391pt', top:'594pt', width:'7.9pt', height:'7.9pt', background:'var(--laranja)' }}></div>
        <span className="t z75 c-texto" style={st('600.9pt', '43.9pt')}>Imprensa</span>
        <span className="t z75 c-texto" style={st('600.9pt', '113.8pt')}>Instagram</span>
        <span className="t z75 c-texto" style={st('600.9pt', '188.3pt')}>X/Twitter</span>
        <span className="t z75 c-texto" style={st('600.9pt', '262.8pt')}>Facebook</span>
        <span className="t z75 c-texto" style={st('600.9pt', '332.6pt')}>LinkedIn</span>
        <span className="t z75 c-texto" style={st('600.9pt', '402.5pt')}>YouTube</span>

        <div style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%' }}>
          <div style={{ position: 'absolute', left: `${X0}pt`, top: `${BASE - 0.5}pt`, width: `${X1 - X0}pt`, height: '0.99pt', background: 'var(--linha)' }}></div>
          {Array.from({ length: graficoDias.length + 1 }).map((_, i) => (
            <div key={`tick-${i}`} style={{ position: 'absolute', left: `${X0 + passo * i - 0.5}pt`, top: `${BASE}pt`, width: '0.99pt', height: '4.3pt', background: 'var(--linha)' }}></div>
          ))}
          {graficoDias.map((dia, i) => {
            const itensDoDia = registros.filter(r => r.dataPost === dia && r.plataforma !== '-');
            const x = X0 + passo * i + (passo - LARG) / 2;
            let topo = BASE; let totalDoDia = 0;
            return (
              <div key={`dia-${dia}`}>
                {itensDoDia.map((item, idx) => {
                  const alt = (item.volume || 1) * UNID;
                  topo -= alt; totalDoDia += (item.volume || 1);
                  return <div key={idx} style={{ position: 'absolute', left: `${x}pt`, top: `${topo}pt`, width: `${LARG}pt`, height: `${alt}pt`, background: coresPlataforma[item.plataforma] || 'var(--cinza)' }}></div>;
                })}
                {totalDoDia > 0 && <span className="t c z8 c-texto" style={st(`${topo - 4.3}pt`, `${x + LARG / 2 - 30}pt`, { width: '60pt' })}>{totalDoDia}</span>}
                <span className="t c z75 c-cinza" style={st('755pt', `${x + LARG / 2 - 30}pt`, { width: '60pt' })}>{dia}</span>
              </div>
            );
          })}
        </div>

        <span className="t wrap z7 c-cinza" style={st('783.1pt', '32.4pt', { width: '531pt' })}><b>Legenda.</b>  Risco: Baixo · Médio · Alto.  Status: Sinais · Fase aguda · Em desdobramento · Controlado · Encerrado.  Protagonismo: Protagonista · Parte envolvida · Citação incidental · Sem menção.</span>
        <span className="t z75 i c-verm rodape">Documento interno · Sicoob — não redistribuir.</span>
        <span className="t z8 c-cinza r num">1</span>
      </section>

      {/* ================= PÁGINA 2: TIMELINE ================= */}
      <section className="page" id="p2">
        <div className="bg" style={{ height: '68.4pt' }}></div>
        <span className="t z12 b c-lima" style={st('30pt', '32.4pt')}>EVOLUÇÃO · ACIONAMENTOS</span>
        <span className="t z8 c-branco" style={st('50pt', '32.4pt')}>{titulo.toUpperCase()} · {subtitulo.toUpperCase()} · EDIÇÃO DE {ultimaAtualizacao.toUpperCase()}</span>
        <img className="logo" src="/logo-sicoob.svg" alt="Sicoob" style={{ position: 'absolute', left: '465.85pt', top: '20.86pt', width: '97.17pt', height: '25.31pt' }} />

        <span className="t z13 b c-turq" style={st('99.4pt', '32.4pt')}>LINHA DO TEMPO DAS MENÇÕES</span>
        <span className="t z75 b c-cinza" style={st('124.7pt', '32.4pt')}>Cita o Sicoob:</span>
        <div className="lg-dot" style={{ left: '95.8pt', background: 'var(--vermelho)' }}></div>
        <div className="lg-dot" style={{ left: '151.9pt', background: 'var(--neutra)' }}></div>
        <div className="lg-dot" style={{ left: '208.1pt', background: 'var(--verde-escuro)' }}></div>
        <div className="lg-dot o" style={{ left: '281.58pt' }}></div>
        <div className="lg-dot o" style={{ left: '439.98pt', borderColor: 'var(--roxo)' }}></div>
        <span className="t z75 c-cinza" style={st('124.7pt', '108pt')}>negativa</span>
        <span className="t z75 c-cinza" style={st('124.7pt', '164.1pt')}>neutra</span>
        <span className="t z75 c-cinza" style={st('124.7pt', '220.3pt')}>positiva</span>
        <span className="t z75 c-cinza" style={st('124.7pt', '294.5pt')}>Sem menção (contexto)</span>
        <span className="t z75 c-cinza" style={st('124.7pt', '452.9pt')}>Próximo marco</span>

        <div style={{ position: 'absolute', left: '113.05pt', top: '151.2pt', width: '1.5pt', height: '330pt', background: 'var(--linha)' }}></div>

        {timelineItens.map((item, idx) => {
          const baseB = 152.5 + (idx * 36);
          const corPonto = getCorPontoTimeline(item.tonalidade);
          const corTextoTag = getCorTextoTimeline(item.tonalidade);
          const exibicaoTexto = item.textoTimeline || item.fato || '';
          
          if (item.proximoMarco) return (<div key={`tl-${idx}`} style={st(baseB, undefined, { position: 'static' })}><span className="t z85 b c-roxo tl-data">Próximo</span><i className="dot next"></i><span className="t wrap z85 b c-texto tl-txt">{exibicaoTexto}</span></div>);
          if (!item.envolveSicoob) return (<div key={`tl-${idx}`} style={st(baseB, undefined, { position: 'static' })}><span className="t z85 b c-pet tl-data">{item.dataPost || ''}</span><i className="dot p"></i><span className="t wrap z85 c-cinza tl-txt">{exibicaoTexto}</span></div>);
          return (<div key={`tl-${idx}`} style={st(baseB, undefined, { position: 'static' })}><span className="t z85 b c-pet tl-data">{item.dataPost || ''}</span><i className={`dot g ${corPonto}`}></i><span className="t wrap z85 c-texto tl-txt">{exibicaoTexto}</span><span className={`t z7 b tl-tag ${corTextoTag}`}>{(item.tonalidade || '').toUpperCase()}</span></div>);
        })}

        <span className="t z13 b c-turq" style={st('499pt', '32.4pt')}>ACIONAMENTOS DE IMPRENSA</span>
        {acionamentos.length === 0 && <span className="t z8 i c-cinza" style={st('521.3pt', '32.4pt')}>Nenhum acionamento no período.</span>}
        {acionamentos.length > 0 && (
          <table className="tab" style={{ position: 'absolute' }}>
            <colgroup><col style={{width:'44.6pt'}}/><col style={{width:'68.4pt'}}/><col style={{width:'68.4pt'}}/><col style={{width:'126pt'}}/><col style={{width:'57.6pt'}}/><col style={{width:'100.8pt'}}/><col style={{width:'64.8pt'}}/></colgroup>
            <thead><tr><th>Data</th><th>Veículo</th><th>Jornalista</th><th>Demanda</th><th>Prazo</th><th>Resposta</th><th>Status</th></tr></thead>
            <tbody>{acionamentos.map((ac, idx) => (<tr key={`ac-${idx}`}><td>{ac.data}</td><td>{ac.veiculo}</td><td>{ac.jornalista}</td><td>{ac.demanda}</td><td>{ac.prazo}</td><td>{ac.resposta}</td><td>{ac.status}</td></tr>))}</tbody>
          </table>
        )}

        <span className="t z75 i c-verm rodape">Documento interno · Sicoob — não redistribuir.</span>
        <span className="t z8 c-cinza r num">2</span>
      </section>

      {/* ================= PÁGINA 3: CONTEXTO ================= */}
      <section className="page" id="p3">
        <div className="bg" style={{ height: '68.4pt' }}></div>
        <span className="t z12 b c-lima" style={st('30pt', '32.4pt')}>CONTEXTO DO CASO</span>
        <span className="t z8 c-branco" style={st('50pt', '32.4pt')}>{titulo.toUpperCase()} · {subtitulo.toUpperCase()} · EDIÇÃO DE {ultimaAtualizacao.toUpperCase()}</span>
        <img className="logo" src="/logo-sicoob.svg" alt="Sicoob" style={{ position: 'absolute', left: '465.85pt', top: '20.86pt', width: '97.17pt', height: '25.31pt' }} />

        <span className="t z13 b c-turq" style={st('99.4pt', '32.4pt')}>ANÁLISE DO CASO</span>
        <span className="t z75 i c-cinza" style={st('119.1pt', '32.4pt')}>Texto de referência, revisado quando o papel do Sicoob muda. Última revisão: {geral.analise_revisao_data || '--'}.</span>
        <span className="t wrap z11 lh145 b c-pet" style={st('149.1pt', '32.4pt', { width: '530.6pt' })}>{geral.analise_caso || ''}</span>

        <div className="card" style={{ position:'absolute', left:'32.4pt', top:'190.8pt', width:'258.1pt', height:'115.2pt' }}></div>
        <span className="t z75 b sp c-turq" style={st('209.8pt', '46.8pt')}>PAPEL DO SICOOB</span>
        <span className="t wrap z9 lh119 c-texto" style={st('231.1pt', '46.8pt', { width: '229.3pt' })}>{geral.papel_sicoob || ''}</span>

        <div className="card" style={{ position:'absolute', left:'304.9pt', top:'190.8pt', width:'258.1pt', height:'115.2pt' }}></div>
        <span className="t z75 b sp c-turq" style={st('209.8pt', '319.3pt')}>QUEM ESTÁ NO CENTRO DA PAUTA</span>
        <span className="t wrap z9 lh119 c-texto" style={st('231.1pt', '319.3pt', { width: '229.3pt' })}>{geral.centro_pauta || ''}</span>

        <span className="t z75 b sp c-pet" style={st('335.1pt', '32.4pt')}>GATILHOS DE ESCALADA</span>
        {(geral.gatilhos_escalada || '').split('\n').filter(g=>g).map((gatilho, idx) => {
          const bBase = 356.7 + (idx * 16.8);
          return (
            <div key={`gat-${idx}`} style={st(bBase, undefined, { position: 'static' })}>
              <span className="t z9 c-texto" style={st(bBase, '32.4pt')}>•</span>
              <span className="t z9 c-texto" style={st(bBase + 1.5, '44.4pt')}>{gatilho}</span>
            </div>
          );
        })}

        <span className="t z75 i c-verm rodape">Documento interno · Sicoob — não redistribuir fora do ambiente autorizado.</span>
        <span className="t z8 c-cinza r num">3</span>
      </section>

      {/* ================= PÁGINAS 4+: CLIPPING (HÍBRIDO) ================= */}
      {clippings.map((clip, idx) => (
        <section className="page" id={`clipping-page-${clip.idUnico}`} key={clip.idUnico}>
          <div className="bg" style={{ height: '68.4pt' }}></div>
          <span className="t z12 b c-lima" style={st('30pt', '32.4pt')}>ANEXO · REGISTRO DE PUBLICAÇÃO</span>
          <span className="t z8 c-branco" style={st('50pt', '32.4pt')}>{titulo.toUpperCase()} · {subtitulo.toUpperCase()} · EDIÇÃO DE {ultimaAtualizacao.toUpperCase()}</span>
          <img className="logo" src="/logo-sicoob.svg" alt="Sicoob" style={{ position: 'absolute', left: '465.85pt', top: '20.86pt', width: '97.17pt', height: '25.31pt' }} />

          <div style={{ position:'absolute', left:'32.4pt', top:'86.4pt', width:'97.2pt', height:'21.6pt', borderRadius:'10.8pt', background:'var(--roxo)' }}></div>
          <span className="t z85 b c-branco c" style={st('100.6pt', '32.4pt', { width: '97.2pt' })}>IMPRENSA</span>
          <span className="t z8 c-cinza r" style={st('98pt', undefined, { right: 'calc(var(--W) - 562.8pt)' })}>Publicação {idx + 1} de {clippings.length}</span>
          <span className="t z95 b c-turq" style={st('130.5pt', '32.4pt')}>{clip.plataforma || ''}</span>
          <span className="t wrap z15 lh189 b c-pet" style={st('156.2pt', '32.4pt', { width: '530.6pt' })}>{clip.fato || ''}</span>

          <div className="card" style={{ position:'absolute', left:'32.4pt', top:'195.8pt', width:'126.2pt', height:'43.2pt' }}></div>
          <div className="card" style={{ position:'absolute', left:'167.2pt', top:'195.8pt', width:'126.2pt', height:'43.2pt' }}></div>
          <div className="card" style={{ position:'absolute', left:'302pt', top:'195.8pt', width:'126.2pt', height:'43.2pt' }}></div>
          <div className="card" style={{ position:'absolute', left:'436.8pt', top:'195.8pt', width:'126.2pt', height:'43.2pt' }}></div>
          
          <span className="t z65 b c-cinza" style={st('208.1pt', '41.8pt')}>PUBLICAÇÃO</span>
          <span className="t z9 b c-texto" style={st('225pt', '41.8pt')}>{clip.dataPost || ''}</span>
          <span className="t z65 b c-cinza" style={st('208.1pt', '176.6pt')}>LINK</span>
          <span className="t z9 i c-cinza" style={st('225pt', '176.6pt')}>{clip.linkMateria || 'Não informado'}</span>
          <span className="t z65 b c-cinza" style={st('208.1pt', '311.4pt')}>AUTORIA</span>
          <span className="t z9 b c-texto" style={st('225pt', '311.4pt')}>{clip.autoria || '--'}</span>
          <span className="t z65 b c-cinza" style={st('208.1pt', '446.2pt')}>TONALIDADE</span>
          <span className="t z9 b c-texto" style={st('225pt', '446.2pt')}>{(clip.tonalidade || '').toUpperCase()}</span>

          <div className="tag-print" style={{ left: '31.9pt', width: '165.19pt', borderColor: 'var(--petroleo)' }}></div>
          <span className="t z7 b c-pet c" style={st('264.1pt', '32.4pt', { width: '164.2pt' })}>PROTAGONISMO: {protagonismo.toUpperCase()}</span>

          <div className="card" style={{ position:'absolute', left:'32.4pt', top:'284.4pt', width:'530.6pt', height:'80.6pt', background:'var(--amarelo)' }}></div>
          <span className="t z75 b sp c-oliva" style={st('300.5pt', '46.8pt')}>O QUE A MATÉRIA DIZ SOBRE O SICOOB</span>
          <span className="t wrap z9 lh119 c-texto" style={st('319.7pt', '46.8pt', { width: '501.8pt' })}>{clip.trecho || ''}</span>

          {/* O BLOCO HÍBRIDO (Tela vs Impressão) */}
          <div style={{ position:'absolute', left:'31.9pt', top:'377.5pt', width:'531.6pt', height:'411.4pt', borderRadius:'5.76pt', overflow:'hidden', border: '1px dashed #A9B5B9', background: '#FAFBFB' }}>
             {/* Visível na Tela (Iframe leve) */}
             <div className="print-hidden w-full h-full flex flex-col items-center justify-center text-slate-400">
                 {clip.printUrl ? (
                     <iframe src={`/api/relatorios/file?id=${extractId(clip.printUrl)}`} className="w-full h-full border-none" title="Anexo" />
                 ) : (
                     <span className="t z85 c-cinza c mt-4">Nenhum anexo fornecido na coluna PRINT.</span>
                 )}
             </div>

             {/* Oculto na Tela, Visível no PDF (Injetado pelo PrintController) */}
             <div className="hidden print:block w-full h-full bg-white" id={`print-container-cover-${clip.idUnico}`}>
                {clip.printUrl && (
                   <div className="w-full h-full flex flex-col items-center justify-center text-slate-300">
                     <p className="text-[10px] tracking-widest uppercase font-bold">Aguardando Conversão...</p>
                   </div>
                )}
             </div>
          </div>

          <span className="t z75 i c-verm rodape">Documento interno · Sicoob — não redistribuir fora do ambiente autorizado.</span>
          <span className="t z8 c-cinza r num">{3 + idx + 1}</span>
        </section>
      ))}
    </div>
  );
}