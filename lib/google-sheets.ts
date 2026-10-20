import { google } from 'googleapis';

export interface RelatorioDados {
  geral: Record<string, string>;
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
      ranges: ['Configuracoes_Gerais!A1:Z2', 'Registro_Central!A2:P', 'Acionamentos_Imprensa!A2:G'],
    });

    const abas = res.data.valueRanges || [];

    const linhasGeral = abas[0].values || [];
    const geral: Record<string, string> = {};
    if (linhasGeral.length === 2) {
      linhasGeral[0].forEach((chave, idx) => { geral[chave] = linhasGeral[1][idx] || ''; });
    }

    const linhasRegistros = abas[1].values || [];
    const registros: RegistroCentral[] = linhasRegistros.map((coluna) => ({
      dataPost: coluna[0] || '', dataColeta: coluna[1] || '', linkMateria: coluna[2] || '', plataforma: coluna[3] || '',
      envolveSicoob: sim(coluna[4]), tipo: coluna[5] || '', fato: coluna[6] || '', textoTimeline: coluna[7] || '',
      tonalidade: coluna[8] || '', mostrarTimeline: sim(coluna[9]), proximoMarco: sim(coluna[10]),
      gerarClipping: sim(coluna[11]), trecho: coluna[12] || '', autoria: coluna[13] || '',
      volume: parseInt(coluna[14]) || 1, printUrl: coluna[15] || '',
    }));

    const linhasAcionamentos = abas[2].values || [];
    const acionamentos: AcionamentoImprensa[] = linhasAcionamentos.map((coluna) => ({
      data: coluna[0] || '', veiculo: coluna[1] || '', jornalista: coluna[2] || '',
      demanda: coluna[3] || '', prazo: coluna[4] || '', resposta: coluna[5] || '', status: coluna[6] || '',
    }));

    return { geral, registros, acionamentos };
  } catch (error: any) {
    console.error('Erro na planilha:', error.message || error);
    // RETORNO SEGURO: Em vez de quebrar a página, envia o erro para aparecer no alerta amarelo
    return { geral: { erro_api: error.message || 'Erro desconhecido ao acessar o Google Sheets' }, registros: [], acionamentos: [] };
  }
}