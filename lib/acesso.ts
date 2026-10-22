import { google } from 'googleapis';
import { lerGrade } from './google-sheets';
import { obterMonitoramento } from './planilhas';

/**
 * Regras de acesso do portal.
 *
 * 1. Quem pode ENTRAR no portal (login Google):
 *    - sempre: e-mails @loggia.com.br;
 *    - os e-mails e domínios cadastrados na página /acessos (aba "Acessos_Portal" da planilha
 *      do portal, GOOGLE_SHEET_ID, ou de ACESSOS_SHEET_ID);
 *    - os das variáveis ALLOWED_EMAILS e ALLOWED_EMAIL_DOMAINS, se existirem.
 *
 * 2. Quem pode usar o GERADOR: e-mails do domínio @loggia.com.br (ou os domínios da
 *    variável GERADOR_DOMINIOS).
 *
 * 3. Quem ADMINISTRA a lista de acessos (/acessos): os e-mails de ADMINS abaixo
 *    (ou da variável ADMIN_EMAILS, que substitui a lista).
 *
 * 4. Quais ARQUIVOS do Drive o portal entrega: só os que aparecem na aba "Relatorios"
 *    (portal) ou no "Registro_Central" da planilha de monitoramento do relatório aberto.
 */

const CACHE_MS = 60_000;
const DOMINIO_GERADOR = 'loggia.com.br';
/** domínio sempre liberado no portal */
const DOMINIO_LOGGIA = 'loggia.com.br';
const ADMINS = [
  'metricas@loggia.com.br',
  'emanuel.carvalho@loggia.com.br',
  'tauan.soriano@loggia.com.br',
  'gabriela.santiago@loggia.com.br',
];

function lista(v?: string) {
  return (v || '').split(',').map(s => s.trim().toLowerCase().replace(/^@/, '')).filter(Boolean);
}

