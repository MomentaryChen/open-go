/**
 * Base URL for calling the NestJS backend from the Next server (route
 * handlers, server components, generateMetadata).
 *
 * In docker the browser-facing NEXT_PUBLIC_API_BASE_URL points at the host
 * port, which is unreachable from inside the frontend container, so the
 * service-DNS BACKEND_INTERNAL_URL takes precedence.
 * `||` rather than `??`: docker-compose passes unset variables through as "".
 */
export function serverApiBaseUrl() {
  return (
    process.env.BACKEND_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    'http://localhost:33000'
  )
}

/**
 * Absolute origin this app is served from, used to resolve the relative URLs
 * in page metadata (Open Graph needs absolute ones). Set SITE_URL in
 * production or shared-link previews will advertise localhost.
 *
 * Deliberately not NEXT_PUBLIC_*: those are inlined at build time, so a value
 * supplied by docker-compose at runtime would be ignored. This is only ever
 * read on the server, so a plain variable is both correct and configurable.
 */
export function siteUrl() {
  return process.env.SITE_URL || 'http://localhost:3000'
}
