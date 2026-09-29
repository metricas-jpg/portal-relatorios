import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { google } from 'googleapis';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { Readable } from 'stream';

export async function GET(req: NextRequest) {
  try {
    // 1. Verifica autenticação no portal
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const fileId = searchParams.get('id');
    const isDownload = searchParams.get('download') === 'true';

    if (!fileId) {
      return NextResponse.json({ error: 'ID do arquivo não fornecido' }, { status: 400 });
    }

    // 2. Conecta via Service Account
    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_CLIENT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      scopes: [
        'https://www.googleapis.com/auth/drive.readonly',
        'https://www.googleapis.com/auth/drive',
      ],
    });

    const drive = google.drive({ version: 'v3', auth });

    // 3. Obtém nome e metadados
    const fileMeta = await drive.files.get({
      fileId,
      fields: 'name, mimeType',
      supportsAllDrives: true,
    });

    const fileName = fileMeta.data.name || `relatorio_${fileId}.pdf`;

    // 4. Busca o fluxo do arquivo
    const fileStreamResponse = await drive.files.get(
      {
        fileId,
        alt: 'media',
        supportsAllDrives: true,
      },
      { responseType: 'stream' }
    );

    const stream = fileStreamResponse.data as Readable;

    const webStream = new ReadableStream({
      start(controller) {
        stream.on('data', (chunk) => controller.enqueue(chunk));
        stream.on('end', () => controller.close());
        stream.on('error', (err) => controller.error(err));
      },
    });

    // 5. Define cabeçalho: "inline" para abrir na tela ou "attachment" para baixar
    const dispositionType = isDownload ? 'attachment' : 'inline';

    return new NextResponse(webStream, {
      headers: {
        'Content-Type': fileMeta.data.mimeType || 'application/pdf',
        'Content-Disposition': `${dispositionType}; filename="${encodeURIComponent(fileName)}"`,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Erro na rota de arquivo:', error);
    return NextResponse.json({ error: 'Falha ao processar arquivo' }, { status: 500 });
  }
}