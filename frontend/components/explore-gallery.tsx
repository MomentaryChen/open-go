'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { CalendarDays, FileText, MapPin } from 'lucide-react'
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
}

const ALL = '__all__'

type Region = { key: string; label: string; count: number }

/**
 * Browse every finished itinerary, grouped by region (the trip's destination).
 * A tab row filters the card grid; "全部" shows everything. Regions are ordered
 * by how many trips they hold, so the busiest destinations lead.
 */
export function ExploreGallery({ trips }: { trips: GalleryTrip[] }) {
  const [active, setActive] = useState<string>(ALL)

  const regions = useMemo<Region[]>(() => {
    const counts = new Map<string, number>()
    for (const trip of trips) {
      counts.set(trip.destination, (counts.get(trip.destination) ?? 0) + 1)
    }
    return [...counts.entries()]
      .map(([key, count]) => ({ key, label: key, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
  }, [trips])

  const visible = useMemo(
    () => (active === ALL ? trips : trips.filter((t) => t.destination === active)),
    [trips, active],
  )

  if (trips.length === 0) {
    return (
      <div className="mt-16 rounded-2xl border border-dashed border-border bg-card/50 px-6 py-16 text-center">
        <MapPin className="mx-auto h-8 w-8 text-muted-foreground/60" aria-hidden />
        <p className="mt-4 text-muted-foreground">還沒有任何已完成的行程。</p>
        <Link
          href="/"
          className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
        >
          去規劃第一個行程 →
        </Link>
      </div>
    )
  }

  return (
    <div className="mt-8">
      {/* Region filter tabs */}
      <div
        className="flex flex-wrap gap-2"
        role="tablist"
        aria-label="依區域篩選"
      >
        <TabButton
          label="全部"
          count={trips.length}
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
          ? `共 ${trips.length} 個行程 · ${regions.length} 個地區`
          : `${active} · ${visible.length} 個行程`}
      </p>

      <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((trip) => (
          <li key={trip.jobId}>
            <TripCard trip={trip} />
          </li>
        ))}
      </ul>
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
  return (
    <Link
      href={`/trip/${trip.jobId}`}
      className="group flex h-full flex-col rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
          <MapPin className="h-3 w-3" aria-hidden />
          {trip.destination}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {timeAgo(trip.createdAt)}
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
          {trip.durationDays} 天
        </span>
        <span className="inline-flex items-center gap-1">
          <FileText className="h-3.5 w-3.5" aria-hidden />
          {trip.sourceCount} 篇來源
        </span>
      </div>
    </Link>
  )
}
