import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { google } from 'googleapis';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const fileId = searchParams.get('id');

    if (!fileId) {
      return NextResponse.json({ error: 'ID do arquivo não fornecido' }, { status: 400 });
    }

    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_CLIENT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      scopes: [
        'https://www.googleapis.com/auth/drive.readonly',
        'https://www.googleapis.com/auth/drive',
      ],
    });

    const drive = google.drive({ version: 'v3', auth });

    // Consulta os metadados do arquivo para obter a miniatura gerada pelo Drive
    const fileRes = await drive.files.get({
      fileId,
      fields: 'thumbnailLink, hasThumbnail',
      supportsAllDrives: true,
    });

    let thumbUrl = fileRes.data.thumbnailLink;

    if (!thumbUrl) {
      return NextResponse.json({ error: 'Miniatura indisponível' }, { status: 404 });
    }

    // Aumenta a resolução da miniatura de s220 para w600
    thumbUrl = thumbUrl.replace(/=s\d+/, '=w600');

    const imageRes = await fetch(thumbUrl);

    if (!imageRes.ok) {
      return NextResponse.json(
        { error: 'Falha ao descarregar miniatura do Google' },
        { status: imageRes.status }
      );
    }

    const imageBuffer = await imageRes.arrayBuffer();
    const contentType = imageRes.headers.get('content-type') || 'image/jpeg';

    return new NextResponse(imageBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=43200',
      },
    });
  } catch (error) {
    console.error('Erro na rota de thumbnail:', error);
    return NextResponse.json({ error: 'Falha ao processar miniatura' }, { status: 500 });
  }
}