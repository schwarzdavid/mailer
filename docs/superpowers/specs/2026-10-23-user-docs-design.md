# User Documentation Site — Design

Date: 2026-10-23
Status: Reviewed (builder check 2026-10-23), awaiting owner approval

## Goal

Give mailer an operator-facing documentation site in the style and at the scale of the Coolify
docs (https://coolify.io/docs): how to install it, how to configure it (what is mandatory, what
is optional), how to use the admin UI and the public APIs, and how to run it day to day. The
site is a VitePress workspace inside this monorepo, published to GitHub Pages at
`https://schwarzdavid.github.io/mailer/` (the GitHub repository is `schwarzdavid/mailer`; only
the local working directory is called `schwarzdavid-email`, and Pages URLs follow the repository
name). The operator runbook that lives in the README today moves into it, and the README shrinks
to an introduction with a link.

The product is called **mailer** throughout. The admin UI shows "Mail Admin" in its title bar;
the docs mention that once (in the admin guide overview) and otherwise say "the admin UI".
Nothing in the app is renamed by this project.

## Audience and quality bar

The primary reader is an operator with a fresh VPS who installs mailer for the first time. The
secondary reader is an operator who already runs it and comes back for day-to-day tasks (add a
domain, embed a form, rotate a secret, update) and for troubleshooting. Developers are not the
audience: development setup, tests and CI stay in the README and `CLAUDE.md`.

The owner's definition of failure: **a reader has to look something up elsewhere to get through
a page.** Every page is therefore self-contained:

- Every command is written out in full and can be pasted as is. Commands that read `.env` use
  the README's subshell pattern (`(set -a; . ./.env; …)`) so exported variables never shadow
  later edits.
- Every DNS record is given with host, type and an example value built from the documented
  placeholders.
- Every term is explained in one or two sentences where it is first needed (SPF, DKIM, DMARC,
  PTR/reverse DNS, return path, bounce, IP warm-up, STARTTLS, advisory lock where it matters to
  the operator). Explanations stay short and operational, not academic.
- Links to third-party documentation (docker-mailserver, Caddy, Hetzner, Let's Encrypt, Google
  reCAPTCHA) are additional reading only; the step itself is always written out in mailer's docs.
- Every configuration page separates **Required** from **Optional** visibly (a column in the
  table or a badge next to the heading), and says which values the production compose file
  sets itself so a value in `.env` has no effect.
- Every procedural page ends with a section **How you know it worked** (or **Verify**) with the
  concrete observation: a command and its expected output, a UI state, a log line.
- Product gaps are stated plainly with the workaround next to them: the dashboard is empty, a
  `failed` form delivery has no resend button (SQL workaround), the bounce mailbox only grows,
  the onboarding wizard has no back button, a failed login shows no message if that is still
  the case at writing time (verify against the current UI).
- Every statement is verified against the code or the README at writing time. Writers do not
  invent behaviour. Where the two disagree, the code wins and the README is corrected.

## Context

- The README's `Production` section (deploy runbook, verification, secret rotation, update,
  rollback, docker-mailserver and Caddy updates, smoke test), `Logging`, `Health checks`,
  `Running behind a reverse proxy`, `Public send API` and `Open todos` already hold most of the
  operator content, written for the current code. `CLAUDE.md` adds the operational constraints
  (locks, queue, migrations, health semantics). `TODO.md` lists planned work.
- `apps/backend/src/config/env.schema.ts` is the single source of the 40 environment variables,
  their defaults and coercion. `NODE_EXTRA_CA_CERTS` is documented in the README as well, but it
  is read by the Node runtime, not by the schema. `deploy/.env.example` is the production template,
  `.env.example` the local one. `deploy/compose.yml` fixes `NODE_ENV`, `PORT`, `TRUST_PROXY`,
  `DB_HOST`, `DB_PORT`, `REDIS_HOST`, `REDIS_PORT` and every `SMTP_*`/`IMAP_*` key for the backend
  and exposes `SITE_ADDRESS`, `MAIL_HOSTNAME`, `MAIL_PASSWORD`, `IMAGE_TAG`, `HTTP_PORT`,
  `HTTPS_PORT` and `SMTP_PUBLIC_PORT` as compose-level variables.
