import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import { Michroma, Montserrat, JetBrains_Mono } from 'next/font/google';
import { brand, brandCssVars } from '@/config/brand';
import './globals.css';

const display = Michroma({ weight: '400', subsets: ['latin'], variable: '--font-display', display: 'swap' });
const body = Montserrat({ subsets: ['latin'], variable: '--font-body', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

const description = `${brand.text.en.description} ${brand.challenge}.`;

export const metadata: Metadata = {
  title: brand.tabTitle,
  description,
  // Na Vercel o Next usa a URL de produção como base; localmente, localhost.
  metadataBase: new URL(
    process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000',
  ),
  openGraph: {
    title: `${brand.fullName} · ${brand.text.en.tagline}`,
    description,
    type: 'website',
    siteName: brand.fullName,
  },
  twitter: {
    card: 'summary_large_image',
    title: `${brand.fullName} · ${brand.text.en.tagline}`,
    description,
  },
};

export const viewport = { width: 'device-width', initialScale: 1, themeColor: brand.colors.bg };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" style={brandCssVars() as CSSProperties} className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
