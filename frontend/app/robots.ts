import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/server-api'

// SITE_URL is a runtime variable (docker-compose), so the sitemap URL must be
// resolved per request — statically prerendered robots would bake in the
// build-time fallback (localhost) and advertise a dead sitemap in production.
export const dynamic = 'force-dynamic'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Admin UI and the Next-side API proxy are noise to crawlers; trip pages
      // and the explore gallery stay open.
      disallow: ['/admin', '/api/'],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  }
}
