'use client'

import { useMemo } from 'react'
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from 'react-leaflet'
import type { LatLngBoundsExpression, LatLngExpression } from 'leaflet'
import { MapPin } from 'lucide-react'
import type { Attraction } from '@/app/search-results/page'

interface LocationMapProps {
  latitude: number
  longitude: number
  locationName: string
  attractions: Attraction[]
  selectedAttractionIndex: number | null
  onAttractionSelect: (index: number | null) => void
}

const MARKER_DEFAULT = '#3b82f6'
const MARKER_SELECTED = '#f97316'
const MAX_VISIBLE_MARKERS = 6

function FitToBounds({ bounds }: { bounds: LatLngBoundsExpression }) {
  const map = useMap()

  useMemo(() => {
    map.fitBounds(bounds, { padding: [36, 36], maxZoom: 13 })
  }, [bounds, map])

  return null
}

export function LocationMap({
  latitude,
  longitude,
  locationName,
  attractions,
  selectedAttractionIndex,
  onAttractionSelect,
}: LocationMapProps) {
  const points = useMemo(() => [{ latitude, longitude }, ...attractions], [latitude, longitude, attractions])
  const lats = points.map((point) => point.latitude)
  const lngs = points.map((point) => point.longitude)

  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs)
  const maxLng = Math.max(...lngs)

  const latPadding = Math.max((maxLat - minLat) * 0.2, 0.015)
  const lngPadding = Math.max((maxLng - minLng) * 0.2, 0.015)

  const bounds = [
    [minLat - latPadding, minLng - lngPadding],
    [maxLat + latPadding, maxLng + lngPadding],
  ] as LatLngBoundsExpression

  const center = [latitude, longitude] as LatLngExpression

  const selectedAttraction = selectedAttractionIndex !== null ? attractions[selectedAttractionIndex] : null
  const visibleIndexes = useMemo(() => {
    const topIndexes = attractions.slice(0, MAX_VISIBLE_MARKERS).map((_, index) => index)
    if (selectedAttractionIndex === null || topIndexes.includes(selectedAttractionIndex)) {
      return topIndexes
    }
    return [...topIndexes.slice(0, Math.max(0, MAX_VISIBLE_MARKERS - 1)), selectedAttractionIndex]
  }, [attractions, selectedAttractionIndex])

  return (
    <div className="w-full h-full rounded-xl overflow-hidden shadow-lg relative border border-border">
      <MapContainer center={center} zoom={11} scrollWheelZoom className="w-full h-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png"
        />

        <FitToBounds bounds={bounds} />

        {selectedAttraction && (
          <CircleMarker
            center={[selectedAttraction.latitude, selectedAttraction.longitude]}
            radius={22}
            pathOptions={{
              className: 'selected-marker-pulse',
              color: MARKER_SELECTED,
              weight: 0,
              fillColor: MARKER_SELECTED,
              fillOpacity: 0.22,
            }}
            interactive={false}
          />
        )}

        {attractions.map((attraction, idx) => {
          if (!visibleIndexes.includes(idx)) {
            return null
          }

          const isSelected = idx === selectedAttractionIndex
          return (
            <CircleMarker
              key={attraction.name}
              center={[attraction.latitude, attraction.longitude]}
              radius={isSelected ? 14 : 11}
              pathOptions={{
                color: '#ffffff',
                weight: isSelected ? 3 : 2,
                fillColor: isSelected ? MARKER_SELECTED : MARKER_DEFAULT,
                fillOpacity: isSelected ? 0.98 : 0.92,
              }}
              eventHandlers={{
                click: () => onAttractionSelect(isSelected ? null : idx),
              }}
            >
              <Tooltip
                permanent
                direction="center"
                offset={[0, 0]}
                opacity={1}
                className={`map-index-tooltip ${isSelected ? 'is-selected' : ''}`}
              >
                {idx + 1}
              </Tooltip>
            </CircleMarker>
          )
        })}
      </MapContainer>

      {/* Selected attraction info card */}
      {selectedAttraction ? (
        <div className="absolute bottom-4 left-4 right-4 bg-card/95 backdrop-blur-sm px-4 py-3 rounded-xl shadow-lg border border-border">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
                <MapPin className="h-3.5 w-3.5 text-accent" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-foreground text-sm truncate">{selectedAttraction.name}</p>
                <p className="text-xs text-muted-foreground">{selectedAttraction.type} · ★ {selectedAttraction.rating}</p>
              </div>
            </div>
            <button
              onClick={() => onAttractionSelect(null)}
              className="text-muted-foreground hover:text-foreground text-lg leading-none shrink-0"
              aria-label="Clear selection"
            >
              ×
            </button>
          </div>
        </div>
      ) : (
        <div className="absolute bottom-4 left-4 bg-card/90 backdrop-blur-sm px-3 py-2 rounded-lg shadow border border-border">
          <div className="flex items-center gap-2">
            <MapPin className="h-3.5 w-3.5 text-primary" />
            <p className="text-xs font-medium text-foreground">{locationName}</p>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Showing top {Math.min(MAX_VISIBLE_MARKERS, attractions.length)} markers for clarity
          </p>
        </div>
      )}
    </div>
  )
}
