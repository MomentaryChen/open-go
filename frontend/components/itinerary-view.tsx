'use client'

import dynamic from 'next/dynamic'
import {
  BedDouble,
  CalendarDays,
  Camera,
  Clock,
  Coins,
  ExternalLink,
  Lightbulb,
  ListOrdered,
  Map as MapIcon,
  MapPin,
  Plane,
  ShoppingBag,
  Sun,
  TrainFront,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import {
  distanceKm,
  formatDistance,
  type Itinerary,
  type ItineraryItem,
} from '@/lib/trip'

/** Distance from a day's stay to the next day's first located item, if both are known. */
function stayToNextDayKm(itinerary: Itinerary, dayIndex: number): number | null {
  const stay = itinerary.days[dayIndex]?.stay
  if (typeof stay?.latitude !== 'number' || typeof stay?.longitude !== 'number') {
    return null
  }
  const firstStop = itinerary.days[dayIndex + 1]?.items.find(
    (item) => typeof item.latitude === 'number' && typeof item.longitude === 'number',
  )
  if (!firstStop) return null
  return distanceKm(
    { latitude: stay.latitude, longitude: stay.longitude },
    { latitude: firstStop.latitude!, longitude: firstStop.longitude! },
  )
}

// Leaflet touches `window`; keep it out of the server render.
const ItineraryMap = dynamic(
  () => import('@/components/itinerary-map').then((module) => module.ItineraryMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-72 items-center justify-center rounded-xl border border-border bg-secondary/30 text-sm text-muted-foreground">
        地圖載入中…
      </div>
    ),
  },
)

const CATEGORY_META: Record<string, { label: string; icon: LucideIcon; className: string }> = {
  attraction: {
    label: '景點',
    icon: Camera,
    className: 'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300',
  },
  food: {
    label: '美食',
    icon: UtensilsCrossed,
    className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
  },
  shopping: {
    label: '購物',
    icon: ShoppingBag,
    className: 'bg-pink-100 text-pink-700 dark:bg-pink-900/50 dark:text-pink-300',
  },
  transport: {
    label: '交通',
    icon: TrainFront,
    className: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300',
  },
  hotel: {
    label: '住宿',
    icon: BedDouble,
    className: 'bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300',
  },
  other: {
    label: '其他',
    icon: MapPin,
    className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  },
}

