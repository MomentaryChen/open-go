import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';

const prisma = new PrismaClient();

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

async function main() {
  const regions = [
    { name: '台北', countryCode: 'TW' },
    { name: '台中', countryCode: 'TW' },
    { name: '高雄', countryCode: 'TW' },
  ];

  const savedRegions = await Promise.all(
    regions.map((region) =>
      prisma.region.upsert({
        where: {
          countryCode_name: {
            countryCode: region.countryCode,
            name: region.name,
          },
        },
        create: region,
        update: {},
      }),
    ),
  );

  const pois = [
    {
      source: 'tw-open-data',
      sourceId: 'tp101',
      regionName: '台北',
      name: '台北 101',
      category: 'landmark',
      address: '台北市信義區信義路五段 7 號',
      rating: 4.6,
      reviewCount: 15234,
    },
    {
      source: 'tw-open-data',
      sourceId: 'tp-ntm',
      regionName: '台北',
      name: '國立故宮博物院',
      category: 'museum',
      address: '台北市士林區至善路二段 221 號',
      rating: 4.7,
      reviewCount: 9871,
    },
    {
      source: 'tw-open-data',
      sourceId: 'tc-fengjia',
      regionName: '台中',
      name: '逢甲夜市',
      category: 'night-market',
      address: '台中市西屯區',
      rating: 4.4,
      reviewCount: 11003,
    },
    {
      source: 'tw-open-data',
      sourceId: 'kh-love-river',
      regionName: '高雄',
      name: '愛河',
      category: 'scenic',
      address: '高雄市前金區',
      rating: 4.3,
      reviewCount: 6400,
    },
  ];

  // Trip pipeline defaults, mirroring the env chain in src/trip/trip.config.ts.
  // Create-only (`update: {}`) so re-seeding never overwrites tuned values.
  const settings = [
    {
      key: 'trip.targetDocuments',
      value: String(Number(process.env.TRIP_TARGET_DOCUMENTS ?? 30)),
      valueType: 'number',
      description: '每次行程搜尋要蒐集的文章數量',
    },
    {
      key: 'trip.crawlConcurrency',
      value: String(Number(process.env.TRIP_CRAWL_CONCURRENCY ?? 5)),
      valueType: 'number',
      description: '同時抓取文章的並發數',
    },
    {
      key: 'trip.cacheTtlDays',
      value: String(Number(process.env.TRIP_CACHE_TTL_DAYS || 7)),
      valueType: 'number',
      description: '同關鍵字行程快取天數（0 = 停用快取）',
    },
    {
      key: 'trip.resultsPerQuery',
      value: '12',
      valueType: 'number',
      description: '單一搜尋查詢最多取用的結果數',
    },
    {
      key: 'trip.maxDocumentsPerHost',
      value: '3',
      valueType: 'number',
      description: '同一網站最多收錄的文章數（維持來源多樣性）',
    },
    // LLM selection. Router fallback chain: this setting → env → built-in.
    {
      key: 'trip.llmProvider',
      value: ['gemini', 'anthropic'].includes(
        (process.env.TRIP_LLM_PROVIDER || 'gemini').toLowerCase(),
      )
        ? (process.env.TRIP_LLM_PROVIDER || 'gemini').toLowerCase()
        : 'gemini',
      valueType: 'string',
      description: 'LLM 提供者：gemini 或 anthropic（需設定對應 API key）',
    },
    {
      key: 'trip.llmModel',
      value: process.env.TRIP_MODEL || 'auto',
      valueType: 'string',
      description:
        '模型名稱；auto = 依 provider 預設（gemini-flash-latest / claude-opus-4-8）',
    },
    // LLM system prompts. Values mirror the built-in defaults in
    // src/trip/keyword-planner.service.ts / itinerary-composer.service.ts —
    // keep them in sync when the code defaults change. Emptying the value in
    // the admin UI falls back to the code default.
    {
      key: 'trip.plannerSystemPrompt',
      value: `You break a traveller's keyword down into search engine queries for a research crawler.

Rules:
- Detect the language the traveller wrote the keyword in and report it as outputLanguage (BCP-47, e.g. zh-TW, en, ja). Written Chinese without simplified characters should be treated as zh-TW.
- Produce 6 to 10 queries, covering all five intents: attraction, food, transport, accommodation, itinerary.
- Mix languages: at least two queries in the destination's local language, at least two in the traveller's own language, and at least two in English, so the crawler reaches local blogs, the traveller's community, and international guides.
- Write queries the way a real person types them into Google — no boolean operators, no quotes, no site: filters.
- Prefer queries that surface recent, specific, first-hand articles over generic landing pages.`,
      valueType: 'string',
      description:
        '關鍵字規劃的 System Prompt（清空即恢復程式內建預設）',
    },
    {
      key: 'trip.composerSystemPrompt',
      value: `You turn crawled travel articles into one concrete, executable itinerary.

Rules:
- Ground every recommendation in the supplied documents. Never invent a place, price, or opening hour that no document mentions.
- Every itinerary item must list the source URLs it came from, drawn only from the supplied documents.
- Order each day geographically so the traveller is not criss-crossing the city; account for realistic travel time between items.
- Include meals at sensible hours and note transport between distant items.
- If the documents are thin on a topic, say so plainly in the tips rather than filling the gap with generic advice.`,
      valueType: 'string',
      description:
        '行程組合的 System Prompt；輸出語言規則會自動附加在後（清空即恢復程式內建預設）',
    },
  ];

  for (const setting of settings) {
    await prisma.setting.upsert({
      where: { key: setting.key },
      create: setting,
      update: {},
    });
  }

  for (const poi of pois) {
    const region = savedRegions.find((r) => r.name === poi.regionName);
    if (!region) continue;

    const content = {
      regionId: region.id,
      name: poi.name,
      category: poi.category,
      address: poi.address,
      rating: poi.rating,
      reviewCount: poi.reviewCount,
      latitude: null,
      longitude: null,
    };

    await prisma.poi.upsert({
      where: {
        source_sourceId: {
          source: poi.source,
          sourceId: poi.sourceId,
        },
      },
      create: {
        source: poi.source,
        sourceId: poi.sourceId,
        ...content,
        contentHash: hash(JSON.stringify(content)),
      },
      update: {
        ...content,
        contentHash: hash(JSON.stringify(content)),
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
