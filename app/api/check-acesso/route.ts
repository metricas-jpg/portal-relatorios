import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { obterEmailsAutorizados } from '@/lib/google-sheets';

export async function GET() {
  try {
    // 1. Pega a sessão do usuário atual
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ isAuthorized: false });
    }

    const emailUsuario = session.user.email.toLowerCase();
    
    // 2. Lê a aba "Acessos_Gerador" da planilha
    const emailsAutorizados = await obterEmailsAutorizados();

    // 3. Responde com true ou false
    const isAuthorized = emailsAutorizados.includes(emailUsuario);
    
    return NextResponse.json({ isAuthorized });
  } catch (error) {
    console.error('Erro ao verificar acesso:', error);
    return NextResponse.json({ isAuthorized: false }, { status: 500 });
  }
}