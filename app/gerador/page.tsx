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

  // Puxa dados da planilha
  const dados = await obterDadosDoRelatorio();
  const { geral, registros } = dados;

  // Matemática dos totais acumulados
  const totalAcumulado = registros.reduce((acc, curr) => acc + (curr.volume || 1), 0);
  const contagemPorPlataforma = registros.reduce((acc, curr) => {
    if (curr.plataforma && curr.plataforma !== '-') {
      acc[curr.plataforma] = (acc[curr.plataforma] || 0) + (curr.volume || 1);
    }
    return acc;
  }, {} as Record<string, number>);

  const stringPlataformas = Object.entries(contagemPorPlataforma)
    .sort((a, b) => b[1] - a[1])
    .map(([plat, qtd]) => `${plat} ${qtd}`)
    .join(' | ');

  // Define cores com base no risco e status
  const corRisco = geral.nivel_risco === 'ALTO' ? '#B03A3A' : geral.nivel_risco === 'MÉDIO' ? '#D97706' : '#00AE9D';

  return (
    <div className="min-h-screen bg-[#F3F6F6]">
      
      {/* HEADER DE CONTROLE DA APLICAÇÃO (Não sai na impressão) */}
      <header className="print-hidden bg-[#003641] text-white h-16 flex justify-between items-center px-6 shadow-md mb-8">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-slate-300 hover:text-white transition">← Voltar</Link>
          <h1 className="text-lg font-bold border-l border-white/20 pl-4">Gerador: {geral.titulo_crise}</h1>
        </div>
        <button className="bg-[#00AE9D] hover:bg-[#008f81] text-white text-xs font-bold py-2 px-4 rounded-lg cursor-pointer">
          Aperte Ctrl + P para salvar o PDF
        </button>
      </header>

      {/* ÁREA DA FOLHA A4 (Utilizando as classes exatas do CSS do Claude) */}
      <main className="flex flex-col items-center pb-12">
        <div className="page">
          
          {/* CABEÇALHO DO RELATÓRIO */}
          <div className="hdr">
            <div className="eyebrow">Presidência - Superintendência Negócios Digitais, Marketing e Experiência do Cooperado</div>
            <div style={{ color: '#CADB2A', fontWeight: 'bold', fontSize: '11px', marginTop: '4px' }}>RELATÓRIO DE MONITORAMENTO DE CRISE</div>
            <h1>{geral.titulo_crise}</h1>
            <div className="sing">{geral.subtitulo_unidade}</div>
            
            <div className="logo">
              <Image src="/logo-sicoob.svg" alt="Sicoob" width={120} height={34} />
            </div>

            <div className="metaln">
              <span>Início do monitoramento: {geral.inicio_monitoramento}</span>
              {geral.edicao_numero && <span>Edição nº {geral.edicao_numero}</span>}
              <span>Período: {geral.inicio_monitoramento.split(',')[0]} a {geral.ultima_atualizacao}</span>
              <span>Última atualização: {geral.ultima_atualizacao}</span>
            </div>
          </div>

          {/* CORPO DO RELATÓRIO */}
          <div className="body">
            
            {/* Cards Risco e Status */}
            <div className="row2">
              <div className="card">
                <div className="k">
                  <span>Risco para a Instituição</span>
                  <span style={{ color: '#00AE9D' }}>{geral.risco_tendencia}</span>
                </div>
                <div className="big" style={{ color: corRisco }}>{geral.nivel_risco}</div>
                <div className="d">{geral.risco_texto}</div>
              </div>
              <div className="card">
                <div className="k">
                  <span>Status da Crise</span>
                  <span style={{ color: '#00AE9D' }}>{geral.status_tendencia}</span>
                </div>
                <div className="big" style={{ color: '#003641' }}>{geral.status_crise}</div>
                <div className="d">{geral.status_texto}</div>
              </div>
            </div>

            {/* 4 Indicadores Menores */}
            <div className="kpis">
              <div className="kpi">
                <div className="k">Novas Menções<br/>ao Sicoob</div>
                <div className="n">{geral.novas_mencoes_qtd}</div>
                <div className="c">{geral.novas_mencoes_detalhe}</div>
              </div>
              <div className="kpi">
                <div className="k">Menções Gerais<br/>ao Tema</div>
                <div className="n">{geral.mencoes_gerais_tema}</div>
              </div>
              <div className="kpi">
                <div className="k">Menções ao Sicoob<br/>Acumuladas</div>
                <div className="n">{totalAcumulado}</div>
                <div className="c">desde {geral.inicio_monitoramento.split('/')[0]}/{geral.inicio_monitoramento.split('/')[1]}</div>
                <div style={{ fontSize: '8px', color: '#5D6D71', marginTop: '2px' }}>{stringPlataformas}</div>
              </div>
              <div className="kpi">
                <div className="k">Acionamentos<br/>de Imprensa</div>
                <div className="n">{geral.acionamentos_imprensa_card}</div>
              </div>
            </div>

            {/* Textos Analíticos */}
            <div className="tx-grid">
              <div className="tx">
                <div className="l">O que mudou</div>
                <div className="txt">{geral.o_que_mudou}</div>
              </div>
              <div className="tx">
                <div className="l">O que significa para o Sicoob</div>
                <div className="protagonismo">Protagonismo: {geral.protagonismo}</div>
                <div className="txt">{geral.o_que_significa}</div>
              </div>
            </div>

            {/* Área do Gráfico */}
            <div style={{ marginTop: '24px', borderTop: '1px solid #D9E2E3', paddingTop: '16px' }}>
              <div style={{ color: '#00AE9D', fontWeight: 'bold', fontSize: '11px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Menções ao Sicoob por dia de coleta, por rede
              </div>
              <div style={{ height: '180px', marginTop: '12px', border: '1px dashed #D9E2E3', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9AA7AA', fontSize: '12px' }}>
                [O Gráfico em React será renderizado aqui na próxima etapa]
              </div>
            </div>

          </div>

          {/* Rodapé Padrão */}
          <div className="foot">
            <span>Documento interno Sicoob — Não redistribuir fora do ambiente autorizado.</span>
            <span style={{ fontWeight: 'bold' }}>1</span>
          </div>

        </div>
      </main>

    </div>
  );
}