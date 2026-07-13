# Bounce Handling — Design

Date: 2026-07-13
Status: Approved by owner (design dialogue); pending spec review

## Goal

Track email bounces, show them in the UI with their reasons, and automatically block
recipient addresses that bounce permanently (or repeatedly transiently). Sending to a
blocked address fails fast with an error. Blocks can be lifted manually in the UI.

## Context

- Outbound mail goes through nodemailer to a generic SMTP relay (`SMTP_*` env keys,
  MailHog in dev). The app signs DKIM itself (`MailService`).
- There is no inbound mail path today. Bounces (DSNs) are lost.
- Deliveries are tracked in `inbound_form_delivery` (PENDING / SENT / FAILED + error
  text); the delivery loop in `InboundFormSubmissionService.processDeliveries` catches
  send errors and marks the delivery FAILED.
- The app may later run as two instances behind a load balancer; the same bounce must
  not be processed twice.

## Decisions (from design dialogue)

1. **Bounce source:** IMAP polling of a dedicated bounce mailbox, plus unified
   recording of synchronous SMTP 5xx rejections at send time.
2. **Block policy:** escalating duration for permanent bounces; transient bounces
   block after a threshold is reached.
3. **Multi-instance coordination:** Postgres advisory lock (transaction-scoped), with
   a unique DSN Message-ID constraint as idempotency backstop.
4. **UI:** one new menu entry ("Bounces") with two tabs — bounce event log and blocked
   addresses with unblock action.
5. **No app-side retry queue:** the SMTP relay already retries transient failures for
   days before returning a final DSN; duplicating that is out of scope.

## Backend

New feature module `apps/backend/src/modules/bounce/` following the standard layering
(controller / services / models / interfaces / dtos).

### Data model — migration `007-create-bounces.ts`

Table `bounce` (event log):

| Column                | Type        | Notes                                               |
| --------------------- | ----------- | --------------------------------------------------- |
| bounceId              | INTEGER PK  | autoincrement                                       |
| emailAddress          | STRING(255) | not null, indexed                                   |
| type                  | STRING(255) | `permanent` \| `transient`                          |
| statusCode            | STRING(16)  | nullable; DSN status (`5.1.1`) or SMTP code (`550`) |
| reason                | TEXT        | diagnostic text from DSN or transporter error       |
| messageId             | STRING(998) | nullable; DSN Message-ID (null for sync bounces)    |
| receivedAt            | DATE        | not null                                            |
| createdAt / updatedAt | DATE        | standard                                            |

Idempotency: a **unique index on `(messageId, emailAddress)`** — one DSN can report
several recipients, so the Message-ID alone must not be unique. Postgres permits
multiple NULL `messageId` rows, so sync-recorded bounces are unaffected.

Table `email_block` (one row per address with block history):

| Column                | Type        | Notes                                                     |
| --------------------- | ----------- | --------------------------------------------------------- |
| emailBlockId          | INTEGER PK  | autoincrement                                             |
| emailAddress          | STRING(255) | not null, **unique**                                      |
| blockCount            | INTEGER     | not null, default 0; escalation level                     |
| blockedUntil          | DATE        | nullable; null = not currently blocked (history retained) |
| createdAt / updatedAt | DATE        | standard                                                  |

Address matching is case-insensitive: addresses are lowercased before insert/lookup.

### Services

**`EmailBlockService`**

- Constants: `BLOCK_LADDER_DAYS = [7, 30, 90, 365]`,
  `TRANSIENT_THRESHOLD = 3`, `TRANSIENT_WINDOW_DAYS = 7`.
- `applyBlock(emailAddress)`: find-or-create the `email_block` row. If currently
  blocked (`blockedUntil > now`) do nothing (a burst of DSNs escalates once). Otherwise
  increment `blockCount` and set
  `blockedUntil = now + BLOCK_LADDER_DAYS[min(blockCount - 1, 3)]`.
- `assertNotBlocked(emailAddress)`: throws `EmailBlockedException` (plain Error
  subclass carrying the address and `blockedUntil`) when actively blocked.
