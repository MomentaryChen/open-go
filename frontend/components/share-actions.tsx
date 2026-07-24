'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Check, MessageCircle, Share2, Sparkles } from 'lucide-react'
import { track } from '@vercel/analytics'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/lib/i18n/context'
import { copyText } from '@/lib/clipboard'

type ShareMethod = 'native' | 'line' | 'copy'

/**
 * The URL we hand out when sharing. UTM params let the analytics side split
 * "arrived via a shared link" traffic by channel, which is the denominator of
 * the share-loop conversion rate.
 */
function sharedUrl(method: ShareMethod, path?: string): string {
  const url = path
    ? new URL(path, window.location.origin)
    : new URL(window.location.href)
  url.searchParams.set('utm_source', 'share')
  url.searchParams.set('utm_medium', method)
  return url.toString()
}

function trackShare(method: ShareMethod, jobId: string) {
  try {
    track('share_click', { method, jobId })
  } catch {
    // Analytics must never break sharing.
  }
  if (process.env.NODE_ENV !== 'production') {
    console.debug('[share]', method, jobId)
  }
}

/**
 * Share controls for the itinerary page: LINE (where zh-TW trip planning
 * actually happens), the OS share sheet on devices that have one, and
 * copy-link as the universal fallback.
 */
export function ShareActions({
  jobId,
  title,
  path,
}: {
  jobId: string
  title: string
  /**
   * Permalink to share instead of the current address — used where the
   * itinerary renders somewhere other than its own /trip/[jobId] page.
   */
  path?: string
}) {
  const { t } = useLanguage()
  const [copied, setCopied] = useState(false)
  // Resolved in an effect so the server render (no `navigator`) matches the
  // first client render and hydration stays clean.
  const [canNativeShare, setCanNativeShare] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setCanNativeShare(typeof navigator !== 'undefined' && 'share' in navigator)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const shareNative = useCallback(async () => {
    trackShare('native', jobId)
    try {
      await navigator.share({ title, url: sharedUrl('native', path) })
    } catch {
      // User dismissed the sheet — not an error.
    }
  }, [jobId, title, path])

  const shareLine = useCallback(() => {
    trackShare('line', jobId)
    const target =
      'https://social-plugins.line.me/lineit/share?url=' +
      encodeURIComponent(sharedUrl('line', path))
    window.open(target, '_blank', 'noopener,noreferrer')
  }, [jobId, path])

  const copy = useCallback(async () => {
    trackShare('copy', jobId)
    await copyText(sharedUrl('copy', path))
    setCopied(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setCopied(false), 2000)
  }, [jobId, path])

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        size="sm"
        onClick={shareLine}
        className="bg-[#06C755] text-white hover:bg-[#05b34c]"
      >
        <MessageCircle className="mr-1.5 h-4 w-4" />
        {t.share.line}
      </Button>
      {canNativeShare && (
        <Button type="button" variant="outline" size="sm" onClick={() => void shareNative()}>
          <Share2 className="mr-1.5 h-4 w-4" />
          {t.share.more}
        </Button>
      )}
      <Button type="button" variant="outline" size="sm" onClick={() => void copy()}>
        {copied ? (
          <>
            <Check className="mr-1.5 h-4 w-4" />
            {t.share.copied}
          </>
        ) : (
          <>
            <Share2 className="mr-1.5 h-4 w-4" />
            {t.share.copy}
          </>
        )}
      </Button>
    </div>
  )
}

/**
 * End-of-page conversion block: someone who scrolled through a whole shared
 * itinerary is the warmest visitor we get, so ask for the plan-your-own step
 * right there and offer sharing once more.
 */
export function ShareCta({ jobId, title }: { jobId: string; title: string }) {
  const { t } = useLanguage()
  const onPlanClick = useCallback(() => {
    try {
      track('share_cta_click', { jobId })
    } catch {
      // Best-effort only.
    }
  }, [jobId])

  return (
    <section className="mt-12 rounded-2xl border border-primary/20 bg-card/70 p-8 text-center shadow-sm">
      <h2 className="text-xl font-semibold">{t.share.ctaHeading}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        {t.share.ctaBody}
      </p>
      <div className="mt-5 flex flex-col items-center gap-4">
        <Link
          href="/?ref=trip-share"
          onClick={onPlanClick}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
        >
          <Sparkles className="h-4 w-4" />
          {t.share.ctaButton}
        </Link>
        <div className="flex flex-col items-center gap-2">
          <span className="text-xs text-muted-foreground">{t.share.ctaFooter}</span>
          <ShareActions jobId={jobId} title={title} />
        </div>
      </div>
    </section>
  )
}
