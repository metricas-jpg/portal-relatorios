import { chaveCabecalho, lerGrade } from './google-sheets';

/**
 * Lista de monitoramentos: lida da planilha central (aba "Monitoramentos 2026").
 * Cada linha com um link de planilha na coluna "link_da_planilha_do_monitoramento" vira uma
 * opção no gerador, com o nome da coluna "NOME".
 */

export const PLANILHA_CENTRAL_ID = process.env.PLANILHA_CENTRAL_ID || '1lwY8VJo5Ki7GgrlDmAoidNUiSLrmVwtUmIE9LOuWdNs';
export const PLANILHA_CENTRAL_ABA = process.env.PLANILHA_CENTRAL_ABA || 'Monitoramentos 2026';

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
  // transição: a planilha antiga (SPREADSHEET_ID) continua disponível se não estiver na lista
  const antiga = process.env.SPREADSHEET_ID;
  if (antiga && !lista.some(m => m.id === antiga)) lista.push({ id: antiga, nome: 'Planilha padrão (SPREADSHEET_ID)' });
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
