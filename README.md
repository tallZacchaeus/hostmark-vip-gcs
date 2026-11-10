# Hostmark — VIP Guest Coordination System (VIP GCS)

Coordinate VIP guests at a large event: guest intake, live flight tracking, transport, room allocation, a Co-Pilot assistant and room turnaround. Final-year Computer Science project.

**Docs:** [`docs/`](docs/) holds the six core documents: [PRD](docs/01-PRD.md), [TRD](docs/02-TRD.md) (stack, hosting), [App flow](docs/03-App-Flow.md), [UI/UX brief](docs/04-UI-UX-Design-Brief.md), [Schema & API](docs/05-Backend-Schema.md), [Implementation plan](docs/06-Implementation-Plan.md) (what is built). Testers start with the [tester guide](docs/07-Tester-Guide.md) (live test system: https://hostmark.tech, no demo data).

**Status:** P1–P7 are done (the Figma Make frontend "Hostmark", source in [`design/figma-make/`](design/figma-make/README.md); guest intake; flights and transport; room allocation; turnaround and cleaning; the event programme; the Co-Pilot with its offline engine). P8 evaluation and hardening is under way: the engineering items are done, the human ones (volunteer round, usability test, demo) are open. See the implementation plan.

**External services are optional.** Without keys the app makes no external calls: free text is read by offline rules instead of Claude, the registration form skips the Turnstile bot check (rate limits still apply), and live flight status is not polled (use simulated mode, or set landing times by hand). Without `RESEND_API_KEY` no email is sent (temporary passwords are shown on screen). Add `ANTHROPIC_API_KEY`, `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY`, `AERODATABOX_API_KEY` and `RESEND_API_KEY` with `MAIL_FROM` to the environment when you have them ([`docs/02-TRD.md` §4.5](docs/02-TRD.md)).

## Local development

Requirements: Node 22.12+, pnpm 11. Docker is optional.

**Quickest (no Docker):** an in-process PGlite database with demo data starting today.

```bash
pnpm install
pnpm local:setup                     # creates .env.local and .pglite/dev (demo venue, 6 delegations, 3 registrations to review, trips and driver suggestions, a room plan to approve), prints the accounts and password
                                     # --reset starts over
pnpm dev                             # or: pnpm build && pnpm start   → http://localhost:3000
```

**With Docker Postgres:**

```bash
pnpm install
cp .env.example .env.local          # then replace every "change-me" (openssl rand -hex 32)
pnpm db:up                           # Postgres 18 on 127.0.0.1:5433
pnpm db:migrate                      # apply db/migrations
pnpm db:seed                         # demo event, 120 rooms, 15 drivers, one account per role (prints the password)
pnpm dev                             # http://localhost:3000
```

| Command | What it does |
|---|---|
| `pnpm test` / `pnpm test:ui` / `pnpm test:db` / `pnpm test:integration` | Unit / components (jsdom) / SQL (RLS per role) / API end-to-end tests — no Docker needed |
| `pnpm test:all` · `pnpm vitest run --coverage` | Everything · with coverage (threshold 80%) |
| `pnpm typecheck` · `pnpm lint` · `pnpm build` | Type check · ESLint · production build |
| `pnpm db:types` | Regenerate `lib/db/types.ts` from the migrations |
| `pnpm eval:build` · `pnpm eval:intake` | Rebuild the labelled intake set · score the intake pipeline (offline; `-- --reader claude` with a key) |
| `pnpm eval:cascade` | Transport cascade on a synthetic day: latency p50/p95, proposal feasibility, approvals (`-- --flights N --drivers N --updates N --seed N`) |
| `pnpm eval:allocation` | Room allocator on synthetic venues: hard-rule satisfaction (independently checked), preference % vs the first-free-room baseline, runtime (`-- --seeds N --seed N`) |
| `pnpm eval:cleaning` · `pnpm eval:copilot` | Turnaround flow and ready-time estimate error · Co-Pilot answers, actions and safety probes on the demo seed |
| `pnpm eval:all` | Runs all five evaluations in turn and writes their summaries to `eval/results/summary.md` (stops at the first failure) |
| `pnpm worker` | Background worker as its own process (when the app runs with `WORKER_MODE=off`; by default the app server runs it) |
| `pnpm admin:create --email … --name …` | Create a Super Admin (prints a one-time password) |

## Using the API from the frontend

1. **Sign in:** `POST /api/auth/sign-in/email` with `{ "email", "password" }`. Same-origin pages get a session cookie; a frontend on another origin reads the `set-auth-token` response header and sends `Authorization: Bearer <token>` (add its origin to `API_ALLOWED_ORIGINS`).
2. **Who am I:** `GET /api/me`. If `must_change_password` is true, show the change-password screen (`POST /api/account/password`).
3. **Responses** are always `{ "success", "data", "error", "meta"? }` with a stable `error.code`.
4. **Live updates:** `GET /api/notifications/stream` (Server-Sent Events).

Full endpoint list: [`docs/05-Backend-Schema.md` §7](docs/05-Backend-Schema.md).

## Hosting

Production runs on **Vercel** (the app) and **Supabase** (Postgres), both in London: [`docs/02-TRD.md` §5.2](docs/02-TRD.md).

| Command | What it does |
|---|---|
| `bash scripts/hosted-setup.sh --seed` | First deploy from `.env.deploy.local`: migrations, demo data, Vercel project and its variables, production deploy |
| `pnpm hosted:migrate && vercel deploy --prod` | Later deploys |
| `pnpm hosted:admin --email … --name …` | Create a Super Admin on the hosted database |

A second copy runs on a **1 GB DigitalOcean droplet at https://hostmark.tech** (Docker Compose: Caddy, app, Postgres; nightly database dumps): [`docs/02-TRD.md` §5.1](docs/02-TRD.md).

| Command | What it does |
|---|---|
| `bash scripts/droplet-deploy.sh` | Build the app image here, load it on the droplet, copy the Compose files, migrations and the settings in `.env.droplet.local`, restart (migrations run first) |
| `bash scripts/droplet-deploy.sh --settings-only` | Only copy `.env.droplet.local` to the droplet and restart (seconds; e.g. after adding `RESEND_API_KEY`) |
| `bash scripts/droplet-admin.sh --email … --name …` | Create a Super Admin on the droplet (prints a one-time password in your terminal) |
