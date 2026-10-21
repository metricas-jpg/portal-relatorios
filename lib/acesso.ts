import { google } from 'googleapis';
import { lerGrade } from './google-sheets';
import { obterMonitoramento } from './planilhas';

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
 *    (portal) ou no "Registro_Central" da planilha de monitoramento do relatório aberto.
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
  const planilha = planilhaId && (await obterMonitoramento(planilhaId)) ? planilhaId : process.env.SPREADSHEET_ID;
  if (!planilha) return false;
  const ids = await idsDaFonte(`registro:${planilha}`, async () => {
    // lê também o link por trás de chips e hiperlinks
    const grade = await lerGrade(planilha, 'Registro_Central!A2:AZ');
    return grade.flat().flatMap(c => [c.texto, c.link]);
  }, fileId);
  return ids.has(fileId);
}
