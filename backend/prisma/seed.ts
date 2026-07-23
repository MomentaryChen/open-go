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

  // Settings are intentionally NOT seeded: every trip.* setting has a code
  // default (src/trip/trip.config.ts, src/trip/prompts.ts) that applies when
  // the row is absent, and the admin UI creates rows on first edit. Seeding
  // copies here would drift from the code defaults over time.

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
