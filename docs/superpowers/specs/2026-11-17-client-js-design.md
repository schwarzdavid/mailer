# client-js — Design

Date: 2026-11-17
Status: Draft for owner review (all open questions settled 2026-11-17)

## Intent

Websites and backends that talk to mailer today either load the server-served `client.js`
(`GET /api/v1/forms/client.js`, which only provides `InboundForm.getToken(formKey)`) or hand-write
`fetch` calls. Neither gives IDE completion or TypeScript types, and every integrator re-implements
the same submit body, token reuse rule and error handling (see examples 2 and 3 in
`apps/docs/admin-guide/inbound-forms/embed.md`).

The owner wants a typed JavaScript/TypeScript client, installed from npm, that is configured with
nothing but the server's address. It is the first of a family: later clients for other languages
would be named `client-java`, `client-php` and so on, so this one is `client-js`, and it works in
browsers and in Node alike.

## Goals

1. A new workspace package `packages/client-js`, published to npm, with zero runtime dependencies
   (only the platform's `fetch`).
2. Forms (browser and server): request a timed token (waiting out its minimum delay), submit a form,
   and get typed, branchable errors.
3. Send (server only): call `POST /api/v1/send` with an API key.
4. The server-served `client.js` keeps working for script-tag users and is built from the same
   package, so there is one implementation.
5. The client's types cannot silently drift from the backend's contract.

## Non-goals

- Typing a form's `data` or `security` per form (no code generation from a form's field list).
  Matching `data`/`security` to the form's configuration is the integrator's job; the client takes
  `Record<string, unknown>`, optionally narrowed by a generic the integrator supplies.
- The admin API (JWT endpoints). It stays an internal contract (`packages/api`).
- Clients for other languages.
- Automatic retries. The client reports whether an error is worth retrying; the caller decides.
- Framework bindings (Vue/React composables) and DOM helpers that serialise an HTML form.

## Anti-goals

- An API key reaching a browser bundle or a URL by accident. The send client never uses the
  `?key=` fallback and refuses to run where a DOM is present unless the caller opts in explicitly.
- Existing embeds breaking: the `client.js` URL, its script-tag behaviour and
  `InboundForm.getToken` stay as they are.
- A client that compiles against a backend contract that no longer exists.

## Approaches

Considered in the conversation of 2026-11-17:

- **A — one package, one entry point, hand-written, type-checked against the generated contract
  (chosen).** `@schwarzdavid/mailer-client` exports forms, send and errors; a few hundred lines of `fetch` code, with
  a type-level test against `packages/api`. The server's `client.js` becomes the package's IIFE
  build. Trade-off: one package serves two audiences; the DOM guard and the docs keep the send
  client out of browsers, and `sideEffects: false` lets bundlers drop it from websites. (The
  first version had separate `/forms` and `/send` entry points; the owner merged them into one
  on 2026-11-17 because a few kB more are irrelevant, tree-shaking removes them, and one import
  path is simpler.)
- **B — two packages (`client-web` for forms, `client-node` for send).** The clearest
  browser/server split, but double publishing and versioning, and the error types would be
  duplicated or need a third package. Too much overhead for two features.
- **C — generate the client from a public-only OpenAPI spec with openapi-ts.** Less hand-written
  code, but it ships the hey-api client runtime, its errors are less ergonomic, and the token
  waiting and reuse logic still has to be written by hand.

The owner picked A and named the package `client-js` (environment-neutral; later siblings
`client-java`, `client-php`).

## Design

### Package

- Location `packages/client-js`. The workspace `name` is the published npm name, so no rename
  happens at publish time and every import, snippet and doc uses the final name from the start
  (design call). The scope is `@schwarzdavid`, matching the image `ghcr.io/schwarzdavid/mailer`
  (owner, 2026-11-17); the full name is `@schwarzdavid/mailer-client`;
  the folder stays `packages/client-js`.
  `publishConfig.access: public`.
- Registry: the public npm registry (npmjs.com), where the owner's user `schwarzdavid` already owns
  the `@schwarzdavid` scope. Not GitHub Packages: a consumer's `.npmrc` maps a whole scope to one
  registry, so every other `@schwarzdavid/*` package would then be looked up there too, and GitHub
  Packages requires a token even to install public packages.
