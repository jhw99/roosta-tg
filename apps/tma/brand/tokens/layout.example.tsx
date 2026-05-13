/**
 * Roosta Next.js Layout Snippet — app/layout.tsx
 *
 * Drop the metadata block into your existing app/layout.tsx.
 * Place all favicon files from /favicons/ into your /public folder.
 *
 * File mapping:
 *   favicons/favicon.ico                  → public/favicon.ico
 *   favicons/favicon-16x16.png            → public/favicon-16x16.png
 *   favicons/favicon-32x32.png            → public/favicon-32x32.png
 *   favicons/apple-touch-icon.png         → public/apple-touch-icon.png
 *   favicons/android-chrome-192x192.png   → public/android-chrome-192x192.png
 *   favicons/android-chrome-512x512.png   → public/android-chrome-512x512.png
 *   favicons/site.webmanifest             → public/site.webmanifest
 *   logos/roosta_og_image_1200x630.png    → public/og-image.png
 */

import type { Metadata } from "next";

export const metadata: Metadata = {
  metadataBase: new URL("https://roosta-mvp.vercel.app"),

  title: {
    default: "Roosta — On-chain Social Savings on Solana",
    template: "%s | Roosta",
  },

  description:
    "Roosta turns ROSCAs (Korean kye, Mexican tanda, West African sou-sou) into a Solana-native social savings protocol. Pool USDC, automate rotating payouts, build portable financial reputation.",

  keywords: [
    "Roosta",
    "ROSCA",
    "Solana",
    "Web3",
    "Savings",
    "USDC",
    "Korean kye",
    "Tanda",
    "Sou-sou",
    "Social fintech",
    "On-chain savings",
  ],

  // ===== Favicons =====
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    other: [
      { rel: "android-chrome-192x192", url: "/android-chrome-192x192.png" },
      { rel: "android-chrome-512x512", url: "/android-chrome-512x512.png" },
    ],
  },

  manifest: "/site.webmanifest",

  // ===== Theme color (browser chrome) =====
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAFAF7" },
    { media: "(prefers-color-scheme: dark)", color: "#1A1A1A" },
  ],

  // ===== Open Graph (Twitter, Telegram, Discord previews) =====
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://roosta-mvp.vercel.app",
    siteName: "Roosta",
    title: "Roosta — On-chain Social Savings on Solana",
    description:
      "Pool USDC with people you trust. Automate rotating payouts. Build portable financial reputation on Solana.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Roosta logo",
      },
    ],
  },

  twitter: {
    card: "summary_large_image",
    title: "Roosta — On-chain Social Savings on Solana",
    description:
      "Pool USDC with people you trust. Automate rotating payouts on Solana.",
    images: ["/og-image.png"],
  },

  robots: {
    index: true,
    follow: true,
  },
};

/**
 * Example RootLayout — adapt to your existing structure.
 * Add the data-theme attribute on <html> if using class-based dark mode (shadcn standard).
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-body bg-bg-light dark:bg-bg-dark text-foreground">
        {children}
      </body>
    </html>
  );
}
