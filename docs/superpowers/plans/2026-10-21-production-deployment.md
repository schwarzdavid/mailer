# Production Deployment (Images, Compose on a VPS, Mail Server, CI) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One `docker compose up -d` on a VPS runs the whole product, including its own mail server, behind automatic TLS. It runs migrations as a one-shot step before the backend starts. GitHub Actions gates every change and publishes the images.

**Architecture:**

- One root `Dockerfile` with a shared `build` stage. It runs a pnpm install and `turbo run build --filter=frontend`, which builds backend → `backend#generate` → `api#build` → frontend. Two final targets come out of it:
    - `backend`: `node:24-slim` running `node dist/main.js`, from `pnpm deploy --prod`.
    - `web`: Caddy serving the SPA and proxying `/api/*` to the backend.
- `deploy/compose.yml` wires `postgres`, `redis`, a one-shot `migrate` (the backend image running `node dist/migrate.js up`), `backend`, `web` and `mail`.
    - `mail` is docker-mailserver (Postfix + Dovecot). Postfix queues and delivers the mail the backend submits. It receives bounces for `bounce@<MAIL_HOSTNAME>`, and Dovecot serves them over IMAP to the existing bounce poller.
    - Only `web` (80/443) and `mail` (25) publish ports.
- `.github/workflows/ci.yml` runs the full gate, the backend e2e, Playwright, and an image build plus smoke test. On `main` it pushes both images to GHCR.

**Tech Stack:** Docker BuildKit, pnpm 11 (`fetch`, `deploy --legacy`), Turborepo 2, Caddy 2, docker-mailserver 15, Docker Compose v2, GitHub Actions, GHCR.

**Spec:** No separate spec document. The requirements are items 6–9 of Phase 1 in the go-live plan of 2026-10-21 (chat), plus the owner's decisions of 2026-10-21/22:

- Docker Compose on a single VPS.
- GitHub Actions for CI.
- The mail server runs in the same compose stack, using docker-mailserver. The backend does not deliver mail itself.

All three are fixed in Global Constraints.

## Global Constraints

**Process rules**

- **Never touch git** (CLAUDE.md). There are no commit steps.
- **No comments** in code or config. The existing _why_-comments set the bar, and comment-free JSON/YAML is the default (memory: no comments in config files).
- Every task ends with `pnpm lint`, `pnpm typecheck` and `pnpm format` green.
- **Don't disturb the owner's dev stack.**
    - Every compose run in this plan uses the project name `mailer-smoke` and the ports `18080`/`18443`/`18025`, and ends with `down -v`.
    - Never use the dev compose project, never touch the dev volumes, never read or write the root `.env`.

**Versions and images**

- **Node:** major `24`, in exactly two places: `.node-version` (`24`) and `ARG NODE_VERSION=24` in the Dockerfile.
- **pnpm:** comes from `packageManager` (`pnpm@11.9.0`) via corepack. It is never pinned a second time.
- **Image names:** `ghcr.io/schwarzdavid/mailer-backend` and `ghcr.io/schwarzdavid/mailer-web`.
    - Tags: `latest` and `sha-<7-char sha>` on `main`.
    - Compose selects the tag with `IMAGE_TAG`, default `latest`.

**Verified facts**

- **pnpm deploy (verified 2026-10-21 in a scratch clone):**
    - `pnpm --filter backend deploy --prod <dir>` fails with `ERR_PNPM_DEPLOY_NONINJECTED_WORKSPACE`.
    - `--legacy` works.
    - Without a `files` field, the deploy contains `src/` and `test/` but no `dist/`, because `dist` is gitignored. With `"files": ["dist"]` it contains `dist/`, `package.json` and a 167 MB prod `node_modules`, and `node dist/migrate.js` loads.
    - **Ruling:** use `--legacy` in the Dockerfile only. `injectWorkspacePackages` would replace the frontend's symlink to `api` with a copy and break the dev loop.
- **Runtime needs:** the backend reads `apps/backend/package.json` at runtime (`readPackageVersion` in `src/factories/app.setup.ts`). The image keeps `package.json` next to `dist/` (pnpm deploy does this).

**Routing and proxy**

- **One origin.** The SPA calls `location.origin + /api` (`apps/frontend/src/main.ts`). Caddy routes:
    - `/api/*` → `backend:8000`
    - everything else → static files with an `index.html` fallback
- **`/docs` (Swagger UI) is not proxied.** It is mounted outside the `api` prefix, so it stays unreachable from outside. Disabling it in the backend is Phase 2.
- **Trust exactly one proxy hop.**
    - Compose sets `TRUST_PROXY=1` for the backend.
    - The backend port is never published.
    - Caddy replaces any `X-Forwarded-For` it receives from clients, because no `trusted_proxies` is configured.