- Licence: MIT (owner, 2026-11-17), with its own `LICENSE` file in the package and `"license": "MIT"`.
  The rest of the repository stays AGPL-3.0-only; the README and the package README state the
  exception. The IIFE bundle served by the backend is the same MIT code.
- ESM only, `"type": "module"`, `sideEffects: false`, targets ES2022, Node ≥ 20 and evergreen
  browsers. Ships `.js` plus bundled `.d.ts`; the published package does not depend on `api` or
  any other workspace package.
- `exports`: `.` (everything: forms, send, errors, `ClientOptions`), plus a top-level `types`
  field for `moduleResolution: node10`. The IIFE bundle for
  the server is a build output, exported as `./client.iife.js` so the backend can resolve it.
- Version: the same semver as the GitHub release that publishes the server image (lockstep). A
  client version is documented as working with servers of the same version; nothing negotiates
  versions at runtime.

### Configuration

Every client takes one options object:

```ts
interface ClientOptions {
    baseUrl: string // 'https://app.example.com' — the address mailer is served at
    fetch?: typeof fetch // injectable for tests and unusual runtimes
    timeoutMs?: number // per request, default 30 000; aborts via AbortSignal.timeout
}
```

`baseUrl` is the site address, not the API root; the client appends `/api/v1/...`. A trailing slash
is tolerated.

### Forms

The main API is the class `MailerForm`, bound to one form, which automates the timed token
(owner, 2026-11-17):

```ts
import { MailerForm } from '@schwarzdavid/mailer-client'

const contact = new MailerForm({
    baseUrl: 'https://app.example.com',
    formKey: '3f9a0c1e7b2d4a6f8e5c9b0d1a2f4e6c',
    timedToken: { key: 'formToken', location: 'body' }, // omit for forms without the check
})

formElement.addEventListener('focusin', () => contact.prepare()) // optional, recommended

await contact.submit({
    data: { name, email, message },
    security: { website: '' }, // other body-located checks
    headers: { 'X-Captcha': captcha }, // header-located checks (optional)
    query: { ref: 'footer' }, // query-located checks (optional)
}) // → { status: 'accepted' }
```

- **Token automation is on when `timedToken` is given, off when it is omitted.** Not on by default,
  because the token endpoint answers `404 Unknown form` for a form without a timed-token check, so
  a default-on class would make every such form fail with a misleading error. The admin UI snippet
  fills `timedToken` with the form's configured key and location, so integrators copy it rather
  than look it up.
- **The token is fetched lazily**, on `prepare()` or at the latest inside `submit`, never in the
  constructor. Token requests are limited to 5 per 10 minutes per form and client IP
  (`FORM_TOKEN_RATE_LIMIT`), so fetching on construction would spend one per page view and a
  footer form would hit `429` after five pages. Without `prepare()`, `submit` waits out the minimum
  delay (about 3 s by default); the docs recommend `prepare()` on `focusin`.
- `prepare()` returns nothing and never rejects (it is called from event listeners); a failed
  request is simply dropped and `submit` requests again, surfacing the error there.
- `submit` awaits the token (resolving after `waitMs`) and places it under `timedToken.key` in the
  body's `security`, a header or the query string, according to `timedToken.location`; a value
  the caller passed under the same key is replaced.
- The class caches one token request, drops it when the request fails, and drops it after every
  submit answer except `400` (a `400` leaves the token unused, so the visitor can correct a field
  and resend), which is the rule the embed docs describe today. It also drops a cached token once
  its `expiresAt` has passed, so a visitor who focused the form long ago gets a fresh token instead
  of a `403` (design call). `notBefore`/`expiresAt` are parsed from the ISO strings internally and
  are not public API.
- `MailerForm` takes optional generics for `data` and `security` so integrators can type their own
  form; the client never validates them.

A low-level client stays available for custom flows and is what the script-tag global uses:

```ts
import { createFormClient } from '@schwarzdavid/mailer-client'

const forms = createFormClient({ baseUrl: 'https://app.example.com' })
const token = await forms.getToken(formKey) // resolves after waitMs
await forms.submit(formKey, { data, security: { formToken: token } })
```

- `getToken` behaves exactly like today's `InboundForm.getToken`: `POST /api/v1/forms/<key>/token`
  with `credentials: 'omit'`, waits `waitMs`, shares one in-flight request per form key, and
  returns the bare token string.
