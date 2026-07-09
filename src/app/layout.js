import { Inter } from 'next/font/google';
import MainLayoutWrapper from '@/components/MainLayoutWrapper';
import './globals.css';

const inter = Inter({ 
  subsets: ['latin'],
  display: 'swap',
});

export const metadata = {
  title: 'Fingerspot Link - Pemantau Kehadiran',
  description: 'Aplikasi web pemantau absensi dari mesin Fingerspot Revo W-230NM secara real-time.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="id" className="h-full bg-slate-50">
      <body className={`${inter.className} h-full text-slate-900 antialiased`}>
        <MainLayoutWrapper>{children}</MainLayoutWrapper>
      </body>
    </html>
  );
}
