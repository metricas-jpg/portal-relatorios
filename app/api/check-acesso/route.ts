import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { emailPodeGerar } from '@/lib/acesso';

// Diz ao portal se o usuário logado pode ver o botão do gerador (domínio @loggia.com.br)
export async function GET() {
  const session = await getServerSession(authOptions);
  return NextResponse.json({ isAuthorized: emailPodeGerar(session?.user?.email) });
}
