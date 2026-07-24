'use client'

import { useEffect, useRef } from 'react'
import { ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  trackAffiliateEvent,
  type AffiliateCategory,
  type AffiliateLink,
} from '@/lib/affiliate'

type AffiliateCtaProps = {
  link: AffiliateLink
  jobId: string
  day: number
  category: AffiliateCategory
  /** Stay area or attraction name for event debugging. */
  contextLabel?: string
  className?: string
}

/**
 * Outbound affiliate chip: fires cta_impression once when scrolled into view,
 * then cta_click + outbound_redirect on press.
 */
export function AffiliateCta({
  link,
  jobId,
  day,
  category,
  contextLabel,
  className,
}: AffiliateCtaProps) {
  const ref = useRef<HTMLAnchorElement>(null)
  const impressed = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el || impressed.current) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting) || impressed.current) {
          return
        }
        impressed.current = true
        trackAffiliateEvent('cta_impression', {
          jobId,
          day,
          category,
          partner: link.partner,
          label: contextLabel,
        })
        observer.disconnect()
      },
      { threshold: 0.5 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [jobId, day, category, link.partner, contextLabel])

  return (
    <a
      ref={ref}
      href={link.url}
      target="_blank"
      rel="noreferrer noopener sponsored"
      onClick={() => {
        const props = {
          jobId,
          day,
          category,
          partner: link.partner,
          label: contextLabel,
        }
        trackAffiliateEvent('cta_click', props)
        trackAffiliateEvent('outbound_redirect', props)
      }}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border bg-card px-2.5 py-1 text-xs font-medium transition-colors',
        className,
      )}
    >
      {link.label}
      <ExternalLink className="h-3 w-3" aria-hidden />
    </a>
  )
}