- **Healthcheck:** `GET /api/setup/status` (`@SkipThrottle`, touches the DB) is the backend healthcheck until Phase 3 adds a health endpoint.

**Mail server** (docker-mailserver docs, checked 2026-10-22)

- **Image:** `ghcr.io/docker-mailserver/docker-mailserver`, pinned to the newest stable `15.x.y` tag. That was `15.1.0` as of the last check; confirm it with `docker manifest inspect`.
- **Service and hostname:** the service is `mail`, and `hostname: ${MAIL_HOSTNAME}` is a FQDN. On the network `mail`, it also has the alias `${MAIL_HOSTNAME}`, so the backend reaches it under the name its certificate carries.
- **The app already assumes this design** (`domain-dns.service.ts`, `mail.service.ts`):
    - The sending domain gets A → server IP, MX → itself, and SPF `ip4:… -all`.
    - Mail goes out with the envelope sender `bounce@<sending domain>`.
    - The sending domain configured in the app must therefore be `MAIL_HOSTNAME`.
- **No unauthenticated relay, from anywhere.**
    - `PERMIT_DOCKER=none`. The docs warn that `network`/`connected-networks` can create an open relay.
    - The backend submits on port 587 with STARTTLS and authenticates as `bounce@${MAIL_HOSTNAME}`.
    - Port 25 accepts only mail for local recipients.
- **One mailbox account, one secret.**
    - The account is `bounce@${MAIL_HOSTNAME}` with password `MAIL_PASSWORD`. It is both the backend's SMTP login and its IMAP login, and `postmaster@${MAIL_HOSTNAME}` is an alias for it.
    - Accounts are created with docker-mailserver's own `setup email add` and `setup alias add`. They persist in the `mail-config` volume.
    - DMS shuts down and restarts if no account exists within two minutes of the first start.
- **`SPOOF_PROTECTION=1`.** The login may only use its own address as envelope sender. That is exactly `bounce@<MAIL_HOSTNAME>`, so a misconfigured sending domain fails loudly instead of sending with a wrong envelope.
- **Disabled, because the app or the design covers them:**
    - `ENABLE_OPENDKIM=0`: the backend signs with DKIM itself.
    - `ENABLE_AMAVIS=0`, `ENABLE_RSPAMD=0`, `ENABLE_CLAMAV=0`, `ENABLE_OPENDMARC=0`, `ENABLE_POLICYD_SPF=0`.
    - `ENABLE_FAIL2BAN=0`, because no authentication is exposed publicly.
    - `ENABLE_POP3=0`, and `ENABLE_UPDATE_CHECK=0` (it would e-mail the postmaster).
- **TLS:** `SSL_TYPE=manual` with the Let's Encrypt certificate that Caddy obtains for `MAIL_HOSTNAME`.
    - The `caddy-data` volume is mounted read-only. The docs warn that single-file mounts break on renewal.
    - `SSL_CERT_PATH`/`SSL_KEY_PATH` point to `…/caddy/certificates/acme-v02.api.letsencrypt.org-directory/${MAIL_HOSTNAME}/${MAIL_HOSTNAME}.{crt,key}`.
    - Caddy is pinned to Let's Encrypt (`acme_ca`), so this path cannot switch to the ZeroSSL fallback issuer.
- **Volumes:** `mail-data` (`/var/mail`), `mail-state` (`/var/mail-state`, which includes the Postfix queue and must survive recreation), `mail-logs` (`/var/log/mail`), `mail-config` (`/tmp/docker-mailserver`). Also `stop_grace_period: 1m`, as in the upstream compose file.
- **Internal ports:** 587 and 143 are never published. They are reachable only on the network `mail`, which only `backend` and `mail` join.

**Scope**

- **Out of scope** (later phases):
    - Phase 2: helmet/CORS/secret lengths.
    - Phase 3: the health endpoint, Redis auth, DB SSL and logging.
    - Phase 5: backups and monitoring.
    - An automatic deploy to the VPS.
    - **Mail:**
        - Real delivery to the internet. It needs outbound port 25 unblocked by the provider and a PTR record, so it is a runbook item and cannot be tested locally or in CI.
        - IP warm-up.
        - Spam filtering of the bounce mailbox.
        - Purging processed bounce mails. This is an existing README open item; the poller only marks mails `\Seen`.

## Review Focus

