# Smoke Test Workspace — Design

Date: 2026-10-22
Status: Approved by owner (chat, 2026-10-22)

## Goal

Replace `deploy/smoke-test.sh` (about 450 lines of Bash) with a Vitest suite in TypeScript that
checks the same things against the same throwaway production stack. Every check gets a name, a
readable assertion and a bounded timeout, and a failure prints a diff instead of a `FAIL …` line.
It is a one-to-one port: no check is added, none is dropped, except the standalone
`every response carried X-Robots-Tag` line, which becomes an assertion inside the HTTP helper.

## Context

- The Bash script starts the production stack from `deploy/compose.yml` in a temp dir (compose
  project `mailer-smoke`, ports 18080/18443/18025, `SITE_ADDRESS=:80`, a throwaway CA for the
  mail certificate), runs 31 checks in a fixed order (the stack's state evolves: no mail, then
  mail, then the certificate is removed and renewed, then a migration fails, then an update) and
  ends with `down -v`.
- It needs Docker, curl and openssl. The CI job `image` runs it with `IMAGE_TAG=ci` and sets up
  no Node there.
- Toolchain: pnpm workspaces `apps/*` and `packages/*`, Turborepo, Vitest 4, Node pinned to
  24.22.1 in the `Dockerfile`, ESLint flat config through the root `defineBaseConfig`, one root
  Prettier config, strict root `tsconfig.json`.
- Checks that must run inside the Docker network (submission on `mail:587`, relay on `mail:25`)
  run as Node scripts inside the backend container today (`docker compose exec -T backend node --input-type=module`
  with the script on stdin), because the image has `nodemailer`.

## Decisions

1. **New workspace `deploy`.** The folder that already holds `compose.yml` and `.env.example`
   becomes a workspace (`pnpm-workspace.yaml` gains `- 'deploy'`, package name `deploy`). The VPS
   still needs only `compose.yml` and `.env`. Scripts: `lint`, `typecheck`, `test` (unit tests of
   the pure helpers, no Docker) take part in `pnpm check`; `test:smoke` runs the Docker suite and
   is never a Turbo task, so `pnpm test` never starts Docker.
2. **One smoke spec file**, `deploy/smoke/stack.smoke-spec.ts`: a `describe` per phase, an `it` per
   former `pass` line with the same wording (without runtime values in the name). Tests run in
   file order, `bail: 1` stops at the first failure like `set -e`, and `afterAll` always runs
   `down -v --remove-orphans` and removes the temp dir. The `verbose` reporter prints each test.
3. **HTTP through `node:http`** (raw: no redirects, no decompression) in `support/http.ts`.
   `request()` asserts `X-Robots-Tag: noindex, nofollow` on every response; `statusOf()` is the
   plain status probe for the backend-down path and returns `undefined` when nothing answers.
4. **Processes through `execa`**: `docker`, `docker compose`, `openssl`. openssl stays a host
   requirement (CA, leaf certificates, `s_client` for the served serials). curl is no longer
   needed. Every `docker` output is stripped of `\r` before use.
5. **SMTP from the host through `nodemailer`** on port 18025 with `ignoreTLS: true` (curl used
   plain `smtp://`): the outside relay check and the DSN delivery. The DSN goes out with
   `envelope: { from: '', to }` (`MAIL FROM:<>`) and the fixture as `raw`; nodemailer normalises
   line endings and dot-stuffs.
6. **Container-side checks stay in the backend container** and become TypeScript files under
   `deploy/smoke/container/`, run with `node --input-type=module-typescript` (Node 24 strips
   types from stdin). They use erasable syntax only, import `nodemailer` from the image, and are
   type-checked and linted with the workspace (`erasableSyntaxOnly` in its `tsconfig.json`).
7. **Polling through `expect.poll`** with an explicit `interval` and `timeout` replaces every
   hand-rolled deadline loop. The one negative wait ("stays unhealthy for 60 s") uses
   `Compose.waitHealthy()` returning `false`.
8. **Pure helpers get unit tests**: `http.ts` (against a local `node:http` server) and `logs.ts`
   (setup token, JSON request log entry, last word of a command output). They run with
   `pnpm --filter deploy test`.
9. **Fail fast on a missing image and a dirty host.** `createStack` refuses to start when
   `ghcr.io/schwarzdavid/mailer-backend:<IMAGE_TAG>` is not present locally (`up --pull missing`
   would otherwise fail with a GHCR login error) and runs `down -v --remove-orphans` first so a
   killed previous run cannot leave stale containers or volumes behind.
10. **CI:** the `image` job gains `./.github/actions/setup` and runs
    `IMAGE_TAG=ci pnpm --filter deploy test:smoke`.
11. **The Bash script is deleted** in the last task after a full green local run; README step 11,
    the README CI paragraph and `CLAUDE.md` are updated in the same task.

## Non-goals

- No new checks and no changes to `compose.yml`, `.env.example` or the backend.
- No Testcontainers compose environment, no bats-core.
- No parallelism: the stack is one shared resource.

## Checks

The 30 tests, in order, grouped by `describe`:

| Phase                              | Tests (former `pass` lines)                                                                                                                                                                                                                                                        |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| compose configuration              | config hashes follow `SITE_ADDRESS`, `MAIL_HOSTNAME`, the Caddyfile and `postfix-main.cf`                                                                                                                                                                                          |
| boot without the mail server       | stack without mail is up and healthy; readiness reports the missing mail server while liveness stays up; setup token logged and a wrong one refused; the proxy is the stock caddy image and there is no web service                                                                |
| mail server                        | mail is up and healthy with the bounce account; readiness is 200 once mail accepts connections                                                                                                                                                                                     |
| routing and headers                | `/` serves the SPA; `/projects/5` falls back; cache headers; compression; missing asset 404 without immutable; `/api/setup/status` is JSON; JSON request logs with request ids; unknown `/api` path is a JSON 404; `/docs` falls back and hides swagger-ui                         |
| throttling and logs                | forged `X-Forwarded-For` does not evade the login throttle; query-string API keys never reach the container logs                                                                                                                                                                   |
| mail submission, relay and bounces | authenticated submission verifies the certificate and spoof protection rejects a foreign envelope; port 25 from outside rejects relaying; `mail:25` from inside rejects unauthenticated relaying; the DSN is ingested over IMAP into the bounce table; mail publishes only port 25 |
| mail certificate lifecycle         | mail stays unhealthy for 60 s without a certificate; recovers once it appears; a renewed certificate is served on 25 and 143 without a restart                                                                                                                                     |
| migrations                         | every migration applied at start; a failed upstream request is logged with the key redacted; a failing migration keeps the backend from serving and it recovers once the migrations run                                                                                            |
| updates                            | `up -d` replaces the backend                                                                                                                                                                                                                                                       |
