import { google } from 'googleapis';

// ==========================================
// 1. TIPAGENS (O formato dos dados)
// ==========================================
export interface RelatorioDados {
  geral: Record<string, string>;
  registros: RegistroCentral[];
  acionamentos: AcionamentoImprensa[];
}

export interface RegistroCentral {
  data: string;
  tipo: string;
  plataforma: string;
  fato: string;
  tonalidade: string;
  envolveSicoob: boolean;
  mostrarTimeline: boolean;
  proximoMarco: boolean;
  gerarClipping: boolean;
  link: string;
  trecho: string;
  autoria: string;
  volume: number;
}

export interface AcionamentoImprensa {
  data: string;
  veiculo: string;
  jornalista: string;
  demanda: string;
  prazo: string;
  resposta: string;
  status: string;
}

// ==========================================
// 2. AUTENTICAÇÃO COM A SERVICE ACCOUNT
// ==========================================
function getAuth() {
  return new google.auth.JWT({
    email: process.env.GOOGLE_CLIENT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
}

// ==========================================
// 3. FUNÇÃO DE SEGURANÇA (WHITELIST)
// ==========================================
export async function obterEmailsAutorizados(): Promise<string[]> {
  try {
    const sheets = google.sheets({ version: 'v4', auth: getAuth() });
    const spreadsheetId = process.env.SPREADSHEET_ID;

    // Busca apenas a Coluna A da aba de acessos
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Acessos_Gerador!A2:A', 
    });

    const linhas = res.data.values || [];
    
    // Transforma as linhas em uma lista de e-mails em minúsculo, removendo espaços
    return linhas.map(linha => linha[0]?.toLowerCase().trim()).filter(Boolean);
  } catch (error) {
    console.error('Erro ao buscar e-mails autorizados:', error);
    return []; 
  }
}

// ==========================================
// 4. FUNÇÃO DE EXTRAÇÃO DE DADOS DO RELATÓRIO
// ==========================================
export async function obterDadosDoRelatorio(): Promise<RelatorioDados> {
  try {
    const sheets = google.sheets({ version: 'v4', auth: getAuth() });
    const spreadsheetId = process.env.SPREADSHEET_ID;

    // Pede os dados das 3 abas principais de uma vez
    const res = await sheets.spreadsheets.values.batchGet({
      spreadsheetId,
      ranges: [
        'Configuracoes_Gerais!A1:Z2',
        'Registro_Central!A2:M',
        'Acionamentos_Imprensa!A2:G'
      ],
    });

    const abas = res.data.valueRanges || [];

    // Tratamento da Aba 1: Geral (Transforma colunas em chave/valor)
    const linhasGeral = abas[0].values || [];
    const geral: Record<string, string> = {};
    if (linhasGeral.length === 2) {
      const cabecalhos = linhasGeral[0];
      const valores = linhasGeral[1];
      cabecalhos.forEach((chave, index) => {
        geral[chave] = valores[index] || '';
      });
    }

    // Tratamento da Aba 2: Registros (Timeline, Clipping, Volume)
    const linhasRegistros = abas[1].values || [];
    const registros: RegistroCentral[] = linhasRegistros.map((coluna) => ({
      data: coluna[0] || '',
      tipo: coluna[1] || '',
      plataforma: coluna[2] || '',
      fato: coluna[3] || '',
      tonalidade: coluna[4] || '',
      envolveSicoob: coluna[5]?.toUpperCase() === 'SIM',
      mostrarTimeline: coluna[6]?.toUpperCase() === 'SIM',
      proximoMarco: coluna[7]?.toUpperCase() === 'SIM',
      gerarClipping: coluna[8]?.toUpperCase() === 'SIM',
      link: coluna[9] || '',
      trecho: coluna[10] || '',
      autoria: coluna[11] || '',
      volume: parseInt(coluna[12]) || 1, // Se vazio, assume 1
    }));

    // Tratamento da Aba 3: Acionamentos
    const linhasAcionamentos = abas[2].values || [];
    const acionamentos: AcionamentoImprensa[] = linhasAcionamentos.map((coluna) => ({
      data: coluna[0] || '',
      veiculo: coluna[1] || '',
      jornalista: coluna[2] || '',
      demanda: coluna[3] || '',
      prazo: coluna[4] || '',
      resposta: coluna[5] || '',
      status: coluna[6] || '',
    }));

    return { geral, registros, acionamentos };

  } catch (error) {
    console.error('Erro ao buscar dados da planilha:', error);
    throw new Error('Falha na comunicação com a planilha do Google Sheets.');
  }
}