import { google } from 'googleapis';

// ==========================================
// 1. TIPAGENS (Nova Ordem de Colunas)
// ==========================================
export interface RelatorioDados {
  geral: Record<string, string>;
  registros: RegistroCentral[];
  acionamentos: AcionamentoImprensa[];
}

export interface RegistroCentral {
  dataPost: string;         // [0]
  dataColeta: string;       // [1]
  linkMateria: string;      // [2]
  plataforma: string;       // [3]
  envolveSicoob: boolean;   // [4]
  tipo: string;             // [5]
  fato: string;             // [6]
  textoTimeline: string;    // [7]
  tonalidade: string;       // [8]
  mostrarTimeline: boolean; // [9]
  proximoMarco: boolean;    // [10]
  gerarClipping: boolean;   // [11]
  trecho: string;           // [12]
  autoria: string;          // [13]
  volume: number;           // [14]
  printUrl: string;         // [15]
}

export interface AcionamentoImprensa {
  data: string; veiculo: string; jornalista: string; demanda: string; prazo: string; resposta: string; status: string;
}

function getAuth() {
  return new google.auth.JWT({
    email: process.env.GOOGLE_CLIENT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
}

// ==========================================
// 2. FUNÇÃO DE EXTRAÇÃO DE DADOS 
// ==========================================
export async function obterDadosDoRelatorio(): Promise<RelatorioDados> {
  try {
    const sheets = google.sheets({ version: 'v4', auth: getAuth() });
    const res = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: process.env.SPREADSHEET_ID,
      ranges: ['Configuracoes_Gerais!A1:Z2', 'Registro_Central!A2:P', 'Acionamentos_Imprensa!A2:G'],
    });

    const abas = res.data.valueRanges || [];

    // Aba Geral
    const linhasGeral = abas[0].values || [];
    const geral: Record<string, string> = {};
    if (linhasGeral.length === 2) {
      linhasGeral[0].forEach((chave, idx) => { geral[chave] = linhasGeral[1][idx] || ''; });
    }

    // Aba Registros (Aplicando a sua exata ordem de colunas)
    const linhasRegistros = abas[1].values || [];
    const registros: RegistroCentral[] = linhasRegistros.map((coluna) => ({
      dataPost: coluna[0] || '',
      dataColeta: coluna[1] || '',
      linkMateria: coluna[2] || '',
      plataforma: coluna[3] || '',
      envolveSicoob: coluna[4]?.toUpperCase() === 'SIM',
      tipo: coluna[5] || '',
      fato: coluna[6] || '',
      textoTimeline: coluna[7] || '',
      tonalidade: coluna[8] || '',
      mostrarTimeline: coluna[9]?.toUpperCase() === 'SIM',
      proximoMarco: coluna[10]?.toUpperCase() === 'SIM',
      gerarClipping: coluna[11]?.toUpperCase() === 'SIM',
      trecho: coluna[12] || '',
      autoria: coluna[13] || '',
      volume: parseInt(coluna[14]) || 1,
      printUrl: coluna[15] || '',
    }));

    // Aba Acionamentos
    const linhasAcionamentos = abas[2].values || [];
    const acionamentos: AcionamentoImprensa[] = linhasAcionamentos.map((coluna) => ({
      data: coluna[0] || '', veiculo: coluna[1] || '', jornalista: coluna[2] || '',
      demanda: coluna[3] || '', prazo: coluna[4] || '', resposta: coluna[5] || '', status: coluna[6] || '',
    }));

    return { geral, registros, acionamentos };
  } catch (error) {
    console.error('Erro na planilha:', error);
    throw new Error('Falha na comunicação com o Google Sheets.');
  }
}