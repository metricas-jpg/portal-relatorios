import { google } from 'googleapis';

export interface RelatorioDados {
  geral: Record<string, string>;
  /** problemas de leitura das abas (ex.: coluna não encontrada), exibidos no painel do gerador */
  avisosLeitura?: string[];
  registros: RegistroCentral[];
  acionamentos: AcionamentoImprensa[];
}

export interface RegistroCentral {
  dataPost: string; dataColeta: string; linkMateria: string; plataforma: string; envolveSicoob: boolean;
  tipo: string; fato: string; textoTimeline: string; tonalidade: string; mostrarTimeline: boolean;
  proximoMarco: boolean; gerarClipping: boolean; trecho: string; autoria: string; volume: number; printUrl: string;
}

export interface AcionamentoImprensa {
  data: string; veiculo: string; jornalista: string; demanda: string; prazo: string; resposta: string; status: string;
}

const sim = (v?: string) => (v || '').trim().toUpperCase() === 'SIM';

/**
 * Colunas do Registro_Central, localizadas pelo NOME do cabeçalho (linha 1), não pela posição.
 * Assim a equipe pode reordenar as colunas sem quebrar o relatório. `pos` é a posição usada só
 * se o cabeçalho não for encontrado (ordem atual da planilha).
 */
const COLUNAS_REGISTRO = [
  { campo: 'dataPost', nome: 'Data do post', chave: 'datadopost', pos: 0 },
  { campo: 'dataColeta', nome: 'Data Coleta', chave: 'datacoleta', pos: 1 },
  { campo: 'linkMateria', nome: 'Link da Materia', chave: 'linkdamateria', pos: 2 },
  { campo: 'plataforma', nome: 'Canal/Veiculo', chave: 'canalveiculo', pos: 3 },
  { campo: 'autoria', nome: 'Autoria/Jornalista', chave: 'autoria', pos: 4 },
  { campo: 'envolveSicoob', nome: 'Envolve Sicoob?', chave: 'envolvesicoob', pos: 5 },
  { campo: 'tipo', nome: 'Tipo de Registro', chave: 'tipoderegistro', pos: 6 },
  { campo: 'fato', nome: 'Fato / Titulo da Materia', chave: 'fato', pos: 7 },
  { campo: 'textoTimeline', nome: 'Texto Timeline', chave: 'textotimeline', pos: 8 },
  { campo: 'tonalidade', nome: 'Tonalidade', chave: 'tonalidade', pos: 9 },
  { campo: 'mostrarTimeline', nome: 'Mostrar Timeline?', chave: 'mostrartimeline', pos: 10 },
  { campo: 'proximoMarco', nome: 'E Proximo Marco?', chave: 'proximomarco', pos: 11 },
  { campo: 'gerarClipping', nome: 'Gerar Clipping?', chave: 'gerarclipping', pos: 12 },
  { campo: 'trecho', nome: 'Trecho sobre o Sicoob', chave: 'trecho', pos: 13 },
  { campo: 'volume', nome: 'Volume Agrupado', chave: 'volume', pos: 14 },
  { campo: 'printUrl', nome: 'COLUNA PRINT', chave: 'print', pos: 15 },
] as const;

const chaveCabecalho = (s: string) =>
  (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** posição de cada campo a partir da linha de cabeçalho */
function mapearColunas(cabecalho: string[], avisos: string[]) {
  const chaves = cabecalho.map(chaveCabecalho);
  const pos: Record<string, number> = {};
  const faltando: string[] = [];
  COLUNAS_REGISTRO.forEach(c => {
    // "Data do post (DD/MM)" vira "datadopostddmm": basta conter a chave
    const i = chaves.findIndex(k => k.includes(c.chave));
    if (i >= 0) pos[c.campo] = i; else { pos[c.campo] = c.pos; faltando.push(c.nome); }
  });
  if (faltando.length && cabecalho.length) {
    avisos.push(`Registro_Central: não encontrei as colunas ${faltando.join(', ')} pelo nome do cabeçalho; usei a posição padrão. Confira se os nomes da linha 1 foram alterados.`);
  }
  return pos;
}

function getAuth() {
  return new google.auth.JWT({
    email: process.env.GOOGLE_CLIENT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
}

export async function obterDadosDoRelatorio(): Promise<RelatorioDados> {
  try {
    const sheets = google.sheets({ version: 'v4', auth: getAuth() });
    const spreadsheetId = process.env.SPREADSHEET_ID;

    const res = await sheets.spreadsheets.values.batchGet({
      spreadsheetId,
      ranges: ['Configuracoes_Gerais!A1:Z2', 'Registro_Central!A1:Z', 'Acionamentos_Imprensa!A2:G'],
    });

    const abas = res.data.valueRanges || [];

    const linhasGeral = abas[0].values || [];
    const geral: Record<string, string> = {};
    if (linhasGeral.length === 2) {
      linhasGeral[0].forEach((chave, idx) => { geral[chave] = linhasGeral[1][idx] || ''; });
    }

    const avisosLeitura: string[] = [];
    const [cabecalho = [], ...linhasRegistros] = (abas[1].values || []) as string[][];
    const p = mapearColunas(cabecalho, avisosLeitura);
    const registros: RegistroCentral[] = linhasRegistros
      .filter(l => l.some(c => String(c || '').trim()))
      .map((l) => {
        const v = (campo: string) => String(l[p[campo]] ?? '').trim();
        return {
          dataPost: v('dataPost'), dataColeta: v('dataColeta'), linkMateria: v('linkMateria'), plataforma: v('plataforma'),
          envolveSicoob: sim(v('envolveSicoob')), tipo: v('tipo'), fato: v('fato'), textoTimeline: v('textoTimeline'),
          tonalidade: v('tonalidade'), mostrarTimeline: sim(v('mostrarTimeline')), proximoMarco: sim(v('proximoMarco')),
          gerarClipping: sim(v('gerarClipping')), trecho: v('trecho'), autoria: v('autoria'),
          volume: parseInt(v('volume')) || 1, printUrl: v('printUrl'),
        };
      });

    const linhasAcionamentos = abas[2].values || [];
    const acionamentos: AcionamentoImprensa[] = linhasAcionamentos.map((coluna) => ({
      data: coluna[0] || '', veiculo: coluna[1] || '', jornalista: coluna[2] || '',
      demanda: coluna[3] || '', prazo: coluna[4] || '', resposta: coluna[5] || '', status: coluna[6] || '',
    }));

    return { geral, registros, acionamentos, avisosLeitura };
  } catch (error: any) {
    console.error('Erro na planilha:', error.message || error);
    // RETORNO SEGURO: Em vez de quebrar a página, envia o erro para aparecer no alerta amarelo
    return { geral: { erro_api: error.message || 'Erro desconhecido ao acessar o Google Sheets' }, registros: [], acionamentos: [] };
  }
}