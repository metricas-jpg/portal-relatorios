import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { google } from 'googleapis';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession();
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
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });

    const drive = google.drive({ version: 'v3', auth });

    // Busca o link da miniatura gerado pela API do Google Drive
    const fileRes = await drive.files.get({
      fileId,
      fields: 'thumbnailLink, hasThumbnail',
      supportsAllDrives: true,
    });

    let thumbUrl = fileRes.data.thumbnailLink;

    if (!thumbUrl) {
      return NextResponse.json({ error: 'Miniatura não disponível' }, { status: 404 });
    }

    // Altera o tamanho padrão (s220) para w600 para melhor resolução
    thumbUrl = thumbUrl.replace(/=s\d+/, '=w600');

    // Faz o download da imagem pelo servidor autenticado
    const imageRes = await fetch(thumbUrl, {
      headers: {
        Authorization: `Bearer ${(await auth.getAccessToken()).token}`,
      },
    });

    if (!imageRes.ok) {
      // Fallback caso a miniatura direta não responda
      const directThumb = await fetch(thumbUrl);
      if (!directThumb.ok) {
        return NextResponse.json({ error: 'Erro ao buscar imagem' }, { status: 502 });
      }
      const buffer = await directThumb.arrayBuffer();
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': directThumb.headers.get('content-Type') || 'image/jpeg',
          'Cache-Control': 'public, max-age=86400, s-maxage=86400',
        },
      });
    }

    const imageBuffer = await imageRes.arrayBuffer();

    return new NextResponse(imageBuffer, {
      headers: {
        'Content-Type': imageRes.headers.get('content-Type') || 'image/jpeg',
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      },
    });
  } catch (error) {
    console.error('Erro na rota de thumbnail:', error);
    return NextResponse.json({ error: 'Falha ao processar miniatura' }, { status: 500 });
  }
}