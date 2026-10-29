import { google, sheets_v4 } from 'googleapis';
import { numeroEdicao } from './edicoes';

/**
 * Leitura de uma planilha de monitoramento (mesma estrutura do modelo):
 * - Configuracoes_Gerais: uma linha por edição (coluna edicao_numero);
 * - Registro_Central e Acionamentos_Imprensa: colunas localizadas pelo NOME do cabeçalho,
 *   com a coluna edicao_numero opcional em cada linha.
 */

export interface Edicao {
  /** número da edição (1, 2, 3...) */
  numero: number;
  /** como está escrito na planilha ("01") */
  rotulo: string;
  ultimaAtualizacao: string;
  descricao: string;
  /** linha da aba (para avisos) */
  linha: number;
  dados: Record<string, string>;
}

export interface RelatorioDados {
  /** campos da edição escolhida (preenchido por escolherEdicao) */
  geral: Record<string, string>;
  edicoes: Edicao[];
  /** número da edição escolhida */
  edicao?: number;
  /** problemas de leitura das abas, exibidos no painel do gerador */
  avisosLeitura?: string[];
  registros: RegistroCentral[];
  acionamentos: AcionamentoImprensa[];
}

export interface RegistroCentral {
  edicao: string; dataPost: string; dataColeta: string; linkMateria: string; plataforma: string; envolveSicoob: boolean;
  tipo: string; fato: string; textoTimeline: string; tonalidade: string; mostrarTimeline: boolean;
  proximoMarco: boolean; gerarClipping: boolean; trecho: string; autoria: string; volume: number; printUrl: string;
  /** posicao_citacao (opcional): parte(s) do print em que o Sicoob aparece; preenchida, vale mais que a leitura automática */
  posicaoCitacao: string;
  /** linha na aba Registro_Central (para avisos) */
  linha: number;
}

export interface AcionamentoImprensa {
  edicao: string; data: string; veiculo: string; jornalista: string; pauta: string; atendido: string;
  linha: number;
}

export const sim = (v?: string) => ['SIM', 'TRUE', 'VERDADEIRO', 'S'].includes((v || '').trim().toUpperCase());

