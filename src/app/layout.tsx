import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import { Michroma, Montserrat, JetBrains_Mono } from 'next/font/google';
import { brand, brandCssVars } from '@/config/brand';
import './globals.css';

const display = Michroma({ weight: '400', subsets: ['latin'], variable: '--font-display', display: 'swap' });
const body = Montserrat({ subsets: ['latin'], variable: '--font-body', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

export const metadata: Metadata = {
  title: `${brand.fullName} · ${brand.tagline}`,
  description: `${brand.subtitle} ${brand.challenge}.`,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" style={brandCssVars() as CSSProperties} className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
