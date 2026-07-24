import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { ThemeProvider } from '@/components/theme-provider'
import { siteUrl } from '@/lib/server-api'
import './globals.css'

// `variable` rather than `className`: next/font mangles the family name at
// build time, so the theme tokens in globals.css have to reference the
// generated CSS variable instead of a literal "Geist".
const geistSans = Geist({ subsets: ['latin'], variable: '--font-geist-sans' })
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' })

const DESCRIPTION =
  '輸入關鍵字，AI 讀遍網路遊記，為你排出逐日可執行的旅程，每個行程都附上資料來源。'

export const metadata: Metadata = {
  // Open Graph needs absolute URLs; without this the per-trip metadata's
  // relative `url` silently resolves against localhost in production.
  metadataBase: new URL(siteUrl()),
  title: 'OpenGo ｜ AI 行程規劃',
  description: DESCRIPTION,
  openGraph: {
    type: 'website',
    siteName: 'OpenGo',
    locale: 'zh_TW',
    title: 'OpenGo ｜ AI 行程規劃',
    description: DESCRIPTION,
  },
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    // next-themes writes the theme class onto <html> before paint, which the
    // server render cannot know about — suppressHydrationWarning covers that
    // one intentional mismatch.
    <html lang="zh-TW" className="bg-background" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
