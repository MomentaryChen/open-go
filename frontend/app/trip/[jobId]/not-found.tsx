import Link from 'next/link'
import { MapPinOff } from 'lucide-react'

export default function TripNotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <MapPinOff className="mx-auto h-10 w-10 text-muted-foreground/50" />
        <h1 className="mt-4 text-xl font-semibold text-foreground">
          找不到這個行程
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          連結可能已經失效，或這份行程還在產生中。
          你可以用同樣的關鍵字重新規劃一次。
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-transform active:scale-95"
        >
          開始規劃行程
        </Link>
      </div>
    </main>
  )
}
