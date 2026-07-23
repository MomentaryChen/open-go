'use client'

import { Fragment, useMemo, useState } from 'react'
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
import type { Itinerary } from '@/lib/trip'

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

function FitToBounds({ bounds }: { bounds: LatLngBoundsExpression }) {
  const map = useMap()
  useMemo(() => {
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

  const allStops = useMemo(
    () => [...stopsByDay.values()].flat(),
    [stopsByDay],
  )

  if (allStops.length === 0) {
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

  const lats = allStops.map((stop) => stop.latitude)
  const lngs = allStops.map((stop) => stop.longitude)
  const latPadding = Math.max((Math.max(...lats) - Math.min(...lats)) * 0.15, 0.01)
  const lngPadding = Math.max((Math.max(...lngs) - Math.min(...lngs)) * 0.15, 0.01)
  const bounds = [
    [Math.min(...lats) - latPadding, Math.min(...lngs) - lngPadding],
    [Math.max(...lats) + latPadding, Math.max(...lngs) + lngPadding],
  ] as LatLngBoundsExpression

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
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          />
          <FitToBounds bounds={bounds} />

          {[...stopsByDay.entries()]
            .filter(([day]) => !hiddenDays.has(day))
            .map(([day, stops]) => (
              <Fragment key={day}>
                {stops.length > 1 && (
                  <Polyline
                    positions={stops.map((stop) => [stop.latitude, stop.longitude])}
                    pathOptions={{
                      color: colorOf(day),
                      weight: 3,
                      opacity: 0.75,
                      dashArray: '6 8',
                    }}
                  />
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
            ))}
        </MapContainer>

        <div className="absolute bottom-3 left-3 z-[1000] rounded-lg border border-border bg-card/90 px-3 py-1.5 text-xs text-muted-foreground shadow backdrop-blur">
          位置為 AI 概略標註，僅供了解相對距離，非精確導航座標
        </div>
      </div>
    </div>
  )
}
