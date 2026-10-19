import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ isAuthorized: false });
  
  // Autoriza qualquer pessoa com o domínio corporativo
  const isAuthorized = session.user.email.toLowerCase().endsWith('@loggia.com.br');
  return NextResponse.json({ isAuthorized });
}