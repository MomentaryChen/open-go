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

  // Trip.com's Traditional-Chinese site (tw.) carries the keyword search;
  // it resolves the location itself, so no lat/lng is needed.
  const tripParams = new URLSearchParams({ keyword: query })

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
): { primary: AffiliateLink[]; fallback: AffiliateLink[] } {
  const dest = destination.trim()
  const spot = (attractionName ?? '').trim()
  const primaryQuery =
    spot && dest && !spot.includes(dest) ? `${spot} ${dest}` : spot || dest
  const fallbackQuery = dest || spot

  const primary = spot
    ? [klookSearch(primaryQuery), kkdaySearch(primaryQuery)]
    : []

  const fallback = fallbackQuery
    ? [klookSearch(fallbackQuery), kkdaySearch(fallbackQuery)]
    : []

  return { primary, fallback }
}

function klookSearch(query: string): AffiliateLink {
  return {
    partner: 'klook',
    label: 'Klook',
    url: `https://www.klook.com/zh-TW/search/?query=${encodeURIComponent(query)}`,
  }
}

function kkdaySearch(query: string): AffiliateLink {
  return {
    partner: 'kkday',
    label: 'KKday',
    url: `https://www.kkday.com/zh-tw/product/productlist?keyword=${encodeURIComponent(query)}`,
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
