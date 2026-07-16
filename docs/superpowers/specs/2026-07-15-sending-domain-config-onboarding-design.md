# Sending-Domain Configuration, DNS Health Cron & Onboarding — Design

Date: 2026-07-15
Status: Approved (pending user spec review)

## Goal

Three connected features:

1. A **settings screen** where the platform's sending domain (e.g. `email.schwarzdavid.email`) is configured. The user gets every DNS record required for reliable deliverability (SPF, MX, A/AAAA, DKIM, DMARC, PTR) presented like the existing customer-domain detail screen. Later customization (colors, logo) extends this screen.
2. A **periodic DNS health check** (`@nestjs/schedule` cron) that re-verifies records for all domains and surfaces a healthy/ill indicator in the navigation.
3. A **multi-step onboarding wizard** shown on first start, replacing the auto-seeded admin user: register the first user, configure the sending domain, land in the dashboard. Forms are shared between onboarding and the settings screen; future customization steps append to the wizard.

## Decisions made during brainstorming

- The sending domain is the **platform infrastructure domain**: it replaces the hardcoded SPF include host (`spf.schwarzdavid.email` in `domain-dns.service.ts`) and becomes the bounce/return-path domain (hence MX records). Customer sending domains remain a separate feature.
- The configuration collects **domain + server IPv4 (IPv6 optional)** so SPF/A/MX/PTR records can be generated concretely.
- Onboarding can finish with **pending (unverified) DNS records**; the cron keeps checking and the nav shows ill until valid.
- The cron re-checks **all domains** (sending + customer); the nav indicator reflects **only the sending domain's** health.
- Modeling approach: **reuse the domain tables** — a single-row `settings` table points at a row in `domains`; DKIM generation, `domain_dns` storage and the check machinery are reused.

## Backend

### Settings module (`apps/backend/src/modules/settings/`)

Single-row `settings` table:

| column            | type                    |
| ----------------- | ----------------------- |
| `settingId`       | PK, autoincrement       |
| `sendingDomainId` | nullable FK → `domains` |
| `serverIpv4`      | string                  |
| `serverIpv6`      | nullable string         |
| timestamps        |                         |

Future customization (colors, logo) becomes new columns on this row via migrations.

Endpoints (standard module layering: controller / services / models / interfaces / dtos):

- `GET /settings` (JwtAuth) → `SettingsDto { sendingDomain: SendingDomainDto | null }`. `SendingDomainDto`: fqdn, serverIpv4, serverIpv6, `records: DomainDnsDto`-style list (host, type, use, expected value, current value, status), `lastCheckedAt`.
- `PUT /settings/sending-domain` (JwtAuth) — body `{ fqdn, serverIpv4, serverIpv6? }`:
    - Same fqdn as currently configured → update IPs, regenerate expected record values, reset statuses, trigger an immediate recheck.
    - Different fqdn → create a new domain row via a dedicated `DomainService.createSendingDomain(fqdn, ips)` path (reuses domain + DKIM creation but writes the sending-domain record set below instead of the customer defaults), delete the old sending-domain row, repoint `sendingDomainId`.
    - In both cases regenerate all **customer** domains' expected SPF values to `include:<new fqdn>` and reset their SPF status (the include target changed).
- `POST /settings/sending-domain/refresh` (JwtAuth) → `SendingDomainDto` — manual recheck, backing the refresh button on the records card (the customer `POST /domain/:id/refresh` endpoint is not used for the sending domain).

The sending domain participates in the existing `domains.rootDomain` uniqueness: no customer domain can share its root domain (and vice versa). This is accepted — the system already enforces one domain per root.

### Domain module extensions

**Record set for the sending domain** (created on configure):

| use   | type | host                      | expected value                                                                                                                                                              |
| ----- | ---- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A     | A    | fqdn                      | serverIpv4                                                                                                                                                                  |
| AAAA  | AAAA | fqdn                      | serverIpv6 (only when provided)                                                                                                                                             |
| MX    | MX   | fqdn                      | `10 <fqdn>`                                                                                                                                                                 |
| SPF   | TXT  | fqdn                      | `v=spf1 ip4:<ipv4> [ip6:<ipv6>] -all`                                                                                                                                       |
| DKIM  | TXT  | selector.\_domainkey.fqdn | `v=DKIM1; k=…; p=…` (existing logic)                                                                                                                                        |
| DMARC | TXT  | \_dmarc.fqdn              | `v=DMARC1; p=none;` (existing logic)                                                                                                                                        |
| PTR   | PTR  | server IP                 | fqdn — one PTR row per provided IP (always IPv4, additionally IPv6 when given); checked via `dns.reverse`; UI notes PTR is set at the hosting provider, not in the DNS zone |

**`DomainDnsService.reloadDnsRecords`** dispatches by record type: TXT → `resolve(host, 'TXT')`, A → `resolve4`, AAAA → `resolve6`, MX → `resolveMx` (compare priority + exchange), PTR → `reverse(ip)`. Targeted improvement: the current "multiple TXT records → throw" behavior breaks on hosts carrying unrelated TXT records; instead the check passes when **any** returned TXT value equals the expected one (`current` stores the matching value when found, otherwise the first returned value).

