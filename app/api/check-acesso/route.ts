import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { emailEhAdmin, emailPodeGerar } from '@/lib/acesso';

// Diz ao portal o que mostrar no cabeçalho: botão do gerador e ícone de compartilhamento
export async function GET() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  return NextResponse.json({ isAuthorized: emailPodeGerar(email), isAdmin: emailEhAdmin(email) });
}
