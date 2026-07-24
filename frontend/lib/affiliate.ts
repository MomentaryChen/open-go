import { useEffect, useState } from 'react'
import { track } from '@vercel/analytics'
import { apiBaseUrl } from '@/lib/trip'

/** Partners we deep-link to for lodging / tickets (affiliate-ready). */
export type AffiliatePartner =
  | 'booking'
  | 'trip'
  | 'google_hotels'
  | 'klook'
  | 'kkday'

export type AffiliateCategory = 'lodging' | 'ticket'

/**
 * Affiliate ids injected into outbound partner URLs, configured from the admin
 * console. The query-parameter each maps to is decided here (the backend only
 * stores the values). Blank = not configured → that param is omitted.
 */
export type AffiliateConfig = {
  booking: { aid: string }
  trip: { allianceid: string; sid: string }
  klook: { aid: string }
  kkday: { cid: string }
}

let configCache: AffiliateConfig | null = null
let configPromise: Promise<AffiliateConfig | null> | null = null

/** Fetch the public affiliate ids once and memoize; never throws. */
export function fetchAffiliateConfig(): Promise<AffiliateConfig | null> {
  if (configCache) return Promise.resolve(configCache)
  if (!configPromise) {
    configPromise = fetch(`${apiBaseUrl()}/affiliate/config`)
      .then((res) => (res.ok ? (res.json() as Promise<AffiliateConfig>) : null))
      .then((cfg) => {
        if (cfg) configCache = cfg
        return cfg
      })
      .catch(() => null)
  }
  return configPromise
}

/**
 * Affiliate ids for the itinerary link builders. Starts null so the first
 * client render matches the server (no hydration mismatch), then fills in after
 * the fetch — the CTA hrefs gain their ids before the user can click.
 */
export function useAffiliateConfig(): AffiliateConfig | null {
  const [config, setConfig] = useState<AffiliateConfig | null>(null)
  useEffect(() => {
    let active = true
    void fetchAffiliateConfig().then((cfg) => {
      if (active && cfg) setConfig(cfg)
    })
    return () => {
      active = false
    }
  }, [])
  return config
}

export type AffiliateLink = {
  partner: AffiliatePartner
  label: string
  url: string
}

export type AffiliateEventName =
  | 'cta_impression'
  | 'cta_click'
  | 'outbound_redirect'

export type AffiliateEventProps = {
  jobId: string
  day: number
  category: AffiliateCategory
  partner: AffiliatePartner
  /** Attraction name or stay area — helps debug which CTA converted. */
  label?: string
}

const LODGING_RADIUS_KM = 3

/**
 * Booking sites match a location against an autocomplete index, so a descriptive
 * area like「信義區（台北101周邊）」fails to resolve and the field is left blank.
 * Strip the parenthetical gloss and vague suffixes down to the place name.
 */
