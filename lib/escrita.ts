import { google } from 'googleapis';
import { COLUNAS_REGISTRO, OPCIONAIS_REGISTRO, mapearColunas, obterDadosDoRelatorio, escolherEdicao } from './google-sheets';


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
          note: it.prioridade == null ? '' : `Ordem definida pelo gerador por ${email} em ${quando}.`,
        }] }],
        fields: 'userEnteredValue,note',
      },
    }));
    await sheets.spreadsheets.batchUpdate({ spreadsheetId: planilha, requestBody: { requests } });
    return { gravadas: itens.map(it => it.linha) };
  } catch (e) {
    throw traduzir(e);
  }
}

/* ============================== nova edição ============================== */

/**
 * Campos copiados da edição anterior (já com a herança resolvida) para a nova linha de
 * Configuracoes_Gerais. Ficam vazios: o_que_mudou, o_que_significa, risco_texto, status_texto,
 * ultima_atualizacao, hora_atualizacao e os demais textos da edição.
 */
export const CAMPOS_COPIADOS = [
  'titulo_orgao', 'titulo_crise', 'titulo_o_que_mudou', 'titulo_o_que_significa', 'subtitulo_unidade', 'inicio_monitoramento',
  'nivel_risco', 'risco_tendencia', 'status_crise', 'status_tendencia', 'protagonismo',
  'analise_caso', 'papel_sicoob', 'centro_pauta', 'gatilhos_escalada',
];

const ABA_GERAL = 'Configuracoes_Gerais';
const coluna = (i: number): string => (i >= 26 ? coluna(Math.floor(i / 26) - 1) : '') + String.fromCharCode(65 + (i % 26));
/** texto que o Sheets interpretaria como fórmula vira texto ('=...) */
const seguro = (v: string) => (/^[=+@]/.test(v) ? `'${v}` : v);

/**
 * Decide o que gravar na linha da nova edição (função pura, testável): linha de destino logo
 * depois da última edição; não escreve em colunas com fórmula nem em células já preenchidas.
 */
export function planejarNovaEdicao(linhas: string[][], formulas: unknown[][], base: Record<string, string>, numero: number) {
  const cab = (linhas[0] || []).map(c => String(c ?? '').trim());
  const col = (nome: string) => cab.indexOf(nome);
  const cEd = col('edicao_numero'), cUlt = col('ultima_atualizacao');
  if (cEd < 0 && cUlt < 0) throw new ErroEscrita('invalido', 'Não encontrei as colunas edicao_numero e ultima_atualizacao em Configuracoes_Gerais.');
  // última linha que é uma edição (tem número ou data), como na leitura do relatório
  const ehEdicao = (l: string[] = []) => !!(String(l[cEd] ?? '').trim() || String(l[cUlt] ?? '').trim());
  let ultimaIdx = 0;
  linhas.forEach((l, i) => { if (i > 0 && ehEdicao(l)) ultimaIdx = i; });
  if (!ultimaIdx) throw new ErroEscrita('invalido', 'Ainda não há nenhuma edição em Configuracoes_Gerais para copiar.');

  // colunas calculadas por fórmula (em qualquer célula, inclusive no título): não escrever
  const calculada = new Set<number>();
  formulas.forEach(l => (l || []).forEach((v, i) => { if (typeof v === 'string' && v.startsWith('=')) calculada.add(i); }));

  const alvo = ultimaIdx + 1; // índice na grade (0 = título); linha da planilha = alvo + 1
  const atual = linhas[alvo] || [];
  const vazia = (i: number) => !String(atual[i] ?? '').trim();
  const dadosGravar: { range: string; values: string[][] }[] = [];
  const escrever = (i: number, valor: string) => {
    if (i < 0 || calculada.has(i) || !vazia(i) || !valor.trim()) return;
    dadosGravar.push({ range: `${ABA_GERAL}!${coluna(i)}${alvo + 1}`, values: [[seguro(valor)]] });
  };
  escrever(cEd, String(numero).padStart(2, '0'));
  CAMPOS_COPIADOS.forEach(campo => escrever(col(campo), base[campo] || ''));
  if (!dadosGravar.length) throw new ErroEscrita('invalido', 'Nada para copiar: a linha da nova edição já está preenchida ou as colunas são calculadas.');
  return { alvo, dadosGravar };
}

/**
 * Cria a linha da próxima edição logo depois da última edição (reaproveita uma linha só com
 * valores pré-preenchidos). Regras de segurança:
 * - colunas com fórmula (em qualquer célula, inclusive no título, como o edicao_numero com
 *   ARRAYFORMULA) nunca são escritas;
 * - células já preenchidas na linha de destino não são sobrescritas;
 * - se a última edição na planilha não for a que a tela conhecia (outra pessoa criou antes), não grava.
 */
export async function criarNovaEdicao(planilha: string, ultimaConhecida: number, email: string): Promise<{ numero: number; linha: number }> {
  try {
    const api_ = api();
    const range = `${ABA_GERAL}!A1:AZ`;
    const [fmt, form] = await Promise.all([
      api_.spreadsheets.values.get({ spreadsheetId: planilha, range }),
      api_.spreadsheets.values.get({ spreadsheetId: planilha, range, valueRenderOption: 'FORMULA' }),
    ]);
    const linhas = (fmt.data.values || []) as string[][];
    const formulas = (form.data.values || []) as unknown[][];
    const dados = await obterDadosDoRelatorio(planilha);
    const ultima = dados.edicoes[dados.edicoes.length - 1];
    if (!ultima) throw new ErroEscrita('invalido', 'Não foi possível ler as edições desta planilha.');
    if (ultima.numero !== ultimaConhecida) {
      throw new ErroEscrita('conflito', `A planilha já tem a edição ${String(ultima.numero).padStart(2, '0')} (alguém criou antes). Recarregue a página.`);
    }
    const base = escolherEdicao(dados, ultima.numero).geral;
    const numero = ultima.numero + 1;
    const { alvo, dadosGravar } = planejarNovaEdicao(linhas, formulas, base, numero);

    await api_.spreadsheets.values.batchUpdate({
      spreadsheetId: planilha,
      requestBody: { valueInputOption: 'USER_ENTERED', data: dadosGravar },
    });

    // nota de autoria na primeira célula gravada
    const meta = await api_.spreadsheets.get({ spreadsheetId: planilha, fields: 'sheets.properties(sheetId,title)' });
    const aba = meta.data.sheets?.find(s => s.properties?.title === ABA_GERAL)?.properties;
    const primeira = dadosGravar[0].range.match(/!([A-Z]+)\d+$/)?.[1];
    if (aba?.sheetId != null && primeira) {
      const ci = [...primeira].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
      const quando = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      await api_.spreadsheets.batchUpdate({
        spreadsheetId: planilha,
        requestBody: { requests: [{ updateCells: {
          range: { sheetId: aba.sheetId, startRowIndex: alvo, endRowIndex: alvo + 1, startColumnIndex: ci, endColumnIndex: ci + 1 },
          rows: [{ values: [{ note: `Edição ${String(numero).padStart(2, '0')} criada pelo gerador por ${email} em ${quando} (copiada da edição ${String(ultima.numero).padStart(2, '0')}).` }] }],
          fields: 'note',
        } }] },
      }).catch(() => { /* a nota é só registro; a edição já foi criada */ });
    }
    return { numero, linha: alvo + 1 };
  } catch (e) {
    throw traduzir(e);
  }
}
