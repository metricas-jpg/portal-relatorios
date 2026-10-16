import { google } from 'googleapis';

// Função auxiliar para autenticar usando as variáveis que já temos
function getAuth() {
  return new google.auth.JWT({
    email: process.env.GOOGLE_CLIENT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
}

// Lógica que vai na planilha e puxa quem tem autorização
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
    return []; // Falha segura: se der erro de conexão, a lista vem vazia e ninguém entra
  }
}