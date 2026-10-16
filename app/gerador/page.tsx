import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { obterEmailsAutorizados, obterDadosDoRelatorio } from '@/lib/google-sheets';
import Image from 'next/image';
import Link from 'next/link';

export default async function GeradorPage() {
  // 1. Verificação de Segurança (A Porta)
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

  // 2. Busca os dados reais da planilha no Backend
  const dados = await obterDadosDoRelatorio();
  const { geral } = dados; // Extraímos a aba "Geral" para usar nesta primeira página

  // 3. Renderiza a Interface
  return (
    <div className="min-h-screen bg-[#f4f7f8] text-[#003641] print:bg-white print:m-0 print:p-0">
      
      {/* Barra de Controle (Visível apenas na tela, escondida no PDF com "print:hidden") */}
      <header className="bg-[#003641] text-white h-16 flex justify-between items-center px-6 shadow-md print:hidden">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-slate-300 hover:text-white transition">← Voltar</Link>
          <h1 className="text-lg font-bold border-l border-white/20 pl-4">Gerador: {geral.titulo_crise}</h1>
        </div>
        
        {/* Usamos um pequeno truque de JavaScript no cliente para chamar a tela de impressão nativa */}
        <button 
          // onClick={() => window.print()} não funciona direto em Server Components, 
          // então para MVP, instruímos o usuário a usar o atalho, ou depois isolamos o botão num Client Component
          className="bg-[#00AE9D] hover:bg-[#008f81] text-white text-xs font-bold py-2 px-4 rounded-lg flex items-center gap-2 cursor-pointer"
        >
          <span className="hidden sm:inline">Aperte Ctrl + P para salvar o PDF</span>
          <span className="sm:hidden">Imprimir (PDF)</span>
        </button>
      </header>

      <main className="max-w-7xl mx-auto py-8 px-4 flex flex-col items-center print:py-0 print:px-0">
        
        {/* =========================================================================
            SLIDE 1: PÁGINA A4 PAISAGEM
            O container mede exatos 297mm x 210mm para casar com a folha de sulfite
            ========================================================================= */}
        <div className="w-[297mm] h-[210mm] bg-white shadow-2xl relative overflow-hidden flex flex-col print:shadow-none break-after-page">
          
          {/* CABEÇALHO DO RELATÓRIO (Fundo Azul Petróleo) */}
          <div className="bg-[#003641] text-white px-10 pt-10 pb-6 shrink-0 relative">
            <div className="flex justify-between items-start mb-6">
              <div className="max-w-2xl">
                <p className="text-xs font-semibold tracking-wider text-slate-300 uppercase mb-1">
                  {geral.subtitulo_unidade}
                </p>
                <p className="text-[11px] font-bold tracking-widest text-[#CADB2A] uppercase mb-5">
                  Relatório de Monitoramento de Crise
                </p>
                <h1 className="text-3xl font-bold leading-tight mb-2">
                  {geral.titulo_crise}
                </h1>
                <h2 className="text-xl font-semibold text-[#CADB2A]">
                  {geral.subtitulo_unidade}
                </h2>
              </div>
              
              {/* Espaço para as Logos */}
              <div className="flex flex-col items-end gap-3">
                <Image src="/logo-sicoob.svg" alt="Sicoob" width={130} height={40} className="object-contain" priority />
                <span className="text-[10px] uppercase tracking-widest text-slate-400 mt-2 font-semibold">
                  Edição nº {geral.edicao_numero}
                </span>
              </div>
            </div>

            {/* Linha de Metadados de Data */}
            <div className="flex justify-between items-center text-[10px] text-slate-300 uppercase tracking-wider pt-4 border-t border-white/10 mt-2">
              <p>Início do monitoramento: {geral.inicio_monitoramento}</p>
              <p>Período: {geral.inicio_monitoramento} a {geral.ultima_atualizacao}</p>
              <p>Última atualização: {geral.ultima_atualizacao}</p>
            </div>
          </div>

          {/* CORPO DO SLIDE 1 */}
          <div className="flex-1 p-10 flex flex-col gap-6">
            
            {/* Bloco de Indicadores: Risco e Status */}
            <div className="grid grid-cols-2 gap-6">
              
              {/* Card de Risco */}
              <div className="border border-slate-200 rounded-lg p-5">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">
                  Risco para a instituição
                </p>
                <div className="flex items-center gap-4 mb-3">
                  {/* Cor dinâmica baseada no nível de risco */}
                  <h3 className={`text-2xl font-bold uppercase ${
                    geral.nivel_risco === 'ALTO' ? 'text-red-600' : 
                    geral.nivel_risco === 'MÉDIO' ? 'text-orange-500' : 'text-green-600'
                  }`}>
                    {geral.nivel_risco}
                  </h3>
                  <span className="bg-slate-100 text-slate-600 text-xs font-bold px-2 py-1 rounded">
                    {geral.risco_tendencia}
                  </span>
                </div>
                <p className="text-xs text-[#003641] font-medium leading-relaxed">
                  {geral.risco_texto}
                </p>
              </div>

              {/* Card de Status */}
              <div className="border border-slate-200 rounded-lg p-5">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">
                  Status da crise
                </p>
                <div className="flex items-center gap-4 mb-3">
                  <h3 className="text-xl font-bold uppercase text-[#003641]">
                    {geral.status_crise}
                  </h3>
                  <span className="bg-slate-100 text-slate-600 text-xs font-bold px-2 py-1 rounded">
                    {geral.status_tendencia}
                  </span>
                </div>
                <p className="text-xs text-[#003641] font-medium leading-relaxed">
                  {geral.status_texto}
                </p>
              </div>

            </div>

            {/* Aqui entrarão os próximos blocos: Gráfico, Acumulados, O que mudou */}
            <div className="flex-1 border-2 border-dashed border-slate-200 rounded-lg flex items-center justify-center text-slate-400 text-sm font-medium">
              [Área reservada para o Gráfico de Barras e Resumo de Menções]
            </div>

          </div>
          
          {/* Rodapé do Slide */}
          <div className="px-10 pb-4 flex justify-between items-center text-[9px] text-slate-400 uppercase tracking-wider">
            <p>Documento interno Sicoob — Não redistribuir fora do ambiente autorizado.</p>
            <p className="font-bold">1</p>
          </div>
        </div>

      </main>
    </div>
  );
}