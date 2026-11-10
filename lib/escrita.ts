import { google } from 'googleapis';
import { COLUNAS_REGISTRO, OPCIONAIS_REGISTRO, mapearColunas } from './google-sheets';

/**
 * Gravação na planilha de monitoramento (modo edição do gerador). Por segurança:
 * - só escreve nas células pedidas (hoje, a coluna "prioridade" do Registro_Central);
 * - antes de gravar, relê as linhas e confere id_do_print (ou o título) — se alguém inseriu,
 *   apagou ou reordenou linhas desde que a página abriu, não grava nada;
 * - cada célula gravada recebe uma nota com quem alterou e quando (o histórico do Google
 *   mostra a conta do site, não a pessoa).
 * A conta do site precisa ser Editor (Colaborador, em drives compartilhados) da planilha.
 */

export type CodigoErro = 'sem-coluna' | 'sem-permissao' | 'conflito' | 'invalido' | 'outro';
export class ErroEscrita extends Error {
  constructor(public codigo: CodigoErro, mensagem: string, public linhas: number[] = []) { super(mensagem); }
}

function api() {
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_CLIENT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

const ABA = 'Registro_Central';
const limpa = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();

export interface ItemPrioridade { linha: number; idPrint: string; fato: string; prioridade: number | null }

function traduzir(e: unknown): ErroEscrita {
  if (e instanceof ErroEscrita) return e;
  const code = (e as { code?: number }).code;
  if (code === 403 || code === 404) {
    const conta = process.env.GOOGLE_CLIENT_EMAIL || 'a conta de serviço do site';
    return new ErroEscrita('sem-permissao', `O site não tem permissão para editar esta planilha. Compartilhe a planilha (ou a pasta dela) com ${conta} como Editor (Colaborador, em drives compartilhados).`);
  }
  console.error('[escrita]', e);
  return new ErroEscrita('outro', 'Não foi possível gravar na planilha. Tente de novo em instantes.');
}

export async function gravarPrioridades(planilha: string, itens: ItemPrioridade[], email: string): Promise<{ gravadas: number[] }> {
  if (!itens.length) return { gravadas: [] };
  try {
    const sheets = api();
    // 1. cabeçalho e linhas atuais
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: planilha, range: `${ABA}!A1:AZ` });
    const [cab = [], ...linhas] = (res.data.values || []) as string[][];
    const p = mapearColunas(cab.map(String), COLUNAS_REGISTRO, ABA, [], OPCIONAIS_REGISTRO);
    if (p.prioridade < 0) throw new ErroEscrita('sem-coluna', 'Esta planilha não tem a coluna "prioridade" no Registro_Central. Crie a coluna para reordenar pelo site.');

    // 2. confere se cada linha ainda é a mesma publicação
    const mudaram = itens.filter(it => {
      const l = linhas[it.linha - 2] || [];
      if (it.idPrint && p.idPrint >= 0) return limpa(l[p.idPrint]) !== limpa(it.idPrint);
      return limpa(l[p.fato]) !== limpa(it.fato);
    }).map(it => it.linha);
    if (mudaram.length) {
      throw new ErroEscrita('conflito', `A planilha mudou desde que a página abriu (linha ${mudaram.join(', ')}). Recarregue a página e refaça a ordem.`, mudaram);
    }

    // 3. id interno da aba (para gravar valor e nota juntos)
    const meta = await sheets.spreadsheets.get({ spreadsheetId: planilha, fields: 'sheets.properties(sheetId,title)' });
    const aba = meta.data.sheets?.find(s => s.properties?.title === ABA)?.properties;
    if (aba?.sheetId == null) throw new ErroEscrita('outro', `Aba ${ABA} não encontrada.`);

    const quando = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const requests = itens.map(it => ({
      updateCells: {
        range: { sheetId: aba.sheetId, startRowIndex: it.linha - 1, endRowIndex: it.linha, startColumnIndex: p.prioridade, endColumnIndex: p.prioridade + 1 },
        rows: [{ values: [{
          userEnteredValue: it.prioridade == null ? undefined : { numberValue: it.prioridade },
          // número simples: se a coluna herdou formato de data, 1 apareceria como 31/12/1899
          userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern: '0' } },
          note: it.prioridade == null ? '' : `Ordem definida pelo gerador por ${email} em ${quando}.`,
        }] }],
        fields: 'userEnteredValue,userEnteredFormat.numberFormat,note',
      },
    }));
    await sheets.spreadsheets.batchUpdate({ spreadsheetId: planilha, requestBody: { requests } });
    return { gravadas: itens.map(it => it.linha) };
  } catch (e) {
    throw traduzir(e);
  }
}