- The admin UI (rebuilt in October 2026) has these areas, from `RouteNames.ts` and
  `en.json#nav`: Dashboard (placeholder), Projects (list, detail, sent mail), Inbound forms
  (detail, template editor), Domains (list, detail), Bounces (events, blocked addresses),
  Administration: Users (list, detail), Roles (list, detail), Settings; plus Login and the
  first-run Onboarding wizard. `docs/ui-inventory.md` describes the flows (A–H) in detail, but it
  was written on 2026-10-13, before the redesign and before Roles existed: it is a map of what to
  document, and every label, order of steps and screen state is taken from the current views and
  `en.json`, never from the inventory.
- No GitHub release or tag exists yet, so no image is on GHCR. The installation pages are written
  for the first release (`IMAGE_TAG` set to its version), and the plan verifies them against a
  locally built image (`docker build -t ghcr.io/schwarzdavid/mailer-backend:local .`) the way the
  smoke test does.
- A separate project is in flight in this working tree: the smoke-test workspace
  (`docs/superpowers/specs/2026-10-22-smoke-test-workspace-design.md`) replaces
  `deploy/smoke-test.sh` with `pnpm --filter deploy test:smoke`, adds `deploy` as a workspace,
  and rewrites README step 11, the README CI paragraph and `CLAUDE.md`. This project starts after
  that one has landed and builds on its README and `CLAUDE.md`.
- `.dockerignore` excludes `docs`, `deploy` and `dev` but not `apps/*`, so `apps/docs` would enter
  the image build context and `pnpm install --frozen-lockfile` in the `build` stage would install
  VitePress. The `Dockerfile` itself builds only with `turbo run build --filter=frontend`.
- Public HTTP surfaces: `POST /api/v1/send` (Bearer API key), `GET /api/public/form/client.js`,
  `POST /api/public/form/:slug/token`, `POST /api/public/form/:slug` (open to every origin),
  `GET /api/health`, `GET /api/health/ready`, `GET /api/setup/status`, `POST /api/setup/user`.
  Everything else is the admin API behind JWT.
- The OpenAPI document is generated without a database by `backend#generate` into
  `apps/backend/openapi.json` (gitignored). `packages/api` already consumes it through an
  explicit Turbo dependency; the docs do the same.
- The Playwright suite under `apps/frontend/e2e/` boots the whole stack (Testcontainers Postgres,
  Redis, MailHog, GreenMail, the built backend, the built frontend) in `support/global-setup.ts`
  and exposes `E2E_BASE_URL`, `E2E_API_URL`, `E2E_SETUP_TOKEN` and `E2E_MAILHOG_URL`.
- Toolchain: pnpm 11 workspaces `apps/*` and `packages/*`, Turborepo 2, Node 24.22.1 (pinned in
  the `Dockerfile`, read by `.github/actions/setup`), ESLint flat config through the root
  `defineBaseConfig`, one root Prettier config (4 spaces, single quotes, no semicolons), strict
  root `tsconfig.json`. VitePress 1.6.4 is current; `vitepress-openapi` 0.2.5 (peer
  `vitepress >=1.0.0`) renders an OpenAPI document as VitePress pages.
- The `Dockerfile` builds with `turbo run build --filter=frontend`, so a new `docs` workspace does
  not slow the image build.

## Decisions

1. **New workspace `apps/docs`**, package name `docs`, VitePress 1.6.x with the default theme,
   English only (`lang: 'en-US'`), site title `mailer`, `base: '/mailer/'` as the single place to
   change when a custom domain comes, `cleanUrls: true`, `lastUpdated: true`,
   built-in local search (`search.provider: 'local'`), `editLink` to the file on GitHub, a GitHub
   social link, an AGPL footer notice. Top navigation: Introduction, Installation,
   Configuration, Admin guide, Operations, API, Reference; one sidebar per section (see Site
   map). No version switcher: the docs follow `main`; behaviour that depends on the release is
   marked inline ("since 1.x"). Scripts: `dev` (`vitepress dev`), `build` (`vitepress build`),
   `preview`, `lint` (ESLint over `.vitepress/**/*.ts` and any Vue theme files), `typecheck`
   (`vue-tsc --noEmit` over the same). `lint` and `typecheck` take part in `pnpm check` through
   Turbo like every other workspace; Prettier formats the Markdown with the root config.
2. **Dead links fail the build.** VitePress's default (`ignoreDeadLinks` unset) throws on dead
   internal links. `docs#build` runs in `pnpm build` and in the docs workflow for every pull
   request, so a broken link blocks the merge. `pnpm check` is not changed to include the build.
