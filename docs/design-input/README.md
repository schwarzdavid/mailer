# Design input for Claude Design

Material for the redesign in Claude Design (claude.ai/design). Captured 2026-10-14 from the current `main`.

## How to use

1. Open `claude-design-prompt.md` and fill in the **[brackets]** in the "Direction" section.
2. In Claude Design, start a new project and paste the prompt (everything below the line).
3. Attach the screenshots and `../ui-inventory.md`. If there's an upload limit, start with the **core set** below and add the rest when you reach those screens.
4. Let it do the design system and component sheet first (deliverables 1–2), review, then continue screen by screen.
5. When you're happy, export the handoff bundle and bring it back here for `docs/redesign-plan.md`.

**Core set (about 15 files):** `10-dashboard`, `21-projects-list`, `23-project-detail`, `50-form-detail`, `53-form-receiver-dialog`, `55-template-editor`, `33-domain-detail`, `42-bounces-list`, `60-settings`, `73-user-detail`, `05-login`, `01-onboarding-1-account`, `03-onboarding-3-dns-records`, plus `mobile/23-project-detail` and `mobile/33-domain-detail`.

## Screenshot index

Desktop is 1440px wide; mobile is 390px at 2× scale. Full-page captures, except dialogs and menus, which show the viewport.

| Prefix | Area | Files (`screens/desktop/`) |
|---|---|---|
| `01–03` | Onboarding wizard | account step (empty, validation errors), sending domain, DNS records |
| `05` | Login | empty, validation errors, wrong credentials |
| `10` | Dashboard | placeholder page |
| `20–28` | Projects | list (empty, populated with "Recently deleted"), add dialog (and validation), detail (full, sparse, loading = blank), delete dialog, add-member dialog, add-form dialog |
| `30–34` | Domains | list (empty, populated, row menu, loading), delete dialog, add dialog with apex-domain warning, detail, detail loading |
| `40–43` | Bounces | bounces and blocked tabs, each empty and populated |
| `50–55` | Inbound forms | form detail (full, empty), field dialog (add, edit number), reCAPTCHA dialog, receiver dialog, template editor, versions menu |
| `60` | Settings | sending domain form and infrastructure DNS records |
| `70–73` | Users | list, add dialog, delete dialog, user detail |
| `80–81` | Limited user | projects list and project detail as a user with restricted permissions |

`screens/mobile/` has the main pages at phone width: login, dashboard, projects list, project detail, form detail, template editor, domains list and detail, bounces, settings, users list and detail.

## Notes on the data

- All data is seeded realistic test data (Acme, Northwind, Contoso). No real customer data.
- **DNS records all show "Invalid"** because the test domains aren't real. That's expected and still useful: it is the state a new user sees.
- **Bounce and blocked-address rows are stubbed in the browser.** The API can't create bounces (they come from ingested bounce mails), so the capture script substitutes realistic responses for those two requests. Everything else comes from the real backend.
- Loading screenshots (`28-`, `34-`) were taken with artificially slowed API responses.

## Regenerating

The capture script lives in `apps/frontend/.tmp/capture/` (gitignored). It reuses the e2e global setup, so it needs Docker, and it brings up a throwaway stack: no dev database is touched.

```bash
cd apps/frontend
pnpm exec playwright test -c .tmp/capture/capture.config.ts
```