- `getBlockedAddresses()`: rows with `blockedUntil > now`, ordered by `blockedUntil`
  descending.
- `unblock(emailBlockId)`: sets `blockedUntil = null`; `blockCount` is preserved so the
  next bounce escalates from where it left off. Throws NotFound for unknown id.

**`BounceService`**

- `recordBounce({ emailAddress, type, statusCode, reason, messageId, receivedAt })`:
  inserts a `bounce` row; a unique-constraint violation on `(messageId, emailAddress)`
  means this DSN recipient was already processed → return without side effects. Then
  applies blocking rules:
    - `permanent` → `EmailBlockService.applyBlock`.
    - `transient` → count transient bounces for the address within
      `TRANSIENT_WINDOW_DAYS`, including the one just recorded; if
      `>= TRANSIENT_THRESHOLD` → `applyBlock`.
- `getBounces()`: all bounce rows, newest first.

**`DsnParserService`**

- Input: raw RFC822 message source. Uses `mailparser`.
- Finds the `message/delivery-status` MIME part; extracts per-recipient fields:
  `Final-Recipient` (fallback `Original-Recipient`), `Action`, `Status`,
  `Diagnostic-Code`.
- Classification: `Action: failed` with `5.x.x` status → `permanent`; `4.x.x` status or
  `Action: delayed` → `transient`; anything else (relayed/expanded/delivered) → ignore.
- Returns a parsed bounce per failed recipient (a DSN can report several), or an empty
  result for non-DSN mail.
- The DSN's own `Message-ID` header is used as the idempotency key.

**`BounceMailboxService`** (IMAP poller)

- Uses `imapflow`. Config from env: `IMAP_HOST`, `IMAP_PORT`, `IMAP_SECURE`,
  `IMAP_USER`, `IMAP_PASSWORD`, optional `IMAP_POLL_INTERVAL_SECONDS` (default 60).
- If `IMAP_HOST` is not set, the poller does not start; one warning is logged
  (dev/MailHog stays functional).
- Lifecycle: `onApplicationBootstrap` starts a `setInterval`; `onApplicationShutdown`
  clears it. Overlapping rounds are prevented with an in-process "round running" flag.
- Poll round, wrapped in a `sequelize.transaction` whose only purpose is to pin a
  connection for the advisory lock (bounce writes below run on their own pooled
  connections; the unique `messageId` guards against any double-processing):
    1. `SELECT pg_try_advisory_xact_lock(<constant bigint key>)` — if `false`, another
       instance is polling; skip the round. The lock releases automatically at
       transaction end (commit, rollback, or crash).
    2. Connect to IMAP, search INBOX for unseen messages.
    3. For each message: download source → `DsnParserService` → for each parsed bounce
       `BounceService.recordBounce(...)` → mark message `\Seen`.
    4. Non-DSN messages are marked seen and skipped (debug log).
- Errors in a round are logged and do not kill the interval; the IMAP connection is
  opened and closed per round.

### MailService changes

- Inject `EmailBlockService` and `BounceService` (`MailModule` imports `BounceModule`;
  no dependency from bounce back to mail, so no cycle).
- Before sending: `await emailBlockService.assertNotBlocked(mail.to)`.
- Envelope: `envelope: { from: BOUNCE_ADDRESS, to: mail.to }` so DSNs return to the
  bounce mailbox. New env key `BOUNCE_ADDRESS`; when unset, the envelope is left as
  today (header From) and only sync bounces are captured. DMARC note: Return-Path
  domain may differ from the From domain — DMARC still passes via DKIM alignment.
- Catch transporter errors: when the error carries `responseCode >= 500`, record a
  permanent bounce (`messageId: null`, `statusCode` from the response code, `reason`
  from the error message), then rethrow. Other errors rethrow untouched.
- The existing delivery loop needs no change: `EmailBlockedException` is caught there
  and the delivery is marked FAILED with the block message.

### HTTP API (`BounceController`, `@JwtAuth`, tag `bounce`)

`@Controller('bounce')` — singular, matching `user` / `domain` / `inbound-form`.