1. **Someone uses the mail server as an open relay.** Mail for a foreign domain must be rejected, both from the internet on port 25 and unauthenticated from inside the Docker network. Otherwise the IP is blacklisted within hours. Pinned in Task 3 (smoke checks "open relay from outside" and "unauthenticated relay from inside").
2. **A release whose migration fails.** The previously running backend must keep serving and must not be stopped or replaced. Pinned in Task 2 (smoke-test step "failed migration keeps the old backend").
3. **A client sends a forged `X-Forwarded-For`.** Rate limits must still count the real address, otherwise the login throttle is useless. Pinned in Task 2 (11 logins with rotating forged XFF → the 11th is 429).
4. **The mail certificate lifecycle.**
    - On the very first boot, Caddy has no certificate yet, so `mail` must recover on its own once it appears.
    - After a renewal, which Caddy does about every 60 days, Postfix and Dovecot must serve the new certificate without a restart.
    - Otherwise STARTTLS breaks silently after about 90 days.
      Pinned in Task 3 (smoke checks "first boot without certificate" and "renewed certificate is picked up").
5. **State and secrets.**
    - `.env`, `.git` and `.superpowers` must not reach an image (Task 1).
    - Everything that must survive a recreation lives in named volumes, and container logs are rotated so the disk doesn't fill over months (Tasks 2 and 3, compose config checks). That covers Postgres, Caddy's certificates (Let's Encrypt rate limits), the mail accounts and the Postfix queue.

---

### Task 1: Container images

**Files:**

- Create: `Dockerfile`, `.dockerignore`, `.node-version`
- Modify: `apps/backend/package.json` (add `"files": ["dist"]`)

**Interfaces:**

- Produces:
    - **Target `backend`:**
        - `WORKDIR /app` contains `package.json`, `dist/` and prod `node_modules/`. `/app` is owned by root and read-only for the `node` user.
        - `USER node`, `ENV NODE_ENV=production`, `EXPOSE 8000`, `CMD ["node", "dist/main.js"]`.
        - The same image runs `node dist/migrate.js up` and `node dist/openapi.js <path>`.
    - **`build` stage:** the frontend output sits at `/repo/apps/frontend/dist`. Task 2 adds the `web` target on top of it, together with the Caddyfile it needs.

- [ ] **Step 1: Write `.dockerignore`.**
    - It allowlists by excluding: `**/node_modules`, `**/dist`, `**/.turbo`, `**/.tmp`, `**/coverage`, `.git`, `.env`, `.env.*`, `!.env.example`, `.superpowers`, `.idea`, `.junie`, `.claude`, `.playwright-mcp`, `.run`, `apps/backend/openapi.json`, `apps/frontend/test-results`, `apps/frontend/playwright-report`, `docs`.

- [ ] **Step 2: Write the `Dockerfile`.**
    - **`build` stage:**
        - `FROM node:${NODE_VERSION}-slim AS build`, `ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 TURBO_TELEMETRY_DISABLED=1`, `corepack enable`, `WORKDIR /repo`.
        - Copy `package.json pnpm-lock.yaml pnpm-workspace.yaml`, then `RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store pnpm fetch`. Use the store path that `pnpm store path` prints in the image.
        - `COPY . .`, then `pnpm install --offline --frozen-lockfile` with the same cache mount.
        - `pnpm turbo run build --filter=frontend`.
        - `pnpm --filter backend deploy --legacy --prod /out`.
    - **`backend` stage:** `FROM node:${NODE_VERSION}-slim AS backend`, then `COPY --from=build /out /app` and the settings from Interfaces.
    - Use `slim` (Debian) for both Node stages. **Ruling:** `sass-embedded`, `@swc/core` and `@parcel/watcher` ship native binaries, and the build must not depend on their musl variants.

- [ ] **Step 3: Add `"files": ["dist"]` to `apps/backend/package.json`** and write `.node-version` with `24`.

- [ ] **Step 4: Build the backend target.**

    Run: `docker build --target backend -t mailer-backend:smoke .`
    Expected: it succeeds. A second build without source changes is fully cached (`CACHED` on install and build).

- [ ] **Step 5: Check the image content (Review Focus 5).**

    Run:

    ```bash
    docker run --rm mailer-backend:smoke sh -c 'ls -a /app; test ! -e /app/.env; test ! -e /app/src; id -un'
    docker run --rm --read-only mailer-backend:smoke node dist/openapi.js /dev/stdout | head -c 200
    docker build --target build -t mailer-build:smoke . && docker run --rm mailer-build:smoke ls /repo/apps/frontend/dist
    docker image ls mailer-backend:smoke
    ```

    Expected:
    - The listing shows only `dist`, `node_modules` and `package.json` (plus `README.md` if pnpm adds it), and the user is `node`.
    - The OpenAPI JSON starts with `{"openapi":` and has `"version":"0.0.1"`. This proves `package.json` is readable and that a read-only root filesystem works.
    - The frontend `dist` contains `index.html` and `assets/`.
    - Record the image size in the report.

- [ ] **Step 6: Gate.** Run `pnpm lint`, `pnpm typecheck` and `pnpm format`. Expected: all pass.

### Task 2: Compose stack, Caddy and smoke test

**Files:**

- Create:
    - `deploy/Caddyfile`, `deploy/compose.yml`, `deploy/compose.build.yml`
    - `deploy/.env.example`, `deploy/smoke-test.sh`
    - `.gitattributes`
- Modify:
    - `Dockerfile`: add the `web` target.
    - `.editorconfig`: add `[*.sh]` `end_of_line = lf`.
    - `README.md`: the "Production" section, and the "Production deployment" TODO line 168.
    - `CLAUDE.md`: repository layout and commands.

**Interfaces:**

- Consumes: the targets and image contract from Task 1.
- Produces:
    - **`deploy/compose.yml`:**
        - `name: mailer`, services `postgres`, `redis`, `migrate`, `backend`, `web`, volumes `postgres-data`, `redis-data`, `caddy-data`, `caddy-config`.
        - It reads the interpolation values and `env_file: .env` from its own directory.
    - **`deploy/smoke-test.sh`:** usage `IMAGE_TAG=<tag> deploy/smoke-test.sh`. It runs the stack from images already present locally and exits non-zero on the first failed check. Task 3 adds the mail checks to it, and Task 4 calls it from CI.

- [ ] **Step 1: Write `deploy/smoke-test.sh` first (LF, `set -euo pipefail`).**
    - **Setup:**
        - Make a temp dir, copy `deploy/compose.yml` into it, and write a `.env` with:
            - `SITE_ADDRESS=:80`, `HTTP_PORT=18080`, `HTTPS_PORT=18443`
            - `IMAGE_TAG` from the environment, default `local`
            - `DB_DATABASE`/`DB_USERNAME=mailer`
            - random `DB_PASSWORD`, `BACKEND_JWT_SECRET` and `BACKEND_ENCRYPTION_SECRET` (`head -c 32 /dev/urandom | base64`)
            - `SMTP_HOST=localhost`, `SMTP_PORT=25`
        - Run `docker compose -p mailer-smoke --project-directory "$tmp" -f "$tmp/compose.yml" up -d --pull missing --wait`.
        - A `trap` runs `down -v` and removes the temp dir.
    - **Checks**, against `http://localhost:18080`, using `curl`:
        1. `/` → 200, body contains `<div id="app">`.
        2. `/projects/5` → 200, same body (SPA fallback).
        3. `/` has a `Cache-Control` header containing `no-cache`. The first `/assets/*.js` referenced by `index.html` has `immutable`.
        4. `/api/setup/status` → 200 JSON.
        5. `/docs` → body does not contain `swagger-ui`.
        6. Every response carries `X-Robots-Tag: noindex, nofollow`.
        7. **Forged XFF:** 11 × `POST /api/auth/login` with body `{"email":"smoke@example.com","password":"wrong-password"}`, each with `X-Forwarded-For: 203.0.113.$i`. Responses 1–10 are 401 and the 11th is 429.
        8. **Re-running migrations:** `docker compose … run --rm migrate node dist/migrate.js pending --json` prints `[]`.
        9. **Failed migration keeps the old backend:**
            - Record `docker compose … ps -q backend`.
            - Write `$tmp/compose.fail.yml`, which overrides `migrate.command` to `["node", "-e", "process.exit(1)"]` and adds `SMOKE_REVISION: "2"` to `backend.environment`, so that compose wants to recreate the backend.
            - Run `up -d --pull missing` with both files. It must exit non-zero, and `/api/setup/status` must still return 200 from the same container id.
            - **Ruling** if compose stops the old backend instead: the README documents `docker compose run --rm migrate` as an explicit step before `up -d`, the smoke check is changed to assert that sequence, and the finding goes into the report.
    - **`--wait` ruling:** if `up --wait` rejects the exited one-shot `migrate` container, poll `docker compose … ps --format json` until `backend` is `healthy`, with a 120 s timeout.

- [ ] **Step 2: Run the smoke test and confirm it fails.**

    Run: `IMAGE_TAG=local bash deploy/smoke-test.sh`. Expected: FAIL, because `deploy/compose.yml` is missing.

- [ ] **Step 3: Write `deploy/Caddyfile` and add the `web` target to the `Dockerfile`.**
    - The `web` target is `FROM caddy:2-alpine AS web`, then `COPY --from=build /repo/apps/frontend/dist /srv` and `COPY deploy/Caddyfile /etc/caddy/Caddyfile`.
    - The Caddyfile:
        - A site block `{$SITE_ADDRESS}` with `encode zstd gzip` and `header X-Robots-Tag "noindex, nofollow"`.
        - `handle /api/*` → `reverse_proxy backend:8000`.
        - A fallback `handle` with `root * /srv`, `try_files {path} /index.html` and `file_server`.
        - `header /assets/* Cache-Control "public, max-age=31536000, immutable"`, and `Cache-Control "no-cache"` for everything outside `/assets/*` and `/api/*`.

- [ ] **Step 4: Write `deploy/compose.yml`.**

    Shared settings:
    - An `x-logging` anchor (`json-file`, `max-size: 10m`, `max-file: "5"`) applied to every service.
    - `restart: unless-stopped`, except `migrate`, which uses `restart: "no"`.

    Services:
    - **`postgres`:** `postgres:17-alpine`.
        - `POSTGRES_DB/USER/PASSWORD` interpolated from `DB_DATABASE`, `DB_USERNAME` and `${DB_PASSWORD:?DB_PASSWORD is required}`.
        - A `pg_isready` healthcheck and the volume `postgres-data`. No ports.
    - **`redis`:** `redis:8-alpine`, a `redis-cli ping` healthcheck, the volume `redis-data`. No ports.
    - **`migrate`:** image `ghcr.io/schwarzdavid/mailer-backend:${IMAGE_TAG:-latest}`.
        - `command: ["node", "dist/migrate.js", "up"]`, `env_file: .env`, environment `DB_HOST: postgres`, `DB_PORT: "5432"`.
        - `depends_on: postgres: service_healthy`.
    - **`backend`:** the same image.
        - `env_file: .env`, plus environment `NODE_ENV: production`, `PORT: "8000"`, `TRUST_PROXY: "1"`, `DB_HOST: postgres`, `DB_PORT: "5432"`, `REDIS_HOST: redis`, `REDIS_PORT: "6379"`.
        - `read_only: true`, `tmpfs: /tmp`, `init: true`.
        - Healthcheck `node -e "fetch('http://127.0.0.1:8000/api/setup/status').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"`: interval 10s, retries 6, start_period 20s.
        - `depends_on`: `migrate: service_completed_successfully`, `postgres: service_healthy`, `redis: service_healthy`.
    - **`web`:** image `ghcr.io/schwarzdavid/mailer-web:${IMAGE_TAG:-latest}`.
        - Environment `SITE_ADDRESS: ${SITE_ADDRESS:?SITE_ADDRESS is required}`.
        - Ports `${HTTP_PORT:-80}:80`, `${HTTPS_PORT:-443}:443` and `${HTTPS_PORT:-443}:443/udp`.
        - Volumes `caddy-data:/data` and `caddy-config:/config`.
        - `depends_on: backend: service_healthy`.

- [ ] **Step 5: Write `deploy/compose.build.yml`** (local builds only).
    - `backend` gets `build: { context: .., target: backend }` and `web` gets `build: { context: .., target: web }`.
    - `migrate` has no `build`, because it reuses the backend image tag.

- [ ] **Step 6: Write `deploy/.env.example`.**
    - The keys: `SITE_ADDRESS`, `IMAGE_TAG`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`, `BACKEND_JWT_SECRET`, `BACKEND_ENCRYPTION_SECRET`, `SMTP_*`, `IMAP_*`, and the six rate-limit keys with the defaults from the root `.env.example`.
    - `SITE_ADDRESS=app.example.com` and `IMAGE_TAG=latest`. All secrets are empty.
    - Write `.gitattributes` with `*.sh text eol=lf`, and add `[*.sh]` `end_of_line = lf` to `.editorconfig`.

- [ ] **Step 7: Check the compose config (Review Focus 5).**

    Run: `docker compose -f deploy/compose.yml --env-file deploy/.env.example config --quiet` with dummy values exported for the required variables.
    Expected:
    - Exit 0.
    - In `docker compose … config`, every service has `logging.options.max-size: 10m`, and `web` mounts `caddy-data` and `caddy-config`.
    - Without `DB_PASSWORD`, the command fails with `DB_PASSWORD is required`.

- [ ] **Step 8: Build and run the smoke test.**

    Run:

    ```bash
    IMAGE_TAG=local docker compose -f deploy/compose.yml -f deploy/compose.build.yml --env-file <a scratch env with SITE_ADDRESS and DB_PASSWORD> build
    IMAGE_TAG=local bash deploy/smoke-test.sh
    ```

    Expected: every check passes and the script exits 0. Afterwards `docker ps -a --filter name=mailer-smoke` is empty and `docker volume ls --filter name=mailer-smoke` is empty.

- [ ] **Step 9: Document.**
    - **README "Production":** replace the manual `pnpm` path with a "Deploying with Docker Compose" runbook:
        1. Install Docker on the VPS. Point a DNS A/AAAA record at the VPS. Open ports 80 and 443.
        2. Copy `deploy/compose.yml` and `deploy/.env.example` as `.env` to `/opt/mailer`. Fill in the secrets (`openssl rand -base64 48`), and back up `BACKEND_ENCRYPTION_SECRET` separately.
        3. Run `docker login ghcr.io` with a PAT that has `read:packages`, because the packages are private.
        4. Run `docker compose pull && docker compose up -d`. Finish the first-time setup immediately.
        5. **Update:** the same two commands. Migrations run automatically before the new backend starts.
        6. **Rollback:** set `IMAGE_TAG=sha-<sha>` and run `up -d`. Migrations are not rolled back automatically.
        7. **Local smoke test:** the build and smoke-test commands from Step 8.
    - The existing one-off `SequelizeMeta` rename note and the "Running behind a reverse proxy" section stay. Add that compose sets `TRUST_PROXY=1` itself.
    - Tick the "Production deployment" TODO.
    - **CLAUDE.md:** add `Dockerfile` and `deploy/` (prod compose, Caddyfile, smoke test) to "Repository layout", and the smoke-test command to "Common commands".

- [ ] **Step 10: Gate.** Run `pnpm lint`, `pnpm typecheck` and `pnpm format`. Expected: all pass. Prettier also formats the new YAML and Markdown.

### Task 3: Mail server (docker-mailserver)

**Files:**

- Modify:
    - `deploy/compose.yml`: add the `mail` service, the network `mail` and four mail volumes.
    - `deploy/Caddyfile`: global `acme_ca` and `email`, plus a site block for `MAIL_HOSTNAME`.
    - `deploy/.env.example`: drop `SMTP_*`/`IMAP_*`, add `MAIL_HOSTNAME`, `MAIL_PASSWORD` and `ACME_EMAIL`.
    - `deploy/smoke-test.sh`: the mail checks.
    - `README.md`: the mail part of the runbook.
    - `CLAUDE.md`: the layout line.

**Interfaces:**

- Consumes:
    - The compose stack and smoke script from Task 2.
    - The backend's existing env keys `SMTP_HOST/PORT/SECURE/USER/PASSWORD` and `IMAP_HOST/PORT/SECURE/USER/PASSWORD` (`src/config/env.schema.ts`, `src/modules/mail/mail.module.ts`, `src/modules/bounce/services/bounce-mailbox.service.ts`). No backend code changes.
- Produces:
    - **Compose sets the backend's mail env itself.** It goes in `environment`, so it overrides whatever `.env` holds:
        - `SMTP_HOST: ${MAIL_HOSTNAME}`, `SMTP_PORT: "587"`, `SMTP_SECURE: "false"`, `SMTP_USER: bounce@${MAIL_HOSTNAME}`, `SMTP_PASSWORD: ${MAIL_PASSWORD}`
        - `IMAP_HOST: ${MAIL_HOSTNAME}`, `IMAP_PORT: "143"`, `IMAP_SECURE: "false"`, `IMAP_USER: bounce@${MAIL_HOSTNAME}`, `IMAP_PASSWORD: ${MAIL_PASSWORD}`
    - With `SECURE=false`, nodemailer and imapflow upgrade via STARTTLS. DMS refuses AUTH without TLS, so a failed TLS handshake fails closed.

- [ ] **Step 1: Extend `deploy/smoke-test.sh` with the mail checks first.**
    - **Setup additions:**
        - The temp `.env` gets `MAIL_HOSTNAME=mail.smoke.test`, a random `MAIL_PASSWORD`, `ACME_EMAIL=smoke@example.com` and `SMTP_PUBLIC_PORT=18025`.
        - The script creates a throwaway CA and a leaf certificate for `mail.smoke.test` with `openssl` (SAN `DNS:mail.smoke.test`) in `$tmp/tls/`.
        - It writes `$tmp/compose.smoke.yml`, which overrides `mail`'s `SSL_CERT_PATH`/`SSL_KEY_PATH` to a bind-mounted `$tmp/tls` directory. The mount is a directory, not single files, for the same inode reason as in production. The file also mounts the CA into `backend` and sets `NODE_EXTRA_CA_CERTS` to it.
        - **Start order:** `up -d --wait` for every service except `mail`, then `up -d mail`. Then `docker compose … exec mail setup email add bounce@mail.smoke.test "$MAIL_PASSWORD"` and `setup alias add postmaster@mail.smoke.test bounce@mail.smoke.test`. Then wait until `mail` is `healthy` (120 s timeout).
    - **Checks**, run from the host unless stated:
        1. **Submission works:** in the `backend` container, `node --input-type=module -e` with `nodemailer` from `/app/node_modules`:
            - Build a transport from the backend's own `SMTP_*` env plus `requireTLS: true`. Its `verify()` resolves.
            - A mail with envelope `bounce@mail.smoke.test` → `bounce@mail.smoke.test` is accepted.
            - A mail with envelope `other@mail.smoke.test` is rejected (spoof protection).
        2. **Open relay from outside:** `curl --url smtp://localhost:18025 --mail-from smoke@example.org --mail-rcpt victim@example.org --upload-file -` exits non-zero, and the output contains `Relay access denied`.
        3. **Unauthenticated relay from inside:** in `backend`, a `nodemailer` transport to `mail.smoke.test:25` without auth sending to `victim@example.org` is rejected.
        4. **Bounce ingestion end to end:**
            - `curl` delivers `dev/fixtures/dsn-permanent.eml` over port 18025 to `bounce@mail.smoke.test` with a null sender.
            - Within 150 s (the poll interval is 60 s), `docker compose … exec postgres psql -U mailer -d mailer -tAc 'select count(*) from bounce'` returns at least `1`.
            - **Ruling** if the fixture's DSN does not create a `bounce` row in a fresh DB: assert the poller's processing instead, i.e. the message is `\Seen` per `doveadm search -u bounce@mail.smoke.test SEEN`. Name the reason in the report.
        5. **Internal ports stay internal:** `docker compose … port mail 587` and `port mail 143` print nothing. `port mail 25` prints the published port.
        6. **First boot without a certificate:**
            - Stop `mail` and move `$tmp/tls/*` away.
            - Start `mail`. It does not become healthy within 60 s.
            - Move the files back. It becomes healthy within 180 s without any further command.
        7. **Renewed certificate is picked up:**
            - Issue a second leaf from the same CA into `$tmp/tls/`, overwriting the files.
            - Within 90 s, `openssl s_client -starttls smtp -connect localhost:18025 -servername mail.smoke.test` shows the new serial, without a restart.
            - **Ruling** if DMS change detection doesn't reload: add a `restart` step for `mail` after renewal to the README, and assert that sequence instead.

- [ ] **Step 2: Run the smoke test and confirm the new checks fail.**

    Run: `IMAGE_TAG=local bash deploy/smoke-test.sh`. Expected: FAIL on the mail setup, because there is no `mail` service yet.

- [ ] **Step 3: Write the mail parts of `deploy/compose.yml` and `deploy/Caddyfile`.**
    - **Networks:** `default` for every service except `mail`, and `mail` for `backend` and `mail` only. `mail` is on the network `mail` alone, with `aliases: [${MAIL_HOSTNAME}]`.
    - **`mail` service:**
        - Image, `hostname`, environment and volumes as in Global Constraints "Mail server".
        - `caddy-data:/caddy:ro`, `ports: ["${SMTP_PUBLIC_PORT:-25}:25"]`, `restart: unless-stopped`, the `x-logging` anchor and `stop_grace_period: 1m`.
        - Rely on the image's built-in `HEALTHCHECK`, so the compose file declares none.
    - **`backend`:** join the network `mail` too, and add the mail env from Interfaces.
    - **`web`:** environment `MAIL_HOSTNAME` and `ACME_EMAIL`.
    - **Caddyfile:**
        - A global options block with `email {$ACME_EMAIL}` and `acme_ca https://acme-v02.api.letsencrypt.org/directory`.
        - A site block `{$MAIL_HOSTNAME}` that only does `respond 404`. It exists so that Caddy obtains and renews the certificate for `mail`.
    - **Required values:** `MAIL_HOSTNAME` and `MAIL_PASSWORD` use `:?… is required` interpolation.

- [ ] **Step 4: Update `deploy/.env.example`.**
    - Remove `SMTP_*` and `IMAP_*`.
    - Add `MAIL_HOSTNAME=mx.example.com`, an empty `MAIL_PASSWORD` and `ACME_EMAIL=admin@example.com`.

- [ ] **Step 5: Check the compose config (Review Focus 5).**

    Run: `docker compose … config` with dummy values.
    Expected:
    - `mail` has the four named volumes and the logging options.
    - `mail` publishes only `25`.
    - `mail` is not on `default`.
    - `backend` is on both networks.
    - Without `MAIL_PASSWORD`, the command fails with `MAIL_PASSWORD is required`.

- [ ] **Step 6: Build and run the smoke test.**

    Run the two commands from Task 2 Step 8. Expected: every check of Tasks 2 and 3 passes, and no `mailer-smoke` containers or volumes remain.

- [ ] **Step 7: Document the mail part in the README runbook.**
    - **Before the first `up`:**
        - DNS: A/AAAA for `SITE_ADDRESS` and for `MAIL_HOSTNAME` pointing at the VPS.
        - The PTR record of the VPS IP points to `MAIL_HOSTNAME`.
        - The provider has unblocked outbound port 25 (Hetzner Cloud, for example, blocks it by default).
        - Ports 25, 80 and 443 are open inbound.
    - **Right after the first `up -d`, within two minutes:**
        - `docker compose exec mail setup email add bounce@$MAIL_HOSTNAME "$MAIL_PASSWORD"`
        - `docker compose exec mail setup alias add postmaster@$MAIL_HOSTNAME bounce@$MAIL_HOSTNAME`
    - **Rotating the password:** `setup email update`, then `docker compose up -d backend`.
    - **In the app:** configure `MAIL_HOSTNAME` as the sending domain, with the VPS IP as server IP. The app then shows the A, MX, SPF, DKIM and DMARC records.
    - **Warm-up:** raise the sending volume slowly over the first weeks.
    - **The bounce mailbox grows.** Processed mails are only marked `\Seen` (README open item).
    - CLAUDE.md: the `deploy/` layout line now also mentions the mail service.

- [ ] **Step 8: Gate.** Run `pnpm lint`, `pnpm typecheck` and `pnpm format`. Expected: all pass.

### Task 4: GitHub Actions CI

**Files:**

- Create: `.github/workflows/ci.yml`
- Modify: `README.md` (one CI paragraph), `CLAUDE.md` (layout line)

**Interfaces:**

- Consumes:
    - `pnpm check` (root).
    - `pnpm --filter backend test:e2e`.
    - `pnpm --filter frontend test:e2e`.
    - The `Dockerfile` targets (Task 1).
    - `deploy/smoke-test.sh` with `IMAGE_TAG` (Tasks 2 and 3; it pulls the docker-mailserver image itself, through compose).

- [ ] **Step 1: Look up the current major version of each action.**

    Run `gh api repos/<owner>/<repo>/releases/latest --jq .tag_name` for each of:
    - `actions/checkout`
    - `pnpm/action-setup`
    - `actions/setup-node`
    - `actions/upload-artifact`
    - `docker/setup-buildx-action`
    - `docker/login-action`
    - `docker/metadata-action`
    - `docker/build-push-action`

    Pin each action to its major (`@vN`) and list the versions in the report.

- [ ] **Step 2: Write `.github/workflows/ci.yml`.**

    Workflow settings:
    - `on: push: branches: [main]` and `pull_request`.
    - `concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }`.
    - Top-level `permissions: contents: read`.
    - Shared setup in each Node job: checkout, `pnpm/action-setup` (no version input, it reads `packageManager`), `actions/setup-node` with `node-version-file: .node-version` and `cache: pnpm`, then `pnpm install --frozen-lockfile`.

    Jobs:
    - **`check`:** `pnpm check`.
    - **`backend-e2e`:** `pnpm --filter backend test:e2e`.
    - **`frontend-e2e`:**
        - `pnpm --filter frontend exec playwright install --with-deps chromium`, then `pnpm --filter frontend test:e2e`.
        - On failure, upload `apps/frontend/playwright-report` and `apps/frontend/node_modules/.tmp/e2e/*.log` as artifacts.
    - **`images`:** `needs: [check, backend-e2e, frontend-e2e]`, `permissions: { contents: read, packages: write }`.
        1. Set up buildx.
        2. Build both targets with `docker/build-push-action`: `load: true`, tags `ghcr.io/schwarzdavid/mailer-{backend,web}:ci`, `cache-from: type=gha,scope=<target>`, `cache-to: type=gha,mode=max,scope=<target>`.
        3. Run `IMAGE_TAG=ci bash deploy/smoke-test.sh`.
        4. Only if `github.event_name == 'push' && github.ref == 'refs/heads/main'`: log in to GHCR with `GITHUB_TOKEN`, then build and push both targets again from the gha cache, with tags from `docker/metadata-action` (`type=raw,value=latest` and `type=sha,format=short`).

- [ ] **Step 3: Lint the workflow.**

    Run: `docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:<latest release tag> -color`. Expected: no findings.

- [ ] **Step 4: Rehearse the `check` job on a fresh copy.**
    - Copy the working tree, without git-ignored files, into the scratchpad: `git ls-files -co --exclude-standard` piped to `tar`. Git is only read.
    - In the copy, run `pnpm install --frozen-lockfile && pnpm check`.
    - Expected: exit 0.
    - **Ruling:** if it fails on something outside this plan, fix only what blocks CI, and name it in the report.

- [ ] **Step 5: Document.**
    - README: a "Continuous integration" paragraph covering the four jobs, which job pushes images, and the tag scheme.
    - CLAUDE.md: add `.github/workflows/ci.yml` to "Repository layout".
    - Run the gate: `pnpm lint`, `pnpm typecheck`, `pnpm format`.
    - The first real CI run happens when the owner pushes. Until then the report lists it as **not yet verified on GitHub**.
