import { getServerSession } from 'next-auth';
import { notFound } from 'next/navigation';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { emailEhAdmin } from '@/lib/acesso';
import { TelaSelecao } from '@/app/gerador/Moldura';
import GerenciarAcessos from './GerenciarAcessos';

export const dynamic = 'force-dynamic';

/** Página de compartilhamento: só para os administradores (para os demais, ela não existe). */
export default async function AcessosPage() {
  const session = await getServerSession(authOptions);
  if (!emailEhAdmin(session?.user?.email)) notFound();
  return (
    <TelaSelecao titulo="Compartilhar o portal" secao="Acessos" voltar={{ href: '/', texto: 'Portal' }}>
      <p className="text-sm text-slate-600 mb-6 leading-relaxed">
        E-mails <strong>@loggia.com.br</strong> já têm acesso a tudo. Aqui você libera pessoas e empresas de fora: escolha
        se elas só consultam os relatórios (<strong>Portal</strong>) ou também geram relatórios (<strong>Portal + gerador</strong>).
      </p>
      <GerenciarAcessos />
    </TelaSelecao>
  );
}
