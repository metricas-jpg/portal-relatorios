import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { emailPodeGerar } from '@/lib/acesso';
import { listarMonitoramentos } from '@/lib/planilhas';
import BuscaMonitoramento from './BuscaMonitoramento';
import { AcessoRestrito, AvisoErro, TelaSelecao } from './Moldura';

export const dynamic = 'force-dynamic';

/** Etapa 1: escolher o monitoramento (lista da planilha central). */
export default async function GeradorPage() {
  const session = await getServerSession(authOptions);
  if (!(await emailPodeGerar(session?.user?.email))) return <AcessoRestrito email={session?.user?.email} />;

  const { lista, erro } = await listarMonitoramentos();
  return (
    <TelaSelecao titulo="Qual relatório você quer gerar?" voltar={{ href: '/', texto: 'Portal' }}>
      {erro && <AvisoErro>{erro}</AvisoErro>}
      <BuscaMonitoramento lista={lista} />
    </TelaSelecao>
  );
}
