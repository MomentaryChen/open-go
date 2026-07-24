'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { CalendarDays, FileText, MapPin, Pin, Search, Star, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { fmt } from '@/lib/i18n'
import { useLanguage } from '@/lib/i18n/context'
import { timeAgo } from '@/lib/trip-history'

export type GalleryTrip = {
  jobId: string
  keyword: string
  /** ISO timestamp (serialized from the backend). */
  createdAt: string
  /** The itinerary destination — used as the region grouping key. */
  destination: string
  title: string
  durationDays: number
  dayCount: number
  summary: string
  sourceCount: number
  /** Curation: pinned trips lead the gallery. */
  pinned: boolean
  /** Curation: featured trips rank above regular ones. */
  featured: boolean
}

const ALL = '__all__'

type Region = { key: string; label: string; count: number }

function matchesQuery(trip: GalleryTrip, query: string): boolean {
  if (!query) return true
  const haystack = [trip.keyword, trip.title, trip.destination, trip.summary]
    .join('\n')
    .toLowerCase()
  return haystack.includes(query)
}

/**
 * Browse every finished itinerary, grouped by region (the trip's destination).
 * A keyword search narrows the card grid first; region tabs then filter within
 * those matches. "全部" shows every match. Regions are ordered by how many
 * matching trips they hold, so the busiest destinations lead.
 */
export function ExploreGallery({ trips }: { trips: GalleryTrip[] }) {
  const { t } = useLanguage()
  const [active, setActive] = useState<string>(ALL)
  const [query, setQuery] = useState('')

  const normalizedQuery = query.trim().toLowerCase()

  const matched = useMemo(
    () => trips.filter((trip) => matchesQuery(trip, normalizedQuery)),
    [trips, normalizedQuery],
  )

  const regions = useMemo<Region[]>(() => {
    const counts = new Map<string, number>()
    for (const trip of matched) {
      counts.set(trip.destination, (counts.get(trip.destination) ?? 0) + 1)
    }
    return [...counts.entries()]
      .map(([key, count]) => ({ key, label: key, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
  }, [matched])

  // Drop a region tab selection that no longer has matches after the query changes.
  useEffect(() => {
    if (active !== ALL && !regions.some((region) => region.key === active)) {
      setActive(ALL)
    }
  }, [active, regions])

  const visible = useMemo(
    () => (active === ALL ? matched : matched.filter((item) => item.destination === active)),
    [matched, active],
  )

  if (trips.length === 0) {
    return (
      <div className="mt-16 rounded-2xl border border-dashed border-border bg-card/50 px-6 py-16 text-center">
        <MapPin className="mx-auto h-8 w-8 text-muted-foreground/60" aria-hidden />
        <p className="mt-4 text-muted-foreground">{t.explore.empty}</p>
        <Link
          href="/"
          className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
        >
          {t.explore.emptyCta}
        </Link>
      </div>
    )
  }

  return (
    <div className="mt-8">
      <div className="relative max-w-md">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t.explore.searchPlaceholder}
          aria-label={t.explore.searchAria}
          className="pr-9 pl-9"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="absolute top-1/2 right-2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label={t.explore.clearSearch}
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        ) : null}
      </div>

      {/* Region filter tabs */}
      <div
        className="mt-4 flex flex-wrap gap-2"
        role="tablist"
        aria-label={t.explore.filterByRegion}
      >
        <TabButton
          label={t.explore.all}
          count={matched.length}
          active={active === ALL}
          onClick={() => setActive(ALL)}
        />
        {regions.map((region) => (
          <TabButton
            key={region.key}
            label={region.label}
            count={region.count}
            active={active === region.key}
            onClick={() => setActive(region.key)}
          />
        ))}
      </div>

      <p className="mt-4 text-sm text-muted-foreground">
        {active === ALL
          ? fmt(t.explore.countLine, { trips: matched.length, regions: regions.length })
          : fmt(t.explore.countActive, { active, count: visible.length })}
      </p>

      {visible.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-border bg-card/50 px-6 py-12 text-center">
          <Search className="mx-auto h-8 w-8 text-muted-foreground/60" aria-hidden />
          <p className="mt-4 text-muted-foreground">
            {fmt(t.explore.noResults, { query: query.trim() })}
          </p>
          <button
            type="button"
            onClick={() => {
              setQuery('')
              setActive(ALL)
            }}
            className="mt-4 text-sm font-medium text-primary hover:underline"
          >
            {t.explore.clearSearch}
          </button>
        </div>
      ) : (
        <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((trip) => (
            <li key={trip.jobId}>
              <TripCard trip={trip} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function TabButton({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={
        'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ' +
        (active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-card text-foreground hover:border-primary/40')
      }
    >
      {label}
      <span
        className={
          'rounded-full px-1.5 text-xs ' +
          (active ? 'bg-primary-foreground/20' : 'bg-secondary text-muted-foreground')
        }
      >
        {count}
      </span>
    </button>
  )
}

function TripCard({ trip }: { trip: GalleryTrip }) {
  const { t, locale } = useLanguage()
  return (
    <Link
      href={`/trip/${trip.jobId}`}
      className="group flex h-full flex-col rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
            <MapPin className="h-3 w-3" aria-hidden />
            {trip.destination}
          </span>
          {trip.pinned && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-1 text-xs font-medium text-amber-700 dark:text-amber-300">
              <Pin className="h-3 w-3" aria-hidden />
              {t.explore.pinnedBadge}
            </span>
          )}
          {trip.featured && !trip.pinned && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-1 text-xs font-medium text-amber-700 dark:text-amber-300">
              <Star className="h-3 w-3" aria-hidden />
              {t.explore.featuredBadge}
            </span>
          )}
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">
          {timeAgo(trip.createdAt, locale)}
        </span>
      </div>

      <h3 className="mt-3 line-clamp-2 font-semibold text-foreground group-hover:text-primary">
        {trip.title}
      </h3>

      {trip.summary && (
        <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
          {trip.summary}
        </p>
      )}

      <div className="mt-auto flex items-center gap-4 pt-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <CalendarDays className="h-3.5 w-3.5" aria-hidden />
          {fmt(t.explore.days, { n: trip.durationDays })}
        </span>
        <span className="inline-flex items-center gap-1">
          <FileText className="h-3.5 w-3.5" aria-hidden />
          {fmt(t.explore.sources, { n: trip.sourceCount })}
        </span>
      </div>
    </Link>
  )
}
