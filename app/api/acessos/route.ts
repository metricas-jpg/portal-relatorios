import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { emailEhAdmin } from '@/lib/acesso';
import { normalizar, validar, type Acesso, type AreaAcesso, type ArquivoAcessos, type TipoAcesso } from '@/lib/acessos';
import { ErroGitHub, gravarNoGitHub, lerDoGitHub } from '@/lib/github';
import publicado from '@/config/acessos.json';

/**
 * Lista de acessos (e-mails e domínios além do @loggia.com.br). Só administradores.
 * GET: lista atual no GitHub + o que já está publicado no site.
 * POST { tipo, valor, area }: adiciona (ou muda a área). DELETE { tipo, valor }: remove.
 */

const naoAutorizado = () => NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
const erro = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status });
const chave = (a: Pick<Acesso, 'tipo' | 'valor'>) => `${a.tipo}:${a.valor}`;

async function admin() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  return emailEhAdmin(email) ? (email as string).toLowerCase() : null;
}

function resposta(arquivo: ArquivoAcessos) {
  // "publicado" = o que o site em produção já usa; o resto está esperando a republicação
  const listaNoAr = (publicado as ArquivoAcessos).acessos || [];
  const noAr = new Set(listaNoAr.map(a => `${chave(a)}:${a.area}`));
  const naLista = new Set(arquivo.acessos.map(chave));
  return NextResponse.json(
    {
      acessos: arquivo.acessos.map(a => ({ ...a, publicado: noAr.has(`${chave(a)}:${a.area}`) })),
      // removidos da lista, mas que o site em produção ainda aceita até a republicação
      removendo: listaNoAr.filter(a => !naLista.has(chave(a))),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

function falha(e: unknown) {
  if (e instanceof ErroGitHub) return erro(e.message, e.status);
  console.error('[acessos]', e);
  return erro('Não foi possível acessar a lista. Tente de novo.', 500);
}

async function lerCorpo(req: NextRequest) {
  try {
    const c = (await req.json()) as { tipo?: string; valor?: string; area?: string };
    const tipo: TipoAcesso | null = c.tipo === 'email' || c.tipo === 'dominio' ? c.tipo : null;
    const area: AreaAcesso = c.area === 'gerador' ? 'gerador' : 'portal';
    return tipo ? { tipo, area, valor: normalizar(tipo, String(c.valor || '')) } : null;
  } catch {
    return null;
  }
}

export async function GET() {
  if (!(await admin())) return naoAutorizado();
  try { return resposta((await lerDoGitHub()).arquivo); } catch (e) { return falha(e); }
}

export async function POST(req: NextRequest) {
  const email = await admin();
  if (!email) return naoAutorizado();
  const c = await lerCorpo(req);
  if (!c) return erro('Requisição inválida.');
  const problema = validar(c.tipo, c.valor);
  if (problema) return erro(problema);
  const rotulo = `${c.tipo === 'email' ? 'e-mail' : 'domínio'} ${c.valor} (${c.area})`;
  try {
    const arquivo = await gravarNoGitHub(a => {
      const outros = a.acessos.filter(x => chave(x) !== chave(c));
      const novo: Acesso = {
        tipo: c.tipo, valor: c.valor, area: c.area,
        adicionado_por: email, adicionado_em: new Date().toISOString(),
      };
      return { ...a, acessos: [...outros, novo].sort((x, y) => x.tipo.localeCompare(y.tipo) || x.valor.localeCompare(y.valor)) };
    }, `acessos: libera ${rotulo} — por ${email}`);
    return resposta(arquivo);
  } catch (e) { return falha(e); }
}

export async function DELETE(req: NextRequest) {
  const email = await admin();
  if (!email) return naoAutorizado();
  const c = await lerCorpo(req);
  if (!c) return erro('Requisição inválida.');
  try {
    const arquivo = await gravarNoGitHub(
      a => ({ ...a, acessos: a.acessos.filter(x => chave(x) !== chave(c)) }),
      `acessos: remove ${c.tipo === 'email' ? 'e-mail' : 'domínio'} ${c.valor} — por ${email}`,
    );
    return resposta(arquivo);
  } catch (e) { return falha(e); }
}