3. **Deployment through a new workflow `.github/workflows/docs.yml`**: on `push` to `main` and
   on `pull_request` against `main`. Job `build`: checkout with `fetch-depth: 0` (for
   `lastUpdated`), `.github/actions/setup`, `pnpm build --filter docs` (Turbo builds the backend,
   generates the spec and env keys, then the site), `actions/configure-pages`,
   `actions/upload-pages-artifact` with `apps/docs/.vitepress/dist`. Job `deploy` (only on
   `push`, `needs: build`, environment `github-pages`, permissions `pages: write`,
   `id-token: write`, concurrency group `pages` without cancel-in-progress):
   `actions/deploy-pages`. `ci.yml` is not touched. One-time owner step outside the repo:
   Settings → Pages → Source "GitHub Actions", and the repository must be public for Pages on
   the free plan.
4. **API reference generated from `openapi.json`.** The page `api/reference` renders
   `apps/backend/openapi.json` with `vitepress-openapi`, grouped by tag. `turbo.json` gains
   `"docs#build": { "dependsOn": ["backend#generate"], "outputs": [".vitepress/dist/**"] }` and
   `"docs#dev": { "dependsOn": ["backend#generate"] }`, mirroring `api#build`. The docs reference
   the spec by its path in the producer package, as `packages/api/openapi-ts.config.ts` does;
   no copy, no fake workspace dependency. Hand-written pages explain authentication, error
   shapes and codes, limits and the request id; the generated pages are the exhaustive list.
   If `vitepress-openapi` turns out to break the build or render the spec badly, the fallback
   is a single page embedding Scalar's API reference web component against the same file; the
   builder decides after a short spike and records the choice in the plan.
