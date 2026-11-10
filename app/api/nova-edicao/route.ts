import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { emailPodeGerar } from '@/lib/acesso';
import { obterMonitoramento } from '@/lib/planilhas';
import { ErroEscrita, criarNovaEdicao } from '@/lib/escrita';

/** POST { planilha, ultima } → cria a edição ultima+1 em Configuracoes_Gerais → { numero } */
const STATUS: Record<string, number> = { 'sem-permissao': 403, conflito: 409, invalido: 400, outro: 502 };

export async function POST(req: NextRequest) {
  const email = (await getServerSession(authOptions))?.user?.email;
  if (!emailPodeGerar(email)) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const c = (await req.json().catch(() => ({}))) as { planilha?: unknown; ultima?: unknown };
  const planilha = typeof c.planilha === 'string' && /^[-\w]{20,}$/.test(c.planilha) ? c.planilha : null;
  const ultima = Number(c.ultima);
  if (!planilha || !Number.isInteger(ultima) || ultima < 1 || !(await obterMonitoramento(planilha))) {
    return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  }
  try {
    const r = await criarNovaEdicao(planilha, ultima, (email as string).toLowerCase());
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    const err = e as ErroEscrita;
    return NextResponse.json({ error: err.message, codigo: err.codigo }, { status: STATUS[err.codigo] || 500 });
  }
}
