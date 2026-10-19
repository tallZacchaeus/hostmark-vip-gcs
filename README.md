# VIP Guest Coordination System (VIP GCS)

Coordinate VIP guests at a large event: guest intake, live flight tracking, transport, room allocation, a Co-Pilot assistant and room turnaround. Final-year Computer Science project.

**Docs:** [`docs/`](docs/) holds the six core documents: [PRD](docs/01-PRD.md), [TRD](docs/02-TRD.md) (stack, hosting), [App flow](docs/03-App-Flow.md), [UI/UX brief](docs/04-UI-UX-Design-Brief.md), [Schema & API](docs/05-Backend-Schema.md), [Implementation plan](docs/06-Implementation-Plan.md) (what is built).

**Status:** P1 backend (accounts, roles, event and venue setup, audit + undo, notifications, decisions queue) is built and tested. The frontend is being designed in Figma Make.

## Local development

Requirements: Node 22.12+, pnpm 11, Docker (for the local Postgres only).

```bash
pnpm install
cp .env.example .env.local          # then replace every "change-me" (openssl rand -hex 32)
pnpm db:up                           # Postgres 18 on 127.0.0.1:5433
pnpm db:migrate                      # apply db/migrations
pnpm db:seed                         # demo event, 126 rooms, 15 drivers, one account per role (prints the password)
pnpm dev                             # http://localhost:3000
```

| Command | What it does |
|---|---|
| `pnpm test` / `pnpm test:db` / `pnpm test:integration` | Unit / SQL (RLS per role) / API end-to-end tests — no Docker needed |
| `pnpm test:all` · `pnpm vitest run --coverage` | Everything · with coverage (threshold 80%) |
| `pnpm typecheck` · `pnpm build` | Type check · production build |
| `pnpm db:types` | Regenerate `lib/db/types.ts` from the migrations |
| `pnpm admin:create --email … --name …` | Create a Super Admin (prints a one-time password) |

## Using the API from the frontend

1. **Sign in:** `POST /api/auth/sign-in/email` with `{ "email", "password" }`. Same-origin pages get a session cookie; a frontend on another origin reads the `set-auth-token` response header and sends `Authorization: Bearer <token>` (add its origin to `API_ALLOWED_ORIGINS`).
2. **Who am I:** `GET /api/me`. If `must_change_password` is true, show the change-password screen (`POST /api/account/password`).
3. **Responses** are always `{ "success", "data", "error", "meta"? }` with a stable `error.code`.
4. **Live updates:** `GET /api/notifications/stream` (Server-Sent Events).

Full endpoint list: [`docs/05-Backend-Schema.md` §7](docs/05-Backend-Schema.md). Deployment to the droplet: [`docs/02-TRD.md` §5](docs/02-TRD.md).
