import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { ThemeProvider } from '@/components/theme-provider'
import { LanguageProvider } from '@/lib/i18n/context'
import { getDictionary } from '@/lib/i18n'
import { getServerLocale } from '@/lib/i18n/server'
import { siteUrl } from '@/lib/server-api'
import './globals.css'

// `variable` rather than `className`: next/font mangles the family name at
// build time, so the theme tokens in globals.css have to reference the
// generated CSS variable instead of a literal "Geist".
const geistSans = Geist({ subsets: ['latin'], variable: '--font-geist-sans' })
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' })

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale()
  const t = getDictionary(locale)
  return {
    // Open Graph needs absolute URLs; without this the per-trip metadata's
    // relative `url` silently resolves against localhost in production.
    metadataBase: new URL(siteUrl()),
    title: t.meta.homeTitle,
    description: t.meta.description,
    openGraph: {
      type: 'website',
      siteName: 'OpenGo',
      locale: locale === 'en' ? 'en_US' : 'zh_TW',
      title: t.meta.homeTitle,
      description: t.meta.description,
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
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const locale = await getServerLocale()

  return (
    // next-themes writes the theme class onto <html> before paint, which the
    // server render cannot know about — suppressHydrationWarning covers that
    // one intentional mismatch.
    <html
      lang={locale === 'en' ? 'en' : 'zh-TW'}
      className="bg-background"
      suppressHydrationWarning
    >
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}
      >
        <LanguageProvider initialLocale={locale}>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            {children}
          </ThemeProvider>
        </LanguageProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
