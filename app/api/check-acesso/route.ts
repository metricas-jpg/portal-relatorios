import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { emailEhAdmin, emailPodeGerar } from '@/lib/acesso';

// Diz ao portal quais botões mostrar: gerador (domínio @loggia.com.br) e acessos (administradores)
export async function GET() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  return NextResponse.json({ isAuthorized: emailPodeGerar(email), isAdmin: emailEhAdmin(email) });
}
