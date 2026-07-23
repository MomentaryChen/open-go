import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RegionsService {
  constructor(private readonly prisma: PrismaService) {}

  async search(query?: string) {
    const keyword = query?.trim();

    if (!keyword) {
      return this.prisma.region.findMany({
        orderBy: { name: 'asc' },
        take: 20,
      });
    }

    await this.prisma.searchKeywordLog.create({
      data: { keyword },
    });

    return this.prisma.region.findMany({
      where: {
        name: {
          contains: keyword,
          mode: 'insensitive',
        },
      },
      orderBy: { name: 'asc' },
      take: 20,
    });
  }

  async listPois(regionId: string) {
    return this.prisma.poi.findMany({
      where: { regionId },
      orderBy: [{ rating: 'desc' }, { reviewCount: 'desc' }],
      include: {
        reviewLinks: {
          select: {
            platform: true,
            url: true,
            generatedAt: true,
          },
          orderBy: { platform: 'asc' },
        },
      },
      take: 50,
    });
  }

  async listRecommendations(regionId: string) {
    const pois = await this.prisma.poi.findMany({
      where: { regionId },
      take: 50,
    });

    return pois
      .map((poi) => {
        const ratingScore = Math.min((poi.rating ?? 0) / 5, 1) * 0.6;
        const reviewScore = Math.min(poi.reviewCount / 500, 1) * 0.4;
        return {
          ...poi,
          recommendationScore: Number((ratingScore + reviewScore).toFixed(3)),
        };
      })
      .sort((a, b) => b.recommendationScore - a.recommendationScore)
      .slice(0, 20);
  }

  async listCategoryStats(regionId: string) {
    const grouped = await this.prisma.poi.groupBy({
      by: ['category'],
      where: { regionId },
      _count: { _all: true },
      orderBy: [{ _count: { category: 'desc' } }, { category: 'asc' }],
    });

    const categories = grouped.map((item) => ({
      category: item.category ?? 'uncategorized',
      count: item._count._all,
    }));

    const total = categories.reduce((sum, item) => sum + item.count, 0);
    return { regionId, total, categories };
  }
}
