import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { DOMINIO_RE, EMAIL_RE, emailEhAdmin, lerAcessos, normalizarAcesso, salvarAcessos, type TipoAcesso } from '@/lib/acesso';

/** Lista de e-mails e domínios com acesso ao portal (além do @loggia.com.br). Só administradores. */

async function admin() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  return emailEhAdmin(email) ? (email as string) : null;
}

const erro = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status });

function falhaPlanilha(e: unknown) {
  const err = e as { code?: number; message?: string };
  console.error('[acessos] Erro ao gravar:', err.message);
  return erro(err.code === 403
    ? `O site não tem permissão para editar a planilha do portal. Compartilhe-a com ${process.env.GOOGLE_CLIENT_EMAIL || 'a conta de serviço do site'} como editor.`
    : 'Não foi possível salvar na planilha. Tente de novo.', 500);
}

async function lerCorpo(req: NextRequest): Promise<{ tipo: TipoAcesso; valor: string } | string> {
  let corpo: { tipo?: string; valor?: string };
  try { corpo = await req.json(); } catch { return 'Requisição inválida.'; }
  const tipo = corpo.tipo === 'dominio' ? 'dominio' : corpo.tipo === 'email' ? 'email' : null;
  if (!tipo) return 'Tipo inválido.';
  return { tipo, valor: normalizarAcesso(tipo, String(corpo.valor || '')) };
}

export async function GET() {
  if (!(await admin())) return erro('Não autorizado', 401);
  return NextResponse.json({ acessos: await lerAcessos(true) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const email = await admin();
  if (!email) return erro('Não autorizado', 401);
  const c = await lerCorpo(req);
  if (typeof c === 'string') return erro(c);
  if (c.tipo === 'email' && !EMAIL_RE.test(c.valor)) return erro('E-mail inválido.');
  if (c.tipo === 'dominio' && !DOMINIO_RE.test(c.valor)) return erro('Domínio inválido. Use o formato empresa.com.br, sem @.');
  if (c.tipo === 'dominio' && ['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'yahoo.com.br', 'icloud.com', 'live.com', 'uol.com.br', 'bol.com.br'].includes(c.valor))
    return erro(`${c.valor} é um domínio de e-mail pessoal: liberar o domínio inteiro abre o portal para qualquer pessoa. Adicione o e-mail específico.`);
  if (c.valor.endsWith('loggia.com.br')) return erro('E-mails @loggia.com.br já têm acesso.');
  try {
    const atuais = await lerAcessos(true);
    if (atuais.some(a => a.tipo === c.tipo && a.valor === c.valor)) return erro('Já está na lista.');
    const em = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const acessos = [...atuais, { tipo: c.tipo, valor: c.valor, por: email, em }];
    await salvarAcessos(acessos);
    return NextResponse.json({ acessos });
  } catch (e) { return falhaPlanilha(e); }
}

export async function DELETE(req: NextRequest) {
  if (!(await admin())) return erro('Não autorizado', 401);
  const c = await lerCorpo(req);
  if (typeof c === 'string') return erro(c);
  try {
    const atuais = await lerAcessos(true);
    const acessos = atuais.filter(a => !(a.tipo === c.tipo && a.valor === c.valor));
    if (acessos.length !== atuais.length) await salvarAcessos(acessos);
    return NextResponse.json({ acessos });
  } catch (e) { return falhaPlanilha(e); }
}
