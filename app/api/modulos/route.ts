import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { emailPodeGerar } from '@/lib/acesso';
import { obterMonitoramento } from '@/lib/planilhas';
import { kv, kvConfigurado } from '@/lib/kv';
import { ehModulo, type EscolhaSalva, type EscolhasSalvas } from '@/lib/modulos';

/**
 * Módulos escolhidos no gerador, compartilhados pela equipe.
 * GET ?planilha=ID → { compartilhado, salvas: { "1": { desligados, por, em }, ... } }
 * POST { planilha, edicao, desligados } → grava a escolha daquela edição.
 * Sem armazenamento configurado, responde compartilhado: false e o navegador guarda localmente.
 */

const chave = (planilha: string) => `modulos:${planilha}`;
const semCache = { 'Cache-Control': 'no-store' };

async function quem() {
  const email = (await getServerSession(authOptions))?.user?.email;
  return emailPodeGerar(email) ? (email as string).toLowerCase() : null;
}

async function planilhaValida(id: unknown) {
  return typeof id === 'string' && /^[-\w]{20,}$/.test(id) && !!(await obterMonitoramento(id));
}

export async function GET(req: NextRequest) {
  if (!(await quem())) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const planilha = req.nextUrl.searchParams.get('planilha');
  if (!(await planilhaValida(planilha))) return NextResponse.json({ error: 'Planilha inválida' }, { status: 400 });
  if (!kvConfigurado()) return NextResponse.json({ compartilhado: false, salvas: {} }, { headers: semCache });
  try {
    const lista = (await kv<string[]>(['HGETALL', chave(planilha!)])) || [];
    const salvas: EscolhasSalvas = {};
    for (let i = 0; i + 1 < lista.length; i += 2) {
      try {
        const v = JSON.parse(lista[i + 1]) as EscolhaSalva;
        salvas[lista[i]] = { desligados: (v.desligados || []).filter(ehModulo), por: v.por || '', em: v.em || '' };
      } catch { /* valor corrompido: ignora */ }
    }
    return NextResponse.json({ compartilhado: true, salvas }, { headers: semCache });
  } catch (e) {
    console.error('[modulos]', e);
    return NextResponse.json({ compartilhado: false, salvas: {}, erro: 'Não foi possível ler a escolha compartilhada.' }, { headers: semCache });
  }
}

export async function POST(req: NextRequest) {
  const email = await quem();
  if (!email) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const c = (await req.json().catch(() => ({}))) as { planilha?: unknown; edicao?: unknown; desligados?: unknown };
  const edicao = Number(c.edicao);
  if (!(await planilhaValida(c.planilha)) || !Number.isInteger(edicao) || edicao < 1 || edicao > 999 || !Array.isArray(c.desligados)) {
    return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  }
  if (!kvConfigurado()) return NextResponse.json({ error: 'Armazenamento compartilhado não configurado' }, { status: 503 });
  const salva: EscolhaSalva = { desligados: [...new Set(c.desligados.filter(ehModulo))], por: email, em: new Date().toISOString() };
  try {
    await kv(['HSET', chave(c.planilha as string), edicao, JSON.stringify(salva)]);
    return NextResponse.json({ ok: true, salva });
  } catch (e) {
    console.error('[modulos]', e);
    return NextResponse.json({ error: 'Não foi possível salvar a escolha.' }, { status: 502 });
  }
}
