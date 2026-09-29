import { google } from 'googleapis';
import { NextResponse } from 'next/server';

    export async function GET() {
    try {
        const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
        const privateKey = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
        const sheetId = process.env.GOOGLE_SHEET_ID;

        if (!clientEmail || !privateKey || !sheetId) {
        return NextResponse.json({ error: 'Configurações de ambiente ausentes' }, { status: 500 });
        }

        const auth = new google.auth.JWT({
        email: clientEmail,
        key: privateKey,
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
        });

    const sheets = google.sheets({ version: 'v4', auth });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: 'Relatorios!A2:G',
    });

    const rows = response.data.values || [];

    const relatorios = rows.map((row) => ({
      id: row[0] || '',
      nome: row[1] || '',
      data: row[2] || '',
      urlVisualizacao: row[3] || '',
      urlDownload: row[4] || '',
      titulo: row[5] || '',
      dataSincronizacao: row[6] || ''
    }));

    return NextResponse.json({ relatorios });
  } catch (error: any) {
    console.error('Erro na API:', error);
    return NextResponse.json({ error: error.message || 'Erro ao consultar planilha' }, { status: 500 });
  }
}