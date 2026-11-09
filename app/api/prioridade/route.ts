import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { emailPodeGerar } from '@/lib/acesso';
import { obterMonitoramento } from '@/lib/planilhas';
import { ErroEscrita, gravarPrioridades, type ItemPrioridade } from '@/lib/escrita';

/**
 * POST { planilha, itens: [{ linha, idPrint, fato, prioridade }] }
 * Grava a coluna "prioridade" do Registro_Central (modo edição do gerador).
 */
const STATUS: Record<string, number> = { 'sem-coluna': 409, 'sem-permissao': 403, conflito: 409, invalido: 400, outro: 502 };

export async function POST(req: NextRequest) {
  const email = (await getServerSession(authOptions))?.user?.email;
  if (!emailPodeGerar(email)) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const c = (await req.json().catch(() => ({}))) as { planilha?: unknown; itens?: unknown };
  const planilha = typeof c.planilha === 'string' && /^[-\w]{20,}$/.test(c.planilha) ? c.planilha : null;
  if (!planilha || !(await obterMonitoramento(planilha))) return NextResponse.json({ error: 'Planilha inválida' }, { status: 400 });
  if (!Array.isArray(c.itens) || !c.itens.length || c.itens.length > 500) return NextResponse.json({ error: 'Nada para gravar' }, { status: 400 });

  const itens: ItemPrioridade[] = [];
  for (const raw of c.itens as Record<string, unknown>[]) {
    const linha = Number(raw.linha);
    const prioridade = raw.prioridade == null ? null : Number(raw.prioridade);
    if (!Number.isInteger(linha) || linha < 2 || (prioridade != null && (!Number.isInteger(prioridade) || prioridade < 1 || prioridade > 999))) {
      return NextResponse.json({ error: 'Item inválido' }, { status: 400 });
    }
    itens.push({ linha, prioridade, idPrint: String(raw.idPrint ?? ''), fato: String(raw.fato ?? '') });
  }
  try {
    const r = await gravarPrioridades(planilha, itens, (email as string).toLowerCase());
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    const err = e as ErroEscrita;
    return NextResponse.json({ error: err.message, codigo: err.codigo, linhas: err.linhas }, { status: STATUS[err.codigo] || 500 });
  }
}