- `submit` sends JSON `{ data, security? }`, adds `headers` and `query`, `credentials: 'omit'`, and
  does no token handling. `MailerForm` is built on these two functions.

### Send

A class too, for symmetry with `MailerForm` (owner, 2026-11-17):

```ts
import { MailerSender } from '@schwarzdavid/mailer-client'

const mailer = new MailerSender({ baseUrl: 'https://app.example.com', apiKey: process.env.MAILER_API_KEY })
const { mailMessageId } = await mailer.send({ from, to, replyTo, subject, html, text })
```

- `Authorization: Bearer <apiKey>` only; never the query-string fallback.
- The constructor throws when `globalThis.document` exists, with a message that explains the key
  must stay on a server and names the override. (Workers and Deno have no `document` and are
  allowed.) The owner wants an explicit override rather than a hard ban (2026-11-17): the option
  `dangerouslyAllowBrowser: true` skips the check, for internal tools where exposing the key to
  the browser is an accepted risk. The name follows the convention of other API SDKs (OpenAI,
  Anthropic) and was confirmed by the owner.
- The request type mirrors `PublicSendDto`: `from`, `to`, `subject`, `html` required; `replyTo`,
  `text` optional.

### Errors

One exported error class, `MailerError`, thrown for every non-2xx answer and for transport
failures:

- `status: number` — HTTP status, `0` for network failure or timeout.
- `code?: string` — the send endpoint's stable code (`FROM_DOMAIN_NOT_ALLOWED`,
  `FROM_DOMAIN_NOT_READY`, `RECIPIENT_BLOCKED`, `DELIVERY_FAILED`), typed as a string-literal
  union that still accepts unknown strings.
- `messages: string[]` — `message` normalised to a list (validation errors are already a list).
- `mailMessageId?: number` — present on `RECIPIENT_BLOCKED` and `DELIVERY_FAILED`.
- `retryable: boolean` — `true` for `0`, `429`, `502`, `503`; `false` otherwise. Mirrors
  "Which errors to retry" in `apps/docs/api/errors.md`.
- `cause` — the original error for transport failures.

Bodies that are not JSON (`413` from the proxy) yield `messages: []`. `getToken` rejections keep a
numeric `status`, so code written against today's `client.js` (`error.status`) still works.

### Drift guard

`client-js` has `api` as a **dev** dependency only. A type test (`*.test-d.ts` run by Vitest's
typecheck mode, or an equivalent `tsc` check) asserts that the client's request and response types
are mutually assignable with the generated `PublicSendDto`, `PublicSendResultDto`,
`InboundFormSubmitDto` and `InboundFormSubmitResultDto`, and with
`Pick<InboundFormTokenDto, 'token' | 'waitMs'>` (the generated token type carries `notBefore` and
`expiresAt` as `Date` because `packages/api` runs the hey-api transformers, while the wire format
is ISO strings, so those two fields are checked by a unit test instead). A backend DTO change then
fails `pnpm typecheck`/`pnpm test`.

Task wiring: the backend depends on `client-js` at runtime, and `client-js` depends on `api` only
for this check, so a plain `^build` on `client-js#build` would form a cycle
(`client-js#build → api#build → backend#generate → backend#build → client-js#build`).
`client-js#build` therefore depends on nothing from the workspace, and only `client-js#typecheck`
and `client-js#test` depend on `api#build`, as explicit entries in `turbo.json`.

### Server-served client.js

- `apps/backend/src/modules/inbound-form/client/inbound-form-client.ts` (the `toString()`-serialised
  installer) is removed. Its behaviour moves into `client-js`.
- `client-js` builds an IIFE bundle that derives the base URL from `document.currentScript.src`
  (stripping `/api/v1/forms/client.js` and any query or hash) and assigns
  `window.InboundForm = { ...createFormClient({ baseUrl }), MailerForm }`, with `MailerForm`
  defaulting its `baseUrl` to the derived one. `InboundForm.getToken` keeps its behaviour; `submit`
  and `new InboundForm.MailerForm({ formKey, timedToken })` become available to script-tag users
  as well.
- The backend gets `client-js` as a regular dependency (so `pnpm --filter backend deploy --prod`
  ships it into the image), resolves `@schwarzdavid/mailer-client/client.iife.js` once at startup, and serves it
  from the existing route with the existing headers (`Cache-Control: public, max-age=86400`,
  `Cross-Origin-Resource-Policy: cross-origin`). A missing bundle fails startup, like the missing
  SPA `index.html` does. Under `pnpm dev` the bundle comes from the workspace build; Turbo's
  `^build` already orders `client-js#build` before `backend#build`.
