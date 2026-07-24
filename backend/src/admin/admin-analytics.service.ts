import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  hostOverride,
  isHostBlocked,
  listCoversHost,
  STATIC_BLOCKED_HOSTS,
} from '../trip/host-policy';
import { HostPolicyService } from '../trip/host-policy.service';

type KeywordRow = {
  keyword: string;
  total: bigint;
  done: bigint;
  failed: bigint;
  avg_documents: number | null;
  last_at: Date;
};

type TrendRow = {
  day: Date;
  total: bigint;
  done: bigint;
  failed: bigint;
};

@Injectable()
export class AdminAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hostPolicy: HostPolicyService,
  ) {}

  /**
   * Keyword demand and reliability, derived from TripJob rather than
   * SearchKeywordLog: only TripJob records whether the request actually
   * produced an itinerary, which is what makes a content gap visible.
   */
  async keywords(days: number, limit: number) {
    const since = this.daysAgo(days);

    const rows = await this.prisma.$queryRaw<KeywordRow[]>`
      SELECT
        j.keyword,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE j.status = 'done') AS done,
        COUNT(*) FILTER (WHERE j.status = 'failed') AS failed,
        AVG(d.doc_count)::float AS avg_documents,
        MAX(j."createdAt") AS last_at
      FROM "TripJob" j
      LEFT JOIN (
        SELECT "jobId", COUNT(*) FILTER (WHERE status = 'fetched') AS doc_count
        FROM "TripDocument"
        GROUP BY "jobId"
      ) d ON d."jobId" = j.id
      WHERE j."createdAt" >= ${since}
      GROUP BY j.keyword
      ORDER BY total DESC, last_at DESC
      LIMIT ${limit}
    `;

    return rows.map((row) => {
      const total = Number(row.total);
      const done = Number(row.done);
      const failed = Number(row.failed);
      const finished = done + failed;
      return {
        keyword: row.keyword,
        total,
        done,
        failed,
        pending: total - finished,
        failureRate: finished ? failed / finished : null,
        avgDocuments: row.avg_documents,
        lastAt: row.last_at,
      };
    });
  }

  /** Daily job volume with the done/failed split, oldest day first. */
  async trend(days: number) {
    const since = this.daysAgo(days);

    const rows = await this.prisma.$queryRaw<TrendRow[]>`
      SELECT
        DATE_TRUNC('day', "createdAt") AS day,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'done') AS done,
        COUNT(*) FILTER (WHERE status = 'failed') AS failed
      FROM "TripJob"
      WHERE "createdAt" >= ${since}
      GROUP BY 1
      ORDER BY 1 ASC
    `;

    return rows.map((row) => ({
      day: row.day,
      total: Number(row.total),
      done: Number(row.done),
      failed: Number(row.failed),
    }));
  }

  /**
   * Keywords whose jobs finish but yield too few fetched documents — the
   * itinerary is thin rather than missing, so these never show up as failures.
   */
  async contentGaps(days: number, maxDocuments: number, limit: number) {
    const since = this.daysAgo(days);

    const rows = await this.prisma.$queryRaw<
      Array<{ keyword: string; jobs: bigint; avg_documents: number | null; last_at: Date }>
    >`
      SELECT
        j.keyword,
        COUNT(*) AS jobs,
        AVG(COALESCE(d.doc_count, 0))::float AS avg_documents,
        MAX(j."createdAt") AS last_at
      FROM "TripJob" j
      LEFT JOIN (
        SELECT "jobId", COUNT(*) FILTER (WHERE status = 'fetched') AS doc_count
        FROM "TripDocument"
        GROUP BY "jobId"
      ) d ON d."jobId" = j.id
      WHERE j."createdAt" >= ${since} AND j.status = 'done'
      GROUP BY j.keyword
      HAVING AVG(COALESCE(d.doc_count, 0)) <= ${maxDocuments}
      ORDER BY avg_documents ASC, jobs DESC
      LIMIT ${limit}
    `;

    return rows.map((row) => ({
      keyword: row.keyword,
      jobs: Number(row.jobs),
      avgDocuments: row.avg_documents,
      lastAt: row.last_at,
    }));
  }

  /** Hosts the crawler keeps hitting, with their success rate and policy. */
  async hosts(days: number, limit: number) {
    const since = this.daysAgo(days);
    const [policy, unreliableHosts] = await Promise.all([
      this.hostPolicy.getLists(),
      this.loadUnreliableHosts(),
    ]);
    const allowlist = new Set(policy.allowlist);
    const denylist = new Set(policy.denylist);

    const rows = await this.prisma.$queryRaw<
      Array<{ host: string; attempts: bigint; fetched: bigint }>
    >`
      SELECT
        regexp_replace(split_part(split_part(doc.url, '//', 2), '/', 1), '^www\.', '') AS host,
        COUNT(*) AS attempts,
        COUNT(*) FILTER (WHERE doc.status = 'fetched') AS fetched
      FROM "TripDocument" doc
      JOIN "TripJob" j ON j.id = doc."jobId"
      WHERE j."createdAt" >= ${since}
      GROUP BY 1
      HAVING COUNT(*) >= 3
      ORDER BY attempts DESC
      LIMIT ${limit}
    `;

    const seen = new Set<string>();
    const mapped = rows.map((row) => {
      const attempts = Number(row.attempts);
      const fetched = Number(row.fetched);
      // UI badge for this analytics window; crawl still uses loadUnreliableHosts.
      const autoBlocked = attempts >= 3 && fetched === 0;
      seen.add(row.host);
      return this.hostRow(row.host, {
        attempts,
        fetched,
        autoBlocked,
        policy,
        allowlist,
        denylist,
        unreliableHosts,
      });
    });

    // Surface manually listed hosts even when they have no recent crawl stats.
    for (const host of [...policy.allowlist, ...policy.denylist]) {
      if (seen.has(host)) continue;
      mapped.push(
        this.hostRow(host, {
          attempts: 0,
          fetched: 0,
          autoBlocked: false,
          policy,
          allowlist,
          denylist,
          unreliableHosts,
        }),
      );
      seen.add(host);
    }

    return mapped;
  }

  private hostRow(
    host: string,
    opts: {
      attempts: number;
      fetched: number;
      autoBlocked: boolean;
      policy: { allowlist: string[]; denylist: string[] };
      allowlist: Set<string>;
      denylist: Set<string>;
      unreliableHosts: Set<string>;
    },
  ) {
    const allowMatch = listCoversHost(host, opts.policy.allowlist);
    const denyMatch = listCoversHost(host, opts.policy.denylist);
    const staticBlocked = listCoversHost(host, STATIC_BLOCKED_HOSTS);
    return {
      host,
      attempts: opts.attempts,
      fetched: opts.fetched,
      successRate: opts.attempts ? opts.fetched / opts.attempts : 0,
      autoBlocked: opts.autoBlocked,
      override: hostOverride(host, opts.policy),
      allowMatch,
      denyMatch,
      staticBlocked,
      effectivelyBlocked: isHostBlocked(host, {
        allowlist: opts.allowlist,
        denylist: opts.denylist,
        unreliable: opts.unreliableHosts,
        staticBlocked: STATIC_BLOCKED_HOSTS,
      }),
    };
  }

  /**
   * Same window and rules as TripService.loadUnreliableHosts so the admin
   * “effectively blocked” flag matches crawl URL selection.
   */
  private async loadUnreliableHosts(): Promise<Set<string>> {
    try {
      const rows = await this.prisma.$queryRaw<Array<{ host: string }>>`
        SELECT regexp_replace(split_part(split_part(url, '//', 2), '/', 1), '^www\.', '') AS host
        FROM "TripDocument"
        WHERE "fetchedAt" >= NOW() - INTERVAL '30 days'
        GROUP BY 1
        HAVING COUNT(*) >= 3
           AND COUNT(*) FILTER (WHERE status = 'fetched') = 0
      `;
      return new Set(rows.map((row) => row.host));
    } catch {
      return new Set();
    }
  }

  /**
   * Affiliate CTA funnel: impressions → clicks → outbound redirects, broken
   * down by partner / category with a daily trend and recent event log.
   */
  async affiliate(days: number, recentLimit: number) {
    const since = this.daysAgo(days);

    const [totals, byPartner, byCategory, trend, recent] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{ event: string; count: bigint }>
      >`
        SELECT event, COUNT(*) AS count
        FROM "AffiliateEvent"
        WHERE "createdAt" >= ${since}
        GROUP BY event
      `,
      this.prisma.$queryRaw<
        Array<{
          partner: string;
          impressions: bigint;
          clicks: bigint;
          redirects: bigint;
        }>
      >`
        SELECT
          partner,
          COUNT(*) FILTER (WHERE event = 'cta_impression') AS impressions,
          COUNT(*) FILTER (WHERE event = 'cta_click') AS clicks,
          COUNT(*) FILTER (WHERE event = 'outbound_redirect') AS redirects
        FROM "AffiliateEvent"
        WHERE "createdAt" >= ${since}
        GROUP BY partner
        ORDER BY clicks DESC, impressions DESC
      `,
      this.prisma.$queryRaw<
        Array<{
          category: string;
          impressions: bigint;
          clicks: bigint;
          redirects: bigint;
        }>
      >`
        SELECT
          category,
          COUNT(*) FILTER (WHERE event = 'cta_impression') AS impressions,
          COUNT(*) FILTER (WHERE event = 'cta_click') AS clicks,
          COUNT(*) FILTER (WHERE event = 'outbound_redirect') AS redirects
        FROM "AffiliateEvent"
        WHERE "createdAt" >= ${since}
        GROUP BY category
        ORDER BY clicks DESC, impressions DESC
      `,
      this.prisma.$queryRaw<
        Array<{
          day: Date;
          impressions: bigint;
          clicks: bigint;
          redirects: bigint;
        }>
      >`
        SELECT
          DATE_TRUNC('day', "createdAt") AS day,
          COUNT(*) FILTER (WHERE event = 'cta_impression') AS impressions,
          COUNT(*) FILTER (WHERE event = 'cta_click') AS clicks,
          COUNT(*) FILTER (WHERE event = 'outbound_redirect') AS redirects
        FROM "AffiliateEvent"
        WHERE "createdAt" >= ${since}
        GROUP BY 1
        ORDER BY 1 ASC
      `,
      this.prisma.affiliateEvent.findMany({
        where: { createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take: recentLimit,
        select: {
          id: true,
          event: true,
          jobId: true,
          day: true,
          category: true,
          partner: true,
          label: true,
          createdAt: true,
          job: { select: { keyword: true } },
        },
      }),
    ]);

    const countByEvent = Object.fromEntries(
      totals.map((row) => [row.event, Number(row.count)]),
    ) as Record<string, number>;
    const impressions = countByEvent.cta_impression ?? 0;
    const clicks = countByEvent.cta_click ?? 0;
    const redirects = countByEvent.outbound_redirect ?? 0;

    const funnelRow = (impressionsN: number, clicksN: number, redirectsN: number) => ({
      impressions: impressionsN,
      clicks: clicksN,
      redirects: redirectsN,
      ctr: impressionsN ? clicksN / impressionsN : null,
      redirectRate: clicksN ? redirectsN / clicksN : null,
    });

    return {
      summary: funnelRow(impressions, clicks, redirects),
      byPartner: byPartner.map((row) => ({
        partner: row.partner,
        ...funnelRow(
          Number(row.impressions),
          Number(row.clicks),
          Number(row.redirects),
        ),
      })),
      byCategory: byCategory.map((row) => ({
        category: row.category,
        ...funnelRow(
          Number(row.impressions),
          Number(row.clicks),
          Number(row.redirects),
        ),
      })),
      trend: trend.map((row) => ({
        day: row.day,
        impressions: Number(row.impressions),
        clicks: Number(row.clicks),
        redirects: Number(row.redirects),
      })),
      recent: recent.map((row) => ({
        id: row.id,
        event: row.event,
        jobId: row.jobId,
        day: row.day,
        category: row.category,
        partner: row.partner,
        label: row.label,
        keyword: row.job?.keyword ?? null,
        createdAt: row.createdAt,
      })),
    };
  }

  private daysAgo(days: number) {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  }
}
