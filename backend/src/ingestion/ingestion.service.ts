import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

type IngestPoiInput = {
  source: string;
  sourceId: string;
  regionName: string;
  countryCode?: string;
  name: string;
  category?: string;
  address?: string;
  rating?: number;
  reviewCount?: number;
  latitude?: number;
  longitude?: number;
};

@Injectable()
export class IngestionService {
  constructor(private readonly prisma: PrismaService) {}

  async cacheFetch(source: string, endpoint: string, params: Record<string, string>) {
    const paramsHash = this.hash(JSON.stringify(params));
    const now = new Date();

    const cached = await this.prisma.ingestionRequestCache.findUnique({
      where: {
        source_endpoint_paramsHash: {
          source,
          endpoint,
          paramsHash,
        },
      },
    });

    if (cached && cached.expiresAt > now) {
      return { hit: true };
    }

    const responseHash = this.hash(`${source}:${endpoint}:${paramsHash}:${now.toISOString()}`);
    const expiresAt = new Date(now.getTime() + 1000 * 60 * 60 * 24);

    await this.prisma.ingestionRequestCache.upsert({
      where: {
        source_endpoint_paramsHash: {
          source,
          endpoint,
          paramsHash,
        },
      },
      create: { source, endpoint, paramsHash, responseHash, expiresAt },
      update: { responseHash, fetchedAt: now, expiresAt },
    });

    return { hit: false };
  }

  async ingestPois(items: IngestPoiInput[]) {
    const result = {
      created: 0,
      updated: 0,
      skipped: 0,
    };

    for (const item of items) {
      const region = await this.prisma.region.upsert({
        where: {
          countryCode_name: {
            countryCode: item.countryCode ?? 'TW',
            name: item.regionName,
          },
        },
        create: {
          countryCode: item.countryCode ?? 'TW',
          name: item.regionName,
        },
        update: {},
      });

      const payload = {
        regionId: region.id,
        name: item.name,
        category: item.category ?? null,
        address: item.address ?? null,
        rating: item.rating ?? null,
        reviewCount: item.reviewCount ?? 0,
        latitude: item.latitude ?? null,
        longitude: item.longitude ?? null,
      };
      const contentHash = this.hash(JSON.stringify(payload));

      const existing = await this.prisma.poi.findUnique({
        where: {
          source_sourceId: {
            source: item.source,
            sourceId: item.sourceId,
          },
        },
      });

      if (!existing) {
        await this.prisma.poi.create({
          data: {
            source: item.source,
            sourceId: item.sourceId,
            ...payload,
            contentHash,
          },
        });
        result.created += 1;
        continue;
      }

      if (existing.contentHash === contentHash) {
        await this.prisma.poi.update({
          where: { id: existing.id },
          data: { lastFetchedAt: new Date() },
        });
        result.skipped += 1;
        continue;
      }

      await this.prisma.poi.update({
        where: { id: existing.id },
        data: {
          ...payload,
          contentHash,
          lastFetchedAt: new Date(),
        },
      });
      result.updated += 1;
    }

    return result;
  }

  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }
}
