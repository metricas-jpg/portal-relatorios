import { google } from 'googleapis';
import { lerGrade } from './google-sheets';
import { obterMonitoramento } from './planilhas';
import { ADMINS, DOMINIO_LOGGIA, areaNaLista, type ArquivoAcessos } from './acessos';
import arquivoAcessos from '@/config/acessos.json';

/**
 * Regras de acesso do portal.
 *
 * 1. PORTAL (login Google): e-mails @loggia.com.br, os e-mails e domínios da lista de acessos
 *    (config/acessos.json, editada pela página /acessos) e os das variáveis ALLOWED_EMAILS e
 *    ALLOWED_EMAIL_DOMAINS, se existirem. Ninguém mais entra.
 *
 * 2. GERADOR: e-mails @loggia.com.br (ou os domínios de GERADOR_DOMINIOS) e os itens da lista
 *    de acessos marcados como "gerador".
 *
 * 3. ADMINISTRADORES da lista de acessos: os e-mails de ADMINS (lib/acessos.ts).
 *
 * 4. Quais ARQUIVOS do Drive o portal entrega: só os que aparecem na aba "Relatorios"
 *    (portal) ou no "Registro_Central" da planilha de monitoramento do relatório aberto.
 */

const CACHE_MS = 60_000;

function lista(v?: string) {
  return (v || '').split(',').map(s => s.trim().toLowerCase().replace(/^@/, '')).filter(Boolean);
}

function sheetsClient() {
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_CLIENT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  return google.sheets({ version: 'v4', auth });
}

/** lista publicada junto com o site (muda a cada alteração feita em /acessos, após a republicação) */
const LISTA = (arquivoAcessos as ArquivoAcessos).acessos || [];
const doDominio = (e: string, dominios: string[]) => dominios.some(d => e.endsWith('@' + d));

// ---------- 1. Portal ----------
export function emailPodeEntrar(email?: string | null): boolean {
  if (!email) return false;
  const e = email.toLowerCase().trim();
  if (doDominio(e, [DOMINIO_LOGGIA])) return true;
  if (lista(process.env.ALLOWED_EMAILS).includes(e) || doDominio(e, lista(process.env.ALLOWED_EMAIL_DOMAINS))) return true;
  return areaNaLista(e, LISTA) !== null;
}

// ---------- 2. Gerador ----------
export function emailPodeGerar(email?: string | null): boolean {
  if (!email) return false;
  const e = email.toLowerCase().trim();
  const dominios = lista(process.env.GERADOR_DOMINIOS);
  if (doDominio(e, dominios.length ? dominios : [DOMINIO_LOGGIA])) return true;
  return areaNaLista(e, LISTA) === 'gerador';
}

// ---------- 3. Administradores ----------
export function emailEhAdmin(email?: string | null): boolean {
  return !!email && ADMINS.includes(email.toLowerCase().trim());
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