5. **Environment reference with a drift guard.** `backend#generate` additionally writes
   `apps/backend/env-keys.json` (the sorted keys of `envShape`, produced by the same
   `dist/openapi.js` run or a sibling script; gitignored; added to the Turbo `generate`
   outputs). The page `configuration/environment` is hand-written: one table per group (General,
   Database, Redis, Secrets, Mail server, SMTP, IMAP, Rate limits) with columns Variable,
   Required, Default, Set by compose, Description, followed by long-form sections for the
   variables that need them (`TRUST_PROXY`, `DB_SSL*`, `REDIS_TLS*`, `SMTP_REQUIRE_TLS`,
   `LOG_LEVEL`, the rate-limit pairs). A build-time check in `.vitepress/config.ts`
   (`buildEnd` or a small script run before `vitepress build`) parses the tables, compares the
   set of variable names with `env-keys.json` plus the compose-level variables listed in the
   same file (`SITE_ADDRESS`, `MAIL_HOSTNAME`, `MAIL_PASSWORD`, `IMAGE_TAG`, `HTTP_PORT`,
   `HTTPS_PORT`, `SMTP_PUBLIC_PORT`, maintained by hand in the check) and the runtime variables
   read by Node rather than by the schema (`NODE_EXTRA_CA_CERTS`, in its own small table on the
   page and on the check's allow-list), and fails the build on any variable missing from the page
   or no longer existing in the schema.
6. **Screenshots are generated, not hand-made, and the docs own the script** (owner decision,
   2026-10-23). `apps/docs` gets its own `playwright.config.ts` (chromium only, viewport
   1440×900, light theme, `workers: 1`, `retries: 0`), the spec and seed helpers under
   `apps/docs/screenshots/`, `@playwright/test` as a devDependency and the script `screenshots`
   (`playwright test`), run as `pnpm --filter docs screenshots` after a one-time
   `pnpm --filter docs exec playwright install chromium`. The spec seeds deterministic demo data
   through the API (project "Acme Website", domain `mail.example.com`, a contact form with three
   fields, a receiver with a published template, one sent mail, one bounce), visits each screen
   from the Screenshot list below and writes PNGs to
   `apps/docs/public/screenshots/<section>/<name>.png`. The PNGs are committed; the Pages build
   never runs Playwright. Pages embed screenshots with Markdown images and a caption; every
   screenshot has alt text that names the screen.

    The stack bootstrapping that the frontend e2e suite does today in
    `apps/frontend/e2e/support/global-setup.ts`, `infrastructure.ts` and `processes.ts`
    (Testcontainers Postgres, Redis, MailHog and GreenMail; build the backend, generate the
    spec, start the backend, read the setup token, generate the api client, build and serve the
    frontend) moves into a new shared package `packages/e2e-stack` (package name `e2e-stack`,
    `workspace:*` devDependency of both `frontend` and `docs`). It exports
    `startStack(): Promise<RunningStack>` with `baseUrl`, `apiUrl`, `setupToken`, `mailhogUrl`
    and `stop()`, resolves the repo, backend, frontend and api paths from its own location, owns
    the Testcontainers dependencies, keeps the per-app work directories
    (`apps/*/node_modules/.tmp/e2e`) where they are, and takes part in `pnpm check` with `lint`
    and `typecheck`. The frontend's `global-setup.ts` and the docs' global setup become thin
    wrappers that call `startStack` and publish the values through `process.env`
    (`E2E_BASE_URL`, `E2E_API_URL`, `E2E_SETUP_TOKEN`, `E2E_MAILHOG_URL`). `fixtures.ts`
    (Playwright page helpers and the e2e test data) stays in the frontend. The frontend e2e
    suite must pass unchanged after the move (CI job `frontend-e2e`), and that move is the first
    task of the plan so the docs workspace never depends on frontend internals.

7. **The README shrinks.** It keeps `About`, `Tech stack`, `Local setup`, `CI and release
pipeline`, `License`, gains a "Documentation" paragraph with the Pages URL right after
   `About`, and loses `Production` (all of it except the smoke-test paragraph, see decision 11),
   `Logging`, `Health checks`, `Running behind a reverse proxy`, `Public send API` and
   `Open todos`. Their content moves into the pages named in the Site map; nothing is dropped.
   `TODO.md` stays as the developer backlog; the docs `reference/roadmap` page lists the
   user-visible gaps from both files.
8. **`CLAUDE.md` is updated** in the same change: `apps/docs` and `packages/e2e-stack` in the
   repository layout, the `docs#build` dependency and `env-keys.json` in the contract pipeline
   section, the screenshot script and the shared stack package in the testing section, and a
   working-agreement line: operator-facing documentation lives in `apps/docs`;
   a change to an environment variable, `deploy/compose.yml`, a public endpoint, a background
   job or an admin UI flow updates the matching page in the same change, and the README holds
   developer content only.
9. **Placeholders and conventions** used on every page: `app.example.com` for `SITE_ADDRESS`,
   `mx.example.com` for `MAIL_HOSTNAME`, `mail.example.com` for a customer sending domain,
   `203.0.113.10` / `2001:db8::10` for the server addresses, `/opt/mailer` as the install
   directory, `mailer` as database name and user, `example.org` for recipients, `sdm_…` for API
   keys. Admonitions: `::: tip`, `::: warning`, `::: danger` (data loss: `BACKEND_ENCRYPTION_SECRET`,
   `down -v`, encryption secret rotation). Code blocks carry a language; shell blocks are `bash`.
   UI labels are written in bold with the exact wording from `en.json` (**Projects** → **Add**).
   Headings use sentence case. Pages open with one or two sentences saying what the reader will
   have at the end.
10. **Content is written from the sources listed per page**, by the implementer or by
    subagents, one page per task, each task naming its source files. The README text may be
    reused verbatim where it already meets the quality bar, and is rewritten where it is dense
    (the `Deploying with Docker Compose` paragraph becomes several pages with steps).
11. **The smoke test is maintainer tooling, not operator content.** An operator has
    `compose.yml` and `.env` on a VPS and no checkout, pnpm or local image build, so the docs
    never tell them to run it. The Caddy and docker-mailserver tags are pinned in `compose.yml`
    and change with releases; the operator picks them up through the normal update. The former
    page `updating-mail-and-proxy` is therefore folded into `operations/updating` as a short
    section ("Caddy and the mail server are updated with releases; take the release's
    `compose.yml`"). The README keeps its smoke-test paragraph as developer content, placed under
    `CI and release pipeline`, in whatever wording the smoke-test workspace project leaves there.
12. **The image build stays as it is.** `apps/docs` is added to `.dockerignore` only if the
    `build` stage still passes `pnpm install --frozen-lockfile` without the workspace present
    (pnpm rejects a lockfile whose importers do not match the workspace). If it does not, the
    workspace stays in the context and the extra install time is accepted; either way the builder
    verifies `docker build -t ghcr.io/schwarzdavid/mailer-backend:local .` once and records the
    outcome in the plan.
13. **The image is public at go-live** (owner decision, 2026-10-23). The docs are written for a
    public `ghcr.io/schwarzdavid/mailer-backend`: no `docker login ghcr.io` step, no personal
    access token in `requirements` or `installation/docker-compose`, and `operations/security`
    does not list private packages. The README's remaining `CI and release pipeline` paragraph
    drops the sentence that ties the private default to the login step. One-time owner step
    outside the repo, listed in the plan next to enabling Pages: set the package's visibility to
    public on GitHub after the first release has pushed it (new GHCR packages start private).

## Site map

Paths are relative to `apps/docs/`; every page is one Markdown file. The index page (`index.md`)
uses the VitePress home layout: a one-line tagline ("Self-hosted mail service for websites"),
three actions (Install, Admin guide, API), and feature cards for inbound forms, the send API,
domains and DNS, bounce handling, and projects with roles.

### Introduction (`introduction/`)

| Page             | Content                                                                                                                                                                                                                                                                                                                    | Sources                                                                                           |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `what-is-mailer` | What it does, for whom, the two halves (admin UI, public API), what it is not (no mailbox hosting, no newsletters, no relay for third parties), licence and work-in-progress note                                                                                                                                          | README `About`, `License`                                                                         |
| `how-it-works`   | The stack (backend, Caddy, Postgres, Redis, docker-mailserver) with a diagram; the life of a form submission (store → queue → send → bounce loop); the life of an API send (synchronous); where DKIM, SPF and the return path come in; what runs in the background (DNS check, bounce poller, recovery sweep, trash purge) | README `About`, `CLAUDE.md` (inbound-form deliveries, single-instance jobs), `deploy/compose.yml` |
| `requirements`   | Server (amd64 VPS, Docker Compose ≥ 2.23.1, RAM/disk guidance), network (inbound 25/80/443, outbound 25 unblocked by the provider), two DNS names and a PTR record, a browser for setup; a checklist the reader ticks off before Installation                                                                              | README `Production` step 1, `Dockerfile`, `compose.yml`                                           |

### Installation (`installation/`)

| Page              | Content                                                                                                                                                                                                                                                                                                                                                                                                                                     | Sources                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `prepare-server`  | Install Docker and Compose (the official convenience script and the version check), open the firewall ports, request port 25 unblocking (Hetzner example), set the PTR record, create `/opt/mailer`                                                                                                                                                                                                                                         | README step 1                                                                           |
| `dns`             | Why two names (`SITE_ADDRESS` and `MAIL_HOSTNAME` must differ for Caddy), the A/AAAA records for both, the PTR record, how to check propagation (`dig` commands with expected output)                                                                                                                                                                                                                                                       | README step 1 and 2, `compose.yml` Caddyfile                                            |
| `docker-compose`  | Copy `compose.yml` and `.env.example` from the release's commit (full `curl` commands against `raw.githubusercontent.com/schwarzdavid/mailer/<tag>/deploy/…`), fill `.env` key by key (every key of `deploy/.env.example` explained, secrets with `openssl rand -base64 48`, pin `IMAGE_TAG`), `pull` + `up -d`, create the bounce mailbox and `postmaster` alias within two minutes, why `mail` restarts until Caddy holds the certificate | README steps 2–4, `deploy/.env.example`, `compose.yml`                                  |
| `first-run-setup` | Read the setup token from the log, open `https://app.example.com`, wizard step by step with screenshots (account, sending domain IPs pre-filled from DNS, the seven DNS records to copy with example values), finish while records are still pending, token behaviour on restart and with several instances                                                                                                                                 | README step 4 and 6, `ui-inventory.md` flow A, `SetupTokenService`, settings controller |
| `verify`          | `docker compose ps` expectations, the openssl certificate check, both health endpoints with sample JSON, the DNS health state in the UI, a first test mail through a form or the send API, the sent mail page; a troubleshooting pointer per failed check                                                                                                                                                                                   | README step 5, `Health checks`                                                          |
| `going-live`      | IP warm-up schedule, DMARC policy progression (`p=none` → `quarantine` → `reject`), checking the IP against blocklists, keeping backups from day one, where to look when mail lands in spam                                                                                                                                                                                                                                                 | README step 6 (warm-up); DMARC and blocklist guidance is new, written for operators     |

### Configuration (`configuration/`)

| Page                      | Content                                                                                                                                                                                                                                                                                                           | Sources                                                                                               |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `environment`             | The complete variable reference (decision 5): compose-level variables first, then the backend variables by group, each with Required/Default/Set by compose/Description, then the long-form sections                                                                                                              | `env.schema.ts`, `deploy/.env.example`, `.env.example`, `compose.yml`, README `Local setup` step 2    |
| `external-postgres-redis` | Pointing the backend at managed Postgres or Redis: which `.env` keys, TLS and private CAs (`NODE_EXTRA_CA_CERTS`), `DB_SSL_REJECT_UNAUTHORIZED` as last resort, `DB_POOL_MAX` sizing, Redis `noeviction` and persistence requirements, what happens to the bundled services (remove them from compose)            | README step 2, `CLAUDE.md` (inbound-form deliveries)                                                  |
| `reverse-proxy`           | What Caddy does in the stack, `HTTP_PORT`/`HTTPS_PORT`/`SMTP_PUBLIC_PORT`, `TRUST_PROXY` semantics with the table, putting a CDN or another proxy in front (edit `compose.yml`), Caddy access logs and the `key` redaction filter, running your own proxy instead of Caddy (what the mail certificate then needs) | README `Running behind a reverse proxy`, `Public send API` (log filter), `compose.yml`                |
| `rate-limits`             | Every limit: login and setup (fail closed), public send per key and per IP, form submit and token per IP, their variables, how to read a 429, behaviour when Redis is down                                                                                                                                        | `env.schema.ts`, `app.module.ts` throttlers, README `Running behind a reverse proxy` (last paragraph) |
| `logging`                 | JSON lines in production, `LOG_LEVEL`, request ids and `X-Request-Id`, what is never logged, compose log rotation (`max-size`, `max-file`), reading logs per service, shipping logs elsewhere                                                                                                                     | README `Logging`, `compose.yml` `x-logging`                                                           |
| `health-checks`           | The two endpoints, their checks and timeouts, caching, which one the container healthcheck uses and why, wiring an uptime monitor                                                                                                                                                                                 | README `Health checks`                                                                                |
| `without-docker`          | Running the backend on bare Node: build, `NODE_ENV=production`, the public dir with the built frontend, migrations on start and the migrate CLI, a TLS reverse proxy in front, bringing your own SMTP server and bounce mailbox (`SMTP_*`, `IMAP_*`, `SMTP_REQUIRE_TLS`)                                          | README `Without Docker`, `env.schema.ts`                                                              |

### Admin guide (`admin-guide/`)

| Page                                    | Content                                                                                                                                                                                                                                                                 | Sources                                                                               |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `overview`                              | A tour of the navigation (Dashboard, Projects, Domains, Bounces, Administration: Users, Roles, Settings), the account menu and theme switch, the DNS health alert in the navigation, the "Mail Admin" title, the empty dashboard                                        | `en.json#nav`, `RouteNames.ts`, `ui-inventory.md`                                     |
| `projects`                              | Create a project, assign sending domains, members and project roles, API keys live here, the sent mail page, trash and restore within 30 days                                                                                                                           | `ui-inventory.md` flows C and G, project and mail-message controllers, README `About` |
| `domains`                               | Add a customer sending domain (subdomain recommendation), the SPF/DKIM/DMARC records with example values and what each protects, the DNS health check job and the Refresh button, what Valid/Invalid means, how customer domains relate to the platform sending domain  | `ui-inventory.md` flow D, domain module, README `About` (Domains & DNS)               |
| `inbound-forms/create`                  | Create a form: name, slug, domain, active toggle, the public endpoint URL                                                                                                                                                                                               | `ui-inventory.md` flow C steps 3–4, inbound-form module                               |
| `inbound-forms/fields`                  | Field types, validation rules, how a field is referenced in templates and receivers                                                                                                                                                                                     | inbound-form field DTOs and services                                                  |
| `inbound-forms/security`                | Honeypot, Google reCAPTCHA (keys, where the secret is stored and the plain-text caveat from the open todos), the submission token (`/token`, `waitMs`), rate limits, what each stops and what it does not                                                               | inbound-form security services, `TODO.md`, README `Open todos`                        |
| `inbound-forms/receivers-and-templates` | Receivers (fixed recipient or `{{field}}`, reply-to, active), the Handlebars template editor, field chips, live preview with sample data, draft vs published, versions                                                                                                  | `ui-inventory.md` flow C steps 7–9, template services                                 |
| `inbound-forms/embed`                   | Three ways to submit from a website, each as a complete copy-paste example: plain HTML `<form>` POST, `fetch` with `client.js` and a token, a static-site example page; CORS behaviour, response codes, error handling in the browser                                   | `public-inbound-form.controller.ts`, `inbound-form-client.ts`, submit DTOs            |
| `inbound-forms/deliveries`              | Submission → one delivery per receiver → queue → send; statuses, retry schedule (8 attempts, about two hours), what fails immediately, the recovery sweep, duplicates after a crash, resending a failed delivery (SQL), where deliveries show up                        | README `About` (Inbound forms) and the resend paragraph, `CLAUDE.md`                  |
| `send-api`                              | Create an API key (shown once), the `curl` example, the request fields and limits, every response and error code, synchronous behaviour and client-side retries, header vs `?key=`                                                                                      | README `Public send API`, `public-send.controller.ts`, send DTO                       |
| `bounces`                               | The bounce events list (permanent/transient), how blocks happen (5xx at `RCPT TO`, DSN mails via IMAP, "too many transient"), reviewing and lifting blocks, the growing mailbox                                                                                         | README `About` (Bounce handling), bounce module, `ui-inventory.md` flow H             |
| `users-and-roles`                       | Global roles and permissions, project roles and permissions (the six project permissions), direct extra permissions, custom roles, "nobody grants more than they hold", the two places where access is granted and how they combine                                     | README `About` (Users, roles & permissions), permission module, `ui-inventory.md` F   |
| `settings`                              | The platform sending domain: name from `MAIL_HOSTNAME`, server IPs, the records card and Refresh, what happens when `MAIL_HOSTNAME` changes (SPF include rewrite, DKIM key regenerated, customer DNS updates needed, refuses to start if the name is a customer domain) | README `About` (Platform sending domain), settings module                             |

### Operations (`operations/`)

| Page               | Content                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Sources                                                                   |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `updating`         | Pin tags, take `compose.yml` and diff `.env.example` from the new release, record the running revision, `pull` + `up -d --remove-orphans` + `prune`, migrations on start, a failed migration (log line, rollback semantics, options), the one-off `SequelizeMeta` rename for very old installs, and a short section on Caddy and docker-mailserver: pinned in `compose.yml`, updated with releases, rolled with `docker compose up -d mail` / `proxy` after taking the new file (decision 11) | README step 8 and 10, `Without Docker` rename note                        |
| `rollback`         | Rolling back after a successful update: revert migrations with the current image first (`executed`, `down --to`), then switch `IMAGE_TAG` and `compose.yml`                                                                                                                                                                                                                                                                                                                                   | README step 9                                                             |
| `backup-restore`   | What to back up and why: `postgres-data` (`pg_dump` command via compose), `mail-config` (accounts), `.env` and especially `BACKEND_ENCRYPTION_SECRET`; what not to bother with (`caddy-data` re-obtains certificates, `redis-data` only holds queued jobs, `mail-data` is the bounce mailbox); a restore procedure on a fresh server                                                                                                                                                          | New content derived from `compose.yml` volumes and README step 2 (secret) |
| `rotating-secrets` | Mail password, database password (with the `ALTER USER` step), `BACKEND_JWT_SECRET` (logs everyone out), `BACKEND_ENCRYPTION_SECRET` (cannot be rotated without losing DKIM keys and reCAPTCHA secrets; what to do instead)                                                                                                                                                                                                                                                                   | README step 7 and step 2, `CLAUDE.md`                                     |
| `monitoring`       | Health endpoints for uptime monitors, `docker compose ps`, reading backend and mail logs, following a request id, the DNS health alert in the UI, the sent mail and bounce pages as delivery monitors                                                                                                                                                                                                                                                                                         | README `Logging`, `Health checks`                                         |
| `scaling`          | Several backend instances on one database and Redis, how the background jobs stay single-instance (leases in `locks`, 30 s takeover, skipped overlapping runs, the bounce poller's advisory lock), the setup token caveat, `DB_POOL_MAX` per instance                                                                                                                                                                                                                                         | README `Production` (last paragraphs), `CLAUDE.md` (single-instance jobs) |
| `troubleshooting`  | Symptom → cause → fix entries: `mail` keeps restarting (no certificate yet), nothing is delivered (port 25 blocked, PTR missing), backend restarts after update (migration failed), no setup token in the log (a user exists, or wrong instance), DNS records stay pending, deliveries stuck in `pending`, 503 on login (Redis down), readiness 503 while the site works, mail in spam                                                                                                        | README (various), `CLAUDE.md` (throttler, readiness), `TODO.md`           |
| `security`         | Security headers and CSP exceptions, CORS policy per surface, what the logs never contain, API key handling and the `key` redaction, no relay on port 25, verifying the image you run (pinned `IMAGE_TAG`, the `org.opencontainers.image.revision` label), the AGPL network clause for modified versions                                                                                                                                                                                      | README `Production` (headers paragraph), `Public send API`, `License`     |

### API (`api/`)

| Page        | Content                                                                                                                                                                                                                   | Sources                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `overview`  | The three surfaces (public send API, public form endpoints, admin API), base URL, authentication per surface (Bearer API key, none, JWT from `POST /api/auth/login`), request ids, JSON body limits, no CORS except forms | README `Public send API`, `CLAUDE.md` (configureApp)                |
| `errors`    | The standard Nest error shape, the domain error shape with `code`, every code with its status and meaning, 429 and 413                                                                                                    | README `Public send API`, DTOs and exceptions in the api-key module |
| `reference` | Generated from `openapi.json` (decision 4)                                                                                                                                                                                | `apps/backend/openapi.json`                                         |

### Reference (`reference/`)

| Page            | Content                                                                                                                                                                                                                      | Sources                                             |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `cli`           | The migration CLI inside the container (`up`, `down --to`, `pending`, `executed`) and the docker-mailserver `setup` commands used in the docs (`email add`, `email update`, `alias add`), each with the full compose command | README steps 4, 7, 9, `Without Docker`, `CLAUDE.md` |
| `compose-stack` | Every service, volume, network and published port of `deploy/compose.yml`, what it holds and whether it must be backed up                                                                                                    | `compose.yml`                                       |
| `glossary`      | Short definitions of the terms used across the docs, each linking to the page that uses it                                                                                                                                   | All pages                                           |
| `roadmap`       | Known gaps and planned work in operator terms, from the README's open todos and `TODO.md`                                                                                                                                    | README `Open todos`, `TODO.md`                      |
| `development`   | Two paragraphs: where developer documentation lives (README local setup, `CLAUDE.md`), how to run and build the docs locally, how screenshots are regenerated                                                                | This spec                                           |

About 44 pages. Pages that would be shorter than a few paragraphs are merged into their
neighbour rather than padded.

## Screenshot list

Produced by the script of decision 6 into `apps/docs/public/screenshots/`:

- `installation/onboarding-account.png`, `onboarding-domain.png`, `onboarding-records.png`
- `admin-guide/login.png`, `dashboard.png`
- `admin-guide/projects-list.png`, `project-detail.png`, `project-messages.png`
- `admin-guide/domain-detail.png` (records card with one valid and one invalid record if the
  seed data allows it, otherwise pending)
- `admin-guide/form-detail.png`, `form-fields.png`, `form-security.png`, `form-receivers.png`,
  `template-editor.png`
- `admin-guide/bounces.png`, `blocked-addresses.png`
- `admin-guide/users-list.png`, `user-detail.png`, `roles-list.png`, `role-detail.png`,
  `settings.png`

The exact crop (full page vs the card) is the builder's choice per screenshot; a consistent
rule (full page at 1440×900 unless a dialog is the subject) is written down in the script.

## Left to the builder

- The exact VitePress sidebar wording and ordering within each section, as long as every page
  in the Site map is reachable from a sidebar.
- Whether `env-keys.json` is written by `dist/openapi.js` (second argument) or by a sibling
  `dist/env-keys.js` with its own script; both are acceptable, `generate` stays one Turbo task.
- The implementation of the drift check (Markdown table parser vs a simpler regex over
  `` `VARIABLE` `` cells in the environment page), as long as it fails the build on a mismatch
  and prints the offending names.
- `vitepress-openapi` configuration and the spike that confirms it renders the spec (decision 4
  names the fallback).
- Seed-data details and the Playwright selectors for the screenshot script.
- The internal layout of `packages/e2e-stack` (one module or the three existing files) and how
  it is executed (Playwright loads it as TypeScript through its own loader, so no build step is
  the default; a `build` script is acceptable if a consumer needs one).
- Whether to add a `CNAME`-ready configuration comment or leave `base` alone until a domain exists.
- Diagram tooling for `how-it-works` (an inline SVG or a Mermaid plugin); a static SVG committed
  to `public/` is the default if a plugin adds friction.

## Non-goals

- Developer documentation (architecture internals, build, tests, CI). It stays in the README
  and `CLAUDE.md`; the docs link there once.
- Versioned documentation per release.
- A custom domain, custom theme or branding beyond the default theme with a title.
- Translations.
- Changes to the application itself (no renames, no new endpoints, no Setup CLI). Where the docs
  reveal a product gap, it goes on the roadmap page, not into this project.
- Running Playwright in the Pages workflow.

## Anti-goals

- A page that sends the reader to another site to complete a step.
- Padding: pages that restate the README without adding the steps, commands and verification
  the README skips.
- Documenting behaviour that is not in the code (aspirational docs). The roadmap page is the
  only place for planned behaviour, and it is labelled as such.
- Screenshots that drift from the UI because they were made by hand.
