# Docs slim-down

## Why

The operator docs (`apps/docs`) are too long and carry information most operators do not need or can look up themselves (installing Docker, firewalls, checking free ports). The admin UI already shows the DNS records, so the docs need not repeat them.

## Goals

- **API:** only the public endpoints: `public-send` and `public-form`. The admin endpoints exist for the UI only.
- **Introduction:** one page, the landing page (`index.md`): hero, features, the stack diagram, the request flow in short, the requirements and what mailer is not.
- **Installation:** one page (`installation/index.md`): requirements in short (Docker link only), A records and outbound port 25, create the install directory, `compose.yml`, `setup.sh` and `.env` embedded from `deploy/` at build time with VitePress snippet imports, the `.env` keys explained (two names, registrable-domain rule, server addresses, generated secrets), start with `setup.sh`, read the setup token.
- **First-run setup:** kept, without "How you know it worked".
- **Advanced configuration** (`installation/advanced-configuration.md`): the former `configuration/environment.md`; the env drift check moves with it.
- **Deliverability best practices** (`operations/deliverability.md`): IP warm-up, tightening DMARC, when mail lands in spam (from the deleted "Going live").
- **Deleted:** `introduction/*`, `installation/{prepare-server,dns,docker-compose,verify,going-live}`, `configuration/*`, `reference/*`, `operations/rotating-secrets`, `api/reference/*` except the two public pages.
- **TODO.md:** guide the user through tightening DMARC in the UI; show IP warm-up guidance in the UI during the first days.

## Non-goals

- The admin guide and the remaining operations pages stay as they are, apart from links to deleted pages.

## Approach

- Snippet imports (`<<< @/../../deploy/compose.yml`) instead of a copy script: VitePress reads the files at build time. The docs build from `main`, so the embedded files may be newer than the latest release image.
- The convention test for `## How you know it worked` is removed; the H1 check stays.
- The API reference test checks that exactly the public tags have pages and that each exists in the OpenAPI document.
- Links into deleted pages are repointed to the closest remaining page; the developer content of `reference/development.md` moves into `CONTRIBUTING.md`.
