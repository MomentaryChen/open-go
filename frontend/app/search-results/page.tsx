 'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { ResultsSidebar } from '@/components/results-sidebar'
import { Button } from '@/components/ui/button'
import { ChevronLeft } from 'lucide-react'

export interface Attraction {
  id: string
  name: string
  type: string
  rating: number
  reviewCount: number
  highlights: string[]
  tips: string
  latitude: number
  longitude: number
}

type CategoryStat = {
  category: string
  count: number
}

type RegionDto = {
  id: string
  name: string
  countryCode: string
}

type PoiDto = {
  id: string
  name: string
  category: string | null
  rating: number | null
  reviewCount: number
  address: string | null
  latitude: number | null
  longitude: number | null
}

type SearchData = {
  location: string
  latitude: number
  longitude: number
  overview: string
  attractions: Attraction[]
  reviews: Array<{ author: string; rating: number; text: string; date: string }>
  videos: Array<{ title: string; videoId: string; channel: string; views: string }>
}

const mockData: SearchData = {
  location: '東京',
  latitude: 35.6762,
  longitude: 139.6503,
  overview: '東京是日本的首都，融合了傳統文化與現代科技，擁有豐富的美食、購物和歷史景點。',
  attractions: [
    {
      id: 'mock-1',
      name: '淺草寺',
      type: '寺廟',
      rating: 4.7,
      reviewCount: 45832,
      highlights: ['雷門', '仲見世通商店街', '五重塔'],
      tips: '建議清晨前往，避開人潮',
      latitude: 35.7148,
      longitude: 139.7967,
    },
    {
      id: 'mock-2',
      name: '東京晴空塔',
      type: '地標',
      rating: 4.5,
      reviewCount: 32145,
      highlights: ['360度觀景台', '夜景絕美', '購物中心'],
      tips: '傍晚時分可同時欣賞日落與夜景',
      latitude: 35.7101,
      longitude: 139.8107,
    },
    {
      id: 'mock-3',
      name: '新宿御苑',
      type: '公園',
      rating: 4.6,
      reviewCount: 28976,
      highlights: ['櫻花季必訪', '日式庭園', '溫室植物'],
      tips: '春季櫻花、秋季紅葉最美',
      latitude: 35.6852,
      longitude: 139.7100,
    },
    {
      id: 'mock-4',
      name: '明治神宮',
      type: '神社',
      rating: 4.8,
      reviewCount: 38421,
      highlights: ['森林步道', '傳統婚禮', '御守'],
      tips: '週末可能遇到傳統婚禮儀式',
      latitude: 35.6763,
      longitude: 139.6993,
    },
    {
      id: 'mock-5',
      name: '澀谷十字路口',
      type: '景點',
      rating: 4.3,
      reviewCount: 52341,
      highlights: ['世界最繁忙路口', '忠犬八公像', '購物天堂'],
      tips: '從星巴克二樓觀景最佳',
      latitude: 35.6595,
      longitude: 139.7006,
    },
  ] as Attraction[],
  reviews: [
    {
      author: '旅行者小明',
      rating: 5,
      text: '東京是我去過最棒的城市！交通便利，美食超多，每個角落都有驚喜。淺草寺的雷門真的很壯觀，推薦早起去拍照。',
      date: '2024年3月',
    },
    {
      author: 'Sarah W.',
      rating: 4,
      text: '第一次來東京，被這座城市的乾淨和有序震撼到。新宿御苑的櫻花太美了，不過人真的很多，建議平日去。',
      date: '2024年4月',
    },
    {
      author: '美食獵人',
      rating: 5,
      text: '築地市場的海鮮、拉麵、壽司...每一餐都是享受！記得帶足夠的胃來東京，這裡的美食絕對不會讓你失望。',
      date: '2024年2月',
    },
    {
      author: 'Alex Chen',
      rating: 4,
      text: '東京的夜生活很精彩，新宿歌舞伎町和澀谷都很有特色。唯一缺點是物價有點高，但體驗絕對值得。',
      date: '2024年1月',
    },
    {
      author: '家庭旅遊',
      rating: 5,
      text: '帶小孩來東京迪士尼，孩子們玩得超開心！東京對親子旅遊非常友善，到處都有母嬰設施。',
      date: '2024年3月',
    },
  ],
  videos: [
    {
      title: '大阪自由行攻略｜景點美食一次看',
      videoId: 'https://www.youtube.com/watch?v=_G1-Dh8CwkY',
      channel: '旅遊頻道',
      views: '125萬次觀看',
    },
    {
      title: '東京必吃美食TOP10｜在地人推薦',
      videoId: 'def456',
      channel: '美食探險家',
      views: '89萬次觀看',
    },
    {
      title: '淺草寺完整導覽｜歷史文化深度遊',
      videoId: 'ghi789',
      channel: '日本旅遊',
      views: '45萬次觀看',
    },
    {
      title: '東京住宿推薦｜新宿vs澀谷住哪好？',
      videoId: 'jkl012',
      channel: '背包客棧',
      views: '67萬次觀看',
    },
  ],
}

const LocationMap = dynamic(
  () => import('@/components/location-map').then((module) => module.LocationMap),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full bg-gradient-to-br from-sky-50 to-blue-100 flex items-center justify-center rounded-xl border border-border">
        <div className="text-sm text-muted-foreground">Loading map...</div>
      </div>
    ),
  }
)

function SearchResultsContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const location = searchParams.get('location') || mockData.location
  const categoryFromUrl = normalizeCategory(searchParams.get('category'))

  const [isLoading, setIsLoading] = useState(false)
  const [data, setData] = useState({ ...mockData, location })
  const [categoryStats, setCategoryStats] = useState<CategoryStat[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string>(categoryFromUrl)
  const [selectedAttractionIndex, setSelectedAttractionIndex] = useState<number | null>(null)

  const filteredAttractions = useMemo(() => {
    if (selectedCategory === 'all') return data.attractions
    return data.attractions.filter((attraction) => attraction.type === selectedCategory)
  }, [data.attractions, selectedCategory])

  useEffect(() => {
    setSelectedAttractionIndex(null)
  }, [selectedCategory])

  useEffect(() => {
    setSelectedCategory((current) => (current === categoryFromUrl ? current : categoryFromUrl))
  }, [categoryFromUrl])

  useEffect(() => {
    const currentCategory = normalizeCategory(searchParams.get('category'))
    if (currentCategory === selectedCategory) return

    const params = new URLSearchParams(searchParams.toString())
    params.set('location', location)
    if (selectedCategory === 'all') {
      params.delete('category')
    } else {
      params.set('category', selectedCategory)
    }
    router.replace(`/search-results?${params.toString()}`, { scroll: false })
  }, [location, router, searchParams, selectedCategory])

  useEffect(() => {
    if (selectedCategory === 'all') return
    const exists = categoryStats.some((item) => item.category === selectedCategory)
    if (!exists) {
      setSelectedCategory('all')
    }
  }, [categoryStats, selectedCategory])

  useEffect(() => {
    const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:33000'
    let disposed = false

    const loadRegionData = async () => {
      setIsLoading(true)
      try {
        const region = await findOrCreateRegion(baseUrl, location)
        if (!region) return

        const [pois, categoryResponse] = await Promise.all([
          fetchJson<PoiDto[]>(`${baseUrl}/regions/${region.id}/pois`),
          fetchJson<{ categories: CategoryStat[] }>(`${baseUrl}/regions/${region.id}/categories`),
        ])

        if (disposed) return

        const attractions = pois.map((poi, index) =>
          toAttraction(poi, index, mockData.latitude, mockData.longitude),
        )

        if (attractions.length > 0) {
          setData((current) => ({
            ...current,
            location,
            attractions,
          }))
          setCategoryStats(categoryResponse.categories ?? [])
        } else {
          setData({ ...mockData, location })
          setCategoryStats([])
        }
      } catch {
        if (!disposed) {
          setData({ ...mockData, location })
          setCategoryStats([])
        }
      } finally {
        if (!disposed) {
          setIsLoading(false)
        }
      }
    }

    void loadRegionData()

    return () => {
      disposed = true
    }
  }, [location])

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border px-6 py-4 flex items-center gap-4 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push('/')}
          className="shrink-0"
        >
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">{location}</h1>
          <p className="text-sm text-muted-foreground line-clamp-1">{data.overview}</p>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left - Map */}
        <div className="flex-1 p-4">
          <LocationMap
            latitude={data.latitude}
            longitude={data.longitude}
            locationName={data.location}
            attractions={filteredAttractions}
            selectedAttractionIndex={selectedAttractionIndex}
            onAttractionSelect={setSelectedAttractionIndex}
          />
        </div>

        {/* Right - Sidebar */}
        <div className="w-[420px] border-l border-border bg-card overflow-hidden flex flex-col shrink-0">
          <ResultsSidebar
            location={data.location}
            reviews={data.reviews}
            videos={data.videos}
            attractions={filteredAttractions}
            overview={data.overview}
            categoryStats={categoryStats}
            selectedCategory={selectedCategory}
            onCategoryChange={setSelectedCategory}
            isLoading={isLoading}
            selectedAttractionIndex={selectedAttractionIndex}
            onAttractionSelect={setSelectedAttractionIndex}
          />
        </div>
      </div>
    </div>
  )
}

export default function SearchResultsPage() {
  return (
    <Suspense fallback={<div className="h-screen bg-background" />}>
      <SearchResultsContent />
    </Suspense>
  )
}

async function fetchJson<T>(url: string, options?: RequestInit) {
  const response = await fetch(url, options)
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`)
  }
  return (await response.json()) as T
}

async function findOrCreateRegion(baseUrl: string, location: string) {
  const query = encodeURIComponent(location)
  const regions = await fetchJson<RegionDto[]>(`${baseUrl}/regions/search?q=${query}`)
  const matched =
    regions.find((region) => region.name.toLowerCase() === location.toLowerCase()) ?? regions[0]
  if (matched) return matched

  await fetchJson(`${baseUrl}/automation/discover-region`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: location }),
  })

  const fallbackRegions = await fetchJson<RegionDto[]>(`${baseUrl}/regions/search?q=${query}`)
  return fallbackRegions[0]
}

function toAttraction(poi: PoiDto, index: number, baseLatitude: number, baseLongitude: number): Attraction {
  const offset = (index % 6) * 0.01 + 0.01
  return {
    id: poi.id,
    name: poi.name,
    type: poi.category ?? 'uncategorized',
    rating: poi.rating ?? 0,
    reviewCount: poi.reviewCount ?? 0,
    highlights: poi.address ? [poi.address] : [],
    tips: 'Open external review links to read the latest feedback.',
    latitude: poi.latitude ?? baseLatitude + offset,
    longitude: poi.longitude ?? baseLongitude + offset,
  }
}

function normalizeCategory(value: string | null) {
  if (!value || value.trim() === '') return 'all'
  return value
}
