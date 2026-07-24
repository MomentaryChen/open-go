import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/server-api'

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
