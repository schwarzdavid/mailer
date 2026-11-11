# Contributing

This file covers working on the code: the local setup, the commands that keep the build green, and the CI and release pipeline. Installation, configuration and operations live on the documentation site at https://schwarzdavid.github.io/mailer/, and [`CLAUDE.md`](CLAUDE.md) describes the repository layout, the architecture and the testing conventions. How to build the documentation site and regenerate its screenshots is on its [Development](https://schwarzdavid.github.io/mailer/reference/development) page.

## Local setup

### Prerequisites

- Node.js `^22.18.0` or `>=24.12.0`
- pnpm (the exact version is pinned in `package.json` under `packageManager`; `corepack enable` picks it up)
- Docker with Docker Compose

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure the environment

Copy the template to a root `.env`. It holds only the required keys and the values where local development differs from the backend's defaults (`apps/backend/src/config/env.schema.ts`); together they already match the local Docker services.

```bash
cp .env.example .env
```

Change `BACKEND_JWT_SECRET` and `BACKEND_ENCRYPTION_SECRET` to any non-trivial values of at least 32 characters. The encryption secret encrypts stored secrets at rest (DKIM private keys and reCAPTCHA secrets), so if you change it later, they can no longer be decrypted.

Every other variable, with its default, is described in the [environment reference](https://schwarzdavid.github.io/mailer/configuration/environment). Besides the required keys, the template points `SMTP_*` at MailHog and `IMAP_*` at GreenMail and departs from the defaults only where the local services need it: MailHog has no STARTTLS (`SMTP_REQUIRE_TLS=false`), GreenMail serves IMAP without TLS (`IMAP_SECURE=false`), the local domains never resolve (`SEND_REQUIRE_VALID_DNS=false`), and the backend logs at `debug`.

### 3. Start the infrastructure

```bash
docker compose up -d
```

| Service    | Purpose                            | Ports                                           |
| ---------- | ---------------------------------- | ----------------------------------------------- |
| PostgreSQL | Main database                      | `5432`                                          |
| Redis      | Cache, rate limits, delivery queue | `6379`                                          |
| MailHog    | Catches all outgoing mail          | SMTP `1025`, web UI http://localhost:8025       |
| GreenMail  | Bounce mailbox                     | SMTP `3025` (inject DSNs), IMAP `3143` (polled) |

### 4. Database migrations

The backend applies pending migrations itself every time it starts, under `pnpm dev` as well, and refuses to start if one of them fails. Each run is a single transaction, so a failed run leaves the database as it was.

Migrations are recorded in the `SequelizeMeta` table without a file extension. If your dev database was already migrated by an earlier version, it still holds `.ts`-suffixed names. Convert them once **before** the backend starts, otherwise every migration would run again and fail (a fresh database needs no rename):

```sql
UPDATE "SequelizeMeta" SET name = regexp_replace(name, '\.ts$', '');
```

To apply them without starting the backend, or to inspect and revert them, use the migration CLI (`up | down | pending | executed`):

```bash
pnpm --filter backend migrate up
```

### 5. The API client

The OpenAPI spec (`apps/backend/openapi.json`) and the generated client (`packages/api/dist`) are not committed. Neither needs a database or Redis: the backend's `generate` task writes the spec from the compiled backend in Nest's preview mode, without booting the app, and `packages/api` builds the client from it. `pnpm dev` and `pnpm build` both run these steps first, so a fresh clone needs no extra step. Under `pnpm dev` the client is regenerated whenever the backend is rebuilt. Without `pnpm dev`, regenerate it with:

```bash
pnpm build --filter api
```

### 6. Start the apps

```bash
pnpm dev
```

- Frontend: http://localhost:5173 (proxies `/api` to the backend)
- Backend API: http://localhost:8000/api
- Swagger UI: http://localhost:8000/docs (mounted only when `NODE_ENV` is not `production`)

On first start the frontend sends you to the onboarding wizard. There you create the first (Super Admin) user, which needs the setup token that the backend prints to its log on start while no user exists (`Setup token: …`), and then see the DNS records of the platform sending domain, which the backend created from `MAIL_HOSTNAME` and `MAIL_SERVER_IPV4` in `.env` (`mail.example.com` and `203.0.113.10` in the template). Locally, the DNS records will stay "pending", which is expected.

## Useful commands

```bash
pnpm lint                         # ESLint (+ oxlint in the frontend)
pnpm typecheck                    # tsc / vue-tsc
pnpm test                         # unit tests across all workspaces
pnpm --filter backend test:e2e    # backend e2e tests (needs Docker, uses Testcontainers)
pnpm --filter frontend test:e2e   # full-stack Playwright tests (needs Docker; once: pnpm --filter frontend exec playwright install chromium)
pnpm check                        # lint + typecheck + test + format check
```

## CI and release pipeline

`.github/workflows/ci.yml` runs on every push to `main`, on every pull request against `main` and when a GitHub release is published, in four jobs. `check` runs `pnpm check` (lint, typecheck, unit tests and the format check), `backend-e2e` runs `pnpm --filter backend test:e2e`, and `frontend-e2e` runs the Playwright suite (`pnpm --filter frontend test:e2e`) and uploads the Playwright report and the e2e logs as an artifact when it fails. The three jobs share the composite action `.github/actions/setup`, which installs the Node version pinned in the `Dockerfile` (`ARG NODE_VERSION`, the single place that names it), so CI and the image always run the same Node. The `image` job starts only after all three have passed. It builds the `backend` Docker target once, the only image, and runs the smoke test (`pnpm --filter e2e test:smoke`) against it (the stock Caddy and docker-mailserver images are pulled for the test). On pushes and pull requests it stops there and publishes nothing. For a published release it then pushes that same tested image to GHCR, tagged with the release version (`v1.4.0` becomes `1.4.0`, so release tags must be semver), `sha-<7-char sha>` and, unless the release is marked as a pre-release, `latest`.

`.github/workflows/docs.yml` builds the documentation site (`apps/docs`) on every push and pull request to `main` and deploys it to GitHub Pages on pushes to `main`.

### Local smoke test

Build the backend image and run the stack from it. It needs Docker, Compose 2.23.1 or newer and openssl (on Windows, run it from Git Bash so that `openssl` is on `PATH`). The suite lives in the `e2e` workspace (`e2e/smoke/`).

```bash
docker build -t ghcr.io/schwarzdavid/mailer:local .
IMAGE_TAG=local pnpm --filter e2e test:smoke
```

The test starts a throwaway stack (compose project `mailer-smoke`, ports 18080, 18443 and 18025) with a throwaway CA for the mail certificate. It checks that the proxy is the stock Caddy image, routing (the SPA fallback, 404s for missing assets and unknown `/api` paths, `/docs` falling back to the SPA), caching and compression, security headers, JSON request logs whose `reqId` matches the `X-Request-Id` header, the login throttle, that `/api/health/ready` reports the missing mail server while `/api/health` stays up and turns `200` once `mail` is healthy, that the backend migrates the database when it starts, that a failing migration keeps it from serving until the migrations can run, and that `up -d` replaces it. On the mail side it checks authenticated submission with certificate verification against `MAIL_HOSTNAME` and spoof protection, that port 25 refuses to relay both from outside and from inside the Docker network, bounce ingestion end to end, that 587 and 143 are not published, recovery when the certificate appears after the first boot, and that a renewed certificate is served without a restart.

It removes everything afterwards, whether the run completes or fails. An interrupted run (Ctrl-C) keeps the stack: the next run removes it first, or remove it by hand with `docker compose -p mailer-smoke down -v --remove-orphans`. The proxy's failing attempt to get a Let's Encrypt certificate for the fake `mail.smoke.test` only adds log noise.
