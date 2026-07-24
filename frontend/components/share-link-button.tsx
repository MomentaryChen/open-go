'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Share2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { copyText } from '@/lib/clipboard'

/** Copies the page's own URL — used on the shareable itinerary page. */
export function ShareLinkButton() {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    [],
  )

  const copy = useCallback(async () => {
    await copyText(window.location.href)
    setCopied(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setCopied(false), 2000)
  }, [])

  return (
    <Button type="button" variant="outline" size="sm" onClick={() => void copy()}>
      {copied ? (
        <>
          <Check className="mr-1.5 h-4 w-4" />
          已複製連結
        </>
      ) : (
        <>
          <Share2 className="mr-1.5 h-4 w-4" />
          分享行程
        </>
      )}
    </Button>
  )
}
