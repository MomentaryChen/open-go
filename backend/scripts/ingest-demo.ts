import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';

const prisma = new PrismaClient();

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

async function ingestOne(input: {
  source: string;
  sourceId: string;
  regionName: string;
  name: string;
  category?: string;
  address?: string;
  rating?: number;
  reviewCount?: number;
}) {
  const region = await prisma.region.upsert({
    where: {
      countryCode_name: {
        countryCode: 'TW',
        name: input.regionName,
      },
    },
    create: {
      countryCode: 'TW',
      name: input.regionName,
    },
    update: {},
  });

  const payload = {
    regionId: region.id,
    name: input.name,
    category: input.category ?? null,
    address: input.address ?? null,
    rating: input.rating ?? null,
    reviewCount: input.reviewCount ?? 0,
    latitude: null,
    longitude: null,
  };
  const contentHash = hash(JSON.stringify(payload));

  const existing = await prisma.poi.findUnique({
    where: {
      source_sourceId: {
        source: input.source,
        sourceId: input.sourceId,
      },
    },
  });

  if (!existing) {
    await prisma.poi.create({
      data: {
        source: input.source,
        sourceId: input.sourceId,
        ...payload,
        contentHash,
      },
    });
    return 'created';
  }

  if (existing.contentHash === contentHash) {
    await prisma.poi.update({
      where: { id: existing.id },
      data: { lastFetchedAt: new Date() },
    });
    return 'skipped';
  }

  await prisma.poi.update({
    where: { id: existing.id },
    data: {
      ...payload,
      contentHash,
      lastFetchedAt: new Date(),
    },
  });
  return 'updated';
}

async function main() {
  const first = await ingestOne({
    source: 'demo-source',
    sourceId: 'demo-001',
    regionName: '台北',
    name: '測試景點 A',
    category: 'landmark',
    rating: 4.2,
    reviewCount: 10,
  });

  const second = await ingestOne({
    source: 'demo-source',
    sourceId: 'demo-001',
    regionName: '台北',
    name: '測試景點 A',
    category: 'landmark',
    rating: 4.2,
    reviewCount: 10,
  });

  const third = await ingestOne({
    source: 'demo-source',
    sourceId: 'demo-001',
    regionName: '台北',
    name: '測試景點 A',
    category: 'landmark',
    rating: 4.8,
    reviewCount: 66,
  });

  console.log({ first, second, third });
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
