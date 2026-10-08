# Contributing

open-go is a pnpm workspace: `backend` (NestJS) and `frontend` (Next.js).

## Setup

```bash
pnpm install
cp backend/.env.example backend/.env
pnpm --filter backend prisma:migrate
pnpm --filter backend seed
```

Start the apps:

```bash
pnpm dev:backend:auto
pnpm dev:frontend
```

Set `TRIP_DEMO_MODE=true` in `backend/.env` to exercise the planner without an LLM key or web search. Docker setup is in the README.

## Checks

```bash
pnpm --filter backend test
pnpm --filter backend exec -- tsc --noEmit
pnpm --filter ./frontend exec -- tsc --noEmit
```

CI runs those, plus `docker compose -f infra/docker-compose.yml config`.

## Scope

The public product is the keyword trip planner (`POST /trips`, `/`, `/explore`) and the admin console. Region discovery and the scheduled Wikipedia sync are a separate ingestion path; change them only when the task is about that path.

The trip queue, the public create counter, and the Google-block backoff all live in one backend process. A second replica does not share them.

## Pull requests

Branch from `develop`. Write user-facing copy and docs in English, except `README.zh-TW.md` and the locale dictionaries. Do not commit `.env` files or API keys.
