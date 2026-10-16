import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { obterEmailsAutorizados } from '@/lib/google-sheets';
import Link from 'next/link';

export default async function GeradorPage() {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.email) {
    redirect('/'); 
  }

  const emailUsuario = session.user.email.toLowerCase();
  const emailsAutorizados = await obterEmailsAutorizados();

  // O Segurança: barra quem não está na planilha
  if (!emailsAutorizados.includes(emailUsuario)) {
    return (
      <div className="min-h-screen bg-[#00262e] flex flex-col items-center justify-center text-center px-4">
        <h1 className="text-4xl font-bold text-white mb-4">Acesso Restrito</h1>
        <p className="text-slate-300 mb-8 max-w-md">
          O e-mail <strong>{emailUsuario}</strong> não tem permissão para acessar o Gerador de Relatórios.
        </p>
        <Link href="/" className="bg-[#00AE9D] text-white px-6 py-3 rounded-xl font-bold hover:bg-[#008f81] transition">
          Voltar para o Portal
        </Link>
      </div>
    );
  }

  // Liberado: renderiza a interface do gerador
  return (
    <div className="min-h-screen bg-[#f4f7f8] text-[#003641]">
      <header className="bg-[#003641] text-white h-20 flex items-center px-6 shadow-md">
        <h1 className="text-xl font-bold">Gerador de Relatórios</h1>
        <span className="ml-4 bg-[#00AE9D]/20 text-[#00AE9D] text-xs px-3 py-1 rounded-full border border-[#00AE9D]/30">
          Modo Edição
        </span>
      </header>

      <main className="max-w-7xl mx-auto p-8">
        <div className="bg-white p-12 rounded-2xl shadow-sm border border-slate-200 text-center">
          <h2 className="text-2xl font-bold mb-4">Bem-vinda, {session.user.name}!</h2>
          <p className="text-slate-500">
            Você acessou a sala secreta do gerador. Em breve, o layout do PDF será construído aqui.
          </p>
        </div>
      </main>
    </div>
  );
}