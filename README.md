# go-one

Taiwan-first travel aggregation MVP.

## Stack

- Backend: Node.js + NestJS + Prisma + PostgreSQL
- Frontend: React + Vite
- Workspace: pnpm

## Quick start

1. Install dependencies

```bash
pnpm install
```

2. Configure database

```bash
copy backend/.env.example backend/.env
```

3. Run migration and seed

```bash
pnpm --filter backend prisma:migrate
pnpm --filter backend seed
```

4. (Optional) Validate non-duplicate ingestion flow

```bash
pnpm --filter backend ingest:demo
```

Expected output should include:

- `first: "created"`
- `second: "skipped"`
- `third: "updated"`

5. Start apps

```bash
pnpm dev:backend:auto
pnpm dev:frontend
```

## API

- `GET /regions/search?q=台北`
- `GET /regions/search?q=<keyword>` logs each non-empty keyword into `SearchKeywordLog`
- `GET /regions/:id/pois`
- `GET /regions/:id/recommendations`
- `GET /regions/:id/categories`
- `POST /ingestion/cache-check`
- `POST /ingestion/pois`
- `POST /automation/discover-region` (manual region discovery trigger)
- `POST /trips` → `{ jobId }` (start a keyword-driven itinerary job)
- `GET /trips/:id` (job status, queries and itinerary)
- `GET /trips/:id/stream` (Server-Sent Events progress feed)
- `GET /trips/:id/documents` (crawled source documents)

## AI trip planning

`POST /trips` runs an asynchronous pipeline for a single keyword:

1. **planning** — Claude splits the keyword into 6–10 search queries across attraction / food / transport / accommodation / itinerary intents, in mixed languages.
2. **searching** — each query is run against a web search engine; results are de-duplicated and capped at 3 per host until 30 URLs are collected.
3. **crawling** — the 30 pages are fetched (5 at a time), boilerplate is stripped, and body text is stored in `TripDocument`.
4. **composing** — Claude reads the crawled corpus and returns a structured day-by-day itinerary, where every item cites the source URLs it came from.

Progress is pushed over SSE, so the frontend page at `/trip` shows each stage live.

Both LLM steps go through one `StructuredLlm` interface (`src/trip/llm/`), so the provider is
a configuration choice rather than a code change: a zod schema defines the expected shape, and
each adapter enforces it its own way — Gemini via `responseJsonSchema` plus a `safeParse` on
the reply, Claude via the SDK's structured-output helper. The active provider and model are
logged at startup (`Trip LLM: provider=… model=…`).

### Search source

Google no longer renders results for plain HTTP clients — `google.com/search` returns a
JavaScript-only shell that redirects non-JS clients to `/httpservice/retry/enablejs`, so
`fetch` + an HTML parser can never see a result. Search is therefore driven by a headless
Chromium (Playwright) that executes the page and reads the rendered links; only this step
uses a browser, article bodies are still fetched with plain HTTP.

Two launch details are load-bearing — changing either makes Google serve its "unusual
traffic" bot check instead of results:

- `channel: 'chromium'` — the full new-headless Chromium, not Playwright's default headless
  shell, whose fingerprint Google rejects.
- `--disable-blink-features=AutomationControlled` plus the `navigator.webdriver` patch in
  `GoogleSearchProvider`.

If Google still blocks (or `TRIP_SEARCH_BROWSER=false`), the pipeline falls back to
`lite.duckduckgo.com`, which returns server-rendered HTML, and says so in the job's
progress message.

The backend image installs Chromium via `npx playwright install --with-deps chromium`, which
is why it is Debian-based rather than Alpine — Playwright's Chromium build is glibc-only.

Required environment variables (backend):

| Variable | Default | Purpose |
| --- | --- | --- |
| `TRIP_LLM_PROVIDER` | `gemini` | `gemini` or `anthropic`. Selects which SDK runs both LLM steps. |
| `TRIP_MODEL` | per provider | Overrides the model. Defaults: `gemini-2.5-flash` / `claude-opus-4-8`. |
| `GEMINI_API_KEY` | — | Required when the provider is `gemini` (`GOOGLE_API_KEY` also accepted). |
| `ANTHROPIC_API_KEY` | — | Required when the provider is `anthropic`. |
| `TRIP_TARGET_DOCUMENTS` | `30` | How many pages to collect and crawl per job. |
| `TRIP_CRAWL_CONCURRENCY` | `5` | Parallel page fetches. |
| `TRIP_SEARCH_BROWSER` | `true` | Set `false` to skip Chromium and use the fallback engine only. |
| `TRIP_BROWSER_HEADLESS` | `true` | Set `false` to watch the search browser while debugging. |

Example:

```bash
curl -X POST http://localhost:33000/trips \
  -H "Content-Type: application/json" \
  -d "{\"keyword\":\"大阪三天兩夜自由行\"}"

curl -N http://localhost:33000/trips/<jobId>/stream
```

## Background automation

Backend now includes two scheduled jobs:

1. **Attraction discovery sync** (every 30 minutes)
   - Pulls category-based candidates from Wikipedia by region query.
   - Writes new POIs to DB and updates existing ones through the ingestion pipeline.
   - Categories include `attraction`, `food`, `shopping`, `cafe`, and `hotel` for frontend filtering.
2. **External review-link sync** (every 45 minutes)
   - Generates outbound review links for each POI (Google Maps, TripAdvisor, Booking).
   - Stores links only; review text is not scraped or persisted.

Manual trigger example:

```bash
curl -X POST http://localhost:33000/automation/discover-region \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"Japan Osaka\"}"
```

## Docker

Backend container startup is migration-aware by default:

- Runs `prisma migrate deploy` before starting NestJS.
- Migration history is automatically tracked in Prisma's `_prisma_migrations` table.

The backend image is Debian-based (not Alpine) and installs Chromium, because the trip
pipeline reads Google's JS-rendered results through Playwright. It also sets
`shm_size: 1gb`, without which Chromium crashes on the container default of 64MB.

Build images:

```bash
pnpm docker:build
```

Build + start + print endpoints:

```powershell
powershell -ExecutionPolicy Bypass -File .\infra\build-images.ps1
```

Run all services (postgres + backend + frontend):

```bash
pnpm docker:up
```

Stop:

```bash
pnpm docker:down
```

Host ports:

- Frontend: `35173`
- Backend API: `33000`
- Postgres: `35432`