export function ItineraryView({ itinerary }: { itinerary: Itinerary }) {
  return (
    <div className="space-y-6">
      {/* Boarding-pass style cover */}
      <Card className="overflow-hidden border-none p-0 shadow-lg shadow-primary/10">
        <div className="bg-gradient-to-br from-primary via-primary/90 to-accent p-6 text-primary-foreground md:p-8">
          <div className="flex items-center gap-2 text-sm opacity-90">
            <Plane className="h-4 w-4" />
            <span className="tracking-widest uppercase">Boarding Pass · 你的專屬旅程</span>
          </div>
          <h2 className="mt-3 text-2xl font-bold md:text-3xl">{itinerary.title}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed opacity-90">{itinerary.summary}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <CoverStat icon={CalendarDays} text={`${itinerary.destination} · ${itinerary.durationDays} 天`} />
            <CoverStat icon={Sun} text={`最佳季節：${itinerary.bestSeason}`} />
            <CoverStat icon={Coins} text={`預算：${itinerary.budgetEstimate}`} />
          </div>
        </div>
        {/* perforation line, like a ticket stub */}
        <div className="border-t-2 border-dashed border-border bg-card px-6 py-3 text-xs text-muted-foreground">
          由 AI 讀取 {itinerary.references.length} 個網路來源整理而成，每個行程都附出處
        </div>
      </Card>

      <Tabs defaultValue="itinerary">
        <TabsList>
          <TabsTrigger value="itinerary">
            <ListOrdered className="mr-1.5 h-4 w-4" />
            行程
          </TabsTrigger>
          <TabsTrigger value="map">
            <MapIcon className="mr-1.5 h-4 w-4" />
            地圖
          </TabsTrigger>
        </TabsList>

        <TabsContent value="itinerary" className="mt-4 space-y-6">
          {itinerary.days.map((day, dayIndex) => (
            <Card
              key={day.day}
              className="p-6 animate-in fade-in slide-in-from-bottom-4 duration-500 [animation-fill-mode:backwards]"
              style={{ animationDelay: `${Math.min(dayIndex * 120, 600)}ms` }}
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent text-sm font-bold text-primary-foreground shadow-md shadow-primary/20">
                  D{day.day}
                </span>
                <div>
                  <p className="font-semibold text-foreground">Day {day.day}</p>
                  <p className="text-sm text-muted-foreground">{day.theme}</p>
                </div>
              </div>
              <ol className="mt-5">
                {day.items.map((item, index) => (
                  <TimelineItem
                    key={`${day.day}-${index}`}
                    item={item}
                    isLast={index === day.items.length - 1}
                  />
                ))}
              </ol>
              {day.stay && (
                <div className="mt-4 flex items-start gap-3 rounded-xl border border-violet-200 bg-violet-50/60 px-4 py-3 dark:border-violet-900 dark:bg-violet-950/30">
                  <BedDouble className="mt-0.5 h-4 w-4 shrink-0 text-violet-600 dark:text-violet-300" />
                  <div className="text-sm">
                    <p className="font-medium text-foreground">
                      今晚住宿區域：{day.stay.area}
                    </p>
                    {day.stay.reason && (
                      <p className="mt-0.5 text-muted-foreground">{day.stay.reason}</p>
                    )}
                    {(() => {
                      const km = stayToNextDayKm(itinerary, dayIndex)
                      return km !== null ? (
                        <p className="mt-0.5 text-violet-700 dark:text-violet-300">
                          距 Day {day.day + 1} 出發點{formatDistance(km)}
                        </p>
                      ) : null
                    })()}
                  </div>
                </div>
              )}
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="map" className="mt-4">
          <ItineraryMap itinerary={itinerary} />
        </TabsContent>
      </Tabs>

      {itinerary.tips.length > 0 && (
        <Card className="border-accent/30 bg-accent/5 p-6">
          <h3 className="inline-flex items-center gap-2 font-semibold text-foreground">
            <Lightbulb className="h-4 w-4 text-accent" />
            旅遊提醒
          </h3>
          <ul className="mt-3 space-y-2">
            {itinerary.tips.map((tip, index) => (
              <li key={index} className="flex gap-2 text-sm text-muted-foreground">
                <span className="text-accent">•</span>
                {tip}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {itinerary.references.length > 0 && (
        <Card className="p-6">
          <h3 className="font-semibold text-foreground">資料來源</h3>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {itinerary.references.map((reference) => (
              <li key={reference.url}>
                <a
                  href={reference.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                  <span className="line-clamp-1">{reference.title || reference.url}</span>
                </a>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

function CoverStat({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-sm backdrop-blur">
      <Icon className="h-3.5 w-3.5" />
      {text}
    </span>
  )
}

function TimelineItem({ item, isLast }: { item: ItineraryItem; isLast: boolean }) {
  const meta = CATEGORY_META[item.category] ?? CATEGORY_META.other

  return (
    <li className="relative pl-12 pb-6 last:pb-0">
      {/* dashed route line connecting stops, like a travel map */}
      {!isLast && (
        <span
          aria-hidden
          className="absolute bottom-0 left-4 top-10 border-l-2 border-dashed border-border"
        />
      )}
      <span
        className={cn(
          'absolute left-0 top-0 flex h-8 w-8 items-center justify-center rounded-full shadow-sm',
          meta.className,
        )}
      >
        <meta.icon className="h-4 w-4" />
      </span>

      <div className="trip-lift rounded-xl border border-transparent px-3 py-2 -mx-3 hover:border-border hover:bg-secondary/40">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="rounded-md bg-secondary px-1.5 py-0.5 font-mono text-xs text-secondary-foreground tabular-nums">
            {item.time}
          </span>
          <span className="font-medium text-foreground">{item.name}</span>
          <span className={cn('rounded-full px-2 py-0.5 text-xs', meta.className)}>{meta.label}</span>
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {item.durationMinutes} 分鐘
          </span>
        </div>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{item.description}</p>
        {item.tips && <p className="mt-1 text-sm text-accent">💡 {item.tips}</p>}
        {item.sourceUrls.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {item.sourceUrls.map((url) => (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noreferrer noopener"
                className="text-xs text-muted-foreground underline underline-offset-2 hover:text-primary"
              >
                {hostOf(url)}
              </a>
            ))}
          </div>
        )}
      </div>
    </li>
  )
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}