| Route                                  | Returns                                    |
| -------------------------------------- | ------------------------------------------ |
| `GET /bounce`                          | `BounceDto[]` — event log, newest first    |
| `GET /bounce/blocked`                  | `EmailBlockDto[]` — active blocks only     |
| `DELETE /bounce/blocked/:emailBlockId` | `EmailBlockDto` — the row after unblocking |

DTOs follow house conventions: services return raw domain rows; controllers map to
class-transformer DTOs with `@ResponseDto(...)` / `@SerializeOptions` stripping at the
boundary; `@ApiProperty` via the swagger CLI plugin.

After the endpoints exist: `pnpm --filter backend generate` then
`pnpm --filter api build` to regenerate the typed client.

## Frontend

New module `apps/frontend/src/modules/bounces/`.

- Route `/bounces`, `RouteNames.BOUNCE_LIST`, view `BounceListView` under `AppLayout`;
  nav tab in `AppLayout` after Forms (`module.bounces.nav`).
- `BounceListView` hosts two Vuetify tabs:
    - **Bounces** (`partials/BounceTable.vue`): address, type (chip: error color for
      permanent, warning for transient), status code, reason, received date.
    - **Blocked** (`partials/BlockedTable.vue`): address, blocked-until, block count,
      unblock button per row.
- Server state via composables: `queries/useBouncesQuery.ts` (key `['bounces']`),
  `queries/useBlockedAddressesQuery.ts` (key `['bounces.blocked']`),
  `mutations/useUnblockMutation.ts` (calls the delete endpoint, then invalidates
  `['bounces.blocked']`). Components never call the SDK directly.
- i18n: all copy under `module.bounces.*` in `src/locales/en.json` (global JSON only).

## Configuration

New keys in `.env` / `.env.example`:

```
BOUNCE_ADDRESS=
IMAP_HOST=
IMAP_PORT=993
IMAP_SECURE=true
IMAP_USER=
IMAP_PASSWORD=
IMAP_POLL_INTERVAL_SECONDS=60
```

All optional; without `IMAP_HOST` the poller is off, without `BOUNCE_ADDRESS` the
envelope behaves as today.

## New dependencies

- `imapflow` — IMAP client (nodemailer ecosystem)
- `mailparser` + `@types/mailparser` — MIME/DSN parsing

## Testing

Backend unit tests (Vitest, beside source, typed mocks per house style):

- `dsn-parser.service.spec.ts`: fixtures for a permanent DSN (5.1.1), transient DSN
  (4.2.2 mailbox full), delayed notification, multi-recipient DSN, and a non-DSN mail.
- `email-block.service.spec.ts`: ladder progression 7→30→90→365, cap at 365,
  no-escalation while actively blocked, unblock preserves `blockCount`,
  `assertNotBlocked` throws only during an active block, transient threshold applies
  the same ladder.
- `bounce.service.spec.ts`: records + triggers block for permanent; transient below /
  at threshold; duplicate `messageId` is a no-op.
- `bounce-mailbox.service.spec.ts`: skips round when advisory lock is not acquired;
  processes unseen messages and marks them seen; disabled without `IMAP_HOST`
  (mocked imapflow).
- `mail.service.spec.ts` (extend): blocked recipient throws before the transporter is
  touched; 5xx transporter error records a permanent bounce and rethrows; envelope
  carries `BOUNCE_ADDRESS`.
- `bounce.controller.spec.ts`: routes delegate to services and map DTOs.

Frontend tests (`__tests__`, `mountView` / `withVueQuery`):

- `BounceListView.spec.ts`: both tabs render rows from mocked queries; unblock button
  triggers the mutation.
- Composables: query keys and SDK call wiring.

Full gate before completion: `pnpm check` (lint + typecheck + test + format).

## Out of scope

- App-side retry/queue for transient failures (the relay owns retries).
- VERP (per-delivery return-path addresses) and correlating bounces back to
  `inbound_form_delivery` rows.
- Pagination of the bounce log (matches current list endpoints; can be added when
  volume demands it).
- Automatic purge of old bounce rows.
