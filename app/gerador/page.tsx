import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { obterEmailsAutorizados, obterDadosDoRelatorio } from '@/lib/google-sheets';
import Link from 'next/link';
import './gerador.css'; // Importando os estilos isolados

export default async function GeradorPage() {
  // SEGURANÇA
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect('/'); 
  
  const emailUsuario = session.user.email.toLowerCase();
  const emailsAutorizados = await obterEmailsAutorizados();

  if (!emailsAutorizados.includes(emailUsuario)) {
    return (
      <div className="min-h-screen bg-[#00262e] flex flex-col items-center justify-center text-center px-4">
        <h1 className="text-4xl font-bold text-white mb-4">Acesso Restrito</h1>
        <p className="text-slate-300 mb-8 max-w-md">O e-mail <strong>{emailUsuario}</strong> não tem permissão.</p>
        <Link href="/" className="bg-[#00AE9D] text-white px-6 py-3 rounded-xl font-bold">Voltar</Link>
      </div>
    );
  }

  // BUSCA DE DADOS
  const dados = await obterDadosDoRelatorio();
  const { geral, registros, acionamentos } = dados;

  // MATEMÁTICA E AGRUPAMENTOS
  const totalAcumulado = registros.reduce((acc, curr) => acc + (curr.volume || 1), 0);
  const platMap: Record<string, number> = { Imprensa: 0, Instagram: 0, 'X/Twitter': 0, Facebook: 0, LinkedIn: 0, YouTube: 0 };
  
  registros.forEach(r => {
    if (r.plataforma && r.plataforma !== '-') {
      platMap[r.plataforma] = (platMap[r.plataforma] || 0) + (r.volume || 1);
    }
  });

  const timelineItens = registros.filter(r => r.mostrarTimeline);
  const clippings = registros.filter(r => r.gerarClipping);

  const graficoDias = Array.from(new Set(registros.map(r => r.data))).filter(d => d !== '-' && d !== '' && d.includes('/'));
  const X0 = 43, X1 = 552.4, BASE = 741.2, LARG = 25.3, UNID = 17.3;
  const passo = graficoDias.length > 0 ? (X1 - X0) / graficoDias.length : 0;
  
  const coresPlataforma: Record<string, string> = {
    Imprensa: 'var(--roxo)', Instagram: 'var(--turquesa)', 'X/Twitter': 'var(--petroleo)',
    Facebook: 'var(--verde)', LinkedIn: 'var(--lima)', YouTube: 'var(--laranja)'
  };

  const getCorPontoTimeline = (tonalidade: string) => {
    const t = tonalidade.toUpperCase();
    if (t === 'NEGATIVA') return 'neg';
    if (t === 'NEUTRA') return 'neu';
    if (t === 'POSITIVA') return 'pos';
    return 'acl';
  };
  const getCorTextoTimeline = (tonalidade: string) => {
    const t = tonalidade.toUpperCase();
    if (t === 'NEGATIVA') return 'c-verm';
    if (t === 'NEUTRA') return 'c-neutra';
    return 'c-cinza';
  };

  const st = (b: string | number, left?: string | number, extra?: any) => ({
    '--b': typeof b === 'number' ? `${b}pt` : b,
    ...(left && { left: typeof left === 'number' ? `${left}pt` : left }),
    ...extra
  } as React.CSSProperties);

  return (
    <div className="doc">
      
      {/* BARRA DE CONTROLE WEB */}
      <header className="print-hidden w-full max-w-[595pt] bg-[#003641] text-white p-4 rounded-xl flex justify-between items-center shadow-lg">
        <div className="flex gap-4 items-center">
          <Link href="/" className="text-sm text-slate-300 hover:text-white">← Voltar</Link>
          <div className="h-6 w-px bg-white/20"></div>
          <span className="font-bold">Gerador de Relatórios</span>
        </div>
        <button className="bg-[#00AE9D] hover:bg-[#008f81] text-white text-xs font-bold py-2 px-4 rounded-lg">
          Ctrl + P (Imprimir/Salvar PDF)
        </button>
      </header>

      {/* ======================= PÁGINA 1 ======================= */}
      <section className="page" id="p1">
        <div className="bg" style={{ height: '205.2pt' }}></div>
        <span className="t wrap z10 c-branco" style={st('31.6pt', '32.4pt', { width: '370pt' })}>
          Presidência - Superintendência Negócios Digitais, Marketing e Experiência do Cooperado
        </span>
        <img className="logo" src="/logo-sicoob.svg" alt="Sicoob" style={{ position: 'absolute', left: '447.85pt', top: '25.88pt', width: '115.17pt', height: '29.99pt' }} />
        
        <span className="t z95 b c-lima" style={st('70.4pt', '32.4pt')}>RELATÓRIO DE MONITORAMENTO DE CRISE</span>
        <span className="t z24 b c-branco" style={st('117.2pt', '32.4pt')}>{geral.titulo_crise}</span>
        <span className="t z15 b c-lima" style={st('147.8pt', '32.4pt')}>{geral.subtitulo_unidade}</span>
        <span className="t z85 c-branco" style={st('182.7pt', '32.4pt')}>
          Início do monitoramento: {geral.inicio_monitoramento}   ·   Edição nº {geral.edicao_numero || '--'}   ·   Período: {geral.inicio_monitoramento.split(',')[0]} a {geral.ultima_atualizacao}   ·   Última atualização: {geral.ultima_atualizacao}
        </span>

        {/* RISCO E STATUS */}
        <div className="card" style={{ position:'absolute', left:'32.4pt', top:'219.6pt', width:'258.1pt', height:'95pt' }}></div>
        <span className="t z75 b sp c-cinza" style={st('238.6pt', '46.8pt')}>RISCO PARA A INSTITUIÇÃO</span>
        <span className="t z75 b c-cinza r" style={st('238.6pt', undefined, { right: 'calc(var(--W) - 276.1pt)' })}>→ {geral.risco_tendencia}</span>
        <span className={`t z26 b ${geral.nivel_risco === 'ALTO' ? 'c-verm' : 'c-turq'}`} style={st('273.5pt', '46.8pt')}>{geral.nivel_risco}</span>
        <span className="t wrap z8 c-cinza" style={st('290.9pt', '46.8pt', { width: '229.3pt' })}>{geral.risco_texto}</span>

        <div className="card" style={{ position:'absolute', left:'304.9pt', top:'219.6pt', width:'258.1pt', height:'95pt' }}></div>
        {/* CORREÇÃO AQUI: className ao invés de class */}
        <span className="t z75 b sp c-cinza" style={st('238.6pt', '319.3pt')}>STATUS DA CRISE</span>
        <span className="t z75 b c-cinza r" style={st('238.6pt', undefined, { right: 'calc(var(--W) - 548.7pt)' })}>→ {geral.status_tendencia}</span>
        <span className="t z19 b c-roxo" style={st('270.7pt', '319.3pt')}>{geral.status_crise}</span>
        <span className="t wrap z8 c-cinza" style={st('290.9pt', '319.3pt', { width: '229.3pt' })}>{geral.status_texto}</span>

        {/* 4 INDICADORES NUMÉRICOS */}
        <div className="card" style={{ position:'absolute', left:'32.4pt', top:'327.6pt', width:'99.6pt', height:'86.4pt', background:'var(--petroleo)' }}></div>
        <span className="t z7 b c-branco" style={st('343.2pt', '43.2pt')}>NOVAS MENÇÕES<br/>AO SICOOB</span>
        <span className="t z26 b c-branco" style={st('387.7pt', '43.2pt')}>{geral.novas_mencoes_qtd}</span>
        <span className="t z7 c-lima" style={st('401.5pt', '43.2pt')}>{geral.novas_mencoes_detalhe}</span>

        <div className="card" style={{ position:'absolute', left:'142.8pt', top:'327.6pt', width:'99.6pt', height:'86.4pt' }}></div>
        <span className="t z7 b c-cinza" style={st('343.2pt', '153.6pt')}>MENÇÕES GERAIS<br/>AO TEMA</span>
        <span className="t z26 b c-claro" style={st('387.7pt', '153.6pt')}>{geral.mencoes_gerais_tema.split(' ')[0]}</span>
        <span className="t z7 c-cinza" style={st('401.5pt', '153.6pt')}>{geral.mencoes_gerais_tema.replace(/^\d+\s/, '')}</span>

        <div className="card" style={{ position:'absolute', left:'253.3pt', top:'327.6pt', width:'199.3pt', height:'86.4pt' }}></div>
        <span className="t z7 b c-cinza" style={st('343.2pt', '264.1pt')}>MENÇÕES AO SICOOB ACUMULADAS</span>
        <span className="t z26 b c-pet" style={st('387.7pt', '264.1pt')}>{totalAcumulado}</span>
        <span className="t z7 c-cinza" style={st('401.5pt', '264.1pt')}>desde {geral.inicio_monitoramento.split('/')[0]}/{geral.inicio_monitoramento.split('/')[1]}</span>
        
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
        <span className="t z26 b c-claro" style={st('387.7pt', '474.2pt')}>{geral.acionamentos_imprensa_card.split(' ')[0]}</span>
        <span className="t z7 c-cinza" style={st('401.5pt', '474.2pt')}>{geral.acionamentos_imprensa_card.replace(/^\d+\s/, '')}</span>

        {/* TEXTOS ANALÍTICOS */}
        <span className="t z85 b c-turq" style={st('440.5pt', '32.4pt')}>O QUE MUDOU</span>
        <span className="t wrap z9 lh119 c-texto" style={st('442.1pt', '162pt', { width: '404pt' })}>{geral.o_que_mudou}</span>
        
        <div style={{ position:'absolute', left:'32.4pt', top: '492.83pt', width: '530.6pt', height: '.74pt', background: 'var(--linha)' }}></div>
        
        <span className="t z85 b c-turq" style={st('507.4pt', '32.4pt')}>O QUE SIGNIFICA<br/>PARA O SICOOB</span>
        <span className="t z7 i c-cinza" style={st('534.7pt', '32.4pt')}>Protagonismo: {geral.protagonismo}</span>
        <span className="t wrap z9 lh119 c-texto" style={st('509pt', '162pt', { width: '404pt' })}>{geral.o_que_significa}</span>

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
            const itensDoDia = registros.filter(r => r.data === dia && r.plataforma !== '-');
            const x = X0 + passo * i + (passo - LARG) / 2;
            let topo = BASE;
            let totalDoDia = 0;

            return (
              <div key={dia}>
                {itensDoDia.map((item, idx) => {
                  const alt = (item.volume || 1) * UNID;
                  topo -= alt;
                  totalDoDia += (item.volume || 1);
                  return <div key={idx} style={{ position: 'absolute', left: `${x}pt`, top: `${topo}pt`, width: `${LARG}pt`, height: `${alt}pt`, background: coresPlataforma[item.plataforma] || 'var(--cinza)' }}></div>;
                })}
                {totalDoDia > 0 && <span className="t c z8 c-texto" style={st(`${topo - 4.3}pt`, `${x + LARG / 2 - 30}pt`, { width: '60pt' })}>{totalDoDia}</span>}
                <span className="t c z75 c-cinza" style={st('755pt', `${x + LARG / 2 - 30}pt`, { width: '60pt' })}>{dia}</span>
              </div>
            );
          })}
        </div>

        <span className="t wrap z7 c-cinza" style={st('783.1pt', '32.4pt', { width: '531pt' })}><b>Legenda.</b>  Risco (define a frequência de monitoramento): Baixo · Médio · Alto.  Status: Sinais · Fase aguda · Em desdobramento · Controlado · Encerrado.  Protagonismo: Protagonista · Parte envolvida · Citação incidental · Sem menção.</span>
        <span className="t z75 i c-verm rodape">Documento interno · Sicoob — não redistribuir fora do ambiente autorizado.</span>
        <span className="t z8 c-cinza r num">1</span>
      </section>

      {/* ======================= PÁGINA 2 ======================= */}
      <section className="page" id="p2">
        <div className="bg" style={{ height: '68.4pt' }}></div>
        <span className="t z12 b c-lima" style={st('30pt', '32.4pt')}>EVOLUÇÃO · ACIONAMENTOS</span>
        <span className="t z8 c-branco" style={st('50pt', '32.4pt')}>{geral.titulo_crise.toUpperCase()} · {geral.subtitulo_unidade.toUpperCase()} · EDIÇÃO DE {geral.ultima_atualizacao.toUpperCase()}</span>
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
        <span className="t z75 c-cinza" style={st('124.7pt', '294.5pt')}>Sem menção ao Sicoob (contexto)</span>
        <span className="t z75 c-cinza" style={st('124.7pt', '452.9pt')}>Próximo marco</span>

        <div style={{ position: 'absolute', left: '113.05pt', top: '151.2pt', width: '1.5pt', height: '330pt', background: 'var(--linha)' }}></div>

        {timelineItens.map((item, idx) => {
          const baseB = 152.5 + (idx * 36);
          const corPonto = getCorPontoTimeline(item.tonalidade);
          const corTextoTag = getCorTextoTimeline(item.tonalidade);
          
          if (item.proximoMarco) {
            return (
              <div key={idx} style={st(baseB, undefined, { position: 'static' })}>
                <span className="t z85 b c-roxo tl-data">Próximo</span><i className="dot next"></i>
                <span className="t wrap z85 b c-texto tl-txt">{item.fato}</span>
              </div>
            );
          }

          if (!item.envolveSicoob) {
            return (
              <div key={idx} style={st(baseB, undefined, { position: 'static' })}>
                <span className="t z85 b c-pet tl-data">{item.data}</span><i className="dot p"></i>
                <span className="t wrap z85 c-cinza tl-txt">{item.fato}</span>
              </div>
            );
          }

          return (
            <div key={idx} style={st(baseB, undefined, { position: 'static' })}>
              <span className="t z85 b c-pet tl-data">{item.data}</span><i className={`dot g ${corPonto}`}></i>
              <span className="t wrap z85 c-texto tl-txt">{item.fato}</span>
              <span className={`t z7 b tl-tag ${corTextoTag}`}>{item.tonalidade.toUpperCase()}</span>
            </div>
          );
        })}

        <span className="t z13 b c-turq" style={st('499pt', '32.4pt')}>ACIONAMENTOS DE IMPRENSA</span>
        {acionamentos.length === 0 && <span className="t z8 i c-cinza" style={st('521.3pt', '32.4pt')}>Nenhum acionamento no período.</span>}
        
        {acionamentos.length > 0 && (
          <table className="tab" style={{ position: 'absolute' }}>
            <colgroup><col style={{width:'44.6pt'}}/><col style={{width:'68.4pt'}}/><col style={{width:'68.4pt'}}/><col style={{width:'126pt'}}/><col style={{width:'57.6pt'}}/><col style={{width:'100.8pt'}}/><col style={{width:'64.8pt'}}/></colgroup>
            <thead><tr><th>Data</th><th>Veículo</th><th>Jornalista</th><th>Demanda</th><th>Prazo</th><th>Resposta</th><th>Status</th></tr></thead>
            <tbody>
              {acionamentos.map((ac, idx) => (
                <tr key={idx}><td>{ac.data}</td><td>{ac.veiculo}</td><td>{ac.jornalista}</td><td>{ac.demanda}</td><td>{ac.prazo}</td><td>{ac.resposta}</td><td>{ac.status}</td></tr>
              ))}
            </tbody>
          </table>
        )}

        <span className="t z75 i c-verm rodape">Documento interno · Sicoob — não redistribuir fora do ambiente autorizado.</span>
        <span className="t z8 c-cinza r num">2</span>
      </section>

      {/* ======================= PÁGINA 3 ======================= */}
      <section className="page" id="p3">
        <div className="bg" style={{ height: '68.4pt' }}></div>
        <span className="t z12 b c-lima" style={st('30pt', '32.4pt')}>CONTEXTO DO CASO</span>
        <span className="t z8 c-branco" style={st('50pt', '32.4pt')}>{geral.titulo_crise.toUpperCase()} · {geral.subtitulo_unidade.toUpperCase()} · EDIÇÃO DE {geral.ultima_atualizacao.toUpperCase()}</span>
        <img className="logo" src="/logo-sicoob.svg" alt="Sicoob" style={{ position: 'absolute', left: '465.85pt', top: '20.86pt', width: '97.17pt', height: '25.31pt' }} />

        <span className="t z13 b c-turq" style={st('99.4pt', '32.4pt')}>ANÁLISE DO CASO</span>
        <span className="t z75 i c-cinza" style={st('119.1pt', '32.4pt')}>Texto de referência: escrito na abertura do caso e revisado só quando o papel do Sicoob mudar.  Última revisão: {geral.analise_revisao_data}.</span>
        <span className="t wrap z11 lh145 b c-pet" style={st('149.1pt', '32.4pt', { width: '530.6pt' })}>{geral.analise_caso}</span>

        <div className="card" style={{ position:'absolute', left:'32.4pt', top:'190.8pt', width:'258.1pt', height:'115.2pt' }}></div>
        <span className="t z75 b sp c-turq" style={st('209.8pt', '46.8pt')}>PAPEL DO SICOOB</span>
        <span className="t wrap z9 lh119 c-texto" style={st('231.1pt', '46.8pt', { width: '229.3pt' })}>{geral.papel_sicoob}</span>

        <div className="card" style={{ position:'absolute', left:'304.9pt', top:'190.8pt', width:'258.1pt', height:'115.2pt' }}></div>
        <span className="t z75 b sp c-turq" style={st('209.8pt', '319.3pt')}>QUEM ESTÁ NO CENTRO DA PAUTA</span>
        <span className="t wrap z9 lh119 c-texto" style={st('231.1pt', '319.3pt', { width: '229.3pt' })}>{geral.centro_pauta}</span>

        <span className="t z75 b sp c-pet" style={st('335.1pt', '32.4pt')}>GATILHOS DE ESCALADA</span>
        {geral.gatilhos_escalada.split('\n').map((gatilho, idx) => {
          const bBase = 356.7 + (idx * 16.8);
          return (
            <div key={idx} style={st(bBase, undefined, { position: 'static' })}>
              <span className="t z9 c-texto" style={st(bBase, '32.4pt')}>•</span>
              <span className="t z9 c-texto" style={st(bBase + 1.5, '44.4pt')}>{gatilho}</span>
            </div>
          );
        })}

        <span className="t z75 i c-verm rodape">Documento interno · Sicoob — não redistribuir fora do ambiente autorizado.</span>
        <span className="t z8 c-cinza r num">3</span>
      </section>

      {/* ======================= PÁGINA 4+ ======================= */}
      {clippings.map((clip, idx) => (
        <section className="page" key={idx}>
          <div className="bg" style={{ height: '68.4pt' }}></div>
          <span className="t z12 b c-lima" style={st('30pt', '32.4pt')}>ANEXO · REGISTRO DE PUBLICAÇÃO</span>
          <span className="t z8 c-branco" style={st('50pt', '32.4pt')}>{geral.titulo_crise.toUpperCase()} · {geral.subtitulo_unidade.toUpperCase()} · EDIÇÃO DE {geral.ultima_atualizacao.toUpperCase()}</span>
          <img className="logo" src="/logo-sicoob.svg" alt="Sicoob" style={{ position: 'absolute', left: '465.85pt', top: '20.86pt', width: '97.17pt', height: '25.31pt' }} />

          <div style={{ position:'absolute', left:'32.4pt', top:'86.4pt', width:'97.2pt', height:'21.6pt', borderRadius:'10.8pt', background:'var(--roxo)' }}></div>
          <span className="t z85 b c-branco c" style={st('100.6pt', '32.4pt', { width: '97.2pt' })}>IMPRENSA</span>
          <span className="t z8 c-cinza r" style={st('98pt', undefined, { right: 'calc(var(--W) - 562.8pt)' })}>Publicação {idx + 1} de {clippings.length}</span>
          <span className="t z95 b c-turq" style={st('130.5pt', '32.4pt')}>{clip.plataforma}</span>
          <span className="t wrap z15 lh189 b c-pet" style={st('156.2pt', '32.4pt', { width: '530.6pt' })}>{clip.fato}</span>

          <div className="card" style={{ position:'absolute', left:'32.4pt', top:'195.8pt', width:'126.2pt', height:'43.2pt' }}></div>
          <div className="card" style={{ position:'absolute', left:'167.2pt', top:'195.8pt', width:'126.2pt', height:'43.2pt' }}></div>
          <div className="card" style={{ position:'absolute', left:'302pt', top:'195.8pt', width:'126.2pt', height:'43.2pt' }}></div>
          <div className="card" style={{ position:'absolute', left:'436.8pt', top:'195.8pt', width:'126.2pt', height:'43.2pt' }}></div>
          
          <span className="t z65 b c-cinza" style={st('208.1pt', '41.8pt')}>PUBLICAÇÃO</span>
          <span className="t z9 b c-texto" style={st('225pt', '41.8pt')}>{clip.data}</span>
          <span className="t z65 b c-cinza" style={st('208.1pt', '176.6pt')}>LINK</span>
          <span className="t z9 i c-cinza" style={st('225pt', '176.6pt')}>{clip.link || 'Não informado'}</span>
          <span className="t z65 b c-cinza" style={st('208.1pt', '311.4pt')}>AUTORIA</span>
          <span className="t z9 b c-texto" style={st('225pt', '311.4pt')}>{clip.autoria || '--'}</span>
          <span className="t z65 b c-cinza" style={st('208.1pt', '446.2pt')}>TONALIDADE</span>
          <span className="t z9 b c-texto" style={st('225pt', '446.2pt')}>{clip.tonalidade.toUpperCase()}</span>

          <div className="tag-print" style={{ left: '31.9pt', width: '165.19pt', borderColor: 'var(--petroleo)' }}></div>
          <span className="t z7 b c-pet c" style={st('264.1pt', '32.4pt', { width: '164.2pt' })}>PROTAGONISMO: {geral.protagonismo.toUpperCase()}</span>

          <div className="card" style={{ position:'absolute', left:'32.4pt', top:'284.4pt', width:'530.6pt', height:'80.6pt', background:'var(--amarelo)' }}></div>
          <span className="t z75 b sp c-oliva" style={st('300.5pt', '46.8pt')}>O QUE A MATÉRIA DIZ SOBRE O SICOOB</span>
          <span className="t wrap z9 lh119 c-texto" style={st('319.7pt', '46.8pt', { width: '501.8pt' })}>{clip.trecho}</span>

          <svg style={{ position:'absolute', left:'31.9pt', top:'377.5pt', width:'531.6pt', height:'411.4pt' }} viewBox="0 0 531.6 411.4">
            <rect x=".5" y=".5" width="530.6" height="410.4" rx="5.76" fill="#FAFBFB" stroke="#A9B5B9" strokeWidth=".99" strokeDasharray="3.97 2.98"/>
          </svg>
          <span className="t z10 b c-cinza c" style={st('546.5pt', '32.4pt', { width: '530.6pt' })}>MATÉRIA NA ÍNTEGRA</span>
          <span className="t wrap z85 c-cinza c" style={st('575.2pt', '85.7pt', { width: '424pt' })}>Espaço reservado para o print da matéria gerado via Link.</span>

          <span className="t z75 i c-verm rodape">Documento interno · Sicoob — não redistribuir fora do ambiente autorizado.</span>
          <span className="t z8 c-cinza r num">{3 + idx + 1}</span>
        </section>
      ))}

    </div>
  );
}