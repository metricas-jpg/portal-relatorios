import type { Metadata } from 'next';
import { Asap } from 'next/font/google';
import { Providers } from './providers';
import './globals.css';

const asap = Asap({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-asap',
});

export const metadata: Metadata = {
  title: 'Central de Relatórios | Sicoob & Loggia',
  description: 'Portal de monitoramento e consulta de relatórios',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className={asap.variable}>
      <body className="font-sans antialiased bg-[#f4f7f8] text-[#003641]">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}