**SPF include host**: `SPF_MAILER` constant is removed. Customer-domain SPF generation looks up the configured sending domain's fqdn. To avoid a circular Nest module dependency (settings → domain for creation; domain → settings for the include host), the domain module reads the settings row at the **model** level (`SequelizeModule.forFeature([SettingsModel])` in `DomainModule`), not via `SettingsService`. Creating a customer domain while no sending domain is configured → 400.

**`getDomains()`** excludes the sending domain so it never appears in the customer Domains list (`getDomainById` for it is likewise not reachable from the list UI).

**Schema migration `008`**:

- Create `settings` table.
- `domain_dns.host` is currently globally unique (migration 004), but the sending domain's A, MX and SPF records share the same host. Replace with a composite unique on `(host, use)`.
- New `use`/`type` values are plain strings in existing columns — no enum change needed (only `status` is a PG enum, unchanged).

### DNS health cron

`DnsHealthService` in the domain module, `@Cron` every 15 minutes: iterate all domains, call `reloadDnsRecords` per domain, log and continue on per-domain failure (a tick must never crash). This keeps `lastCheckedAt` and statuses fresh for both the nav indicator and the customer domain screens.

### Mail flow

`MailService.sendMail` derives the envelope from (bounce address) as `bounce@<sending fqdn>` by looking up the configured sending domain (mail module already imports the domain module). `BOUNCE_ADDRESS` env var is removed (`.env.example` updated). Without a configured sending domain the envelope stays unset — identical to today's missing-env behavior. IMAP mailbox credentials (`IMAP_*`) stay env-based.

### Setup module (onboarding backend)

`BootstrapService` (admin seeding) and `ADMIN_EMAIL` are deleted. New `setup` module:

- `GET /setup/status` (`@Public`) → `{ needsSetup: boolean }` — true while the users table is empty.
- `POST /setup/user` (`@Public`) — `{ firstName, lastName, email, password }` → the same `AuthenticationDto` as login (token + user) so onboarding continues authenticated. Returns 403 as soon as any user exists; the count check + insert run inside a transaction to prevent racing duplicate "first" users.

The sending-domain onboarding step uses the regular authenticated `PUT /settings/sending-domain` — no dedicated onboarding API, which is what makes the forms reusable.

## Frontend

### Shared components (new `settings` module, `apps/frontend/src/modules/settings/`)

- `components/SendingDomainForm.vue` — fqdn / IPv4 / IPv6 (optional); vee-validate + Zod (IP format validation; fqdn hostname check via tldts like `AddDomainDialog`); submits `useSendingDomainMutation`; emits `saved`.
- `components/SendingDomainRecordsCard.vue` — full record list grouped with per-record title/description, refresh button, last-checked timestamp; visually mirrors `DomainDnsCard`. The row partial `DomainDnsRecord.vue` moves from `modules/domains/views/details/partials/` to `modules/domains/components/` so both cards share it.
- Queries/mutations: `useSettingsQuery` (`['settings']`), `useSetupStatusQuery` (`['setup.status']`), `useSendingDomainMutation`, `useRegisterMutation` (stores the JWT exactly like `useLoginMutation`); cache updates via `queryClient.setQueryData`.

### Settings screen

Route `/settings` (`RouteNames.SETTINGS`) under `AppLayout`. `SettingsView.vue` is section-based; first section "Sending domain": setup prompt when unconfigured, otherwise form + records card. Future sections (colors, logo) append.

### Nav health indicator

`AppLayout` gains a Settings tab whose icon reflects sending-domain health from `useSettingsQuery` with `refetchInterval: 60_000`: green check when all records valid; warning when any record is invalid **or** nothing is configured.

### Onboarding wizard

Route `/onboarding` (`RouteNames.ONBOARDING`) outside `AppLayout`; `OnboardingView.vue` renders a Vuetify `VStepper` driven by a steps array (future steps append):

1. **Account** — registration form → `useRegisterMutation` → JWT stored.
2. **Sending domain** — `SendingDomainForm`; after save, `SendingDomainRecordsCard` shows the records. "Finish" enables once the config is saved (records may still be pending) → dashboard.

### Routing gate

Global `beforeEach` resolves `useSetupStatusQuery` first (public, cached): `needsSetup` → everything redirects to `/onboarding`; otherwise `/onboarding` redirects to login/dashboard. After registration the setup-status cache is updated so the guard doesn't eject the user mid-wizard. The existing auth guard is unchanged.

### i18n & contract

Copy under `module.settings.*` / `module.onboarding.*`; shared field labels + validation keys at root, added together with Zod constraints. After backend endpoint changes: `pnpm --filter backend generate` → `pnpm --filter api build`; the frontend consumes only the generated SDK/types.

## Testing

- **Backend unit**: settings service (configure, reconfigure, customer-SPF regeneration); setup controller/service (first-user-only guard, transaction path); DNS service per-type resolution + multi-TXT tolerance (mock `node:dns/promises` as the existing spec does); mail service envelope derivation; cron service delegation and error isolation. Typed mocks per repo convention.
- **Frontend**: `SendingDomainForm`, onboarding step flow, settings view states, nav indicator states — via `mountView` / `withVueQuery`.
- **e2e**: boot without seeded admin; `POST /setup/user` succeeds once then 403s; onboarding-to-authenticated flow.

## Out of scope (explicitly)

- Colors/logo customization (future settings columns + onboarding steps — the structure anticipates them, nothing more).
- Configurable SMTP relay settings in the UI (stay env-based).
- Multi-user management / invitations; registration exists only for the first user.
