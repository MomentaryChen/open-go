'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import { useTheme } from 'next-themes'
import {
  CircleMarker,
  MapContainer,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from 'react-leaflet'
import type { LatLngBoundsExpression } from 'leaflet'
import { MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'
import { distanceKm, formatDistance, type Itinerary } from '@/lib/trip'

/** One color per day; wraps around for trips longer than the palette. */
const DAY_COLORS = [
  '#0ea5e9',
  '#f97316',
  '#8b5cf6',
  '#10b981',
  '#ef4444',
  '#eab308',
  '#ec4899',
  '#14b8a6',
]

type Stop = {
  day: number
  order: number
  time: string
  name: string
  latitude: number
  longitude: number
}

type StayPoint = {
  day: number
  area: string
  latitude: number
  longitude: number
}

function FitToBounds({ bounds }: { bounds: LatLngBoundsExpression }) {
  const map = useMap()
  // An effect, not a memo: this mutates the map instance, and React is free to
  // drop or replay a memo. Keyed on `bounds` identity so the view is only
  // reframed when what should be visible actually changes — a re-render from
  // anything else leaves the user's pan and zoom alone.
  useEffect(() => {
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 })
  }, [bounds, map])
  return null
}

/**
 * Rough route overview: numbered stops colored per day, connected in visit
 * order. Coordinates are the LLM's approximate knowledge — good enough to
 * judge distances and day layout, not for turn-by-turn navigation.
 */
