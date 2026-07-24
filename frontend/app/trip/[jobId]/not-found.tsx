import Link from 'next/link'
import { MapPinOff } from 'lucide-react'
import { getServerDictionary } from '@/lib/i18n/server'

export default async function TripNotFound() {
  const t = await getServerDictionary()
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <MapPinOff className="mx-auto h-10 w-10 text-muted-foreground/50" />
        <h1 className="mt-4 text-xl font-semibold text-foreground">
          {t.notFound.heading}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {t.notFound.body}
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-transform active:scale-95"
        >
          {t.notFound.cta}
        </Link>
      </div>
    </main>
  )
}
