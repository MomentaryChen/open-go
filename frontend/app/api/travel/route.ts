import { generateText, Output } from 'ai'
import { z } from 'zod'

// Import geocoding library - we'll use a simple fallback for common locations
const locationCoordinates: Record<string, { lat: number; lng: number }> = {
  '東京': { lat: 35.6762, lng: 139.6503 },
  '京都': { lat: 35.0116, lng: 135.7681 },
  '大阪': { lat: 34.6937, lng: 135.5023 },
  '首爾': { lat: 37.5665, lng: 126.978 },
  '曼谷': { lat: 13.7563, lng: 100.5018 },
  '新加坡': { lat: 1.3521, lng: 103.8198 },
  '巴黎': { lat: 48.8566, lng: 2.3522 },
  '紐約': { lat: 40.7128, lng: -74.006 },
  '倫敦': { lat: 51.5074, lng: -0.1278 },
  '台北': { lat: 25.0330, lng: 121.5654 },
  '北京': { lat: 39.9042, lng: 116.4074 },
  '上海': { lat: 31.2304, lng: 121.4737 },
  '香港': { lat: 22.3193, lng: 114.1694 },
  '杜拜': { lat: 25.2048, lng: 55.2708 },
  '伊斯坦堡': { lat: 41.0082, lng: 28.9784 },
  '東京': { lat: 35.6762, lng: 139.6503 },
  '羅馬': { lat: 41.9028, lng: 12.4964 },
  '米蘭': { lat: 45.4642, lng: 9.19 },
  '威尼斯': { lat: 45.4408, lng: 12.3155 },
  '雅典': { lat: 37.9838, lng: 23.7275 },
  '布宜諾斯艾利斯': { lat: -34.6037, lng: -58.3816 },
  '聖保羅': { lat: -23.5505, lng: -46.6333 },
  '墨西哥市': { lat: 19.4326, lng: -99.1332 },
  '溫哥華': { lat: 49.2827, lng: -123.1207 },
  '多倫多': { lat: 43.6629, lng: -79.3957 },
  '悉尼': { lat: -33.8688, lng: 151.2093 },
  '墨爾本': { lat: -37.8136, lng: 144.9631 },
  '奧克蘭': { lat: -37.0082, lng: 174.7850 },
  '釜山': { lat: 35.1796, lng: 129.0756 },
  '清邁': { lat: 18.7883, lng: 98.9853 },
  '吳哥窟': { lat: 13.3667, lng: 103.8667 },
  '胡志明市': { lat: 10.7769, lng: 106.6963 },
  '河内': { lat: 21.0285, lng: 105.8542 },
}

function getCoordinates(location: string): { latitude: number; longitude: number } {
  // Try exact match first
  if (locationCoordinates[location]) {
    return {
      latitude: locationCoordinates[location].lat,
      longitude: locationCoordinates[location].lng,
    }
  }

  // Try partial match
  for (const [key, coords] of Object.entries(locationCoordinates)) {
    if (location.includes(key) || key.includes(location)) {
      return {
        latitude: coords.lat,
        longitude: coords.lng,
      }
    }
  }

  // Default to world center if not found
  console.log('[travel-api] Location not found, using default coordinates:', location)
  return { latitude: 20, longitude: 0 }
}

const TravelDataSchema = z.object({
  location: z.string().describe('目的地名稱'),
  latitude: z.number().describe('緯度'),
  longitude: z.number().describe('經度'),
  overview: z.string().describe('地區概述，包含歷史文化背景'),
  attractions: z.array(z.object({
    name: z.string().describe('景點名稱'),
    type: z.string().describe('景點類型'),
    rating: z.number().min(1).max(5).describe('評分 1-5'),
    reviewCount: z.number().describe('評論數量'),
    highlights: z.array(z.string()).describe('亮點特色'),
    tips: z.string().describe('旅遊小提示'),
  })).describe('熱門景點列表'),
  reviews: z.array(z.object({
    author: z.string().describe('評論者名稱'),
    rating: z.number().min(1).max(5).describe('評分'),
    text: z.string().describe('評論內容'),
    date: z.string().describe('評論日期'),
  })).describe('旅客評論'),
  videos: z.array(z.object({
    title: z.string().describe('影片標題'),
    videoId: z.string().describe('YouTube 影片 ID'),
    channel: z.string().describe('頻道名稱'),
    views: z.string().describe('觀看次數'),
  })).describe('YouTube 影片推薦'),
})

export async function POST(req: Request) {
  const { location } = await req.json()

  try {
    // Get coordinates for the location
    const { latitude, longitude } = getCoordinates(location)

    const result = await generateText({
      model: 'openai/gpt-5-mini',
      output: Output.object({ schema: TravelDataSchema }),
      messages: [
        {
          role: 'user',
          content: `你是一位專業的旅遊顧問。請為「${location}」提供完整的旅遊資訊。

請提供以下結構化資訊（JSON 格式）：
{
  "location": "${location}",
  "latitude": ${latitude},
  "longitude": ${longitude},
  "overview": "地區概述，包含歷史、文化、地理特色",
  "attractions": [
    {
      "name": "景點名稱",
      "type": "景點類型",
      "rating": 4.5,
      "reviewCount": 1200,
      "highlights": ["亮點1", "亮點2", "亮點3"],
      "tips": "旅遊小提示"
    }
  ],
  "reviews": [
    {
      "author": "評論者名稱",
      "rating": 5,
      "text": "評論內容",
      "date": "2024年4月"
    }
  ],
  "videos": [
    {
      "title": "影片標題",
      "videoId": "dQw4w9WgXcQ",
      "channel": "頻道名稱",
      "views": "1.2M"
    }
  ]
}

要求：
1. 提供 5-8 個熱門景點
2. 提供 4-6 則真實的旅客評論
3. 提供 5 個適合觀看的 YouTube 影片（使用真實的影片 ID）
4. 所有內容使用繁體中文`,
        },
      ],
    })

    return Response.json(result.object)
  } catch (error) {
    console.error('[travel-api] Error in travel API:', error)
    return Response.json(
      { error: '無法取得旅遊資訊' },
      { status: 500 }
    )
  }
}
