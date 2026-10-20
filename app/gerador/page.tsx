import { getServerSession } from 'next-auth';
import Link from 'next/link';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { obterDadosDoRelatorio } from '@/lib/google-sheets';
import { emailPodeGerar } from '@/lib/acesso';
import { montarRelatorio } from '@/lib/relatorio';
import PrintController from './PrintController';
import PainelAvisos from './PainelAvisos';
import Relatorio from './Relatorio';
import './gerador.css';

export const dynamic = 'force-dynamic';

export default async function GeradorPage() {
  // 1. Acesso: e-mails da aba Acessos_Gerador (ou domínio @loggia.com.br, se a aba estiver vazia)
  const session = await getServerSession(authOptions);
  if (!(await emailPodeGerar(session?.user?.email))) {
    return (
      <div className="min-h-screen bg-[#00262e] flex flex-col items-center justify-center text-center px-4">
        <h1 className="text-4xl font-bold text-white mb-4">Acesso Restrito</h1>
        <p className="text-slate-300 mb-8 max-w-md">O e-mail <strong>{session?.user?.email || 'Desconhecido'}</strong> não tem acesso ao gerador. Peça a inclusão na aba Acessos_Gerador da planilha.</p>
        <Link href="/" className="bg-[#00AE9D] text-white px-6 py-3 rounded-xl font-bold">Voltar</Link>
      </div>
    );
  }

  // 2. Dados da planilha → conteúdo do relatório (todos os cálculos ficam em lib/relatorio.ts)
  const r = montarRelatorio(await obterDadosDoRelatorio());

  return (
    <div className="doc">
      {/* barra de controle (não sai na impressão) */}
      <header className="print-hidden w-full max-w-[595pt] bg-[#003641] text-white p-4 rounded-xl flex justify-between items-center shadow-lg">
        <div className="flex gap-4 items-center">
          <Link href="/" className="text-sm text-slate-300 hover:text-white">← Voltar</Link>
          <div className="h-6 w-px bg-white/20"></div>
          <span className="font-bold">Gerador de Relatórios</span>
        </div>
        <PrintController clippings={r.clippings} />
      </header>

      <PainelAvisos avisos={r.avisos} />

      <Relatorio r={r} />
    </div>
  );
}
