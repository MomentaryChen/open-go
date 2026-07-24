import { ImageResponse } from 'next/og'
import { getStoredTrip } from '@/lib/trip-server'

export const alt = '行程預覽'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Theme colors resolved from the oklch vars in globals.css — satori cannot
// read CSS variables or parse oklch(), so they are inlined as hex here.
const PRIMARY = '#0085a7'
const ACCENT = '#e37035'
const INK = '#09131a'
const MUTED = '#4e5a62'
const PAPER = '#fcf9f3'

/**
 * Google Fonts serves woff2 to modern clients, which satori cannot parse. An
 * ancient UA makes the API fall back to woff/ttf, both of which it reads.
 */
const LEGACY_UA = 'Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/40 Safari/537.36'

const DAY = 60 * 60 * 24

type LoadedFont = {
  name: string
  data: ArrayBuffer
  weight: 400 | 700
  style: 'normal'
}

/**
 * Fetch a Noto Sans TC subset containing only the glyphs this card needs.
 * `&text=` keeps it ~13 KB per weight instead of the multi-MB full CJK face,
 * and the per-text URL doubles as the cache key. Both weights come from one
 * request so there is a single point of network failure, not two.
 *
 * Returns an empty array when Google Fonts is unreachable; the caller then
 * renders the Latin-only card instead of failing the whole image request.
 */
async function loadNotoTC(text: string): Promise<LoadedFont[]> {
  const unique = [...new Set(text)].join('')
  const url =
    'https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;700' +
    `&text=${encodeURIComponent(unique)}`

  try {
    const css = await fetch(url, {
      headers: { 'User-Agent': LEGACY_UA },
      next: { revalidate: DAY },
    }).then((response) => response.text())

    const faces = css
      .split('@font-face')
      .slice(1)
      .map((block) => {
        const weight = Number(block.match(/font-weight:\s*(\d+)/)?.[1])
        // Whichever format Google picked for this glyph set, as long as it is
        // one satori understands.
        const source = [
          ...block.matchAll(/url\((https:[^)]+)\)\s*format\('([^']+)'\)/g),
        ].find(([, , format]) => format !== 'woff2')?.[1]
        return { weight, source }
      })
      .filter(
        (face): face is { weight: 400 | 700; source: string } =>
          !!face.source && (face.weight === 400 || face.weight === 700),
      )

    return await Promise.all(
      faces.map(async (face) => ({
        name: 'Noto Sans TC',
        data: await fetch(face.source, { next: { revalidate: DAY } }).then(
          (response) => response.arrayBuffer(),
        ),
        weight: face.weight,
        style: 'normal' as const,
      })),
    )
  } catch {
    return []
  }
}

/**
 * Latin-only last resort. satori throws when handed zero fonts, so the card
 * must always ship with at least one face even if the CJK subset failed.
 */
async function loadLatinFallback(): Promise<LoadedFont[]> {
  try {
    const css = await fetch(
      'https://fonts.googleapis.com/css2?family=Inter:wght@700&text=OpenGWXYZ',
      { headers: { 'User-Agent': LEGACY_UA }, next: { revalidate: DAY } },
    ).then((response) => response.text())

    const source = [
      ...css.matchAll(/url\((https:[^)]+)\)\s*format\('([^']+)'\)/g),
    ].find(([, , format]) => format !== 'woff2')?.[1]
    if (!source) return []

    return [
      {
        // Registered under the CJK family name on purpose: the layout below
        // asks for 'Noto Sans TC', and this face has to answer to it.
        name: 'Noto Sans TC',
        data: await fetch(source, { next: { revalidate: DAY } }).then(
          (response) => response.arrayBuffer(),
        ),
        weight: 700,
        style: 'normal',
      },
    ]
  } catch {
    return []
  }
}

function clamp(text: string, max: number) {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean
}

export default async function Image({
  params,
}: {
  params: Promise<{ jobId: string }>
}) {
  const { jobId } = await params
  const trip = await getStoredTrip(jobId)

  const title = trip ? clamp(trip.itinerary.title, 28) : 'OpenGo'
  const destination = trip?.itinerary.destination ?? ''
  const days = trip?.itinerary.durationDays ?? 0
  const summary = trip ? clamp(trip.itinerary.summary ?? '', 68) : ''
  const sources = trip?.itinerary.references.length ?? 0
  const badge = destination && days ? `${destination} · ${days} 天` : 'AI 行程規劃'
  const footer = sources > 0 ? `AI 讀取 ${sources} 個網路來源整理而成` : 'AI 行程規劃'

  const cjkFonts = await loadNotoTC(
    `${title}${badge}${summary}${footer}OPENGO AI Trip Planner`,
  )

  // Without the CJK subset every Chinese glyph would render as tofu, so drop
  // back to a clean wordmark-only card instead of shipping a broken one.
  const cjkReady = cjkFonts.length > 0
  const fonts = cjkReady ? cjkFonts : await loadLatinFallback()

  // satori cannot lay out anything without a font. If even the Latin fallback
  // is unreachable there is no image to draw, and a 404 lets the crawler fall
  // back to the site-level card rather than showing a broken one.
  if (fonts.length === 0) {
    return new Response('font unavailable', { status: 404 })
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: PAPER,
          backgroundImage: `linear-gradient(135deg, ${PRIMARY} 0%, ${PRIMARY} 55%, ${ACCENT} 100%)`,
          padding: 72,
          fontFamily: 'Noto Sans TC',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              borderRadius: 999,
              backgroundColor: 'rgba(255,255,255,0.22)',
              color: '#ffffff',
              padding: '10px 26px',
              fontSize: 30,
              fontWeight: 700,
              letterSpacing: 2,
            }}
          >
            {cjkReady ? badge : 'OpenGo'}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            borderRadius: 28,
            backgroundColor: PAPER,
            padding: 48,
          }}
        >
          <div
            style={{
              fontSize: 66,
              fontWeight: 700,
              color: INK,
              lineHeight: 1.2,
            }}
          >
            {cjkReady ? title : 'OpenGo'}
          </div>
          {cjkReady && summary ? (
            <div style={{ marginTop: 20, fontSize: 30, color: MUTED, lineHeight: 1.5 }}>
              {summary}
            </div>
          ) : (
            <div style={{ marginTop: 20, fontSize: 30, color: MUTED }}>
              AI Trip Planner
            </div>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            color: '#ffffff',
            fontSize: 26,
          }}
        >
          <div style={{ display: 'flex', fontWeight: 700, letterSpacing: 3 }}>OPENGO</div>
          <div style={{ display: 'flex' }}>{cjkReady ? footer : 'opengo'}</div>
        </div>
      </div>
    ),
    { ...size, fonts },
  )
}