export const chaveCabecalho = (s: string) =>
  (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

interface Coluna { campo: string; nome: string; nomes: string[]; pos: number }

/** Registro_Central (pos = ordem atual do modelo, usada só se o cabeçalho não for encontrado) */
const COLUNAS_REGISTRO: Coluna[] = [
  { campo: 'edicao', nome: 'edicao_numero', nomes: ['edicaonumero', 'edicao', 'versao'], pos: 0 },
  { campo: 'idPrint', nome: 'id_do_print', nomes: ['iddoprint', 'idprint'], pos: 1 },
  { campo: 'dataPost', nome: 'Data do post', nomes: ['datadopostddmm', 'datadopost', 'datapost', 'datadapublicacao'], pos: 2 },
  { campo: 'dataColeta', nome: 'Data Coleta', nomes: ['datacoleta', 'datadacoleta'], pos: 3 },
  { campo: 'linkMateria', nome: 'Link da Materia', nomes: ['linkdamateria', 'linkdapublicacao'], pos: 4 },
  { campo: 'plataforma', nome: 'Canal/Veiculo', nomes: ['canalveiculo', 'canal', 'veiculo'], pos: 5 },
  { campo: 'autoria', nome: 'Autoria/Jornalista', nomes: ['autoriajornalista', 'autoria', 'jornalista'], pos: 6 },
  { campo: 'envolveSicoob', nome: 'Envolve Sicoob?', nomes: ['envolvesicoob'], pos: 7 },
  { campo: 'tipo', nome: 'Tipo de Registro', nomes: ['tipoderegistro', 'tipo'], pos: 8 },
  { campo: 'fato', nome: 'Fato / Titulo da Materia', nomes: ['fatotitulodamateria', 'fato', 'titulodamateria'], pos: 9 },
  { campo: 'textoTimeline', nome: 'Texto Timeline', nomes: ['textotimeline'], pos: 10 },
  { campo: 'tonalidade', nome: 'Tonalidade', nomes: ['tonalidade'], pos: 11 },
  { campo: 'mostrarTimeline', nome: 'Mostrar Timeline?', nomes: ['mostrartimeline'], pos: 12 },
  { campo: 'proximoMarco', nome: 'E Proximo Marco?', nomes: ['eproximomarco', 'proximomarco'], pos: 13 },
  { campo: 'gerarClipping', nome: 'Gerar Clipping?', nomes: ['gerarclipping'], pos: 14 },
  { campo: 'trecho', nome: 'Trecho sobre o Sicoob', nomes: ['trechosobreosicoob', 'trecho'], pos: 15 },
  { campo: 'volume', nome: 'Volume Agrupado', nomes: ['volumeagrupadovazio1', 'volumeagrupado', 'volume'], pos: 16 },
  { campo: 'printUrl', nome: 'coluna_print', nomes: ['colunaprint', 'linkdoprint', 'print'], pos: 17 },
  { campo: 'posicaoCitacao', nome: 'posicao_citacao', nomes: ['posicaocitacao', 'posicaodacitacao', 'localizadordecitacao', 'partedacitacao'], pos: 18 },
];

/** Acionamentos_Imprensa: Data, Veiculo, Jornalista, Pauta, Atendido_ou_nao (+ edicao_numero opcional) */
const COLUNAS_ACIONAMENTOS: Coluna[] = [
  { campo: 'data', nome: 'Data', nomes: ['data'], pos: 0 },
  { campo: 'veiculo', nome: 'Veiculo', nomes: ['veiculo'], pos: 1 },
  { campo: 'jornalista', nome: 'Jornalista', nomes: ['jornalista'], pos: 2 },
  // "Demanda" e "Status" são os nomes do modelo antigo
  { campo: 'pauta', nome: 'Pauta', nomes: ['pauta', 'demanda'], pos: 3 },
  { campo: 'atendido', nome: 'Atendido_ou_nao', nomes: ['atendidoounao', 'atendido', 'status'], pos: 4 },
  { campo: 'edicao', nome: 'edicao_numero', nomes: ['edicaonumero', 'edicao', 'versao'], pos: 5 },
];

/**
 * Posição de cada campo pelo nome do cabeçalho. Ordem de preferência: nome exato, depois
 * "começa com", depois "contém", sem usar a mesma coluna duas vezes (assim "id_do_print" não
 * é confundido com "coluna_print").
 */
export function mapearColunas(cabecalho: string[], colunas: Coluna[], aba: string, avisos: string[], opcionais: string[] = []) {
  const chaves = cabecalho.map(chaveCabecalho);
  const pos: Record<string, number> = {};
  const usadas = new Set<number>();
  const testes: ((k: string, n: string) => boolean)[] = [(k, n) => k === n, (k, n) => k.startsWith(n), (k, n) => k.includes(n)];
  for (const teste of testes) {
    for (const c of colunas) {
      if (c.campo in pos) continue;
      const i = chaves.findIndex((k, idx) => !usadas.has(idx) && k && c.nomes.some(n => teste(k, n)));
      if (i >= 0) { pos[c.campo] = i; usadas.add(i); }
    }
  }
  const faltando: string[] = [];
  for (const c of colunas) {
    if (c.campo in pos) continue;
    if (opcionais.includes(c.campo)) { pos[c.campo] = -1; continue; }
    pos[c.campo] = cabecalho.length ? -1 : c.pos;
    faltando.push(c.nome);
  }
  if (faltando.length && cabecalho.length) {
    avisos.push(`${aba}: não encontrei as colunas ${faltando.join(', ')} pelo nome do cabeçalho (linha 1); esses campos ficaram vazios.`);
  }
  return pos;
}

export function getAuth() {
  return new google.auth.JWT({
    email: process.env.GOOGLE_CLIENT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
}

let cliente: sheets_v4.Sheets | null = null;
export function sheets() {
  cliente ||= google.sheets({ version: 'v4', auth: getAuth() });
  return cliente;
}

/** célula lida da grade: o texto visível e o link por trás dele (hiperlink ou chip do Drive) */
export interface Celula { texto: string; link: string }

/**
 * Lê uma faixa com os links das células: hiperlinks e "chips" de arquivo do Drive
 * (o texto do chip é só o nome do arquivo; o endereço fica em chipRuns).
 */
export async function lerGrade(spreadsheetId: string, range: string): Promise<Celula[][]> {
  const campos = (comChip: boolean) =>
    `sheets(data(rowData(values(formattedValue,hyperlink${comChip ? ',chipRuns(chip(richLinkProperties(uri)))' : ''},textFormatRuns(format(link(uri)))))))`;
  let res;
  try {
    res = await sheets().spreadsheets.get({ spreadsheetId, ranges: [range], includeGridData: true, fields: campos(true) });
  } catch (e) {
    // se a API recusar o campo dos chips, lê sem ele
    if ((e as { code?: number }).code !== 400) throw e;
    res = await sheets().spreadsheets.get({ spreadsheetId, ranges: [range], includeGridData: true, fields: campos(false) });
  }
  const linhas = res.data.sheets?.[0]?.data?.[0]?.rowData || [];
  return linhas.map(l => (l.values || []).map(v => {
    const texto = (v.formattedValue || '').trim();
    const link = v.chipRuns?.find(c => c.chip?.richLinkProperties?.uri)?.chip?.richLinkProperties?.uri
      || v.hyperlink
      || v.textFormatRuns?.find(r => r.format?.link?.uri)?.format?.link?.uri
      || '';
    return { texto, link };
  }));
}

export { numeroEdicao };

/**
 * ultima_atualizacao (data) + hora_atualizacao (hora) → "22/10/2026 18:00". A hora aceita "18:00",
 * "18:00:00", "18h", "18h30" ou "18". Sem hora, fica só a data (ou a hora que já estiver na data).
 */
export function juntarDataHora(data: string, hora: string): { valor: string; horaInvalida: boolean } {
  const d = (data || '').trim(), h = (hora || '').trim();
  if (!h) return { valor: d, horaInvalida: false };
  const m = h.match(/(\d{1,2})\s*(?::|h)\s*(\d{2})?(?::\d{2})?\s*h?\s*$/i) || h.match(/^(\d{1,2})$/);
  if (!m || +m[1] > 23 || (m[2] && +m[2] > 59)) return { valor: d, horaInvalida: true };
  if (!d) return { valor: d, horaInvalida: false };
  const soData = d.split(/[\s,]+/)[0];
  return { valor: `${soData} ${m[1].padStart(2, '0')}:${m[2] || '00'}`, horaInvalida: false };
}

const vazioLinha = (l: unknown[]) => !l.some(c => String((c as Celula)?.texto ?? c ?? '').trim());

export async function obterDadosDoRelatorio(spreadsheetId: string): Promise<RelatorioDados> {
  const avisosLeitura: string[] = [];
  try {
    const [valores, grade] = await Promise.all([
      sheets().spreadsheets.values.batchGet({ spreadsheetId, ranges: ['Configuracoes_Gerais!A1:AZ', 'Acionamentos_Imprensa!A1:Z'] }),
      lerGrade(spreadsheetId, 'Registro_Central!A1:AZ'),
    ]);
    const abas = valores.data.valueRanges || [];

    // ---------- Configuracoes_Gerais: uma linha por edição ----------
    const [cabGeral = [], ...linhasGeral] = (abas[0]?.values || []) as string[][];
    const edicoes: Edicao[] = [];
    linhasGeral.forEach((l, i) => {
      if (vazioLinha(l)) return;
      const dados: Record<string, string> = {};
      cabGeral.forEach((chave, idx) => { if (chave) dados[String(chave).trim()] = String(l[idx] ?? '').trim(); });
      // linha só com valores pré-preenchidos (ex.: titulo_orgao), sem número nem data: ainda não é uma edição
      if (!(dados.edicao_numero || '').trim() && !(dados.ultima_atualizacao || '').trim()) return;
      // a hora do fechamento fica numa coluna própria (hora_atualizacao)
      const junto = juntarDataHora(dados.ultima_atualizacao || '', dados.hora_atualizacao || '');
      if (junto.horaInvalida) avisosLeitura.push(`Configuracoes_Gerais, linha ${i + 2}: hora_atualizacao "${dados.hora_atualizacao}" não reconhecida (use 18:00); a edição ficou sem hora.`);
      dados.ultima_atualizacao = junto.valor;
      const rotulo = dados.edicao_numero || '';
      let numero = numeroEdicao(rotulo);
      if (numero == null) {
        numero = (edicoes[edicoes.length - 1]?.numero || 0) + 1;
        avisosLeitura.push(`Configuracoes_Gerais, linha ${i + 2}: sem edicao_numero; considerei como edição ${numero}.`);
      }
      const descricao = Object.entries(dados).find(([k]) => chaveCabecalho(k).startsWith('descricao'))?.[1] || '';
      edicoes.push({ numero, rotulo: rotulo || String(numero), ultimaAtualizacao: dados.ultima_atualizacao || '', descricao, linha: i + 2, dados });
    });
    const repetidas = edicoes.map(e => e.numero).filter((n, i, a) => a.indexOf(n) !== i);
    if (repetidas.length) avisosLeitura.push(`Configuracoes_Gerais: a edição ${[...new Set(repetidas)].join(', ')} aparece em mais de uma linha; vale a última.`);
    const porNumero = new Map<number, Edicao>();
    edicoes.forEach(e => porNumero.set(e.numero, e));
    const edicoesUnicas = [...porNumero.values()].sort((a, b) => a.numero - b.numero);

    // ---------- Registro_Central ----------
    const [cabReg = [], ...linhasReg] = grade;
    const p = mapearColunas(cabReg.map(c => c.texto), COLUNAS_REGISTRO, 'Registro_Central', avisosLeitura, ['edicao', 'idPrint', 'posicaoCitacao', 'volume']);
    const registros: RegistroCentral[] = [];
    linhasReg.forEach((l, i) => {
      if (vazioLinha(l)) return;
      const cel = (campo: string) => (p[campo] >= 0 ? l[p[campo]] : undefined) || { texto: '', link: '' };
      const v = (campo: string) => cel(campo).texto;
      // links: o endereço por trás do texto (chip ou hiperlink) tem prioridade
      const url = (campo: string) => cel(campo).link || cel(campo).texto;
      registros.push({
        edicao: v('edicao'), dataPost: v('dataPost'), dataColeta: v('dataColeta'), linkMateria: url('linkMateria'), plataforma: v('plataforma'),
        envolveSicoob: sim(v('envolveSicoob')), tipo: v('tipo'), fato: v('fato'), textoTimeline: v('textoTimeline'),
        tonalidade: v('tonalidade'), mostrarTimeline: sim(v('mostrarTimeline')), proximoMarco: sim(v('proximoMarco')),
        gerarClipping: sim(v('gerarClipping')), trecho: v('trecho'), autoria: v('autoria'),
        volume: parseInt(v('volume')) || 1, printUrl: url('printUrl'), posicaoCitacao: v('posicaoCitacao'), linha: i + 2,
      });
    });

    // ---------- Acionamentos_Imprensa ----------
    const [cabAc = [], ...linhasAc] = (abas[1]?.values || []) as string[][];
    const q = mapearColunas(cabAc, COLUNAS_ACIONAMENTOS, 'Acionamentos_Imprensa', avisosLeitura, ['edicao']);
    const acionamentos: AcionamentoImprensa[] = [];
    linhasAc.forEach((l, i) => {
      if (vazioLinha(l)) return;
      const v = (campo: string) => (q[campo] >= 0 ? String(l[q[campo]] ?? '').trim() : '');
      acionamentos.push({
        edicao: v('edicao'), data: v('data'), veiculo: v('veiculo'), jornalista: v('jornalista'),
        pauta: v('pauta'), atendido: v('atendido'), linha: i + 2,
      });
    });

    return { geral: {}, edicoes: edicoesUnicas, registros, acionamentos, avisosLeitura };
  } catch (error) {
    const e = error as { code?: number; message?: string };
    console.error('Erro na planilha:', e.message || error);
    const conta = process.env.GOOGLE_CLIENT_EMAIL || 'a conta de serviço do site';
    const msg = e.code === 403 || e.code === 404
      ? `O site não tem acesso a esta planilha. Compartilhe a planilha (ou a pasta dela) com ${conta} como leitor.`
      : e.message || 'Erro desconhecido ao acessar o Google Sheets';
    return { geral: { erro_api: msg }, edicoes: [], registros: [], acionamentos: [] };
  }
}

/**
 * Campos do caso, que não mudam de uma edição para outra: se estiverem vazios na edição
 * escolhida, valem os da edição anterior mais recente que os tenha preenchido.
 */
const CAMPOS_DO_CASO = [
  'titulo_orgao', 'titulo_crise', 'titulo_o_que_mudou', 'titulo_o_que_significa', 'subtitulo_unidade', 'inicio_monitoramento',
  'analise_caso', 'papel_sicoob', 'centro_pauta', 'gatilhos_escalada', 'analise_revisao_data',
];

/** Monta `geral` com a edição escolhida (padrão: a última) e calcula o início do período. */
export function escolherEdicao(dados: RelatorioDados, numero?: number): RelatorioDados {
  const eds = dados.edicoes;
  if (!eds.length) return dados;
  const idx = numero != null ? eds.findIndex(e => e.numero === numero) : eds.length - 1;
  const atual = eds[idx < 0 ? eds.length - 1 : idx];
  const anteriores = eds.filter(e => e.numero < atual.numero);
  const geral: Record<string, string> = { ...atual.dados };
  for (const campo of CAMPOS_DO_CASO) {
    if ((geral[campo] || '').trim()) continue;
    const herdado = [...anteriores].reverse().find(e => (e.dados[campo] || '').trim());
    if (herdado) geral[campo] = herdado.dados[campo];
  }
  if (!(geral.edicao_numero || '').trim()) geral.edicao_numero = atual.rotulo;
  return { ...dados, geral, edicao: atual.numero };
}