export function ItineraryMap({ itinerary }: { itinerary: Itinerary }) {
  // Days a user has toggled off in the legend.
  const [hiddenDays, setHiddenDays] = useState<Set<number>>(new Set())
  const { resolvedTheme } = useTheme()
  const darkTiles = resolvedTheme === 'dark'

  const stopsByDay = useMemo(() => {
    const byDay = new Map<number, Stop[]>()
    for (const day of itinerary.days) {
      let order = 0
      for (const item of day.items) {
        if (typeof item.latitude !== 'number' || typeof item.longitude !== 'number') {
          continue
        }
        order += 1
        const list = byDay.get(day.day) ?? []
        list.push({
          day: day.day,
          order,
          time: item.time,
          name: item.name,
          latitude: item.latitude,
          longitude: item.longitude,
        })
        byDay.set(day.day, list)
      }
    }
    return byDay
  }, [itinerary])

  const stayByDay = useMemo(() => {
    const byDay = new Map<number, StayPoint>()
    for (const day of itinerary.days) {
      const stay = day.stay
      if (
        stay &&
        typeof stay.latitude === 'number' &&
        typeof stay.longitude === 'number'
      ) {
        byDay.set(day.day, {
          day: day.day,
          area: stay.area,
          latitude: stay.latitude,
          longitude: stay.longitude,
        })
      }
    }
    return byDay
  }, [itinerary])

  const allStops = useMemo(
    () => [
      ...[...stopsByDay.values()].flat(),
      ...[...stayByDay.values()].map((stay) => ({
        latitude: stay.latitude,
        longitude: stay.longitude,
      })),
    ],
    [stopsByDay, stayByDay],
  )

  // Overnight transitions: last point of day N (its stay when located,
  // otherwise its last stop) to the first stop of day N+1.
  const transitions = useMemo(() => {
    const dayNumbers = [...stopsByDay.keys()].sort((a, b) => a - b)
    const lines: Array<{ from: [number, number]; to: [number, number]; days: [number, number] }> = []
    for (let i = 0; i < dayNumbers.length - 1; i++) {
      const current = dayNumbers[i]
      const next = dayNumbers[i + 1]
      const stay = stayByDay.get(current)
      const stops = stopsByDay.get(current)
      const end = stay ?? stops?.[stops.length - 1]
      const start = stopsByDay.get(next)?.[0]
      if (!end || !start) continue
      lines.push({
        from: [end.latitude, end.longitude],
        to: [start.latitude, start.longitude],
        days: [current, next],
      })
    }
    return lines
  }, [stopsByDay, stayByDay])

  // Only the days still switched on in the legend, so toggling one reframes
  // the map onto what is left instead of snapping back to the whole trip.
  const visiblePoints = useMemo(() => {
    const fromStops = [...stopsByDay.entries()]
      .filter(([day]) => !hiddenDays.has(day))
      .flatMap(([, stops]) => stops)
    const fromStays = [...stayByDay.entries()]
      .filter(([day]) => !hiddenDays.has(day))
      .map(([, stay]) => stay)
    return [...fromStops, ...fromStays]
  }, [stopsByDay, stayByDay, hiddenDays])

  const bounds = useMemo<LatLngBoundsExpression | null>(() => {
    // Every day hidden: keep framing the whole trip rather than nothing.
    const points = visiblePoints.length > 0 ? visiblePoints : allStops
    if (points.length === 0) return null

    const lats = points.map((point) => point.latitude)
    const lngs = points.map((point) => point.longitude)
    const latPadding = Math.max((Math.max(...lats) - Math.min(...lats)) * 0.15, 0.01)
    const lngPadding = Math.max((Math.max(...lngs) - Math.min(...lngs)) * 0.15, 0.01)
    return [
      [Math.min(...lats) - latPadding, Math.min(...lngs) - lngPadding],
      [Math.max(...lats) + latPadding, Math.max(...lngs) + lngPadding],
    ]
  }, [visiblePoints, allStops])

  if (allStops.length === 0 || !bounds) {
    return (
      <div className="flex h-72 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-secondary/30 text-center">
        <MapPin className="h-8 w-8 text-muted-foreground/50" />
        <p className="text-sm font-medium text-foreground">此行程尚未包含座標資料</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          這是地圖功能上線前產生的結果；按「重新產生」重新查詢後即可顯示路線地圖
        </p>
      </div>
    )
  }

  const colorOf = (day: number) => DAY_COLORS[(day - 1) % DAY_COLORS.length]

  const toggleDay = (day: number) => {
    setHiddenDays((current) => {
      const next = new Set(current)
      if (next.has(day)) next.delete(day)
      else next.add(day)
      return next
    })
  }

  return (
    <div className="space-y-3">
      {/* Legend: one chip per day, click to show/hide that day's route */}
      <div className="flex flex-wrap gap-2">
        {[...stopsByDay.keys()].map((day) => (
          <button
            key={day}
            type="button"
            onClick={() => toggleDay(day)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-medium transition-opacity',
              hiddenDays.has(day) ? 'opacity-35' : 'bg-card shadow-sm',
            )}
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: colorOf(day) }}
            />
            Day {day}
            <span className="text-muted-foreground">
              {stopsByDay.get(day)?.length} 站
            </span>
          </button>
        ))}
      </div>

      <div className="relative h-[28rem] w-full overflow-hidden rounded-xl border border-border shadow-lg">
        <MapContainer bounds={bounds} scrollWheelZoom className="h-full w-full">
          {/* Keyed so switching theme swaps the basemap instead of leaving a
              blinding white grid behind the dark UI. */}
          <TileLayer
            key={darkTiles ? 'dark' : 'light'}
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url={`https://{s}.basemaps.cartocdn.com/${darkTiles ? 'dark_all' : 'light_all'}/{z}/{x}/{y}{r}.png`}
          />
          <FitToBounds bounds={bounds} />

          {/* Grey overnight connectors: where you sleep → next morning's start */}
          {transitions
            .filter(({ days }) => !hiddenDays.has(days[0]) && !hiddenDays.has(days[1]))
            .map(({ from, to, days }) => (
              <Polyline
                key={`t-${days[0]}-${days[1]}`}
                positions={[from, to]}
                pathOptions={{ color: '#94a3b8', weight: 2, opacity: 0.6, dashArray: '2 7' }}
              >
                <Tooltip sticky>
                  D{days[0]} 住宿 → D{days[1]} 出發：
                  {formatDistance(
                    distanceKm(
                      { latitude: from[0], longitude: from[1] },
                      { latitude: to[0], longitude: to[1] },
                    ),
                  )}
                </Tooltip>
              </Polyline>
            ))}

          {[...stopsByDay.entries()]
            .filter(([day]) => !hiddenDays.has(day))
            .map(([day, stops]) => {
              const stay = stayByDay.get(day)
              // The day's route ends at that night's stay when it is located.
              const routePoints: [number, number][] = [
                ...stops.map((stop): [number, number] => [stop.latitude, stop.longitude]),
                ...(stay ? [[stay.latitude, stay.longitude] as [number, number]] : []),
              ]
              return (
              <Fragment key={day}>
                {routePoints.length > 1 && (
                  <Polyline
                    positions={routePoints}
                    pathOptions={{
                      color: colorOf(day),
                      weight: 3,
                      opacity: 0.75,
                      dashArray: '6 8',
                    }}
                  />
                )}
                {stay && (
                  <CircleMarker
                    center={[stay.latitude, stay.longitude]}
                    radius={12}
                    pathOptions={{
                      color: colorOf(day),
                      weight: 3,
                      fillColor: '#ffffff',
                      fillOpacity: 1,
                    }}
                  >
                    <Tooltip
                      permanent
                      direction="center"
                      offset={[0, 0]}
                      opacity={1}
                      className="map-index-tooltip"
                    >
                      🏨
                    </Tooltip>
                    <Popup>
                      <span className="text-sm font-medium">D{stay.day} 住宿區域</span>
                      <br />
                      {stay.area}
                    </Popup>
                  </CircleMarker>
                )}
                {stops.map((stop) => (
                  <CircleMarker
                    key={`${day}-${stop.order}`}
                    center={[stop.latitude, stop.longitude]}
                    radius={11}
                    pathOptions={{
                      color: '#ffffff',
                      weight: 2,
                      fillColor: colorOf(day),
                      fillOpacity: 0.95,
                    }}
                  >
                    {/* One Tooltip only — Leaflet allows a single bound tooltip
                        per layer; details go in a click Popup instead. */}
                    <Tooltip
                      permanent
                      direction="center"
                      offset={[0, 0]}
                      opacity={1}
                      className="map-index-tooltip"
                    >
                      {stop.order}
                    </Tooltip>
                    <Popup>
                      <span className="text-sm font-medium">
                        D{stop.day} · {stop.time}
                      </span>
                      <br />
                      {stop.name}
                    </Popup>
                  </CircleMarker>
                ))}
              </Fragment>
              )
            })}
        </MapContainer>

        <div className="absolute bottom-3 left-3 z-[1000] rounded-lg border border-border bg-card/90 px-3 py-1.5 text-xs text-muted-foreground shadow backdrop-blur">
          位置為 AI 概略標註，僅供了解相對距離，非精確導航座標
        </div>
      </div>
    </div>
  )
}
