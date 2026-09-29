import NextAuth, { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { google } from 'googleapis';

async function verificarPermissaoNoDrive(userEmail: string): Promise<boolean> {
  try {
    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_CLIENT_EMAIL,
      key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/drive.metadata.readonly'],
    });

    const drive = google.drive({ version: 'v3', auth });

    // Consulta a lista de permissões do arquivo da planilha (ou pasta do Drive)
    const fileId = process.env.GOOGLE_SHEET_ID; 

    const res = await drive.permissions.list({
      fileId: fileId,
      fields: 'permissions(emailAddress, domain, type, role)',
      supportsAllDrives: true,
    });

    const permissoes = res.data.permissions || [];
    const emailNormalizado = userEmail.toLowerCase().trim();
    const dominioUsuario = emailNormalizado.split('@')[1];

    for (const perm of permissoes) {
      // 1. Se foi compartilhado com todo o domínio corporativo
      if (perm.type === 'domain' && perm.domain) {
        if (perm.domain.toLowerCase() === dominioUsuario) {
          return true;
        }
      }

      // 2. Se o e-mail individual está explicitamente na lista de compartilhamento
      if (perm.type === 'user' && perm.emailAddress) {
        if (perm.emailAddress.toLowerCase() === emailNormalizado) {
          return true;
        }
      }

      // 3. Se estiver público ("qualquer pessoa com o link")
      if (perm.type === 'anyone') {
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error('Erro ao consultar permissões no Google Drive:', error);
    return false;
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;
      return await verificarPermissaoNoDrive(user.email);
    },
    async session({ session }) {
      return session;
    },
  },
  pages: {
    signIn: '/',
    error: '/?erro=AcessoNegado',
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };