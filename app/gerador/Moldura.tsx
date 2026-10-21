import Link from 'next/link';
import type { ReactNode } from 'react';

/** Tela das etapas de seleção (fora do relatório), no visual do portal. */
export function TelaSelecao({ titulo, voltar, children }: { titulo: string; voltar: { href: string; texto: string }; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f4f7f8] text-[#003641]">
      <header className="bg-[#003641] text-white border-b border-white/10 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-4">
          <Link href={voltar.href} className="text-sm text-slate-300 hover:text-white whitespace-nowrap">← {voltar.texto}</Link>
          <div className="h-6 w-px bg-white/20" />
          <span className="font-bold">Gerador de Relatórios</span>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-xl font-bold mb-5">{titulo}</h1>
        {children}
      </main>
    </div>
  );
}

export function AvisoErro({ children }: { children: ReactNode }) {
  return <div className="bg-[#FFF6CC] border border-[#E8D277] text-[#6B5300] text-sm p-4 rounded-xl mb-5 leading-relaxed">{children}</div>;
}

export function AcessoRestrito({ email }: { email?: string | null }) {
  return (
    <div className="min-h-screen bg-[#00262e] flex flex-col items-center justify-center text-center px-4">
      <h1 className="text-4xl font-bold text-white mb-4">Acesso Restrito</h1>
      <p className="text-slate-300 mb-8 max-w-md">O e-mail <strong>{email || 'Desconhecido'}</strong> não tem acesso ao gerador. Peça a inclusão na aba Acessos_Gerador da planilha.</p>
      <Link href="/" className="bg-[#00AE9D] text-white px-6 py-3 rounded-xl font-bold">Voltar</Link>
    </div>
  );
}