function sheetsClient(escrita = false) {
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_CLIENT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: [escrita ? 'https://www.googleapis.com/auth/spreadsheets' : 'https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  return google.sheets({ version: 'v4', auth });
}

// ---------- Lista de acessos (página /acessos) ----------
export type TipoAcesso = 'email' | 'dominio';
export interface Acesso { tipo: TipoAcesso; valor: string; por: string; em: string }

const ABA_ACESSOS = 'Acessos_Portal';
const planilhaAcessos = () => process.env.ACESSOS_SHEET_ID || process.env.GOOGLE_SHEET_ID || '';
let cacheAcessos: { em: number; itens: Acesso[] } | null = null;

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const DOMINIO_RE = /^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/;

/** normaliza o que foi digitado: "@Sicoob.com.br" → "sicoob.com.br" */
export function normalizarAcesso(tipo: TipoAcesso, valor: string) {
  const v = (valor || '').trim().toLowerCase();
  return tipo === 'dominio' ? v.replace(/^@/, '') : v;
}

export async function lerAcessos(forcar = false): Promise<Acesso[]> {
  if (!forcar && cacheAcessos && Date.now() - cacheAcessos.em < CACHE_MS) return cacheAcessos.itens;
  const id = planilhaAcessos();
  let itens: Acesso[] = [];
  if (id) {
    try {
      const res = await sheetsClient().spreadsheets.values.get({ spreadsheetId: id, range: `${ABA_ACESSOS}!A2:D` });
      itens = (res.data.values || [])
        .map(l => ({ tipo: (String(l[0] || '').trim().toLowerCase().startsWith('dom') ? 'dominio' : 'email') as TipoAcesso, valor: String(l[1] || ''), por: String(l[2] || ''), em: String(l[3] || '') }))
        .map(a => ({ ...a, valor: normalizarAcesso(a.tipo, a.valor) }))
        .filter(a => a.valor);
    } catch (e) {
      // aba ainda não criada (nenhum acesso cadastrado) ou sem permissão
      const msg = (e as Error).message || '';
      if (!/Unable to parse range/i.test(msg)) console.error('[acesso] Não foi possível ler a aba Acessos_Portal:', msg);
      if (cacheAcessos) return cacheAcessos.itens; // mantém a última lista conhecida
    }
  }
  cacheAcessos = { em: Date.now(), itens };
  return itens;
}

/** grava a lista inteira (cria a aba na primeira vez) */
export async function salvarAcessos(itens: Acesso[]) {
  const id = planilhaAcessos();
  if (!id) throw new Error('Planilha de acessos não configurada (GOOGLE_SHEET_ID).');
  const api = sheetsClient(true);
  const meta = await api.spreadsheets.get({ spreadsheetId: id, fields: 'sheets(properties(title))' });
  if (!meta.data.sheets?.some(s => s.properties?.title === ABA_ACESSOS)) {
    await api.spreadsheets.batchUpdate({ spreadsheetId: id, requestBody: { requests: [{ addSheet: { properties: { title: ABA_ACESSOS } } }] } });
  }
  await api.spreadsheets.values.clear({ spreadsheetId: id, range: `${ABA_ACESSOS}!A:D` });
  await api.spreadsheets.values.update({
    spreadsheetId: id, range: `${ABA_ACESSOS}!A1`, valueInputOption: 'RAW',
    requestBody: { values: [['tipo', 'valor', 'adicionado_por', 'adicionado_em'], ...itens.map(a => [a.tipo, a.valor, a.por, a.em])] },
  });
  cacheAcessos = { em: Date.now(), itens };
}

// ---------- 1. Login ----------
export async function emailPodeEntrar(email?: string | null): Promise<boolean> {
  if (!email) return false;
  const e = email.toLowerCase().trim();
  const naLista = (emails: string[], dominios: string[]) => emails.includes(e) || dominios.some(d => e.endsWith('@' + d));
  if (naLista([], [DOMINIO_LOGGIA])) return true;
  if (naLista(lista(process.env.ALLOWED_EMAILS), lista(process.env.ALLOWED_EMAIL_DOMAINS))) return true;
  const acessos = await lerAcessos();
  return naLista(acessos.filter(a => a.tipo === 'email').map(a => a.valor), acessos.filter(a => a.tipo === 'dominio').map(a => a.valor));
}

// ---------- 3. Administradores ----------
export function emailEhAdmin(email?: string | null): boolean {
  if (!email) return false;
  const admins = lista(process.env.ADMIN_EMAILS);
  return (admins.length ? admins : ADMINS).includes(email.toLowerCase().trim());
}

// ---------- 2. Gerador ----------
/**
 * Domínios que usam o gerador. Fica no servidor (código ou variável da Vercel), fora do alcance
 * de quem usa o site. Padrão: loggia.com.br; GERADOR_DOMINIOS="a.com.br,b.com.br" substitui.
 */
export function emailPodeGerar(email?: string | null): boolean {
  if (!email) return false;
  const dominios = lista(process.env.GERADOR_DOMINIOS);
  const e = email.toLowerCase();
  return (dominios.length ? dominios : [DOMINIO_GERADOR]).some(d => e.endsWith('@' + d));
}

// ---------- 4. Arquivos do Drive ----------
// Por fonte (planilha do portal ou planilha de monitoramento): IDs de arquivo que aparecem nela.
const cacheArquivos = new Map<string, { em: number; ids: Set<string> }>();
const ID_RE = /[-\w]{25,}/g;

async function idsDaFonte(chave: string, ler: () => Promise<string[]>, fileId: string) {
  const c = cacheArquivos.get(chave);
  // recarrega se venceu, ou se o arquivo não está na lista e ela tem mais de 5 s
  // (assim um print recém-adicionado na planilha já funciona sem esperar o cache vencer)
  if (c && (Date.now() - c.em < CACHE_MS) && (c.ids.has(fileId) || Date.now() - c.em < 5_000)) return c.ids;
  const ids = new Set<string>();
  try {
    (await ler()).forEach(t => (t.match(ID_RE) || []).forEach(id => ids.add(id)));
  } catch (e) {
    console.error(`[acesso] Não foi possível ler ${chave}:`, (e as Error).message);
  }
  cacheArquivos.set(chave, { em: Date.now(), ids });
  return ids;
}

/**
 * O arquivo só é entregue se o ID aparecer na aba Relatorios do portal ou no Registro_Central da
 * planilha de monitoramento informada (que precisa estar na lista da planilha central).
 */
export async function arquivoPermitido(fileId: string, planilhaId?: string | null): Promise<boolean> {
  if (!/^[-\w]{25,}$/.test(fileId)) return false;
  const portal = process.env.GOOGLE_SHEET_ID;
  if (portal) {
    const ids = await idsDaFonte(`portal:${portal}`, async () => {
      const res = await sheetsClient().spreadsheets.values.get({ spreadsheetId: portal, range: 'Relatorios!A2:E' });
      return (res.data.values || []).flat().map(String);
    }, fileId);
    if (ids.has(fileId)) return true;
  }
  // só planilhas cadastradas na planilha central
  const planilha = planilhaId && (await obterMonitoramento(planilhaId)) ? planilhaId : null;
  if (!planilha) return false;
  const ids = await idsDaFonte(`registro:${planilha}`, async () => {
    // lê também o link por trás de chips e hiperlinks
    const grade = await lerGrade(planilha, 'Registro_Central!A2:AZ');
    return grade.flat().flatMap(c => [c.texto, c.link]);
  }, fileId);
  return ids.has(fileId);
}
