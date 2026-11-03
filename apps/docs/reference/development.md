# Development

This page is for people who change mailer or these docs rather than run it. It says where the developer documentation lives, how to run and build this documentation site locally, and how its screenshots are made.

## Where the developer documentation lives

These docs are written for operators. Everything about working on the code lives in the repository itself:

- **[`README.md`](https://github.com/schwarzdavid/mailer#local-setup)**, section **Local setup**: the prerequisites (Node.js, pnpm, Docker), the local `.env`, the development services in `dev/docker-compose.yml`, `pnpm dev`, and the lint, typecheck and test commands. Its section **CI and release pipeline** describes how releases and images are built.
- **[`CLAUDE.md`](https://github.com/schwarzdavid/mailer/blob/main/CLAUDE.md)**: the repository layout, the architecture of backend and admin UI, how the API client is generated from the backend, and the testing conventions.

## Run and build the docs

The site is the workspace `apps/docs`, built with VitePress. Run every command from the repository root after `pnpm install`.

Build it once. Turbo first builds the backend and generates the OpenAPI document and the list of environment variables that the site reads:

```bash
pnpm build --filter docs
```

The build fails when `configuration/environment.md` misses a variable the backend or `compose.yml` reads, or lists one that no longer exists, and when a page links to a page that does not exist. The result is in `apps/docs/.vitepress/dist`.

Then start the development server, which reloads every page as you edit it. Use the Turbo form, which builds the backend and generates the OpenAPI document first:

```bash
pnpm dev --filter docs
```

After a build, `pnpm --filter docs dev` starts the server alone. Either way it listens on the fixed port 5180, at `http://localhost:5180/mailer/`, so it does not collide with the admin UI's development server on 5173 when the root `pnpm dev` runs both. After a change to the backend's API, run `pnpm build --filter docs` again so the API reference picks it up.

Run the docs' own tests before you commit a page. They read the generated OpenAPI document `apps/backend/openapi.json`, so on a fresh clone run `pnpm build --filter docs` first:

```bash
pnpm --filter docs test
```

They check that every page is in the sidebar exactly once, that every page starts with a heading, that every procedural page exists and contains **How you know it worked**, that every referenced screenshot exists, and that the API reference has one page per tag of the OpenAPI document.

## Regenerate the screenshots

The screenshots under `apps/docs/public/screenshots/` are taken from a real backend and admin UI with demo data. Docker must be running, because the script starts throwaway Postgres, Redis, MailHog and GreenMail containers. Install the browser once:

```bash
pnpm --filter docs exec playwright install chromium
```

Then take all screenshots:

```bash
pnpm --filter docs screenshots
```

The run builds the backend and the admin UI, starts them against the containers, walks through the setup wizard, seeds the demo project **Acme Website** with the domain `mail.example.net`, and overwrites the PNG files in `apps/docs/public/screenshots/installation/` and `apps/docs/public/screenshots/admin-guide/`. It takes a few minutes and removes the containers at the end. The build and server logs of a run are in `apps/frontend/node_modules/.tmp/e2e/`.
