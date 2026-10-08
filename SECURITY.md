# Security

## Reporting a vulnerability

Report privately through [GitHub Security Advisories](https://github.com/MomentaryChen/open-go/security/advisories/new) for this repository. Please do not open a public issue for an unfixed vulnerability.

## What to know before you deploy

- Set `ADMIN_PASSWORD` before exposing the server. When it is unset, admin routes fail closed.
- `POST /trips` is public. Each accepted call can spend search and LLM quota. Keep `TRIP_CREATE_LIMIT` (default 5 per hour per client address) and set `TRIP_PUBLIC_CREATE=false` if the server should not accept new plans.
- The create limit and the job queue are per process. They reset on restart and are not shared across replicas.
- Do not commit `backend/.env` or `infra/.env`. Those files hold database URLs and API keys.
- Affiliate partner ids are public by design: they are copied into outbound URLs. The admin password is not.
