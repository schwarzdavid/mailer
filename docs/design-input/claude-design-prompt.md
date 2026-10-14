# Prompt for Claude Design

Paste everything below the line into Claude Design. Attach the screenshots from `screens/desktop/` (plus a few from `screens/mobile/`) and `../ui-inventory.md`. Fill in the **[brackets]** under "Direction" first, or delete the ones you have no opinion on.

---

## Context

I'm redesigning the admin panel of a self-hosted **transactional mail service**. The attached screenshots show every screen as it exists today. `ui-inventory.md` describes the screens, flows, states, and known problems in detail. Please read it before designing.

**What the product does.** An operator installs the service on their own server. In it they:
1. Verify **sender domains** by publishing DNS records (SPF, DKIM, DMARC) and re-checking them.
2. Group work into **projects**.
3. Create **inbound forms** inside a project. Each form is a public HTTP endpoint (`/api/public/form/<slug>`) that a website's contact form posts to. A form defines its **fields** (key, label, type, validation), its **security** (honeypot, Google reCAPTCHA), and its **receivers**. Each receiver sends one email per submission, from a sender address to a fixed inbox or to a submitted field such as `{{email}}`.
4. Write a **Handlebars HTML email template** per receiver in a code editor with a live preview. Templates have versions (draft or published).
5. Monitor **bounces** (permanent or transient) and **blocked addresses**, and unblock them.
6. Manage **users**: a role (Super admin, Admin, User), direct permissions, and per-project membership with Read/Update/Delete.
7. Configure the server's own **sending domain** (A, AAAA, MX, SPF, DKIM, DMARC, PTR records) under Settings. A first-run **onboarding wizard** (create admin account → sending domain → DNS records) runs once per installation.

**Who uses it.** Technical operators and agency developers setting up form-to-email delivery for websites. They work on desktop, copy a lot of values (DNS records, endpoint URLs), and return occasionally to check health and bounces. Some users have limited permissions and only see the projects they're members of (see the `80-`/`81-` screenshots).

## What's wrong today (fix these)

- **No dashboard.** After login, users land on an empty page. Design a real overview: setup and DNS health, projects, recent bounces, and next steps for a new install.
- **Weak hierarchy.** Every button is the same large yellow button, and Cancel is red in some dialogs. I need a clear primary / secondary / tertiary / destructive system.
- **Inconsistent patterns.** There are three styles of back navigation, two copy-to-clipboard patterns, dialogs with different widths and close behavior, and "Add" buttons that are sometimes in the card header and sometimes in the footer. Settle on one pattern for each.
- **Deep nesting without wayfinding.** Projects → Project → Form → Template editor has no breadcrumbs, and forms are only reachable through their project.
- **States are incomplete.** Save errors now appear as inline red alerts, but there's no success feedback (no toast/snackbar), and most detail pages show a blank page while loading or after a failed load. Design loading, empty, error, and success states for every screen, plus one consistent rule for when errors appear inline and when they appear as a toast.
- **Navigation highlights the wrong tab.** On project, form and template pages the "Dashboard" tab is highlighted (see `23-project-detail.png`). The new navigation must show where you are, including nested pages.
- **Disabled controls look broken.** For example, the disabled "Assign" button renders dark olive in `23-project-detail.png`.
- **Destructive actions without confirmation** (removing fields, receivers, members, unblocking addresses) need a consistent confirm or undo pattern.
- **DNS records are hard to read.** Long values (DKIM keys) are crammed into small read-only inputs, and the column headers repeat for every record. Find a better way to show and copy host/value pairs with their status.
- **Not responsive.** The top tab bar overflows on phones (Logout covers the tabs), the DNS rows collapse into unreadable one-letter columns (`mobile/33-domain-detail.png`), and tables don't adapt. Desktop-first is fine, but phones must be usable for checking status.
- **Two ways to grant access** (user page vs. project members) with no explanation of how they combine.
- **Placeholders.** The app bar literally says "Logo", and there's no user identity or account menu.

## Constraints

- **Keep all functionality and data.** Every field, action, and status shown in the screenshots must still exist somewhere. You may restructure, regroup, or move things between screens, but call out anything you merge, split, or drop.
- **Implementation target:** Vue 3 with **Vuetify 4** (Material-based components), themed through design tokens. Prefer patterns a themed Material component set can do well: app bar or navigation drawer, cards, lists, data tables, dialogs, steppers, tabs, chips, snackbars, menus. Custom bespoke components are fine when they clearly solve a problem listed above. Name them as new components so I can plan for them.
- **The template editor** stays a code editor (Monaco) next to a live HTML preview. Restyle the chrome around it; don't replace it with a visual builder.
- **Copy is English, but i18n-ready.** Avoid layouts that break when labels get about 30% longer.
- **Accessibility:** WCAG 2.1 AA contrast. A yellow primary with white text fails this, so solve it if you keep yellow.

## Direction

- **Brand / mood:** [e.g. "calm, technical, trustworthy; think Linear/Postmark", or "keep it close to today, just consistent"]
- **Primary color:** [keep today's yellow `#ffcf00` / replace with … / propose options]
- **Logo / name:** [product name, or "use a wordmark placeholder"]
- **Navigation:** [top bar vs. left sidebar; I lean towards …]
- **Density:** [comfortable / compact (data-heavy tables)]
- **Dark mode:** [needed / not needed / nice to have]

## Deliverables

Work in this order and check in with me after step 2:

1. **Design system foundation:** color tokens (brand, neutral, surface, semantic success/warning/error/info, including on-colors), type scale, spacing scale, radii, elevation/shadows, breakpoints, and icon style. Present them as named tokens so they can map 1:1 onto a Vuetify theme.
2. **Component sheet** with all variants and states (default, hover, focus, disabled, loading, error):
   - buttons (primary / secondary / text / destructive / icon)
   - text field, select, combobox, number input, checkbox, switch
   - status chips (valid/invalid, active/inactive, permanent/transient, role, permission)
   - cards and section headers
   - list rows and table rows
   - dialog (form, confirm, destructive confirm)
   - snackbar/toast
   - empty state, error state, loading skeletons
   - page header with breadcrumbs and actions
   - DNS record display with copy
   - navigation (desktop + mobile)
3. **Core flow screens**, desktop and mobile: Dashboard → Projects list → Project detail → Inbound form detail (fields, security, receivers) → Template editor, including their dialogs and empty/loading/error states.
4. **Remaining screens:** Login, Onboarding (3 steps), Domains list + detail + add dialog, Bounces (both tabs), Settings, Users list + detail + dialogs, and the limited-permission view.
5. **A short handoff note** listing the token set, every component and where it's used, and anything you changed about structure or behavior compared with today.
