# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Added top-N failure-reason aggregation on `/admin/keywords`: `GET /ops/analytics/failure-reasons` groups failed `TripJob.error` strings (exact match) so operators can see clusters like search blocked, empty crawl, or LLM timeouts without a new taxonomy table.

### Fixed
- Fixed admin keyword analytics (`/admin/keywords`) failing to load: the host stats query joined `TripDocument` and `TripJob` without qualifying `status` / `url`, so PostgreSQL rejected the ambiguous column reference and the page's parallel fetch aborted.

### Added
- Added affiliate conversion CTAs on finished itineraries: overnight `stay` blocks link to Booking / Agoda / Google Hotels (with lat-lng radius when coordinates exist), and attraction stops offer Klook / KKday ticket searches with a destination hot-ticket fallback.
- Added affiliate funnel tracking (`cta_impression`, `cta_click`, `outbound_redirect`) persisted to an `AffiliateEvent` table via `POST /affiliate/events`, mirrored to Vercel Analytics, and summarized in the admin console at `/admin/affiliate` (`GET /ops/analytics/affiliate`).
- Added a keyword-driven AI trip planning pipeline: `POST /trips` decomposes a keyword into search queries with Claude, collects 30 web pages, stores their extracted text, and composes a structured day-by-day itinerary that cites its sources.
- Added a pluggable LLM layer for the trip pipeline: `TRIP_LLM_PROVIDER` selects Gemini (default) or Claude, and `TRIP_MODEL` overrides the model; both steps share one schema-validated interface.
- Added headless-Chromium (Playwright) Google search for the pipeline, since Google now serves a JavaScript-only shell to plain HTTP clients; article bodies are still fetched over plain HTTP, and `lite.duckduckgo.com` remains the automatic fallback.
- Added `GET /trips/:id`, `GET /trips/:id/documents`, and a `GET /trips/:id/stream` Server-Sent Events feed reporting live pipeline progress.
- Added `TripJob`, `TripQuery`, `TripDocument`, and `TripItinerary` tables backing the trip pipeline.
- Added a `/trip` frontend page with a live progress tracker and an itinerary timeline view, linked from the home page.
- Made the AI trip planner the home page (`/`) as the sole public-facing entry; `/trip` now redirects to `/`, and the former discovery/search home page is no longer routed (its components remain in the repo).
- Added a job-level cache to `POST /trips`: a finished job for the same keyword within `TRIP_CACHE_TTL_DAYS` (default 7, 0 disables) is returned as `cached: true` instead of re-running the pipeline; `forceRefresh: true` bypasses it, and the `/trip` page shows a cache notice with a re-generate button.
- Added a document-level cache to the trip crawler: URLs already fetched by any job within `TRIP_CACHE_TTL_DAYS` reuse the stored content (keeping the original fetch time) and skip the crawler, so overlapping keywords only pay for pages no job has seen.
- Added host-reputation filtering to trip search: a static blocklist of never-fetchable hosts (Facebook, YouTube, Instagram, …) plus hosts the crawler failed on 3+ times in 30 days with zero successes are skipped when selecting URLs, so all document slots go to fetchable pages (crawl history showed 5–9 of 30 slots were wasted per job).
- Log every non-empty `GET /regions/search?q=` keyword into a new `SearchKeywordLog` table.
- Added backend automation module with two scheduled jobs: attraction discovery from web sources and external review-link generation for POIs.
- Added `POST /automation/discover-region` to manually trigger region-based attraction discovery (for example `Japan Osaka`) and persist new POIs when missing.

### Changed
- Changed the backend Docker image base from `node:20-alpine` to `node:22-bookworm-slim` and added a Chromium install step, because Playwright's Chromium build is glibc-only and pnpm 11 requires Node 22.
- Added `openssl` to both Docker stages so Prisma selects the OpenSSL 3 query engine instead of falling back to an unloadable 1.1.x build.
- Pinned `packageManager` to `pnpm@11.0.8` so Corepack stops resolving a newer pnpm inside Docker than the one used locally.
- Changed the backend container start command and `docker:migrate` to call the Prisma binary directly instead of going through pnpm, so starting a container no longer re-verifies the dependency tree or downloads a package manager.
- Changed backend startup flow to support full automatic migration: backend now can run `prisma migrate deploy` before app startup in both local scripts and Docker Compose.
- Added migration utility scripts (`db:migrate:deploy`, `db:migrate:status`) and a default local startup command (`pnpm dev:backend:auto`) that applies migrations automatically.
- Changed discovery ingestion to persist multiple categories (`attraction`, `food`, `shopping`, `cafe`, `hotel`) so frontend can filter POIs by category.
- Added `GET /regions/:id/categories` to return per-category POI counts for frontend filter tabs/badges.
- Update `docker:all` to run Prisma migrations automatically via `docker:migrate` after containers are up.
- Changed Docker Compose restart policy for `postgres`, `backend`, and `frontend` from `unless-stopped` to `no` so containers no longer auto-start with the Docker daemon.
