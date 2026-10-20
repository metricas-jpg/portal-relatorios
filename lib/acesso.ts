import { google } from 'googleapis';

/**
 * Regras de acesso do portal.
 *
 * 1. Quem pode ENTRAR no portal (login Google):
 *    variáveis ALLOWED_EMAIL_DOMAINS (ex.: "loggia.com.br,sicoob.com.br") e/ou
 *    ALLOWED_EMAILS (e-mails avulsos). Se nenhuma estiver definida, o login continua
 *    aberto a qualquer conta Google, como antes, e um aviso é registrado no log.
 *
 * 2. Quem pode usar o GERADOR: e-mails da aba "Acessos_Gerador" da planilha do gerador.
 *    Se a aba estiver vazia ou não puder ser lida, vale o domínio @loggia.com.br.
 *
 * 3. Quais ARQUIVOS do Drive o portal entrega: só os que aparecem na aba "Relatorios"
 *    (portal) ou na coluna PRINT da aba "Registro_Central" (gerador).
 */

const CACHE_MS = 60_000;
const DOMINIO_GERADOR = 'loggia.com.br';

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

// ---------- 1. Login ----------
let avisouLoginAberto = false;
export function emailPodeEntrar(email?: string | null): boolean {
  if (!email) return false;
  const e = email.toLowerCase();
  const dominios = lista(process.env.ALLOWED_EMAIL_DOMAINS);
  const emails = lista(process.env.ALLOWED_EMAILS);
  if (!dominios.length && !emails.length) {
    if (!avisouLoginAberto) {
      console.warn('[acesso] ALLOWED_EMAIL_DOMAINS/ALLOWED_EMAILS não definidas: qualquer conta Google consegue entrar.');
      avisouLoginAberto = true;
    }
    return true;
  }
  return emails.includes(e) || dominios.some(d => e.endsWith('@' + d));
}

// ---------- 2. Gerador ----------
let cacheGerador: { em: number; emails: string[] } | null = null;

async function emailsDoGerador(): Promise<string[]> {
  if (cacheGerador && Date.now() - cacheGerador.em < CACHE_MS) return cacheGerador.emails;
  try {
    const res = await sheetsClient().spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: 'Acessos_Gerador!A2:A',
    });
    const emails = (res.data.values || []).map(l => String(l[0] || '').trim().toLowerCase()).filter(e => e.includes('@'));
    cacheGerador = { em: Date.now(), emails };
    return emails;
  } catch (e) {
    console.error('[acesso] Não foi possível ler a aba Acessos_Gerador:', (e as Error).message);
    return [];
  }
}

export async function emailPodeGerar(email?: string | null): Promise<boolean> {
  if (!email || !emailPodeEntrar(email)) return false;
  const e = email.toLowerCase();
  const autorizados = await emailsDoGerador();
  if (autorizados.length) return autorizados.includes(e);
  return e.endsWith('@' + DOMINIO_GERADOR);
}

// ---------- 3. Arquivos do Drive ----------
let cacheArquivos: { em: number; ids: Set<string> } | null = null;
const ID_RE = /[-\w]{25,}/g;

export async function arquivoPermitido(fileId: string): Promise<boolean> {
  if (!/^[-\w]{25,}$/.test(fileId)) return false;
  // Recarrega a lista se o cache venceu, ou se o arquivo não está nela e a lista tem mais de 5 s
  // (assim um print recém-adicionado na planilha já funciona sem esperar o cache vencer).
  const vencido = !cacheArquivos || Date.now() - cacheArquivos.em > CACHE_MS;
  const ausente = !!cacheArquivos && !cacheArquivos.ids.has(fileId) && Date.now() - cacheArquivos.em > 5_000;
  if (vencido || ausente) {
    const ids = new Set<string>();
    const sheets = sheetsClient();
    const fontes: [string | undefined, string][] = [
      [process.env.GOOGLE_SHEET_ID, 'Relatorios!A2:E'],
      [process.env.SPREADSHEET_ID, 'Registro_Central!P2:P'],
    ];
    for (const [spreadsheetId, range] of fontes) {
      if (!spreadsheetId) continue;
      try {
        const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
        (res.data.values || []).flat().forEach(c => (String(c).match(ID_RE) || []).forEach(id => ids.add(id)));
      } catch (e) {
        console.error(`[acesso] Não foi possível ler ${range}:`, (e as Error).message);
      }
    }
    cacheArquivos = { em: Date.now(), ids };
  }
  return cacheArquivos?.ids.has(fileId) ?? false;
}
