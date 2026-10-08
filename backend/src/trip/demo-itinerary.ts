import type { Itinerary } from './itinerary-composer.service';

const DEMO_SOURCE = 'https://example.com/open-go-demo';
const MAX_DEMO_DAYS = 5;

function clampDays(value: number | null): number {
  if (value == null || !Number.isFinite(value)) return 2;
  return Math.min(MAX_DEMO_DAYS, Math.max(1, Math.trunc(value)));
}

function usesChinese(keyword: string): boolean {
  return /[\u3400-\u9fff]/.test(keyword);
}

/**
 * A finished itinerary that exercises the public UI without search or an LLM.
 * Copy states that the stops are fixtures, so a shared demo link is not
 * mistaken for a researched plan.
 */
export function buildDemoItinerary(
  keyword: string,
  durationDays: number | null,
): Itinerary {
  const days = clampDays(durationDays);
  const label = keyword.trim().slice(0, 80);
  const zh = usesChinese(label);

  return {
    title: label,
    destination: label,
    durationDays: days,
    summary: zh
      ? `這是「${label}」的示範行程。此伺服器開了 TRIP_DEMO_MODE，沒有搜尋網頁，也沒有呼叫 LLM。`
      : `Sample itinerary for “${label}”. This server is in TRIP_DEMO_MODE, so it did not search the web or call an LLM.`,
    bestSeason: zh ? '不適用（示範資料）' : 'Not applicable (demo fixture)',
    budgetEstimate: zh ? '示範資料，非正式估價' : 'Sample only — not a real estimate',
    days: Array.from({ length: days }, (_, index) => {
      const day = index + 1;
      const last = day === days;
      return {
        day,
        theme: zh ? `示範第 ${day} 天` : `Sample day ${day}`,
        stay: last
          ? null
          : {
              area: zh ? '示範住宿區' : 'Sample neighbourhood',
              latitude: null,
              longitude: null,
              reason: zh
                ? '示範用的住宿區域，不是真實推薦。'
                : 'Placeholder stay area for the demo fixture.',
            },
        items: [
          {
            time: '09:00',
            name: zh ? `${label}・示範景點` : `${label} — sample stop`,
            category: 'attraction' as const,
            description: zh
              ? '這個景點是本地產生的範例，用來在沒有 API 金鑰時走完規劃畫面。'
              : 'This stop is generated locally so the planner UI can be tried without API keys.',
            address: null,
            durationMinutes: 90,
            tips: zh
              ? '關閉 TRIP_DEMO_MODE 並設定 LLM 金鑰後，這裡會換成有來源的行程。'
              : 'Turn TRIP_DEMO_MODE off and set an LLM key to replace this with a sourced plan.',
            latitude: null,
            longitude: null,
            sourceUrls: [DEMO_SOURCE],
          },
          {
            time: '12:30',
            name: zh ? '示範用餐' : 'Sample meal',
            category: 'food' as const,
            description: zh
              ? '示範用的用餐時段，沒有對應的文章。'
              : 'A sample meal slot with no supporting article.',
            address: null,
            durationMinutes: 60,
            tips: zh ? '請勿把這筆當成餐廳推薦。' : 'Do not treat this as a restaurant recommendation.',
            latitude: null,
            longitude: null,
            sourceUrls: [DEMO_SOURCE],
          },
        ],
      };
    }),
    tips: [
      zh
        ? '這份行程是本地範例，沒有引用真實文章。'
        : 'This itinerary is a local fixture and does not cite real articles.',
      zh
        ? '將 TRIP_DEMO_MODE 設為 false，並提供 GEMINI_API_KEY 或 ANTHROPIC_API_KEY，才會跑真正的管線。'
        : 'Set TRIP_DEMO_MODE=false and provide GEMINI_API_KEY or ANTHROPIC_API_KEY to run the real pipeline.',
    ],
    references: [
      {
        title: zh ? 'open-go 示範資料' : 'open-go demo fixture',
        url: DEMO_SOURCE,
      },
    ],
  };
}
