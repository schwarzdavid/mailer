# Contributing

This file covers working on the code: the local setup, the commands that keep the build green, and the CI and release pipeline. Installation, configuration and operations live on the documentation site at https://schwarzdavid.github.io/mailer/, and [`CLAUDE.md`](CLAUDE.md) describes the repository layout, the architecture and the testing conventions. How to build the documentation site and regenerate its screenshots is under [Documentation site](#documentation-site).

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

Every other variable, with its default, is described in the [environment reference](https://schwarzdavid.github.io/mailer/installation/advanced-configuration). Besides the required keys, the template points `SMTP_*` at MailHog and `IMAP_*` at GreenMail and departs from the defaults only where the local services need it: MailHog has no STARTTLS (`SMTP_REQUIRE_TLS=false`), GreenMail serves IMAP without TLS (`IMAP_SECURE=false`), the local domains never resolve (`SEND_REQUIRE_VALID_DNS=false`), and the backend logs at `debug`.

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

### 6. The JavaScript client

`packages/client-js` is the npm package `@schwarzdavid/mailer-client` (MIT, zero runtime dependencies). `tsdown` builds its single ESM entry point with its type declarations and `dist/client.iife.js`, the script the backend serves as `client.js`; the backend depends on the package. Under `NODE_ENV=production` the backend refuses to start without that bundle; elsewhere it starts with a warning and answers `client.js` with `404` until the bundle exists, so backend commands such as `pnpm --filter backend start:dev` also work on a fresh clone. The build needs nothing else from the workspace, so Turbo runs `@schwarzdavid/mailer-client#build` without dependencies (an explicit override in `turbo.json`, which avoids the cycle through `api#build` and `backend#generate`). The package depends on `api` only as a dev dependency, for the type test that keeps its request and response types equal to the backend's contract, so a changed DTO fails `pnpm typecheck` and `pnpm test` there. Under `pnpm dev` the package runs `tsdown --watch --no-clean`: the build that Turbo runs first leaves `dist/` complete, and the watcher only overwrites files, so `client.js` is never missing in between. Outside `NODE_ENV=production` the backend reads the bundle again for every request to `client.js`, so a rebuild is served without a restart (the response still allows the browser to cache it for a day, so reload without the cache); renamed chunks leave stale files in `dist/` that `pnpm build` clears. Work on it with:

```bash
pnpm build --filter @schwarzdavid/mailer-client
pnpm --filter @schwarzdavid/mailer-client test
pnpm --filter @schwarzdavid/mailer-client typecheck
```

### 7. Start the apps

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
pnpm --filter backend test:e2e    # backend e2e tests (needs Docker, uses Testcontainers, and the built client package: pnpm build --filter @schwarzdavid/mailer-client)
pnpm --filter frontend test:e2e   # full-stack Playwright tests (needs Docker; once: pnpm --filter frontend exec playwright install chromium)
pnpm check                        # lint + typecheck + test + format check
```

## Documentation site

The operator docs are the VitePress workspace `apps/docs`. Build them once; Turbo first builds the backend and generates the OpenAPI document and the list of environment variables the site reads:

```bash
pnpm build --filter docs   # output in apps/docs/.vitepress/dist
pnpm dev --filter docs     # http://localhost:5180/mailer/
pnpm --filter docs test
```

The build fails when `installation/advanced-configuration.md` misses a variable the backend or `compose.yml` reads or lists one that no longer exists, and when a page links to a page that does not exist. The installation page embeds `deploy/compose.yml`, `deploy/.env.example` and `deploy/setup.sh` at build time, so it always shows the files of the commit it was built from. The tests check that every page is in the sidebar exactly once and starts with a heading, that every referenced screenshot exists, and that the API reference has exactly one page per public tag (`public-send`, `public-form`).

The screenshots under `apps/docs/public/screenshots/` are taken from a real backend and admin UI with demo data. With Docker running, install the browser once and take them all:

```bash
pnpm --filter docs exec playwright install chromium
pnpm --filter docs screenshots
```

The run starts throwaway Postgres, Redis, MailHog and GreenMail containers, walks through the setup wizard, seeds the demo project **Acme Website** with the domain `mail.example.net` and overwrites the PNG files. Its build and server logs are in `apps/frontend/node_modules/.tmp/e2e/`.

## CI and release pipeline

`.github/workflows/ci.yml` runs on every push to `main`, on every pull request against `main` and when a GitHub release is published, in five jobs, the fifth (`npm-publish`, described below) only for a published release. `check` runs `pnpm check` (lint, typecheck, unit tests and the format check), `backend-e2e` builds the client package (the backend needs its `client.iife.js`) and runs `pnpm --filter backend test:e2e`, and `frontend-e2e` runs the Playwright suite (`pnpm --filter frontend test:e2e`) and uploads the Playwright report and the e2e logs as an artifact when it fails. The three jobs share the composite action `.github/actions/setup`, which installs the Node version pinned in the `Dockerfile` (`ARG NODE_VERSION`, the single place that names it), so CI and the image always run the same Node. The `image` job starts only after all three have passed. It builds the `backend` Docker target once, the only image, and runs the smoke test (`pnpm --filter e2e test:smoke`) against it (the stock Caddy and docker-mailserver images are pulled for the test). On pushes and pull requests it stops there and publishes nothing. For a published release it then pushes that same tested image to GHCR, tagged with the release version (`v1.4.0` becomes `1.4.0`, so release tags must be semver), `sha-<7-char sha>` and, unless the release is marked as a pre-release, `latest`.

A published release also publishes the client package to npm: the `npm-publish` job writes the release version into `packages/client-js`, drops its `devDependencies` (`pnpm pack` cannot resolve the unversioned `workspace:*` link to `api`) and publishes it with that version, under the dist-tag `next` for pre-releases and `latest` otherwise. Pushes and pull requests never publish. The package name `@schwarzdavid/mailer-client` is on the public npm registry, where the owner's user holds the `@schwarzdavid` scope.

Owner steps before the first release that publishes the package:

1. Publish a bootstrap version by hand, because npm can only attach a trusted publisher to a package that exists. Build the package (`pnpm build --filter @schwarzdavid/mailer-client`), then in `packages/client-js`, logged in to npm, run the job's own commands: `npm version 0.0.0-bootstrap.0 --no-git-tag-version`, `npm pkg delete devDependencies`, `pnpm pack`, `npm publish ./schwarzdavid-mailer-client-0.0.0-bootstrap.0.tgz --access public --tag bootstrap` and `npm deprecate @schwarzdavid/mailer-client@0.0.0-bootstrap.0 "Bootstrap release for trusted publishing; install a released version"`. Afterwards discard the local changes to `packages/client-js/package.json` and delete the tarball; never commit them. npm points `latest` at the only existing version, so `latest` names the bootstrap version until the first release that is not a pre-release.
2. On npmjs.com, open the package's settings and add a trusted publisher: GitHub Actions, repository `schwarzdavid/mailer`, workflow `ci.yml`. From then on the `npm-publish` job authenticates through OIDC and needs no stored npm token.

`.github/workflows/docs.yml` builds the documentation site (`apps/docs`) on every push and pull request to `main` and deploys it to GitHub Pages on pushes to `main`.

### Local smoke test

Build the backend image and run the stack from it. It needs Docker, Compose 2.23.1 or newer and openssl (on Windows, run it from Git Bash so that `openssl` is on `PATH`). The suite lives in the `e2e` workspace (`e2e/smoke/`).

```bash
docker build -t ghcr.io/schwarzdavid/mailer:local .
IMAGE_TAG=local pnpm --filter e2e test:smoke
```

The test starts a throwaway stack (compose project `mailer-smoke`, ports 18080, 18443 and 18025) with a throwaway CA for the mail certificate. It checks that the proxy is the stock Caddy image, routing (the SPA fallback, 404s for missing assets and unknown `/api` paths, `/docs` falling back to the SPA), caching and compression, security headers, JSON request logs whose `reqId` matches the `X-Request-Id` header, the login throttle, that `/api/health/ready` reports the missing mail server while `/api/health` stays up and turns `200` once `mail` is healthy, that the backend migrates the database when it starts, that a failing migration keeps it from serving until the migrations can run, and that `up -d` replaces it. On the mail side it checks authenticated submission with certificate verification against `MAIL_HOSTNAME` and spoof protection, that port 25 refuses to relay both from outside and from inside the Docker network, bounce ingestion end to end, that 587 and 143 are not published, recovery when the certificate appears after the first boot, and that a renewed certificate is served without a restart.

It removes everything afterwards, whether the run completes or fails. An interrupted run (Ctrl-C) keeps the stack: the next run removes it first, or remove it by hand with `docker compose -p mailer-smoke down -v --remove-orphans`. The proxy's failing attempt to get a Let's Encrypt certificate for the fake `mail.smoke.test` only adds log noise.