- The route stays in the OpenAPI spec as today.

### Admin UI

The integration snippets on a form's page (`TimedTokenInfo.vue`, `exampleRequest`,
`securityPlacement` in `integrationSnippets.ts`) switch to the client's API: an
`npm install @schwarzdavid/mailer-client` line plus `import { MailerForm } ...`, followed by the
`new MailerForm({ … })` call prefilled with the form's key and, when the form has a timed-token
check, its `timedToken` key and location, then `prepare()` and `submit`. The script-tag line stays as the
alternative for sites without a bundler. Copy goes into `en.json` under the existing
`module.inboundForms.details.security.info.*` keys.

### Release

- A published GitHub release publishes `client-js` to npm in `.github/workflows/ci.yml`, after the
  `image` job succeeds, with the release's version (`v1.4.0` → `1.4.0`) written into the package
  before `pnpm publish`. Pre-releases publish under the dist-tag `next`, others under `latest`.
- Authentication through npm trusted publishing (OIDC, `id-token: write`, with provenance), so no
  long-lived npm token is stored. If the owner prefers an `NPM_TOKEN` secret, only this step changes.
  The builder checks npm's current docs on whether a trusted publisher can be configured before the
  package exists; if not, the plan includes a one-off manual first publish by the owner, described
  in `CONTRIBUTING.md`, after which the trusted publisher is set to `ci.yml`.
- Pushes and pull requests build and test the package but never publish; a `pnpm pack` dry run in
  `check` (or the builder's equivalent) catches a broken `files`/`exports` map.

### Testing

- `client-js` unit tests (Vitest, injected `fetch`): URL building, token wait and de-duplication,
  `MailerForm`'s lazy fetch, token placement per location and reuse rule (including expiry), error normalisation for every status
  in the docs' tables, non-JSON bodies, timeouts, `MailerSender`'s DOM guard, its `dangerouslyAllowBrowser` override and Bearer header.
  The existing `inbound-form-client.spec.ts` cases move here.
- The IIFE bundle gets a test that loads it in a jsdom-like context with a `currentScript` and
  checks `window.InboundForm.getToken` against a stub `fetch`.
- Backend e2e (`inbound-form.e2e-spec.ts`, `public-send` tests): the existing `client.js` route
  tests stay; add one test per feature (forms, send) that runs the real `client-js` against the e2e app
  (token → submit → `202`; send → `202` and a `MailerError` with `code` for a refused From domain).
- The smoke test keeps checking that `client.js` is served from the image, which now proves the
  bundle made it into `pnpm deploy`.

### Documentation

`CLAUDE.md` requires the operator docs to change with a public endpoint's behaviour:

- `apps/docs/admin-guide/inbound-forms/embed.md`: example 2 uses `MailerForm` from the npm package; the script-tag
  variant stays, shortened through `InboundForm.MailerForm`; example 3 keeps its full page but
  uses `MailerForm`.
- `apps/docs/admin-guide/inbound-forms/security.md` (timed token section): mention the package
  next to `client.js`.
- `apps/docs/api/overview.md`: a "Send with mailer-client" section using `MailerSender` next to the curl example.
- A new reference page for the client (install, configuration, forms, send, errors, version
  compatibility), registered in the sidebar so the docs tests pass.
- `CONTRIBUTING.md`: the npm publish step of the release pipeline. `CLAUDE.md`: the seventh
  workspace in the layout list. README: a link to the package.

## Left to the builder

- Build tool for ESM + `.d.ts` + IIFE (tsdown, tsup or Vite library mode); pick one that bundles
  declarations so the published types do not import from `api`.
- Exact file layout inside `packages/client-js`, and how the type test is wired into Turbo.
- Whether `retryable` is a getter or a field, and the exact names of error-code union types.
- Whether `ClientOptions.timeoutMs` also applies to the token's `waitMs` (it should not; the wait is
  local).

## Open questions (owner)

None. Settled with the owner on 2026-11-17: the name `@schwarzdavid/mailer-client` on npmjs, MIT,
trusted publishing, `dangerouslyAllowBrowser`, `MailerForm` with opt-in token automation, and
`MailerSender`.
