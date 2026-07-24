import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import type { Poi } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Two POIs closer than this with similar names are treated as the same
 * physical place ("清水寺" vs "清水寺(Kiyomizu-dera)", or the same spot filed
 * under "京都" vs "京都市"). Tight enough that two different shops on the same
 * street stay separate — the name check does the rest.
 */
const NEARBY_RADIUS_METERS = 200;
const METERS_PER_DEGREE_LAT = 111_320;

export type IngestPoiInput = {
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
  private readonly logger = new Logger(IngestionService.name);

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
      merged: 0,
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
        // No exact (source, sourceId) match — before creating, check whether
        // an existing POI is the same physical place under another name,
        // source or region spelling. If so, enrich it instead of duplicating.
        const nearby = await this.findNearbySamePoi(item);
        if (nearby) {
          await this.mergeIntoExistingPoi(nearby, item);
          result.merged += 1;
          continue;
        }

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

  /**
   * Find an existing POI that is the same physical place as `item`: within
   * NEARBY_RADIUS_METERS of its coordinates AND with a similar name. Both
   * conditions are required — proximity alone would merge different shops on
   * the same block. Searched across all regions on purpose, so "京都" vs
   * "京都市" spellings still collapse onto one record.
   */
  private async findNearbySamePoi(item: IngestPoiInput): Promise<Poi | null> {
    if (item.latitude == null || item.longitude == null) return null;

    const latDelta = NEARBY_RADIUS_METERS / METERS_PER_DEGREE_LAT;
    const cosLat = Math.max(
      Math.abs(Math.cos((item.latitude * Math.PI) / 180)),
      0.01, // avoid division blow-up near the poles
    );
    const lngDelta = NEARBY_RADIUS_METERS / (METERS_PER_DEGREE_LAT * cosLat);

    // Cheap bounding-box prefilter; exact distance + name check below.
    const candidates = await this.prisma.poi.findMany({
      where: {
        latitude: { gte: item.latitude - latDelta, lte: item.latitude + latDelta },
        longitude: {
          gte: item.longitude - lngDelta,
          lte: item.longitude + lngDelta,
        },
      },
      take: 25,
    });

    for (const candidate of candidates) {
      if (candidate.latitude == null || candidate.longitude == null) continue;
      const distance = this.distanceMeters(
        item.latitude,
        item.longitude,
        candidate.latitude,
        candidate.longitude,
      );
      if (distance > NEARBY_RADIUS_METERS) continue;
      if (!this.namesSimilar(candidate.name, item.name)) continue;
      return candidate;
    }
    return null;
  }

  /**
   * Enrich an existing POI with data from a duplicate sighting: only fills
   * fields the existing record lacks — never overwrites what another source
   * already provided — and bumps lastFetchedAt as a freshness signal.
   */
  private async mergeIntoExistingPoi(existing: Poi, item: IngestPoiInput) {
    const filled = {
      category: existing.category ?? item.category ?? null,
      address: existing.address ?? item.address ?? null,
      rating: existing.rating ?? item.rating ?? null,
    };
    const changed =
      filled.category !== existing.category ||
      filled.address !== existing.address ||
      filled.rating !== existing.rating;

    await this.prisma.poi.update({
      where: { id: existing.id },
      data: {
        ...(changed
          ? {
              ...filled,
              contentHash: this.hash(
                JSON.stringify({
                  regionId: existing.regionId,
                  name: existing.name,
                  category: filled.category,
                  address: filled.address,
                  rating: filled.rating,
                  reviewCount: existing.reviewCount,
                  latitude: existing.latitude,
                  longitude: existing.longitude,
                }),
              ),
            }
          : {}),
        lastFetchedAt: new Date(),
      },
    });

    this.logger.log(
      `POI dedupe: "${item.name}" (${item.source}) merged into existing "${existing.name}" (${existing.source}/${existing.sourceId})`,
    );
  }

  /**
   * Names count as similar when, after dropping parenthetical annotations,
   * punctuation and whitespace, one contains the other —
   * "清水寺(Kiyomizu-dera)" ⊇ "清水寺".
   */
  private namesSimilar(a: string, b: string) {
    const na = this.normalizeName(a);
    const nb = this.normalizeName(b);
    if (na.length < 2 || nb.length < 2) return false;
    return na.includes(nb) || nb.includes(na);
  }

  private normalizeName(name: string) {
    return name
      .toLowerCase()
      .replace(/[（(][^（）()]*[）)]/g, '') // drop "(...)" annotations
      .replace(/[^\p{L}\p{N}]+/gu, ''); // keep letters/digits only (CJK included)
  }

  /** Haversine great-circle distance in meters. */
  private distanceMeters(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ) {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const earthRadius = 6_371_000;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * earthRadius * Math.asin(Math.sqrt(h));
  }

  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }
}
