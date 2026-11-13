import { chaveCabecalho, lerGrade, sheets } from './google-sheets';

/**
 * Lista de monitoramentos: lida da planilha central (aba "Monitoramentos 2026").
 * Cada linha com um link de planilha na coluna "link_da_planilha_do_monitoramento" vira uma
 * opção no gerador, com o nome da coluna "NOME".
 */

export const PLANILHA_CENTRAL_ID = process.env.PLANILHA_CENTRAL_ID || '1lwY8VJo5Ki7GgrlDmAoidNUiSLrmVwtUmIE9LOuWdNs';
export const PLANILHA_CENTRAL_ABA = process.env.PLANILHA_CENTRAL_ABA || 'Monitoramentos 2026';

/**
 * Lista do portal de relatórios (página inicial): planilha "Base de relatórios", aba "Relatorios".
 * É uma planilha própria do portal, separada da planilha central que alimenta o gerador.
 * A aba é encontrada pelo gid (o número depois de "gid=" no endereço), que não muda quando a aba é
 * renomeada; se o gid não existir, usa a aba de nome "Relatorios".
 * Colunas id_arquivo, nome_arquivo, data_relatorio, url_visualizacao, url_download,
 * titulo_amigavel, data_atualizacao (A a G, título na linha 1).
 * Variáveis opcionais: PORTAL_PLANILHA_ID, PORTAL_ABA_GID ou PORTAL_ABA (nome; tem prioridade).
 */
export const PORTAL_PLANILHA_ID = process.env.PORTAL_PLANILHA_ID || '1jjxE-xIaiRG6sU3eDr1bJY7dW18h0-TcZT7gu5m88hU';
export const PORTAL_ABA_GID = process.env.PORTAL_ABA_GID || '0';
const ABA_RESERVA = 'Relatorios';

let cacheAba: { em: number; titulo: string } | null = null;
/** nome atual da aba do portal (busca pelo gid; guarda por 5 minutos) */
export async function abaDoPortal(): Promise<string> {
  if (process.env.PORTAL_ABA) return process.env.PORTAL_ABA;
  if (cacheAba && Date.now() - cacheAba.em < 5 * 60_000) return cacheAba.titulo;
  let titulo = ABA_RESERVA;
  try {
    const meta = await sheets().spreadsheets.get({ spreadsheetId: PORTAL_PLANILHA_ID, fields: 'sheets.properties(sheetId,title)' });
    const aba = meta.data.sheets?.find(s => String(s.properties?.sheetId) === PORTAL_ABA_GID)?.properties?.title;
    if (aba) titulo = aba;
    else console.error(`[portal] aba gid=${PORTAL_ABA_GID} não encontrada; usando "${ABA_RESERVA}"`);
  } catch (e) {
    console.error('[portal] não foi possível ler as abas da planilha:', (e as Error).message);
  }
  cacheAba = { em: Date.now(), titulo };
  return titulo;
}
export async function intervaloPortal(colunas: string): Promise<string> {
  return `'${(await abaDoPortal()).replace(/'/g, "''")}'!${colunas}`;
}

export interface Monitoramento { id: string; nome: string }

const CACHE_MS = 60_000;
let cache: { em: number; lista: Monitoramento[]; erro: string } | null = null;

/** ID de uma planilha a partir do link (ou do próprio ID) */
export function idDaPlanilha(valor: string): string {
  const v = (valor || '').trim();
  const m = v.match(/\/spreadsheets\/d\/([-\w]{25,})/) || v.match(/^([-\w]{25,})$/);
  return m ? m[1] : '';
}

export async function listarMonitoramentos(): Promise<{ lista: Monitoramento[]; erro: string }> {
  if (cache && Date.now() - cache.em < CACHE_MS) return cache;
  let lista: Monitoramento[] = [];
  let erro = '';
  try {
    const aba = `'${PLANILHA_CENTRAL_ABA.replace(/'/g, "''")}'`;
    const grade = await lerGrade(PLANILHA_CENTRAL_ID, `${aba}!A1:AZ`);
    // o cabeçalho não fica na linha 1 (há um título mesclado acima): procura nas primeiras linhas
    const iCab = grade.slice(0, 15).findIndex(l => l.some(c => chaveCabecalho(c.texto) === 'nome') && l.some(c => chaveCabecalho(c.texto).includes('linkdaplanilha')));
    if (iCab < 0) {
      erro = `Na aba "${PLANILHA_CENTRAL_ABA}" da planilha central não encontrei as colunas "NOME" e "link_da_planilha_do_monitoramento".`;
    } else {
      const cab = grade[iCab].map(c => chaveCabecalho(c.texto));
      const iNome = cab.indexOf('nome');
      const iLink = cab.findIndex(k => k.includes('linkdaplanilha'));
      const vistos = new Set<string>();
      for (const l of grade.slice(iCab + 1)) {
        const cel = l[iLink];
        const id = idDaPlanilha(cel?.link || '') || idDaPlanilha(cel?.texto || '');
        if (!id || vistos.has(id)) continue;
        vistos.add(id);
        lista.push({ id, nome: (l[iNome]?.texto || '').trim() || 'Monitoramento sem nome' });
      }
    }
  } catch (e) {
    const err = e as { code?: number; message?: string };
    console.error('[planilhas] Erro ao ler a planilha central:', err.message);
    erro = err.code === 403 || err.code === 404
      ? `O site não tem acesso à planilha central. Compartilhe-a com ${process.env.GOOGLE_CLIENT_EMAIL || 'a conta de serviço do site'} como leitor.`
      : 'Não foi possível ler a planilha central.';
  }
  lista = lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  cache = { em: Date.now(), lista, erro };
  return cache;
}

export async function obterMonitoramento(id: string): Promise<Monitoramento | null> {
  if (!/^[-\w]{25,}$/.test(id)) return null;
  let m = (await listarMonitoramentos()).lista.find(x => x.id === id);
  // planilha recém-cadastrada na central: recarrega a lista uma vez
  if (!m && cache && Date.now() - cache.em > 5_000) { cache = null; m = (await listarMonitoramentos()).lista.find(x => x.id === id); }
  return m || null;
}
