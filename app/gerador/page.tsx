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

function parseDateBR(str: string) {
  if (!str) return 0;
  const parts = str.split(/[\s,\/h:]+/).filter(Boolean);
  const d = parseInt(parts[0], 10) || 1;
  const m = parseInt(parts[1], 10) || 1;
  let y = new Date().getFullYear();
  if (parts[2] && parts[2].length === 4) y = parseInt(parts[2], 10);
  return new Date(y, m - 1, d).getTime();
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

  // 2. BUSCA DE DADOS
  const dados = await obterDadosDoRelatorio();
  const { geral = {}, registros = [], acionamentos = [] } = dados;

  const alertasDebug: string[] = [];
  if (geral.erro_api) alertasDebug.push(`ERRO DE CONEXÃO: ${geral.erro_api}`);
  if (!geral.titulo_crise && !geral.erro_api) alertasDebug.push('Aba Geral: titulo_crise vazio');
  if (registros.length === 0 && !geral.erro_api) alertasDebug.push('Aba Registro_Central: Nenhum dado preenchido.');

  // =======================================================================
  // TEXTOS DINÂMICOS & VARIÁVEIS
  // =======================================================================
  const tituloOrgao = geral.titulo_orgao || 'Presidência - Superintendência Negócios Digitais, Marketing e Experiência do Cooperado';
  const tituloOQueMudou = geral.titulo_o_que_mudou || 'O QUE MUDOU';
  const tituloOQueSignifica = geral.titulo_o_que_significa || 'O QUE SIGNIFICA PARA O SICOOB';

  const titulo = geral.titulo_crise || 'TÍTULO NÃO DEFINIDO';
  const subtitulo = geral.subtitulo_unidade || 'UNIDADE NÃO DEFINIDA';
  const ultimaAtualizacao = geral.ultima_atualizacao || '--/--/----';
  const edicao = geral.edicao_numero || '--';
  const protagonismo = geral.protagonismo || 'Não informado';
  
  const inicioMon = geral.inicio_monitoramento || '';
  const inicioData = inicioMon.includes(',') ? inicioMon.split(',')[0] : inicioMon;
  const mesAno = inicioMon.includes('/') ? `${inicioMon.split('/')[0]}/${inicioMon.split('/')[1]}` : inicioMon;

  const gatilhos = (geral.gatilhos_escalada || '').split('\n').filter(g => g.trim() !== '');
  
  // Cores do Risco Específicas
  const nivelRisco = (geral.nivel_risco || 'BAIXO').toUpperCase();
  const corRisco = nivelRisco === 'ALTO' ? '#003641' : nivelRisco === 'MÉDIO' ? '#C9D200' : '#7DB61C';

  // =======================================================================
  // MATEMÁTICA AUTOMATIZADA
  // =======================================================================
  const registrosValidos = registros.filter(r => r.plataforma && r.plataforma !== '-');
  const registrosSicoob = registrosValidos.filter(r => r.envolveSicoob);

  const mencoesGeraisQtd = registrosValidos.reduce((acc, curr) => acc + (curr.volume || 1), 0);
  const totalAcumulado = registrosSicoob.reduce((acc, curr) => acc + (curr.volume || 1), 0);

  let novasMencoesQtd = 0;
  if (inicioMon === ultimaAtualizacao) {
    novasMencoesQtd = totalAcumulado;
  } else {
    const timeUltimaAtt = parseDateBR(ultimaAtualizacao);
    novasMencoesQtd = registrosSicoob
      .filter(r => parseDateBR(r.dataColeta) >= timeUltimaAtt)
      .reduce((acc, curr) => acc + (curr.volume || 1), 0);
  }

  const acionamentosValidos = acionamentos.filter(a => a.data && a.veiculo && a.jornalista && a.demanda);
  const acionamentosQtd = acionamentosValidos.length;

  const platMap: Record<string, number> = { Imprensa: 0, Instagram: 0, 'X/Twitter': 0, Facebook: 0, LinkedIn: 0, YouTube: 0 };
  registrosSicoob.forEach(r => { platMap[r.plataforma] = (platMap[r.plataforma] || 0) + (r.volume || 1); });

  const timelineItens = registros.filter(r => r.mostrarTimeline);
  const clippings = registros.filter(r => r.gerarClipping).map((c, i) => ({ ...c, idUnico: `clip_${i}` }));

  // =======================================================================
  // MOTOR DO GRÁFICO RESPONSIVO
  // =======================================================================
  const graficoDias = Array.from(new Set(registrosSicoob.map(r => r.dataPost)))
    .filter(d => d && d !== '-' && d.includes('/'))
    .sort((a, b) => parseDateBR(a) - parseDateBR(b));

  let maxDia = 0;
  graficoDias.forEach(dia => {
    const volDia = registrosSicoob.filter(r => r.dataPost === dia).reduce((acc, curr) => acc + (curr.volume || 1), 0);
    if (volDia > maxDia) maxDia = volDia;
  });

  const MAX_CHART_HEIGHT_PX = 135; // Teto do gráfico para não invadir textos
  const PXP_PER_UNIT = maxDia > 0 ? Math.min(22, MAX_CHART_HEIGHT_PX / maxDia) : 22;
  
  const coresPlataforma: Record<string, string> = { Imprensa: '#49479D', Instagram: '#00AE9D', 'X/Twitter': '#003641', Facebook: '#7DB61C', LinkedIn: '#C9D200', YouTube: '#D9962B' };

  const getCorPontoTimeline = (ton: string) => { const t = (ton||'').toUpperCase(); return t==='NEGATIVA'?'bg-[#B23A3A]':t==='NEUTRA'?'bg-[#7F8F95]':t==='POSITIVA'?'bg-[#4E8A12]':'bg-[#C3CDD0]'; };
  const getCorTextoTimeline = (ton: string) => { const t = (ton||'').toUpperCase(); return t==='NEGATIVA'?'text-[#B23A3A]':t==='NEUTRA'?'text-[#7F8F95]':'text-[#5B6B70]'; };

  return (
    <div className="doc">
      <Script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js" strategy="lazyOnload" />

      {/* HEADER WEB */}
      <header className="print-hidden w-full max-w-[297mm] bg-[#003641] text-white p-4 rounded-xl flex justify-between items-center shadow-lg">
        <div className="flex gap-4 items-center">
          <Link href="/" className="text-sm text-slate-300 hover:text-white">← Voltar</Link>
          <div className="h-6 w-px bg-white/20"></div>
          <span className="font-bold">Gerador de Relatórios</span>
        </div>
        <PrintController clippings={clippings} />
      </header>

      {/* PAINEL DE ERRO PLANILHA */}
      {alertasDebug.length > 0 && (
        <div className="print-hidden w-full max-w-[297mm] bg-[#FFF6CC] border border-[#E8D277] text-[#6B5300] p-5 rounded-xl shadow-sm mb-4">
          <h3 className="font-bold text-sm mb-3">Atenção: Problema na leitura da planilha!</h3>
          <ul className="text-xs grid grid-cols-1 gap-1.5 list-disc pl-5 font-mono bg-white/50 p-3 rounded border border-[#E8D277]/50">
            {alertasDebug.map((alerta, i) => (<li key={i} className="font-semibold text-red-600">{alerta}</li>))}
          </ul>
        </div>
      )}

      {/* ==========================================================
          PÁGINA 1: RESUMO (Layout Modular via Flex/Grid)
          ========================================================== */}
      <section className="custom-page" id="p1">
        
        {/* Header A4 */}
        <div className="bg-[#003641] text-white px-10 pt-8 pb-5 shrink-0 flex flex-col">
          <div className="flex justify-between items-start">
            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-wider mb-2 opacity-80">{tituloOrgao}</span>
              <span className="text-[#C9D200] font-bold text-[11px] uppercase tracking-widest mb-4">Relatório de Monitoramento de Crise</span>
              <h1 className="text-3xl font-bold mb-1 leading-tight">{titulo}</h1>
              <h2 className="text-xl font-bold text-[#C9D200]">{subtitulo}</h2>
            </div>
            <img src="/logo-sicoob.svg" alt="Sicoob" className="h-8 object-contain shrink-0 ml-4 mt-2" />
          </div>
          <div className="flex justify-between items-center text-[10px] uppercase tracking-wider font-semibold opacity-70 mt-5 border-t border-white/20 pt-3">
             <span>Início do monitoramento: {inicioMon}</span>
             <span>Edição nº {edicao}</span>
             <span>Período: {inicioData} a {ultimaAtualizacao}</span>
             <span>Última atualização: {ultimaAtualizacao}</span>
          </div>
        </div>

        {/* Corpo A4 */}
        <div className="flex-1 p-10 flex flex-col gap-6">
          
          {/* Row 1: Risco e Status */}
          <div className="grid grid-cols-2 gap-8">
             <div className="bg-[#EEF2F3] rounded-lg p-5 flex flex-col">
                <div className="flex justify-between items-center mb-3">
                   <span className="text-[11px] font-bold text-[#5B6B70] tracking-widest uppercase">Risco para a instituição</span>
                   <span className="text-[11px] font-bold text-[#00AE9D] uppercase">→ {geral.risco_tendencia}</span>
                </div>
                <span className="text-[32px] font-bold mb-2 uppercase leading-none" style={{color: corRisco}}>{nivelRisco}</span>
                <p className="text-[12.5px] text-[#5B6B70] leading-relaxed">{geral.risco_texto}</p>
             </div>
             <div className="bg-[#EEF2F3] rounded-lg p-5 flex flex-col">
                <div className="flex justify-between items-center mb-3">
                   <span className="text-[11px] font-bold text-[#5B6B70] tracking-widest uppercase">Status da Crise</span>
                   <span className="text-[11px] font-bold text-[#00AE9D] uppercase">→ {geral.status_tendencia}</span>
                </div>
                <span className="text-[26px] font-bold mb-2 uppercase leading-none text-[#49479D]">{geral.status_crise}</span>
                <p className="text-[12.5px] text-[#5B6B70] leading-relaxed">{geral.status_texto}</p>
             </div>
          </div>

          {/* Row 2: KPIs */}
          <div className="grid grid-cols-4 gap-4">
             <div className="bg-[#003641] text-white rounded-lg px-4 py-5 flex flex-col justify-center text-center">
                <span className="text-[9px] font-bold uppercase tracking-wider opacity-80 mb-2 leading-tight">Novas menções<br/>ao Sicoob</span>
                <span className="text-4xl font-bold text-white mb-1">{novasMencoesQtd}</span>
                <span className="text-[9px] text-[#C9D200]">{geral.novas_mencoes_detalhe || 'nesta edição'}</span>
             </div>
             <div className="bg-[#EEF2F3] rounded-lg px-4 py-5 flex flex-col justify-center text-center">
                <span className="text-[9px] font-bold uppercase tracking-wider text-[#5B6B70] mb-2 leading-tight">Menções gerais<br/>ao tema</span>
                <span className="text-3xl font-bold text-[#003641] mb-1">{mencoesGeraisQtd}</span>
                <span className="text-[9px] text-[#5B6B70]">desde {mesAno}</span>
             </div>
             <div className="bg-[#EEF2F3] rounded-lg px-4 py-5 flex flex-col justify-center text-center">
                <span className="text-[9px] font-bold uppercase tracking-wider text-[#5B6B70] mb-2 leading-tight">Menções ao Sicoob<br/>acumuladas</span>
                <span className="text-3xl font-bold text-[#003641] mb-1">{totalAcumulado}</span>
                <span className="text-[9px] text-[#5B6B70] mb-2">desde {mesAno}</span>
                
                {/* Micro-legenda compacta do card */}
                <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[8px] text-left mx-auto w-fit">
                   <div className="flex items-center gap-1.5"><span className="w-2 h-2 bg-[#49479D]"></span><span className="text-[#1E2B30]">Imprensa <b>{platMap['Imprensa']}</b></span></div>
                   <div className="flex items-center gap-1.5"><span className="w-2 h-2 bg-[#7DB61C]"></span><span className="text-[#1E2B30]">Facebook <b>{platMap['Facebook']}</b></span></div>
                   <div className="flex items-center gap-1.5"><span className="w-2 h-2 bg-[#00AE9D]"></span><span className="text-[#1E2B30]">Instagram <b>{platMap['Instagram']}</b></span></div>
                   <div className="flex items-center gap-1.5"><span className="w-2 h-2 bg-[#C9D200]"></span><span className="text-[#1E2B30]">LinkedIn <b>{platMap['LinkedIn']}</b></span></div>
                   <div className="flex items-center gap-1.5"><span className="w-2 h-2 bg-[#003641]"></span><span className="text-[#1E2B30]">X/Twitter <b>{platMap['X/Twitter']}</b></span></div>
                   <div className="flex items-center gap-1.5"><span className="w-2 h-2 bg-[#D9962B]"></span><span className="text-[#1E2B30]">YouTube <b>{platMap['YouTube']}</b></span></div>
                </div>
             </div>
             <div className="bg-[#EEF2F3] rounded-lg px-4 py-5 flex flex-col justify-center text-center">
                <span className="text-[9px] font-bold uppercase tracking-wider text-[#5B6B70] mb-2 leading-tight">Acionamentos<br/>de imprensa</span>
                <span className="text-3xl font-bold text-[#003641] mb-1">{acionamentosQtd}</span>
                <span className="text-[9px] text-[#5B6B70]">novos · em aberto</span>
             </div>
          </div>

          {/* Row 3: Textos Analíticos (Flexível e Seguro) */}
          <div className="grid grid-cols-2 gap-10 mt-2">
             <div className="flex flex-col">
                <h3 className="text-[#00AE9D] font-bold text-[11px] tracking-widest uppercase mb-3">{tituloOQueMudou}</h3>
                <p className="text-[13px] text-[#1E2B30] leading-relaxed whitespace-pre-wrap">{geral.o_que_mudou}</p>
             </div>
             <div className="flex flex-col">
                <h3 className="text-[#00AE9D] font-bold text-[11px] tracking-widest uppercase mb-1">{tituloOQueSignifica}</h3>
                <span className="text-[#5B6B70] italic text-[11px] mb-2">Protagonismo: {protagonismo}</span>
                <p className="text-[13px] text-[#1E2B30] leading-relaxed whitespace-pre-wrap">{geral.o_que_significa}</p>
             </div>
          </div>

          {/* Row 4: Gráfico Responsivo Modular */}
          <div className="flex-1 flex flex-col mt-2 border-t border-[#D5DDE0] pt-5">
             <div className="flex justify-between items-end mb-4">
                <h3 className="text-[#003641] font-bold text-[11px] tracking-widest uppercase">MENÇÕES AO SICOOB POR DIA DE COLETA, POR REDE</h3>
                <span className="text-[10px] italic text-[#5B6B70]">O total acumulado ({totalAcumulado}) fica no indicador acima, fora do gráfico</span>
             </div>
             
             {/* Legenda do Gráfico */}
             <div className="flex gap-6 mb-4 text-[10px] text-[#1E2B30]">
                 <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-[#49479D]"></span>Imprensa</div>
                 <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-[#00AE9D]"></span>Instagram</div>
                 <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-[#003641]"></span>X/Twitter</div>
                 <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-[#7DB61C]"></span>Facebook</div>
                 <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-[#C9D200]"></span>LinkedIn</div>
                 <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-[#D9962B]"></span>YouTube</div>
             </div>

             {/* Área de Plotagem Flexível */}
             <div className="flex-1 border-b border-[#D5DDE0] flex items-end justify-between px-6 pb-0.5 mt-2">
                 {graficoDias.map((dia) => {
                    const itensDoDia = registrosSicoob.filter(r => r.dataPost === dia);
                    const totalDoDia = itensDoDia.reduce((acc, curr) => acc + (curr.volume || 1), 0);
                    
                    return (
                      <div key={`chart-${dia}`} className="flex flex-col items-center w-10 h-full justify-end group">
                         {totalDoDia > 0 && <span className="text-[10px] font-bold text-[#1E2B30] mb-1">{totalDoDia}</span>}
                         
                         <div className="flex flex-col w-[32px] overflow-hidden">
                            {itensDoDia.map((item, idx) => {
                               const heightPx = (item.volume || 1) * PXP_PER_UNIT;
                               return (
                                 <div 
                                    key={idx} 
                                    style={{ height: `${heightPx}px`, backgroundColor: coresPlataforma[item.plataforma] || '#A9B5B9' }} 
                                    className="w-full"
                                 ></div>
                               );
                            })}
                         </div>
                         <span className="text-[10px] text-[#5B6B70] mt-2">{dia}</span>
                      </div>
                    );
                 })}
             </div>
          </div>
          
          {/* Rodapé Padrão (Sem posicionamento absoluto) */}
          <div className="flex justify-between items-center text-[9px] text-[#5B6B70] uppercase tracking-wider mt-4">
            <p className="italic text-[#B23A3A]">Documento interno Sicoob — Não redistribuir fora do ambiente autorizado.</p>
            <p className="font-bold">1</p>
          </div>
        </div>
      </section>

      {/* ==========================================================
          PÁGINA 2: TIMELINE (Modular)
          ========================================================== */}
      <section className="custom-page" id="p2">
        <div className="bg-[#003641] text-white px-10 pt-8 pb-5 shrink-0 flex flex-col">
          <div className="flex justify-between items-start">
            <div className="flex flex-col">
              <span className="text-[#C9D200] font-bold text-[14px] uppercase tracking-widest mb-1">Evolução · Acionamentos</span>
              <span className="text-[10px] uppercase tracking-wider opacity-80">{titulo} · {subtitulo} · Edição de {ultimaAtualizacao}</span>
            </div>
            <img src="/logo-sicoob.svg" alt="Sicoob" className="h-8 object-contain shrink-0 ml-4" />
          </div>
        </div>

        <div className="flex-1 p-10 flex flex-col gap-6">
           <h3 className="text-[#00AE9D] font-bold text-[14px] tracking-widest uppercase">Linha do Tempo das Menções</h3>
           
           <div className="flex items-center gap-6 text-[11px] text-[#5B6B70] mb-2">
              <span className="font-bold uppercase tracking-wider">Cita o Sicoob:</span>
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#B23A3A]"></span>negativa</div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#7F8F95]"></span>neutra</div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#4E8A12]"></span>positiva</div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full border-2 border-[#A9B5B9]"></span>Sem menção (contexto)</div>
              <div className="flex items-center gap-2"><span className="w-3.5 h-3.5 rounded-full border-2 border-[#49479D]"></span>Próximo marco</div>
           </div>

           {/* Lista da Timeline */}
           <div className="flex flex-col relative pl-4 pt-2">
              {timelineItens.map((item, idx) => {
                 const corPonto = getCorPontoTimeline(item.tonalidade);
                 const corTextoTag = getCorTextoTimeline(item.tonalidade);
                 const exibicaoTexto = item.textoTimeline || '';
                 
                 return (
                   <div key={`tl-${idx}`} className="timeline-item flex items-start gap-5 mb-5 relative z-10">
                      <div className="timeline-line"></div>
                      
                      <div className="w-[100px] text-right shrink-0 pt-0.5">
                         <span className={`font-bold text-[12px] ${item.proximoMarco ? 'text-[#49479D]' : 'text-[#003641]'}`}>
                           {item.proximoMarco ? 'Próximo' : item.dataPost}
                         </span>
                      </div>
                      
                      <div className="flex flex-col items-center shrink-0 pt-1 relative z-10 bg-white">
                         {item.proximoMarco ? (
                            <span className="w-3.5 h-3.5 rounded-full border-2 border-[#49479D] bg-white"></span>
                         ) : item.envolveSicoob ? (
                            <span className={`w-3 h-3 rounded-full ${corPonto}`}></span>
                         ) : (
                            <span className="w-3 h-3 rounded-full border-2 border-[#A9B5B9] bg-white"></span>
                         )}
                      </div>
                      
                      <div className="flex-1 flex justify-between items-start gap-4">
                         <p className={`text-[12.5px] leading-relaxed ${item.proximoMarco ? 'font-bold text-[#1E2B30]' : item.envolveSicoob ? 'text-[#1E2B30]' : 'text-[#5B6B70]'}`}>
                            {exibicaoTexto}
                         </p>
                         {item.envolveSicoob && !item.proximoMarco && (
                            <span className={`text-[9px] font-bold uppercase tracking-widest shrink-0 ${corTextoTag}`}>
                               {item.tonalidade}
                            </span>
                         )}
                      </div>
                   </div>
                 );
              })}
           </div>

           <h3 className="text-[#00AE9D] font-bold text-[14px] tracking-widest uppercase mt-6">Acionamentos de Imprensa</h3>
           {acionamentosValidos.length === 0 && <p className="text-[11px] italic text-[#5B6B70]">Nenhum acionamento no período.</p>}
           
           {acionamentosValidos.length > 0 && (
             <table className="tab mt-2">
               <colgroup><col style={{width:'10%'}}/><col style={{width:'15%'}}/><col style={{width:'15%'}}/><col style={{width:'25%'}}/><col style={{width:'12%'}}/><col style={{width:'15%'}}/><col style={{width:'8%'}}/></colgroup>
               <thead><tr><th>Data</th><th>Veículo</th><th>Jornalista</th><th>Demanda</th><th>Prazo</th><th>Resposta</th><th>Status</th></tr></thead>
               <tbody>{acionamentosValidos.map((ac, idx) => (<tr key={`ac-${idx}`}><td>{ac.data}</td><td>{ac.veiculo}</td><td>{ac.jornalista}</td><td>{ac.demanda}</td><td>{ac.prazo}</td><td>{ac.resposta}</td><td>{ac.status}</td></tr>))}</tbody>
             </table>
           )}
        </div>

        <div className="px-10 pb-6 flex justify-between items-center text-[9px] text-[#5B6B70] uppercase tracking-wider mt-auto">
          <p className="italic text-[#B23A3A]">Documento interno Sicoob — Não redistribuir fora do ambiente autorizado.</p>
          <p className="font-bold">2</p>
        </div>
      </section>

      {/* ==========================================================
          PÁGINA 3: CONTEXTO (Modular)
          ========================================================== */}
      <section className="custom-page" id="p3">
        <div className="bg-[#003641] text-white px-10 pt-8 pb-5 shrink-0 flex flex-col">
          <div className="flex justify-between items-start">
            <div className="flex flex-col">
              <span className="text-[#C9D200] font-bold text-[14px] uppercase tracking-widest mb-1">Contexto do Caso</span>
              <span className="text-[10px] uppercase tracking-wider opacity-80">{titulo} · {subtitulo} · Edição de {ultimaAtualizacao}</span>
            </div>
            <img src="/logo-sicoob.svg" alt="Sicoob" className="h-8 object-contain shrink-0 ml-4" />
          </div>
        </div>

        <div className="flex-1 p-10 flex flex-col gap-6">
           <h3 className="text-[#00AE9D] font-bold text-[14px] tracking-widest uppercase mb-1">Análise do Caso</h3>
           <p className="text-[11px] italic text-[#5B6B70]">Texto de referência, revisado quando o papel do Sicoob muda. Última revisão: {geral.analise_revisao_data || '--'}.</p>
           <p className="text-[14px] font-bold text-[#003641] leading-relaxed whitespace-pre-wrap">{geral.analise_caso}</p>

           <div className="grid grid-cols-2 gap-8 mt-4">
              <div className="bg-[#EEF2F3] rounded-lg p-6 flex flex-col">
                 <h4 className="text-[#00AE9D] font-bold text-[11px] tracking-widest uppercase mb-3">Papel do Sicoob</h4>
                 <p className="text-[13px] text-[#1E2B30] leading-relaxed whitespace-pre-wrap">{geral.papel_sicoob}</p>
              </div>
              <div className="bg-[#EEF2F3] rounded-lg p-6 flex flex-col">
                 <h4 className="text-[#00AE9D] font-bold text-[11px] tracking-widest uppercase mb-3">Quem está no centro da pauta</h4>
                 <p className="text-[13px] text-[#1E2B30] leading-relaxed whitespace-pre-wrap">{geral.centro_pauta}</p>
              </div>
           </div>

           <h3 className="text-[#003641] font-bold text-[12px] tracking-widest uppercase mt-6 mb-2">Gatilhos de Escalada</h3>
           <ul className="flex flex-col gap-3">
             {gatilhos.map((gatilho, idx) => (
                <li key={`gat-${idx}`} className="flex items-start gap-3 text-[13px] text-[#1E2B30]">
                   <span className="text-[#003641] font-bold mt-0.5">•</span>
                   <span>{gatilho}</span>
                </li>
             ))}
           </ul>
        </div>

        <div className="px-10 pb-6 flex justify-between items-center text-[9px] text-[#5B6B70] uppercase tracking-wider mt-auto">
          <p className="italic text-[#B23A3A]">Documento interno Sicoob — Não redistribuir fora do ambiente autorizado.</p>
          <p className="font-bold">3</p>
        </div>
      </section>

      {/* ==========================================================
          PÁGINAS 4+: CLIPPING DINÂMICO (Modular & Híbrido)
          ========================================================== */}
      {clippings.map((clip, idx) => (
        <section className="custom-page" id={`clipping-page-${clip.idUnico}`} key={clip.idUnico}>
          <div className="bg-[#003641] text-white px-10 pt-8 pb-5 shrink-0 flex flex-col">
            <div className="flex justify-between items-start">
              <div className="flex flex-col">
                <span className="text-[#C9D200] font-bold text-[14px] uppercase tracking-widest mb-1">Anexo · Registro de Publicação</span>
                <span className="text-[10px] uppercase tracking-wider opacity-80">{titulo} · {subtitulo} · Edição de {ultimaAtualizacao}</span>
              </div>
              <img src="/logo-sicoob.svg" alt="Sicoob" className="h-8 object-contain shrink-0 ml-4" />
            </div>
          </div>

          <div className="flex-1 p-10 flex flex-col gap-5">
             <div className="flex justify-between items-center border-b border-[#D5DDE0] pb-4">
                <div className="flex flex-col">
                   <span className="bg-[#49479D] text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full w-fit mb-3">Imprensa</span>
                   <h3 className="text-[#00AE9D] font-bold text-[12px] uppercase">{clip.plataforma}</h3>
                </div>
                <span className="text-[10px] text-[#5B6B70] uppercase tracking-wider font-semibold">Publicação {idx + 1} de {clippings.length}</span>
             </div>
             
             <h2 className="text-xl font-bold text-[#003641] leading-snug">{clip.fato}</h2>

             <div className="grid grid-cols-4 gap-4 mt-2">
                <div className="bg-[#EEF2F3] rounded-lg p-3 flex flex-col">
                   <span className="text-[9px] font-bold text-[#5B6B70] uppercase tracking-widest mb-1">Publicação</span>
                   <span className="text-[11px] font-bold text-[#1E2B30]">{clip.dataPost}</span>
                </div>
                <div className="bg-[#EEF2F3] rounded-lg p-3 flex flex-col overflow-hidden">
                   <span className="text-[9px] font-bold text-[#5B6B70] uppercase tracking-widest mb-1">Link</span>
                   <span className="text-[11px] font-bold text-[#1E2B30] italic truncate" title={clip.linkMateria}>{clip.linkMateria || 'Não informado'}</span>
                </div>
                <div className="bg-[#EEF2F3] rounded-lg p-3 flex flex-col">
                   <span className="text-[9px] font-bold text-[#5B6B70] uppercase tracking-widest mb-1">Autoria</span>
                   <span className="text-[11px] font-bold text-[#1E2B30]">{clip.autoria || '--'}</span>
                </div>
                <div className="bg-[#EEF2F3] rounded-lg p-3 flex flex-col">
                   <span className="text-[9px] font-bold text-[#5B6B70] uppercase tracking-widest mb-1">Tonalidade</span>
                   <span className="text-[11px] font-bold text-[#1E2B30]">{(clip.tonalidade || '').toUpperCase()}</span>
                </div>
             </div>

             <div className="flex items-center gap-4 mt-2">
                <span className="border border-[#003641] text-[#003641] text-[10px] font-bold uppercase tracking-widest px-4 py-1.5 rounded-full">PROTAGONISMO: {protagonismo.toUpperCase()}</span>
             </div>

             <div className="bg-[#F4F7CC] rounded-lg p-5 flex flex-col mt-2 shrink-0">
                <h4 className="text-[#5E6300] font-bold text-[11px] tracking-widest uppercase mb-2">O QUE A MATÉRIA DIZ SOBRE O SICOOB</h4>
                <p className="text-[13px] text-[#1E2B30] leading-relaxed">{clip.trecho}</p>
             </div>

             <h4 className="text-[#5B6B70] font-bold text-[11px] tracking-widest uppercase text-center mt-2">MATÉRIA NA ÍNTEGRA</h4>

             {/* BLOCO HÍBRIDO (Tela vs Impressão) */}
             <div className="flex-1 w-full rounded-lg overflow-hidden border border-dashed border-[#A9B5B9] bg-[#FAFBFB] relative min-h-[200px]">
                {/* Visível na Tela */}
                <div className="print-hidden w-full h-full flex flex-col items-center justify-center text-slate-400 p-4">
                    {clip.printUrl ? (
                        <iframe src={`/api/relatorios/file?id=${extractId(clip.printUrl)}`} className="w-full h-full border-none" title="Anexo" />
                    ) : (
                        <span className="text-[11px] font-bold tracking-widest uppercase text-[#5B6B70] text-center">Nenhum anexo fornecido na coluna PRINT.</span>
                    )}
                </div>

                {/* Oculto na Tela, Visível no PDF */}
                <div className="hidden print:block w-full h-full bg-white relative" id={`print-container-cover-${clip.idUnico}`}>
                   {clip.printUrl && (
                      <div className="w-full h-full flex flex-col items-center justify-center text-[#5B6B70]">
                        <p className="text-[10px] tracking-widest uppercase font-bold text-center mt-20">Renderização em Andamento...</p>
                      </div>
                   )}
                </div>
             </div>
          </div>

          <div className="px-10 pb-6 flex justify-between items-center text-[9px] text-[#5B6B70] uppercase tracking-wider mt-auto shrink-0">
            <p className="italic text-[#B23A3A]">Documento interno Sicoob — Não redistribuir fora do ambiente autorizado.</p>
            <p className="font-bold">{3 + idx + 1}</p>
          </div>
        </section>
      ))}

    </div>
  );
}