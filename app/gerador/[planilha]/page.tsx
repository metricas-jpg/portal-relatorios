import { getServerSession } from 'next-auth';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { emailPodeGerar } from '@/lib/acesso';
import { obterDadosDoRelatorio, escolherEdicao, numeroEdicao } from '@/lib/google-sheets';
import { obterMonitoramento } from '@/lib/planilhas';
import { formatarDataHora, montarRelatorio } from '@/lib/relatorio';
import PrintController from '../PrintController';
import PainelAvisos from '../PainelAvisos';
import Relatorio from '../Relatorio';
import SeletorEdicao from '../SeletorEdicao';
import { AcessoRestrito, AvisoErro, TelaSelecao } from '../Moldura';
import '../gerador.css';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ planilha: string }>;
  searchParams: Promise<{ [chave: string]: string | string[] | undefined }>;
}

/** Etapa 2: escolher a edição (pula se só houver uma). Etapa 3: o relatório. */
export default async function RelatorioPage({ params, searchParams }: Props) {
  const session = await getServerSession(authOptions);
  if (!emailPodeGerar(session?.user?.email)) return <AcessoRestrito email={session?.user?.email} />;

  const { planilha } = await params;
  const pedido = (await searchParams).edicao;
  const monitoramento = await obterMonitoramento(planilha);
  if (!monitoramento) {
    return (
      <TelaSelecao titulo="Relatório não encontrado" voltar={{ href: '/gerador', texto: 'Relatórios' }}>
        <AvisoErro>Esta planilha não está na lista da planilha central (aba “Monitoramentos 2026”). Confira o link na coluna link_da_planilha_do_monitoramento.</AvisoErro>
      </TelaSelecao>
    );
  }

  const dados = await obterDadosDoRelatorio(planilha);
  const eds = dados.edicoes;
  const voltar = { href: '/gerador', texto: 'Relatórios' };
  if (dados.geral.erro_api || !eds.length) {
    return (
      <TelaSelecao titulo={monitoramento.nome} voltar={voltar}>
        <AvisoErro>{dados.geral.erro_api || 'A aba Configuracoes_Gerais desta planilha não tem nenhuma edição preenchida.'}</AvisoErro>
      </TelaSelecao>
    );
  }

  const numero = numeroEdicao(Array.isArray(pedido) ? pedido[0] : pedido || '');
  const existe = numero != null && eds.some(e => e.numero === numero);
  if (!existe && eds.length === 1) redirect(`/gerador/${planilha}?edicao=${eds[0].numero}`);

  if (!existe) {
    return (
      <TelaSelecao titulo={monitoramento.nome} voltar={voltar}>
        {pedido && <AvisoErro>A edição {String(pedido)} não existe nesta planilha. Escolha uma das edições abaixo.</AvisoErro>}
        <p className="text-sm text-slate-600 mb-4">Escolha a edição do relatório. A linha do tempo, o gráfico e as menções acumuladas incluem tudo até a edição escolhida.</p>
        <ul className="bg-white rounded-2xl shadow-sm border border-slate-200/90 divide-y divide-slate-100 overflow-hidden">
          {[...eds].reverse().map((e, i) => (
            <li key={e.numero}>
              {/* carregamento completo: cada relatório começa com os avisos e anexos zerados */}
              <a href={`/gerador/${planilha}?edicao=${e.numero}`} className="flex items-start justify-between gap-4 px-5 py-4 hover:bg-[#00AE9D]/5 group">
                <span>
                  <span className="font-semibold text-sm">Edição {e.rotulo}</span>
                  {i === 0 && <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-[#00AE9D]">mais recente</span>}
                  <span className="block text-xs text-slate-500 mt-0.5">{e.ultimaAtualizacao ? `Atualizada em ${formatarDataHora(e.ultimaAtualizacao)}` : 'Sem data de atualização'}</span>
                  {e.descricao && <span className="block text-sm text-slate-700 mt-1.5">{e.descricao}</span>}
                </span>
                <span className="text-xs text-slate-400 group-hover:text-[#00AE9D] whitespace-nowrap mt-0.5">Gerar →</span>
              </a>
            </li>
          ))}
        </ul>
      </TelaSelecao>
    );
  }

  const escolhida = escolherEdicao(dados, numero!);
  const r = montarRelatorio(escolhida);
  const atual = eds.find(e => e.numero === numero)!;

  return (
    <div className="doc">
      {/* barra de controle (não sai na impressão) */}
      <header className="print-hidden w-full max-w-[595pt] bg-[#003641] text-white p-4 rounded-xl shadow-lg flex flex-col gap-3">
        <div className="flex justify-between items-center gap-4">
          <div className="flex gap-4 items-center min-w-0">
            <Link href="/gerador" className="text-sm text-slate-300 hover:text-white whitespace-nowrap">← Relatórios</Link>
            <div className="h-6 w-px bg-white/20" />
            <span className="font-bold truncate" title={monitoramento.nome}>{monitoramento.nome}</span>
          </div>
          <PrintController totalAnexos={r.clippings.filter(c => c.printUrl).length} />
        </div>
        {(eds.length > 1 || atual.descricao) && (
          <div className="flex items-center gap-4 border-t border-white/10 pt-3">
            {eds.length > 1 && (
              <SeletorEdicao atual={atual.numero} edicoes={eds.map(e => ({ numero: e.numero, rotulo: e.rotulo, data: formatarDataHora(e.ultimaAtualizacao) }))} />
            )}
            {atual.descricao && <p className="text-xs text-slate-300 leading-relaxed"><span className="text-[#C9D200] font-semibold">O que mudou nesta versão:</span> {atual.descricao}</p>}
          </div>
        )}
      </header>

      <PainelAvisos avisos={r.avisos} />

      <Relatorio r={r} planilha={planilha} />
    </div>
  );
}
