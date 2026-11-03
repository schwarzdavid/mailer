# Backend Serves the Frontend, Stock Caddy for TLS Implementation Plan

> **Amended after implementation (2026-10-22, owner decision).** `FRONTEND_DIST_DIR` was dropped.
>
> - The backend serves the SPA only when `NODE_ENV=production`, from the fixed `FRONTEND_PUBLIC_DIR`: `/app/public` in the image, `apps/backend/public` from source.
> - It refuses to boot when `index.html` is missing there.
> - The plan text below describes the earlier env-var design and is kept as history.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Production ships one application image. The NestJS backend serves the built SPA next to `/api`, and an unmodified `caddy` image only terminates TLS (Let's Encrypt for the app domain and for `MAIL_HOSTNAME`) and proxies everything to the backend. The open recipient-blocking residual (I-1) is closed first.

**Architecture:**

- The backend image gains `/app/public` (the frontend `dist`).
- With `FRONTEND_DIST_DIR` set, `ServeStaticModule` serves it:
    - The SPA fallback returns `index.html` for client routes.
    - A missing `/assets/*` file and an unknown `/api/*` route both return 404.
    - The backend sets the cache headers itself.
- Swagger UI is mounted only outside `NODE_ENV=production`, because the proxy now forwards every path.
- Compose replaces the custom `web` image with a stock Caddy service `proxy`. Its Caddyfile is inline in `compose.yml` (`configs.content`), so a VPS still needs only `compose.yml` and `.env`.
- CI builds, smoke-tests and publishes a single image.

**Tech Stack:** NestJS 12 + `@nestjs/serve-static` 12 (Express 5), Caddy 2 (stock image), Docker Compose ≥ 2.23.1, GitHub Actions.

**Spec:** No separate spec document. The requirements are the owner's decision of 2026-10-22 (chat): drop the custom Caddy image, let the backend serve the frontend, keep a proxy only for TLS. Two items carry over from the review of `docs/superpowers/plans/2026-10-21-production-deployment.md` (ledger `.superpowers/sdd/2026-10-21-production-deployment/progress.md`):

- the I-1 residual
- two README minors

## Global Constraints

**Process rules**

- **Never touch git** (CLAUDE.md). There are no commit steps.
- **No comments** in code or config. The existing _why_-comments set the bar.
- Every task ends with `pnpm lint`, `pnpm typecheck` and `pnpm format` green, plus the affected test suites:
    - `pnpm --filter backend test`
    - `pnpm --filter backend test:e2e` when backend wiring changes
    - the smoke test when deploy files change
- Test doubles follow CLAUDE.md "Testing": typed `vi.fn<Service['method']>()`, typed fixtures, no `as` casts.
- **Don't disturb the owner's dev stack.**
    - Compose runs use the project `mailer-smoke` and the ports 18080/18443/18025, through `deploy/smoke-test.sh`, which cleans up with `down -v`.
    - Never touch the dev compose project or its volumes, and never read or write the root `.env`.

**Images and wiring**

- **One published image:** `ghcr.io/schwarzdavid/mailer-backend`, tagged `latest` and `sha-<7>` on `main`.
    - The `web` target, the `mailer-web` image and `deploy/Caddyfile` are removed.
    - The `.editorconfig`/`.gitattributes` rules that exist only for `Caddyfile` go too.
- **The backend serves static files only when `FRONTEND_DIST_DIR` is set.**
    - The Dockerfile sets `ENV FRONTEND_DIST_DIR=/app/public` in the `backend` stage.
    - Dev (Vite on :5173 with its `/api` proxy), unit tests, backend e2e and Playwright run without it and behave exactly as today.
- **Static routing contract**, with the backend mounted at the root behind the proxy:
    - An existing file under `FRONTEND_DIST_DIR` is served. Files under `/assets/` get `Cache-Control: public, max-age=31536000, immutable`; every other file gets `no-cache`.
    - Any other GET outside `/api` returns `index.html` with `Cache-Control: no-cache`. That covers `/` and client routes like `/projects/5`.
    - A missing `/assets/*` file returns 404, never `index.html`.
    - Any `/api/*` path the API doesn't route returns Nest's JSON 404, never `index.html`.
- **Swagger:** `SwaggerModule.setup('docs', …)` runs only when `NODE_ENV !== 'production'`.
    - `NODE_ENV` joins the Zod `envShape` as `z.enum(['development', 'test', 'production']).default('development')`, read through `ConfigService`.
    - The image already sets `NODE_ENV=production`.
- **Proxy:** the stock image `caddy:<pinned 2.x>-alpine`. Resolve the newest stable 2.x Alpine tag and verify it with `docker manifest inspect`. The Caddyfile is inline in `compose.yml` and does exactly this:
    - a global `acme_ca https://acme-v02.api.letsencrypt.org/directory`
    - a site `${SITE_ADDRESS}` with `encode zstd gzip`, `header X-Robots-Tag "noindex, nofollow"` and `reverse_proxy backend:8000`
    - a site `${MAIL_HOSTNAME}` with `respond 404`, so that Caddy obtains the mail certificate
    - Values come from compose interpolation with `:?` guards; the Caddyfile does not use `{$…}` env placeholders.
    - The volumes `caddy-data` and `caddy-config`, the ports and the mail container's read-only `caddy-data` mount stay unchanged.
- **Unchanged:** `TRUST_PROXY: '1'`, the backend's `read_only`/`tmpfs`, and the update sequence (`pull`, then `run --rm migrate`, then `up -d`).

**I-1 recording rule** (RFC 3463 enhanced status codes)

- A failed submission records a recipient bounce only when all three hold:
    - nodemailer reports `command === 'RCPT TO'`
    - `responseCode >= 500`
    - the reply's enhanced status code is a destination-address code: `5.1.1`, `5.1.2`, `5.1.3`, `5.1.6` or `5.1.10`
- **Never recorded:**
    - sender or policy codes (`5.1.7`, `5.1.8`, `5.7.x`, for example Postfix's `553 5.7.1 … Sender address rejected: not owned by user`)
    - replies without an enhanced code
    - EAUTH, connection and TLS errors
    - every 4xx
- The error is always rethrown, as today.

## Review Focus

1. **An API client calls a mistyped `/api/...` path, or a stale tab requests a deleted chunk.** It must get a 404, not `200 text/html`; otherwise clients mis-parse and Vite's chunk-error handling never fires. Pinned in Task 2 (e2e) and Task 3 (smoke).
2. **Someone opens `https://<site>/docs` in production.** The response is the SPA (its own 404 view), not Swagger UI. In dev, `/docs` still works. Pinned in Task 2 (e2e plus a unit test of the bootstrap condition) and Task 3 (smoke).
3. **A misconfigured sending domain or a wrong mail password in production.** No recipient may end up blocked, while a genuine `550 5.1.1` still is. Pinned in Task 1 (unit tests with the exact Postfix replies observed in the smoke test).
4. **A developer runs `pnpm dev`, the unit suites, backend e2e or Playwright without `FRONTEND_DIST_DIR`.** Nothing changes: no static serving, `/docs` present. Pinned in Task 2 (e2e without the env, plus the existing suites green).
5. **The proxy swap must not lose a security or ops property.** That means TLS for both names, the mail certificate path, `X-Robots-Tag`, compression, the forged-XFF throttle, the failed-migration safety and the relay checks. Pinned in Task 3 (the full existing smoke suite, unchanged except where the image layout changed).

---

### Task 1: Narrow recipient-bounce recording (I-1 residual)

**Files:**

- Modify: `apps/backend/src/modules/mail/services/mail.service.ts` (`permanentRecipientRejectionCode` and its caller)
- Test: `apps/backend/src/modules/mail/services/mail.service.spec.ts`
- Modify: `deploy/smoke-test.sh` (the foreign-envelope check prints and asserts the rejecting SMTP stage)

**Interfaces:**

- Produces: unchanged `MailService.sendMail` behaviour, except which errors reach `BounceService.recordBounce`.

- [ ] **Step 1: Observe the real stage.**
    - Extend the smoke test's foreign-envelope (spoof) check so that its `catch` prints `command`, `responseCode` and `response`, and asserts `command === 'RCPT TO'`. The reviewer of the previous plan expects Postfix's `smtpd_delay_reject=yes` to defer the 553 to `RCPT TO`.
    - Run `IMAGE_TAG=local bash deploy/smoke-test.sh`, rebuilding the images first if needed, and record the exact `response` string.
    - **Ruling:** if the stage turns out to be `MAIL FROM`, keep the assertion on whatever stage is observed and say so in the report. The recording rule stays as specified either way.

- [ ] **Step 2: Write the failing tests** in `mail.service.spec.ts`. Use the existing `smtpError(...)` helper style: typed `SMTPConnection.SMTPError` via `Object.assign`, no casts.
    - `records a bounce for 550 5.1.1 at RCPT TO`: response `550 5.1.1 <x@example.org>: Recipient address rejected: User unknown in virtual mailbox table` → `recordBounce` is called once.
    - `does not record the spoof-protection rejection at RCPT TO`: use the exact response observed in Step 1 (expected `553 5.7.1 <…>: Sender address rejected: not owned by user …`) with `command: 'RCPT TO'` → `recordBounce` is not called, and the error is rethrown.
    - `does not record a sender-address code at RCPT TO`: `553 5.1.8 … Sender address rejected: Domain not found` → not called.
    - `does not record a RCPT TO 5xx without an enhanced status code`: `550 Mailbox unavailable` → not called.
    - Keep the existing EAUTH, MAIL FROM and 4xx cases.

- [ ] **Step 3: Run them and confirm they fail.**

    Run: `pnpm --filter backend exec vitest run src/modules/mail/services/mail.service.spec.ts`
    Expected: the spoof, 5.1.8 and no-enhanced-code cases FAIL against today's rule.

- [ ] **Step 4: Implement the rule from Global Constraints "I-1 recording rule".**
    - Parse the enhanced code with `/^\d{3}[ -](\d\.\d{1,3}\.\d{1,3})\b/` on `response`.
    - Accept only the five listed destination codes.
    - Rethrow unchanged.

- [ ] **Step 5: Run the spec and the backend unit suite.** Expected: all pass.

- [ ] **Step 6: Gate.** Run `pnpm lint`, `pnpm typecheck` and `pnpm format`.

### Task 2: Backend serves the SPA; Swagger only outside production

**Files:**

- Modify: `apps/backend/package.json` (dependency `@nestjs/serve-static` `^12.0.0`, installed with `pnpm --filter backend add`)
- Modify: `apps/backend/src/config/env.schema.ts` (+ spec): optional `FRONTEND_DIST_DIR` (non-empty string; an empty string counts as unset, the same treatment as `SMTP_TLS_SERVERNAME`) and `NODE_ENV`
- Create: `apps/backend/src/factories/static-frontend.ts`. It exports `createStaticFrontendOptions(configService: ConfigService<Env, true>): ServeStaticModuleOptions[]`, which returns `[]` when `FRONTEND_DIST_DIR` is unset. Add a unit spec beside it.
- Modify: `apps/backend/src/app.module.ts`: `ServeStaticModule.forRootAsync({ inject: [ConfigService], useFactory: createStaticFrontendOptions })`
- Modify: `apps/backend/src/main.ts`: Swagger setup behind `NODE_ENV !== 'production'`. Extract the condition into an exported function in `src/factories/app.setup.ts`, for example `shouldServeApiDocs(configService)`, with a unit test.
- Test: create `apps/backend/test/static-frontend.e2e-spec.ts`
- Modify: `Dockerfile`:
    - The `backend` stage copies `/repo/apps/frontend/dist` to `/app/public` and sets `ENV FRONTEND_DIST_DIR=/app/public`.
    - Remove the `web` stage, and make `backend` the last stage so that `docker build .` builds it.

**Interfaces:**

- Produces: the static routing contract and the Swagger condition from Global Constraints. `createStaticFrontendOptions` and `shouldServeApiDocs` are exported for tests.

- [ ] **Step 1: Write the failing e2e spec** `test/static-frontend.e2e-spec.ts`.
    - Follow the pattern of `test/trust-proxy.e2e-spec.ts`: set `process.env` before dynamically importing `./support/app.js`.
    - In `beforeAll`, create a temp dir with `index.html` (containing `<div id="app">`), `assets/app.js` and `favicon.svg`, then set `FRONTEND_DIST_DIR` to it.
    - Assertions:
        - `GET /` → 200, the body contains `<div id="app">`, and `Cache-Control` is `no-cache`.
        - `GET /projects/5` → the same body.
        - `GET /assets/app.js` → 200, and `Cache-Control` contains `immutable`.
        - `GET /favicon.svg` → 200, `Cache-Control: no-cache`.
        - `GET /assets/missing.js` → 404, and the body does not contain `<div id="app">`.
        - `GET /api/does-not-exist` → 404 JSON (`content-type` `application/json`).
        - `GET /api/setup/status` → 200 JSON.
    - Restore the env in `afterAll`.
    - A second `describe` block without `FRONTEND_DIST_DIR`: `GET /` → 404 JSON.
    - **Ruling:** if the env cannot be changed per file because config is validated once per worker, split it into two spec files. Report it.

- [ ] **Step 2: Write the failing unit tests.**
    - `env.schema.spec.ts`: `FRONTEND_DIST_DIR` is optional and empty counts as unset; `NODE_ENV` defaults to `development` and rejects other values.
    - `static-frontend.spec.ts`: returns `[]` when unset. When set, it has the root path, excludes `/api` and `/assets` from the SPA fallback, and has a `setHeaders` that gives `immutable` under `/assets/` and `no-cache` otherwise.
    - `shouldServeApiDocs`: true for `development` and `test`, false for `production`.

- [ ] **Step 3: Run them and confirm they fail.**

    Run: `pnpm --filter backend exec vitest run src/config src/factories` and `pnpm --filter backend test:e2e -- static-frontend`
    Expected: FAIL (missing module or exports, and `/` → 404 JSON).

- [ ] **Step 4: Implement.**
    - Use `@nestjs/serve-static`.
    - Make the `exclude` patterns Express 5 (path-to-regexp v8) style, for example `'/api/{*path}'` and `'/assets/{*path}'`. The fallback skips them, while existing files under `/assets` are still served by the static middleware.
    - Make sure the `index.html` fallback response carries `Cache-Control: no-cache` (`setHeaders` on the static options covers files; check the fallback path too).
    - **Ruling:** if `ServeStaticModule` cannot meet the contract, for example if the fallback response cannot get the header or the excluded assets still fall back, report BLOCKED with the evidence. Do not build a hand-rolled alternative without a ruling.

- [ ] **Step 5: Run the specs, the full backend unit suite and the backend e2e suite.** Expected: all pass, including the existing `openapi.e2e-spec.ts` and `bootstrap.e2e-spec.ts`.

- [ ] **Step 6: Build and inspect the image.**
    - Build: `docker build --target backend -t mailer-backend:smoke .`
    - Check: `MSYS_NO_PATHCONV=1 docker run --rm mailer-backend:smoke sh -c 'ls /app/public /app/public/assets | head; echo $FRONTEND_DIST_DIR'`
    - Expected: `index.html` and `assets` are present and the env var is `/app/public`. Record the new image size.

- [ ] **Step 7: Gate.** Run `pnpm lint`, `pnpm typecheck` and `pnpm format`.

### Task 3: Stock Caddy proxy, one image in compose, CI and docs

**Files:**

- Modify:
    - `deploy/compose.yml`: replace the `web` service with `proxy` and add the `configs` entry `proxy-caddyfile`.
    - `deploy/compose.build.yml`: drop the `web` build.
    - `deploy/smoke-test.sh`, `.github/workflows/ci.yml`, `README.md`, `CLAUDE.md`, `.editorconfig`, `.gitattributes`.
- Delete: `deploy/Caddyfile`.

**Interfaces:**

- Consumes: the image from Task 2, the static routing contract, and the Swagger condition.

- [ ] **Step 1: Adapt the smoke test first, then run it and see it fail.**
    - Every reference to the `web` service or the `mailer-web` image changes to `proxy` or the stock image.
    - Keep every existing check. The cache, SPA, missing-asset, `/docs` and `X-Robots-Tag` checks now exercise backend plus proxy.
    - Add these checks:
        - `GET /api/does-not-exist` → 404 with `application/json`.
        - The first `/assets/*.js` referenced by `index.html` carries `Content-Encoding` when requested with `Accept-Encoding: gzip`, proving the proxy compresses. Use the large JS asset, because Caddy skips bodies under its minimum length.
    - Run it against the current compose, which still has `web`. Expected: FAIL on the missing `proxy` service.

- [ ] **Step 2: Rewrite `deploy/compose.yml` and `deploy/compose.build.yml`.**
    - `proxy` uses the pinned stock Caddy image, the inline `configs` Caddyfile from Global Constraints mounted at `/etc/caddy/Caddyfile`, and the same ports, volumes, logging and `depends_on: backend: service_healthy` as `web` had.
    - `compose.build.yml` builds only `backend`.
    - Delete `deploy/Caddyfile`, and remove the Caddyfile-only rules from `.editorconfig` and `.gitattributes`.

- [ ] **Step 3: Check the compose config.**

    Run `docker compose … config` from a scratch project dir with a dummy `.env`. Expected:
    - The rendered Caddyfile content contains the concrete `SITE_ADDRESS` and `MAIL_HOSTNAME`.
    - It fails with the guard message when either is missing.
    - `caddy validate` passes on the rendered Caddyfile, via `docker run --rm` of the pinned image.

- [ ] **Step 4: Build the backend image and run the smoke test.**

    Run:

    ```bash
    IMAGE_TAG=local docker compose -f deploy/compose.yml -f deploy/compose.build.yml --env-file <scratch env> build
    IMAGE_TAG=local bash deploy/smoke-test.sh
    ```

    Expected: every check passes and no `mailer-smoke` containers, volumes or networks remain.

- [ ] **Step 5: Update CI (`.github/workflows/ci.yml`).**
    - Remove the `web` build, `meta-web` and the `web` push.
    - `images` builds, smokes and pushes only `backend`.
    - Verify with actionlint 1.7.12: no findings.

- [ ] **Step 6: Update the docs.**
    - README: topology (one image, stock Caddy), runbook (no `mailer-web`, and the VPS still needs only `compose.yml` and `.env`), and the CI paragraph.
    - Fix the two carried-over minors:
        - Step 5 lists `healthy` only for the services that define a healthcheck (postgres, redis, backend, mail).
        - The rollback uses the first 7 characters of the recorded revision (`sha-<7>`).
    - Mention that `/docs` exists only outside production.
    - CLAUDE.md: layout, the pipeline description, and the image name.
    - The old plan doc stays as history; add an "Amended" note at its top that points to this plan.

- [ ] **Step 7: Gate.** Run `pnpm lint`, `pnpm typecheck` and `pnpm format`.