function cleanLocation(area: string): string {
  return area
    .replace(/[（(][^）)]*[）)]/g, ' ')
    .replace(/(周邊|周圍|附近|一帶|交界)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Deep links to hotel-booking sites for a night's stay area.
 * When coordinates exist, Booking gets a radius search so a vague area like
 * 「車站周邊」still lands near the planned pin. Itineraries have no calendar
 * dates, so the user picks check-in / check-out on the partner site.
 *
 * Agoda is deliberately not here: its /search endpoint drops any free-text
 * query and bounces to the homepage (it needs a resolved city/property id),
 * so there is no working text deep link. Trip.com's keyword search does carry
 * the query, and Google 飯店 aggregates Agoda/Trip/Hotels prices anyway.
 */
export function lodgingSearchLinks(
  destination: string,
  area: string,
  coords?: { latitude: number; longitude: number } | null,
  config?: AffiliateConfig | null,
): AffiliateLink[] {
  const dest = destination.trim()
  const spot = cleanLocation(area)
  const query = (!dest || spot.includes(dest) ? spot : `${dest} ${spot}`).trim()
  const q = encodeURIComponent(query)
  const lat =
    typeof coords?.latitude === 'number' ? coords.latitude : null
  const lng =
    typeof coords?.longitude === 'number' ? coords.longitude : null
  const hasGeo = lat !== null && lng !== null

  const bookingParams = new URLSearchParams({ ss: query, lang: 'zh-tw' })
  if (hasGeo) {
    bookingParams.set('latitude', String(lat))
    bookingParams.set('longitude', String(lng))
    bookingParams.set('radius', String(LODGING_RADIUS_KM))
  }
  if (config?.booking.aid) bookingParams.set('aid', config.booking.aid)

  // Trip.com's Traditional-Chinese site (tw.) carries the keyword search;
  // it resolves the location itself, so no lat/lng is needed.
  const tripParams = new URLSearchParams({ keyword: query })
  if (config?.trip.allianceid) tripParams.set('Allianceid', config.trip.allianceid)
  if (config?.trip.sid) tripParams.set('SID', config.trip.sid)

  return [
    {
      partner: 'booking',
      label: 'Booking.com',
      url: `https://www.booking.com/searchresults.zh-tw.html?${bookingParams}`,
    },
    {
      partner: 'trip',
      label: 'Trip.com',
      url: `https://tw.trip.com/hotels/list?${tripParams}`,
    },
    {
      partner: 'google_hotels',
      label: 'Google 飯店',
      url: `https://www.google.com/travel/search?q=${q}&hl=zh-TW`,
    },
  ]
}

/**
 * Ticket / activity deep links. Primary links search the attraction name
 * (plus destination for disambiguation). Fallback links drop the attraction
 * and browse destination hot tickets when the specific name is unlikely to
 * match a bookable product.
 */
export function ticketSearchLinks(
  destination: string,
  attractionName?: string | null,
  config?: AffiliateConfig | null,
): { primary: AffiliateLink[]; fallback: AffiliateLink[] } {
  const dest = destination.trim()
  const spot = (attractionName ?? '').trim()
  const primaryQuery =
    spot && dest && !spot.includes(dest) ? `${spot} ${dest}` : spot || dest
  const fallbackQuery = dest || spot

  const primary = spot
    ? [klookSearch(primaryQuery, config), kkdaySearch(primaryQuery, config)]
    : []

  const fallback = fallbackQuery
    ? [klookSearch(fallbackQuery, config), kkdaySearch(fallbackQuery, config)]
    : []

  return { primary, fallback }
}

function klookSearch(query: string, config?: AffiliateConfig | null): AffiliateLink {
  const params = new URLSearchParams({ query })
  if (config?.klook.aid) params.set('aid', config.klook.aid)
  return {
    partner: 'klook',
    label: 'Klook',
    url: `https://www.klook.com/zh-TW/search/?${params}`,
  }
}

function kkdaySearch(query: string, config?: AffiliateConfig | null): AffiliateLink {
  const params = new URLSearchParams({ keyword: query })
  if (config?.kkday.cid) params.set('cid', config.kkday.cid)
  return {
    partner: 'kkday',
    label: 'KKday',
    url: `https://www.kkday.com/zh-tw/product/productlist?${params}`,
  }
}

/** Whether this itinerary stop should show ticket CTAs. */
export function shouldShowTicketCta(item: {
  category: string
  latitude?: number | null
  longitude?: number | null
}): boolean {
  if (item.category === 'attraction') return true
  // Located "other" stops are often paid sights the LLM did not tag cleanly
  // (observation decks, museums). Skip food / shopping / transport / hotel.
  const hasCoords =
    typeof item.latitude === 'number' && typeof item.longitude === 'number'
  return hasCoords && item.category === 'other'
}

/**
 * Phase 0 funnel events → Vercel Analytics + first-party DB ingest.
 * In development the Analytics script is usually absent, so we also mirror to
 * the console so local clicks are still verifiable.
 */
export function trackAffiliateEvent(
  name: AffiliateEventName,
  props: AffiliateEventProps,
): void {
  const payload = {
    event: name,
    jobId: props.jobId || undefined,
    day: props.day,
    category: props.category,
    partner: props.partner,
    ...(props.label ? { label: props.label.slice(0, 80) } : {}),
  }
  try {
    track(name, {
      jobId: props.jobId || 'unknown',
      day: props.day,
      category: props.category,
      partner: props.partner,
      ...(props.label ? { label: props.label.slice(0, 80) } : {}),
    })
  } catch {
    // Analytics must never break the CTA.
  }
  if (process.env.NODE_ENV !== 'production') {
    console.debug('[affiliate]', name, payload)
  }
  void persistAffiliateEvent(payload)
}

function persistAffiliateEvent(payload: {
  event: AffiliateEventName
  jobId?: string
  day: number
  category: AffiliateCategory
  partner: AffiliatePartner
  label?: string
}): void {
  try {
    const body = JSON.stringify(payload)
    const url = `${apiBaseUrl()}/affiliate/events`
    // keepalive survives the tab switch when the user opens the partner site.
    void fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {
      // Funnel persistence is best-effort.
    })
  } catch {
    // Ignore.
  }
}
