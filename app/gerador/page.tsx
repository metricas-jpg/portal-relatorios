import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { obterEmailsAutorizados, obterDadosDoRelatorio } from '@/lib/google-sheets';
import Image from 'next/image';
import Link from 'next/link';

export default async function GeradorPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect('/'); 
  
  const emailUsuario = session.user.email.toLowerCase();
  const emailsAutorizados = await obterEmailsAutorizados();

  if (!emailsAutorizados.includes(emailUsuario)) {
    return (
      <div className="min-h-screen bg-[#00262e] flex flex-col items-center justify-center text-center px-4">
        <h1 className="text-4xl font-bold text-white mb-4">Acesso Restrito</h1>
        <p className="text-slate-300 mb-8 max-w-md">O e-mail <strong>{emailUsuario}</strong> não tem permissão.</p>
        <Link href="/" className="bg-[#00AE9D] text-white px-6 py-3 rounded-xl font-bold hover:bg-[#008f81] transition">Voltar para o Portal</Link>
      </div>
    );
  }

  // Busca os dados reais da planilha no Backend
  const dados = await obterDadosDoRelatorio();
  const { geral, registros } = dados;

  // Lógica Matemática: Calcula os totais acumulados a partir do Registro Central
  const totalAcumulado = registros.reduce((acc, curr) => acc + (curr.volume || 1), 0);
  
  const contagemPorPlataforma = registros.reduce((acc, curr) => {
    if (curr.plataforma && curr.plataforma !== '-') {
      acc[curr.plataforma] = (acc[curr.plataforma] || 0) + (curr.volume || 1);
    }
    return acc;
  }, {} as Record<string, number>);

  // Monta a string no formato: "Imprensa 25 | Instagram 4 | X/Twitter 2"
  const stringPlataformas = Object.entries(contagemPorPlataforma)
    .sort((a, b) => b[1] - a[1]) // Ordena do maior para o menor
    .map(([plat, qtd]) => `${plat} ${qtd}`)
    .join(' | ');

  return (
    <div className="min-h-screen bg-[#f4f7f8] text-[#003641] print:bg-white print:m-0 print:p-0">
      
      {/* Barra de Controle (Visível apenas na tela, escondida no PDF) */}
      <header className="bg-[#003641] text-white h-16 flex justify-between items-center px-6 shadow-md print:hidden">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-slate-300 hover:text-white transition">← Voltar</Link>
          <h1 className="text-lg font-bold border-l border-white/20 pl-4">Gerador: {geral.titulo_crise}</h1>
        </div>
        
        <button className="bg-[#00AE9D] hover:bg-[#008f81] text-white text-xs font-bold py-2 px-4 rounded-lg flex items-center gap-2 cursor-pointer">
          <span className="hidden sm:inline">Aperte Ctrl + P para salvar o PDF</span>
          <span className="sm:hidden">Imprimir (PDF)</span>
        </button>
      </header>

      <main className="max-w-7xl mx-auto py-8 px-4 flex flex-col items-center print:py-0 print:px-0">
        
        {/* =========================================================================
            SLIDE 1: PÁGINA A4 PAISAGEM (297mm x 210mm)
            ========================================================================= */}
        <div className="w-[297mm] h-[210mm] bg-white shadow-2xl relative overflow-hidden flex flex-col print:shadow-none break-after-page">
          
          {/* CABEÇALHO DO RELATÓRIO */}
          <div className="bg-[#003641] text-white px-8 pt-6 pb-4 shrink-0 relative">
            <div className="flex justify-between items-start mb-4">
              <div className="max-w-2xl">
                <p className="text-[9px] font-semibold tracking-wider text-white uppercase mb-1">
                  Presidência - Superintendência Negócios Digitais, Marketing e Experiência do Cooperado
                </p>
                <p className="text-[10px] font-bold tracking-widest text-[#CADB2A] uppercase mb-4">
                  Relatório de Monitoramento de Crise
                </p>
                <h1 className="text-2xl font-bold leading-tight mb-1">
                  {geral.titulo_crise}
                </h1>
                <h2 className="text-lg font-semibold text-[#CADB2A]">
                  {geral.subtitulo_unidade}
                </h2>
              </div>
              
              <div className="flex flex-col items-end">
                <Image src="/logo-sicoob.svg" alt="Sicoob" width={110} height={35} className="object-contain" priority />
              </div>
            </div>

            {/* Linha de Metadados de Data */}
            <div className="flex justify-between items-center text-[9px] text-white font-medium uppercase tracking-wider pt-3 border-t border-white/20">
              <p>Início do monitoramento: {geral.inicio_monitoramento}</p>
              {geral.edicao_numero && <p>Edição nº {geral.edicao_numero}</p>}
              <p>Período: {geral.inicio_monitoramento.split(',')[0]} a {geral.ultima_atualizacao}</p>
              <p>Última atualização: {geral.ultima_atualizacao}</p>
            </div>
          </div>

          {/* CORPO DO SLIDE 1 */}
          <div className="flex-1 px-8 py-5 flex flex-col gap-4">
            
            {/* LINHA 1: Bloco de Risco e Status */}
            <div className="grid grid-cols-2 gap-4">
              {/* Card Risco */}
              <div>
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest border-b border-[#00AE9D] pb-1 mb-2">
                  Risco para a instituição
                </p>
                <div className="flex items-center gap-3 mb-1">
                  <h3 className={`text-xl font-bold uppercase ${geral.nivel_risco === 'ALTO' ? 'text-red-600' : geral.nivel_risco === 'MÉDIO' ? 'text-orange-500' : 'text-green-600'}`}>
                    {geral.nivel_risco}
                  </h3>
                  <span className="text-[#00AE9D] text-[10px] font-bold uppercase">
                    {geral.risco_tendencia}
                  </span>
                </div>
                <p className="text-[10px] text-[#003641] font-medium leading-snug">
                  {geral.risco_texto}
                </p>
              </div>

              {/* Card Status */}
              <div>
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest border-b border-[#00AE9D] pb-1 mb-2">
                  Status da crise
                </p>
                <div className="flex items-center gap-3 mb-1">
                  <h3 className="text-xl font-bold uppercase text-[#003641]">
                    {geral.status_crise}
                  </h3>
                  <span className="text-[#00AE9D] text-[10px] font-bold uppercase">
                    {geral.status_tendencia}
                  </span>
                </div>
                <p className="text-[10px] text-[#003641] font-medium leading-snug">
                  {geral.status_texto}
                </p>
              </div>
            </div>

            {/* LINHA 2: 4 Cartões de Indicadores Numéricos */}
            <div className="grid grid-cols-4 gap-3">
              <div className="bg-slate-50 border border-slate-200 p-2.5 rounded text-center flex flex-col justify-center">
                <p className="text-[8px] font-bold text-[#003641] uppercase mb-1">Novas Menções<br/>ao Sicoob</p>
                <p className="text-2xl font-bold text-[#00AE9D]">{geral.novas_mencoes_qtd}</p>
                <p className="text-[8px] text-slate-500 mt-1">{geral.novas_mencoes_detalhe}</p>
              </div>
              <div className="bg-slate-50 border border-slate-200 p-2.5 rounded text-center flex flex-col justify-center">
                <p className="text-[8px] font-bold text-[#003641] uppercase mb-1">Menções Gerais<br/>ao Tema</p>
                <p className="text-lg font-bold text-[#00AE9D] mt-1">{geral.mencoes_gerais_tema}</p>
              </div>
              <div className="bg-slate-50 border border-slate-200 p-2.5 rounded text-center flex flex-col justify-center">
                <p className="text-[8px] font-bold text-[#003641] uppercase mb-1">Menções ao Sicoob<br/>Acumuladas</p>
                <p className="text-2xl font-bold text-[#00AE9D]">{totalAcumulado}</p>
                <p className="text-[8px] text-slate-500 mt-1">desde {geral.inicio_monitoramento.split('/')[0]}/{geral.inicio_monitoramento.split('/')[1]}</p>
                <p className="text-[7px] text-slate-400 mt-0.5 leading-tight">{stringPlataformas}</p>
              </div>
              <div className="bg-slate-50 border border-slate-200 p-2.5 rounded text-center flex flex-col justify-center">
                <p className="text-[8px] font-bold text-[#003641] uppercase mb-1">Acionamentos<br/>de Imprensa</p>
                <p className="text-lg font-bold text-[#00AE9D] mt-1">{geral.acionamentos_imprensa_card}</p>
              </div>
            </div>

            {/* LINHA 3: Textos Analíticos */}
            <div className="grid grid-cols-2 gap-6">
              <div>
                <h4 className="text-[10px] font-bold text-[#00AE9D] uppercase mb-1">O que mudou</h4>
                <p className="text-[10px] text-[#003641] leading-relaxed">
                  {geral.o_que_mudou}
                </p>
              </div>
              <div>
                <h4 className="text-[10px] font-bold text-[#00AE9D] uppercase mb-1">O que significa para o Sicoob</h4>
                <p className="text-[10px] font-semibold text-[#003641] mb-1">
                  Protagonismo: {geral.protagonismo}
                </p>
                <p className="text-[10px] text-[#003641] leading-relaxed">
                  {geral.o_que_significa}
                </p>
              </div>
            </div>

            {/* LINHA 4: Área do Gráfico */}
            <div className="flex-1 flex flex-col mt-2">
              <h4 className="text-[10px] font-bold text-[#003641] uppercase mb-2">Menções ao Sicoob por dia de coleta, por rede</h4>
              <div className="flex-1 bg-slate-50 border border-slate-200 rounded flex items-center justify-center text-[10px] text-slate-400 font-medium">
                [Área reservada para a renderização do Gráfico de Barras]
              </div>
            </div>

          </div>
          
          {/* Rodapé do Slide */}
          <div className="px-8 pb-3 flex justify-between items-center text-[8px] text-slate-400 uppercase tracking-wider">
            <p>Documento interno Sicoob — Não redistribuir fora do ambiente autorizado.</p>
            <p className="font-bold">1</p>
          </div>
        </div>

      </main>
    </div>
  );
}