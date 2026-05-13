import type { ReactNode } from 'react';
import Script from 'next/script';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from '../components/Providers';
import { ROOSTA_BRAND } from '../lib/brand';

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata = {
  metadataBase: new URL(ROOSTA_BRAND.url),
  title: 'Roosta — Telegram-native social savings',
  description: ROOSTA_BRAND.description,
  manifest: '/site.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-48x48.png', sizes: '48x48', type: 'image/png' },
      { url: '/favicon-64x64.png', sizes: '64x64', type: 'image/png' },
      { url: '/favicon-128x128.png', sizes: '128x128', type: 'image/png' },
      { url: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  openGraph: {
    title: 'Roosta — Telegram-native social savings',
    description: ROOSTA_BRAND.description,
    url: ROOSTA_BRAND.url,
    siteName: 'Roosta',
    images: [
      {
        url: '/brand/roosta_og_image_1200x630.png',
        width: 1200,
        height: 630,
        alt: 'Roosta',
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Roosta — Telegram-native social savings',
    description: ROOSTA_BRAND.description,
    images: ['/brand/roosta_og_image_1200x630.png'],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      </head>
      <body style={{ fontFamily: 'var(--font-body)' }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
