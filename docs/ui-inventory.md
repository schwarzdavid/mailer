# UI Inventory: Frontend

Reference input for the visual redesign. This describes the frontend as of 2026-10-13.

> **Update 2026-10-14 (commit `ccbf4ab`).** Some statements below are now outdated. Where they conflict, these points win:
>
> - **Mutation errors are now shown inline** (`VAlert type="error"`) in nearly every form, dialog and card: login ("Invalid email or password"), onboarding account, add domain/project/form/user, delete dialogs, project domains and members, form general/fields/security/receivers, the template editor, unblock, restore, sending domain, and user profile/permissions. There is still **no snackbar/toast** and **no success feedback**.
> - **Load errors:** only `UserDetailView` shows a load-error alert. The other detail pages still stay blank or spin while loading or after a failed load (§5).
> - **Delete Domain is implemented** (`DeleteDomainDialog.vue`, confirmation plus inline error), and the domain row menu only appears with delete permission. Pain point 3 is resolved.
> - The **Domain list "Add" button** is now gated by `can('create', 'Domain')`. The domain list still has no empty-state text.
> - Login now honors a `?redirect=` back to the originally requested page.
> - Still true: empty Dashboard, the "Logo" placeholder, the `<title>Vite App</title>`, the no-op "Show current" item, and no permission gating on the form detail page.
>
> Screenshots of the current state are in `docs/design-input/screens/`.

- **Stack:** Vue 3 SPA, Vuetify 4 (Material components), Vue Router, TanStack Query, vue-i18n (English only), vee-validate + Zod, CASL for permission-gated UI, Monaco editor (template editing).
- **Paths:** Unless stated otherwise, paths are relative to `apps/frontend/src/`.
- **Product in one line:** A self-hosted admin panel for transactional mail. Admins verify sending domains through DNS records, group **inbound forms** (public form-submission endpoints) into **projects**, and route each submission as an email to **receivers** using Handlebars templates. Admins also monitor **bounces** and manage **users and permissions**.

---

## 1. Views / Screens

### Shells (layouts)

| Shell            | File                                          | Description                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root             | `App.vue`                                     | `VApp` + `RouterView`. Shows a 64px spinner in `VMain` while a route component resolves.                                                                                                                                                                                                                                                                                                                              |
| Auth shell       | `modules/auth/layouts/AuthLayout.vue`         | Full-screen yellow (`bg-primary`) background with one centered card (500px wide, max `calc(100% - 32px)`, `elevation="1"`). The footer reads "Copyright © 2026 David Schwarz IT Services GmbH" and is hardcoded, not translated.                                                                                                                                                                                      |
| App shell        | `modules/dashboard/layouts/AppLayout.vue`     | Top `VAppBar` contains the literal text **"Logo"** as a placeholder, a horizontal `VTabs` nav, a spacer, and a **Logout** button. Tabs are hidden according to permissions. The **Settings** tab carries a health icon (green check or orange alert) based on whether every sending-domain DNS record is valid. It polls every 60s. There is no side nav, no user menu or avatar, and no mobile/hamburger navigation. |
| Onboarding shell | `modules/onboarding/views/OnboardingView.vue` | Uses the same yellow full-screen background as the auth shell, built separately (it doesn't reuse `AuthLayout`). The card is 800px wide.                                                                                                                                                                                                                                                                              |

### Routes

Routes are defined in `router/index.ts` and named in `router/RouteNames.ts`. On every navigation, a global guard: (1) redirects to onboarding if setup is needed, (2) redirects to login if unauthenticated, and (3) redirects to the dashboard if the route's `meta.ability` check fails.

| Route                                                             | Name                    | View                                                               | Purpose                                                                           | Main content                                                                                                                                                             | Actions                                                                                                                                        |
| ----------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `/onboarding`                                                     | `ONBOARDING`            | `modules/onboarding/views/OnboardingView.vue`                      | First-run setup wizard; only reachable while setup is needed                      | 3-step `VStepper`: Account → Sending domain → DNS records                                                                                                                | Continue, Save, Finish                                                                                                                         |
| `/login`                                                          | `LOGIN`                 | `modules/auth/views/LoginView.vue` (in AuthLayout)                 | Sign in                                                                           | Title "Welcome Back", intro text, email and password fields                                                                                                              | Login                                                                                                                                          |
| `/`                                                               | `DASHBOARD`             | `modules/dashboard/views/DashboardView.vue`                        | Landing page after login                                                          | **Placeholder:** a single untranslated `<h1>Dashboard</h1>`, nothing else                                                                                                | none                                                                                                                                           |
| `/projects`                                                       | `PROJECT_LIST`          | `modules/projects/views/list/ProjectListView.vue`                  | List the projects the user can see                                                | Header with Add button, project cards ("N forms · N domains"), and a "Recently deleted" section showing purge dates                                                      | Add project (permission-gated), open project, Restore deleted project                                                                          |
| `/projects/:projectId`                                            | `PROJECT_DETAILS`       | `modules/projects/views/details/ProjectDetailView.vue`             | Manage one project                                                                | Back icon + project name, then stacked cards: General, Domains, Members, Inbound Forms                                                                                   | Rename / Save, Delete (with confirm), Assign or unassign a domain, Add / edit / remove a member, Add a form, open a form                       |
| `/forms/:inboundFormId`                                           | `INBOUND_FORM_DETAILS`  | `modules/inbound-forms/views/details/InboundFormDetailView.vue`    | Configure a public form endpoint                                                  | Back icon (to the project), form name, Active/Inactive chip; cards: General, Fields (table), Security (list), Receivers (list)                                           | Save general settings, copy endpoint URL, toggle active, add / edit / delete fields, security schemes, and receivers, open the template editor |
| `/forms/:inboundFormId/receivers/:inboundFormReceiverId/template` | `INBOUND_FORM_TEMPLATE` | `modules/inbound-forms/views/template/InboundFormTemplateView.vue` | Write the email template for one receiver                                         | Full-width (`fluid`) container: header (title plus "from → to"), subject field, clickable field chips, 50/50 split of Monaco editor (Handlebars) and live iframe preview | Versions menu (load an older version), Save draft, Publish                                                                                     |
| `/domains`                                                        | `DOMAIN_LIST`           | `modules/domains/views/list/DomainListView.vue`                    | List the sender domains (requires `read Domain`)                                  | Header with Add button, clickable domain cards with a Valid/Invalid chip and a ⋮ menu                                                                                    | Add domain, open domain, ⋮ → Delete (**not implemented**; see pain points)                                                                     |
| `/domains/:domainId`                                              | `DOMAIN_DETAILS`        | `modules/domains/views/details/DomainDetailView.vue`               | Verify a domain's DNS                                                             | "← Back" text link, FQDN plus verification chip, DNS Records card (SPF, DKIM, DMARC rows)                                                                                | Refresh DNS check, copy host and value per record, ⋮ → "Show current" (**no-op**)                                                              |
| `/bounces`                                                        | `BOUNCE_LIST`           | `modules/bounces/views/list/BounceListView.vue`                    | Monitor delivery failures (requires `read Bounce`)                                | Title, then 2 tabs: **Bounces** table (recipient, type chip, status, reason, received) and **Blocked addresses** table (recipient, blocked until, times blocked)         | Unblock an address                                                                                                                             |
| `/settings`                                                       | `SETTINGS`              | `modules/settings/views/SettingsView.vue`                          | Configure the server's sending (infrastructure) domain (requires `read Settings`) | "Sending Domain" card with a form (FQDN, IPv4, IPv6), then a DNS Records card (A, AAAA, MX, SPF, DKIM, DMARC, PTR)                                                       | Save, Refresh, copy values                                                                                                                     |
| `/users`                                                          | `USER_LIST`             | `modules/users/views/list/UserListView.vue`                        | Manage admin users (requires `read User`)                                         | Header with Add button, user cards (name, email, role chip)                                                                                                              | Add user, open user, delete user (with confirm; can't delete yourself)                                                                         |
| `/users/:userId`                                                  | `USER_DETAILS`          | `modules/users/views/details/UserDetailView.vue`                   | Edit one user                                                                     | Name plus role chip, then cards: Profile (form), Direct permissions (grouped checkboxes), Project memberships (list)                                                     | Save profile, save permissions, open a project from the memberships list                                                                       |

**No route exists** for: listing inbound forms outside their project, a user's own profile or password change, a 404 page, or deleting an inbound form (`useInboundFormDeleteMutation` exists but no UI uses it).

### Modal screens (dialogs)

| Dialog                     | File                                                                 | Opened from                | Contents                                                                                                                      |
| -------------------------- | -------------------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| New Domain                 | `modules/domains/views/list/partials/AddDomainDialog.vue`            | Domain list "Add"          | FQDN field; a warning alert appears when the entry isn't a subdomain. Abort or Save; on save, navigates to the domain detail. |
| Delete Domain              | `modules/domains/components/dialogs/DeleteDomainDialog.vue`          | Domain card ⋮ menu         | **Stub:** a card containing only the text "Hi"                                                                                |
| New Project                | `modules/projects/views/list/partials/AddProjectDialog.vue`          | Project list "Add"         | Name field. Navigates to the new project on save.                                                                             |
| Delete project             | `modules/projects/views/details/partials/DeleteProjectDialog.vue`    | Project General card       | Explains the 30-day trash. Abort or Delete.                                                                                   |
| Add / Edit member          | `modules/projects/views/details/partials/ProjectMemberDialog.vue`    | Members card               | User select (when adding) plus Read / Update / Delete checkboxes                                                              |
| New Form                   | `modules/inbound-forms/views/list/partials/AddInboundFormDialog.vue` | Project Inbound Forms card | Name, Slug (generated from the name until edited by hand), Domain select. Navigates to the form on save.                      |
| Add / Edit field           | `modules/inbound-forms/views/details/partials/FieldDialog.vue`       | Fields card                | Key, Label, Type, Default, Required; extra inputs depend on type (text: min/max length and pattern; number: min/max)          |
| Add / Edit security scheme | `modules/inbound-forms/views/details/partials/SecurityDialog.vue`    | Security card              | Type (honeypot or reCAPTCHA; locked when editing), Location, Key; reCAPTCHA adds Secret and Min score                         |
| Add / Edit receiver        | `modules/inbound-forms/views/details/partials/ReceiverDialog.vue`    | Receivers card             | Sender (hint shows the domain), Recipient and Reply-To comboboxes offering `{{emailField}}` placeholders, Active switch       |
| New User                   | `modules/users/views/list/partials/AddUserDialog.vue`                | User list "Add"            | First name, last name, email, password, role. Navigates to the user on save.                                                  |
| Delete User                | `modules/users/views/list/partials/DeleteUserDialog.vue`             | Trash icon on a user card  | Confirmation text plus inline error                                                                                           |

---

## 2. User Flows

### A. First-run onboarding (`/onboarding`)

1. On any URL, the router guard sees `needsSetup` and forces `/onboarding` (`router/index.ts`).
2. **Step 1, Create your account** (`OnboardingAccountStep.vue`): first name, last name, email, password → **Continue**. The account is registered and logged in automatically (the JWT is stored by `useRegisterMutation`).
3. **Step 2, Sending domain** (`OnboardingDomainStep.vue` → `settings/components/SendingDomainForm.vue`): FQDN, server IPv4, optional IPv6 → **Save**.
4. **Step 3, DNS records** (`OnboardingRecordsStep.vue` → `settings/components/SendingDomainRecordsCard.vue`): 7 records to copy into DNS, plus Refresh.
    - **Decision:** the user can **Finish** while records are still invalid. The intro says propagation can continue afterwards.
5. **Finish** → Dashboard (currently an empty placeholder).

- The stepper header isn't clickable and there's no Back button, so a mistake in step 1 or 2 can't be revisited inside the wizard.

### B. Sign in / sign out

1. `/login`: email and password → **Login** → Dashboard.
2. Logout (app bar): clears the token, query cache, and permissions → `/login`.

- A failed login shows **no error message** (see States).

### C. Core flow: project → inbound form → email delivery

1. **Projects** tab → **Add** → New Project dialog (name) → redirect to the **Project detail** page.
2. **Domains card:** pick a verified domain from the select → **Assign**. (Only shown with project-update **and** domain-read permission.)
    - **Decision:** which sender domain the project may use. With no domains assigned, the empty-state text says forms can't send mail.
3. **Inbound Forms card** → **Add** → New Form dialog (name, generated slug, optional domain) → redirect to the **Form detail** page.
4. **General card:** adjust the name, slug, and domain; toggle **Active**; **Copy** the public endpoint URL (`/api/public/form/:slug`) to paste into a website.
5. **Fields card** → **Add field**: define each submitted key, its type, and its validation. This repeats per field.
6. **Security card** → **Add scheme**: honeypot or Google reCAPTCHA (optional).
    - **Decision:** whether and how to protect the endpoint.
7. **Receivers card** → **Add receiver**: sender address, recipient (a fixed address or a `{{field}}` placeholder), reply-to, active.
    - **Decision:** whether to send to a fixed inbox or echo to the submitter.
8. On a receiver row, **Edit template** → **Template editor**:
    1. Enter a subject; click field chips to insert `{{key}}` at the cursor (the editor also autocompletes on `{`).
    2. Watch the live preview, rendered with generated sample data (`inbound-forms/helpers/sampleData.ts`).
    3. **Save draft** or **Publish** (publish saves the draft first). Use **Versions** to load an older version.
9. Back arrow → Form detail; the receiver row now shows "Draft vN" / "Published vN".

### D. Sender domain verification

1. **Domains** tab → **Add** → enter an FQDN.
    - **Decision:** a warning recommends a subdomain (e.g. `mail.example.com`) when a bare apex domain is entered. The user can proceed anyway.
2. **Save** → domain detail → copy the SPF, DKIM, and DMARC host/value pairs into DNS.
3. **Refresh** to re-check; the header chip turns from "Invalid" to "Valid" once all records match.

### E. Server settings / health

1. The nav **Settings** tab shows an orange alert icon while any infrastructure record is invalid.
2. Settings → edit the sending domain or IPs → **Save** → records update → copy records → **Refresh**.

### F. Team and permissions

1. **Users** → **Add** → New User dialog (role select; super_admin is only offered to super admins) → redirect to the user detail.
2. **Profile card:** edit name, email, optional new password, role.
3. **Direct permissions card:** check permissions in groups (Domains, Projects, Bounces, Settings, Users, Roles) → **Save**.
4. **Project memberships card:** read-only list with per-project permission chips; clicking a row opens the project.
5. Project-scoped access is granted from the **project** side: Project detail → Members → **Add member** (user plus Read / Update / Delete).
    - **Decision:** global role plus direct permissions (user page) versus per-project membership (project page). The two places are split, and neither UI explains how they combine.

### G. Project deletion / restore

1. Project detail → General card → **Delete** → confirm (30-day trash) → back to the list.
2. The project list's **Recently deleted** section shows the purge date → **Restore**.

### H. Bounce handling

1. **Bounces** tab → the **Bounces** tab lists bounce events (Permanent = red chip, Transient = orange).
2. The **Blocked addresses** tab → **Unblock** per row, with no confirmation.

---

## 3. Components

The project has **no shared component library**. All UI is composed directly from Vuetify primitives. Reusable app components are few; most "components" are view-local partials.

### Cross-module reusable components

| Component                  | File                                                                 | What it does                                                                                                                                                            | Variants             | Used in                                                                                            |
| -------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------- |
| `DomainVerificationChip`   | `modules/domains/components/DomainVerificationChip.vue`              | Valid (green, check icon) or Invalid (orange, alert icon) chip, computed from all DNS records                                                                           | `variant="elevated"` | `DomainListEntry`, `DomainDetailView`                                                              |
| `DomainDnsRecord`          | `modules/domains/components/DomainDnsRecord.vue`                     | One DNS record row: header row (Status, Type, Host, Value), status chip, type, two read-only text fields with copy-to-clipboard icon buttons and tooltips, and a ⋮ menu | none                 | `DomainDnsCard`, `SendingDomainRecordsCard`                                                        |
| `SendingDomainForm`        | `modules/settings/components/SendingDomainForm.vue`                  | FQDN, IPv4, and IPv6 form with Save                                                                                                                                     | none                 | `SettingsView`, `OnboardingDomainStep`                                                             |
| `SendingDomainRecordsCard` | `modules/settings/components/SendingDomainRecordsCard.vue`           | Card listing 7 infrastructure DNS records, with last-checked time and Refresh                                                                                           | none                 | `SettingsView`, `OnboardingRecordsStep`                                                            |
| `InboundFormListEntry`     | `modules/inbound-forms/views/list/partials/InboundFormListEntry.vue` | Clickable form card (name, slug, Active/Inactive chip)                                                                                                                  | none                 | `ProjectFormsCard` (cross-module import from a `views/list/partials` folder that has no list view) |
| `AddInboundFormDialog`     | `modules/inbound-forms/views/list/partials/AddInboundFormDialog.vue` | See Dialogs above                                                                                                                                                       | none                 | `ProjectFormsCard` (same cross-module import)                                                      |
| `MonacoEditor`             | `modules/inbound-forms/views/template/partials/MonacoEditor.vue`     | Handlebars code editor with field autocomplete and an `insertText()` API                                                                                                | none                 | Template view                                                                                      |
| `TemplatePreview`          | `modules/inbound-forms/views/template/partials/TemplatePreview.vue`  | Sandboxed iframe that renders compiled Handlebars; shows a warning alert on compile error                                                                               | none                 | Template view                                                                                      |

### View-local partials (by recurring pattern)

**List entry cards.** Each list item is a full-width card in a vertical stack (`d-flex flex-column gr-3`).

| Component              | File                                                             | Notes                                                                                                                                      |
| ---------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `DomainListEntry`      | `domains/views/list/partials/DomainListEntry.vue`                | Clicks are handled in JS (`@click` → `router.push`), so it isn't a real link. The chip is on the left (prepend) and a ⋮ menu on the right. |
| `ProjectListEntry`     | `projects/views/list/partials/ProjectListEntry.vue`              | Real link (`:to`), `hover`; title plus counts subtitle                                                                                     |
| `InboundFormListEntry` | (above)                                                          | `:to`, `hover`; status chip on the right                                                                                                   |
| `UserListEntry`        | `users/views/list/partials/UserListEntry.vue`                    | `:to` without `hover`; uses explicit `VCardTitle`/`VCardSubtitle` children rather than slots; role chip plus a delete icon on the right    |
| Deleted project row    | inline in `projects/views/list/partials/DeletedProjectsCard.vue` | Title, purge date, and Restore button                                                                                                      |

**Detail "section cards."** Each detail page is a vertical stack of cards (`gr-6`).

| Area         | Cards                                                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Project      | `ProjectGeneralCard`, `ProjectDomainsCard`, `ProjectMembersCard`, `ProjectFormsCard` (`projects/views/details/partials/`) |
| Inbound form | `GeneralCard`, `FieldsCard`, `SecurityCard`, `ReceiversCard` (`inbound-forms/views/details/partials/`)                    |
| User         | `UserProfileCard`, `UserPermissionsCard`, `UserMembershipsCard` (`users/views/details/partials/`)                         |
| Domain       | `DomainDnsCard` (`domains/views/details/partials/`)                                                                       |

**Tables:** `BounceTable`, `BlockedTable` (`bounces/views/list/partials/`), and the table inside `FieldsCard`. All are plain `VTable`, with no sorting, pagination, search, or filters.

**Onboarding steps:** `OnboardingAccountStep`, `OnboardingDomainStep`, `OnboardingRecordsStep` (`onboarding/views/partials/`).

### Duplicates and near-duplicates (consolidation candidates)

| #   | Duplicated UI                                                                 | Locations                                                                                                                                                                             | Note                                                                                                                                                                                                                                          |
| --- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **DNS records card**                                                          | `domains/views/details/partials/DomainDnsCard.vue` vs `settings/components/SendingDomainRecordsCard.vue`                                                                              | Near-identical markup: prepend icon `mdi-magnify-scan`, title slot, "last checked" text, Refresh button, intro, then a list of title / description / `DomainDnsRecord` rows separated by dividers. Only the data source and i18n keys differ. |
| D2  | **Valid/Invalid status chip**                                                 | `DomainVerificationChip.vue` (variant `elevated`) vs inline chips in `DomainDnsRecord.vue:10-16` (default `tonal`)                                                                    | Same labels and colors, different variant                                                                                                                                                                                                     |
| D3  | **Active/Inactive chip**                                                      | `InboundFormDetailView.vue:12`, `InboundFormListEntry.vue:23`, `ReceiversCard.vue:582`                                                                                                | Copy-pasted 3×; inactive uses `color="default"`                                                                                                                                                                                               |
| D4  | **Permission chips** (Read / Update / Delete)                                 | `ProjectMembersCard.vue:370`, `UserMembershipsCard.vue:25`                                                                                                                            | Identical chip loop                                                                                                                                                                                                                           |
| D5  | **Role chip**                                                                 | `UserDetailView.vue:246` (default size), `UserListEntry.vue:433` (`size="small"`)                                                                                                     | Inconsistent size                                                                                                                                                                                                                             |
| D6  | **Copy-to-clipboard**                                                         | `DomainDnsRecord.vue` (`useClipboard`, icon button, tooltip "Copy" → "Copied") vs `inbound-forms/.../GeneralCard.vue:368-377` (`navigator.clipboard`, text button "Copy" → "Copied")  | Two patterns for the same action                                                                                                                                                                                                              |
| D7  | **Create dialog shell** (title, ✕ close, intro, fields, Abort (red) and Save) | `AddDomainDialog`, `AddProjectDialog`, `AddInboundFormDialog`, `AddUserDialog`                                                                                                        | Same skeleton copied 4×                                                                                                                                                                                                                       |
| D8  | **Edit dialog shell** (v-model controlled, no ✕, Abort and Save)              | `FieldDialog`, `SecurityDialog`, `ReceiverDialog`                                                                                                                                     | Same skeleton copied 3×. These use a different open/close mechanism from D7 (see pain points).                                                                                                                                                |
| D9  | **Delete confirmation**                                                       | `DeleteProjectDialog`, `DeleteUserDialog`, `DeleteDomainDialog` (stub)                                                                                                                | Same pattern, different widths (600 vs 500)                                                                                                                                                                                                   |
| D10 | **List page header** (h1, Add button, divider)                                | `DomainListView`, `ProjectListView`, `UserListView`                                                                                                                                   | Copied 3×; Bounces and Settings differ slightly                                                                                                                                                                                               |
| D11 | **Loading skeleton** (3× `VSkeletonLoader type="table-heading"`)              | `DomainListView`, `ProjectListView`, `UserListView`, `BounceTable`, `BlockedTable`                                                                                                    | Copied 5×                                                                                                                                                                                                                                     |
| D12 | **Back navigation**                                                           | Text link "← Back" (`DomainDetailView.vue:7`) vs icon-only `VBtn mdi-arrow-left` (`ProjectDetailView`, `InboundFormDetailView`, `InboundFormTemplateView`) vs none (`UserDetailView`) | Three behaviors                                                                                                                                                                                                                               |
| D13 | **Full-screen yellow centered card**                                          | `AuthLayout.vue` vs `OnboardingView.vue`                                                                                                                                              | Same layout built twice; the onboarding copy has no footer                                                                                                                                                                                    |
| D14 | **Full-page spinner** (128px)                                                 | `DomainDetailView.vue:5`, `SettingsView.vue:5`                                                                                                                                        | Two other detail views use no spinner at all                                                                                                                                                                                                  |

---

## 4. Current Styling

### How styling is implemented

- **Vuetify 4 only.** Styling comes from Vuetify components, Vuetify **utility classes** (`d-flex`, `gr-3`, `pt-6`, `text-medium-emphasis` …), and global component defaults in `plugins/vuetify.ts`.
- **No Tailwind, no CSS modules, no design tokens, no custom SCSS variables.** `sass-embedded` is installed only for Vuetify. No global stylesheet exists besides `vuetify/styles` and `@mdi/font` (imported in `main.ts`).
- **Scoped `<style>` blocks** appear in only 3 places: `DomainDnsRecord.vue` (SCSS, `:deep` overrides for field padding and 0.75rem font), `MonacoEditor.vue`, and `TemplatePreview.vue`. `App.vue` has an empty one.
- **Icons:** Material Design Icons webfont (`@mdi/font`, full CSS, every icon). Icons used: `mdi-check`, `mdi-check-circle`, `mdi-alert`, `mdi-alert-circle`, `mdi-close`, `mdi-pencil`, `mdi-delete`, `mdi-dots-vertical`, `mdi-arrow-left`, `mdi-refresh`, `mdi-magnify-scan`, `mdi-clipboard-outline`, `mdi-clipboard-check-outline`.

### Global theme (`plugins/vuetify.ts`)

| Setting                                     | Value                                                                            | Effect                                                                                                                            |
| ------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `primary`                                   | `#ffcf00` (bright yellow)                                                        | Default color of **every** `VBtn`; also the full-screen background of login and onboarding                                        |
| `background`                                | `#eaeaea` (light grey)                                                           | App background behind the white cards                                                                                             |
| Other colors                                | Vuetify defaults (`secondary`, `success`, `warning`, `error`, `info`, `surface`) | `success`, `warning`, and `error` carry status. `secondary` is used once (`DomainDetailView` back link).                          |
| Dark theme                                  | **None**                                                                         | Light only                                                                                                                        |
| `global.rounded`                            | `false`                                                                          | Square corners everywhere                                                                                                         |
| `global.elevation`                          | `0`                                                                              | Flat surfaces                                                                                                                     |
| `global.ripple`                             | `false`                                                                          | No click ripple                                                                                                                   |
| `VTextField` / `VTextarea` / `VNumberInput` | `variant: 'outlined'`                                                            | `VSelect` and `VCombobox` are **not** included, so they render in Vuetify's default (filled) variant next to outlined text fields |
| `VBtn`                                      | `color: 'primary'`, `size: 'large'`                                              | Every button is large and yellow unless overridden                                                                                |
| `VAlert`                                    | `variant: 'tonal'`                                                               |                                                                                                                                   |

### Colors in use (semantic)

- **Primary yellow:** all buttons, auth and onboarding backgrounds.
- **success** (green): Valid DNS, Active form or receiver, healthy settings icon.
- **warning** (orange): Invalid DNS, Transient bounce, the "use a subdomain" alert, the template preview error, the unhealthy settings icon.
- **error** (red): Permanent bounce, Delete buttons, **Abort/Cancel buttons in create/edit dialogs**, inline error alerts, the "Delete" item in the domain menu (`base-color="error"`).
- **default** (grey): Inactive chips.

### Hardcoded values

| Value                                                                   | Location                                                                                                                                                |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `#ffcf00`, `#eaeaea`                                                    | `plugins/vuetify.ts:8-9` (the only hex colors)                                                                                                          |
| `rgba(0, 0, 0, 0.12)` border, `border-radius: 4px`, `background: white` | `inbound-forms/views/template/partials/TemplatePreview.vue:38-41`. The 4px radius contradicts global `rounded: false`, and the colors ignore the theme. |
| `min-height: 480px`                                                     | `MonacoEditor.vue:97`, `TemplatePreview.vue:38`                                                                                                         |
| `font-size: 0.75rem`                                                    | `DomainDnsRecord.vue` scoped style                                                                                                                      |
| Card widths `500` / `800`, `max-width="calc(100% - 32px)"`              | `AuthLayout.vue:3`, `OnboardingView.vue:3`                                                                                                              |
| Dialog `max-width` 500 / 600 / 700                                      | 500: `ProjectMemberDialog`, `DeleteUserDialog`. 600: `Add*Dialog`, `DeleteProjectDialog`, `ReceiverDialog`, `SecurityDialog`. 700: `FieldDialog`        |
| Spinner sizes 64 / 128                                                  | `App.vue:7`, `DomainDetailView.vue:5`, `SettingsView.vue:5`                                                                                             |
| `class="text-black"` inside a warning alert                             | `AddDomainDialog.vue:13` (forces contrast manually)                                                                                                     |
| Date format `DD.MM.YYYY HH:mm:ss`                                       | `DomainDnsCard.vue`, `SendingDomainRecordsCard.vue` (while other dates use `toLocaleString()`; see pain points)                                         |
| Monaco editor theme                                                     | Monaco default (`vs` light), not tied to the app theme                                                                                                  |

### Typography

- No custom font is loaded (`index.html` has no font link). Vuetify's default font stack applies (Roboto if installed locally, otherwise a system sans-serif).
- Page titles are **raw `<h1>`** elements with no typography class. Spacing is patched per page (`mt-0`, `mb-0`). There is one `<h2>` (`DeletedProjectsCard.vue:3`).
- Card titles: some use the `VCard title` prop (Projects, Forms, Users cards); others use a title slot with `text-body-large` (DNS cards, Settings card). The two styles produce different sizes and weights.
- Body text: `text-body-large` (Material 3 scale) for intros in DNS and Settings; plain `<p>` elsewhere.
- `text-subtitle-2` (`UserPermissionsCard.vue:55`) is a Material 2 scale name. It mixes with the M3 names above; check whether Vuetify 4 still defines it.
- `text-medium-emphasis` for secondary text; `<strong>` for DNS record titles; `<code>` for field keys and security keys.

### Spacing

- Vuetify spacing utilities only (4px steps): `pt-6`, `pt-10`, `mb-4`, `mb-6`, `mb-8`, `my-4`, `mt-1`, `mt-2`, `mt-4`, `mt-16`, `px-2`, `pe-4`, `pl-2`, `ms-1`, `ms-2`, `me-2`, `mr-2`, `mr-n1`.
- Flex gaps: `gr-3` between list items, `gr-6` between detail cards, `gc-1` / `gc-2` / `gc-3` in headers, `ga-6` in the permission grid.
- Header-to-content spacing differs: list views put `pt-6` on the content; detail views put `mb-6` on the divider. `UserDetailView` instead places the header _inside_ a `gr-6` stack.

### Radii and shadows

- Radius: **0** globally (`rounded: false`). The one exception is the 4px iframe border in `TemplatePreview.vue`.
- Elevation: **0** globally. Exceptions: `elevation="1"` on the auth and onboarding cards and on `VList` inside menus (`DomainDnsRecord.vue`, `DomainListEntry.vue`); `variant="elevated"` on `DomainVerificationChip` and on many Save/Delete buttons (visually cancelled by global elevation 0); `hover` on project and form list cards (hover elevation).

### Breakpoints and responsiveness

- Vuetify default breakpoints, not overridden. No code uses `useDisplay` or breakpoint props, except `VCol cols="12" md="6"` in the template editor (`InboundFormTemplateView.vue:64-67`).
- `VContainer` default max widths; only the template view uses `fluid`.
- **Not responsive:**
    - `DomainDnsRecord.vue`: a fixed 12-column grid (`cols` 2 / 1 / 4 / 4 / 1) that will squeeze on phones.
    - `FieldDialog.vue`: fixed `cols="6"` / `cols="4"` grid.
    - The app bar holds up to 6 tabs plus Logout with no collapse.
    - `VTable`s don't stack.

---

## 5. States

Legend: ✅ handled · ⚠️ partial · ❌ missing · — not applicable.

| Screen / component                              | Loading                                                                         | Empty                                                              | Error (load)                                               | Error (mutation)                                        | Success feedback                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------- |
| Login (`LoginView.vue`)                         | ✅ button spinner                                                               | —                                                                  | —                                                          | ❌ wrong credentials show nothing (unhandled rejection) | navigates                                                           |
| Onboarding step 1 (`OnboardingAccountStep.vue`) | ✅ button                                                                       | —                                                                  | —                                                          | ❌                                                      | advances step                                                       |
| Onboarding step 2 (`OnboardingDomainStep.vue`)  | ❌ settings query not awaited; the form's initial values are read once at mount | —                                                                  | ❌                                                         | ❌                                                      | advances step                                                       |
| Onboarding step 3 (`OnboardingRecordsStep.vue`) | ❌ records card silently hidden until loaded                                    | ❌                                                                 | ❌                                                         | ❌ refresh                                              | —                                                                   |
| Dashboard                                       | —                                                                               | ❌ placeholder only                                                | —                                                          | —                                                       | —                                                                   |
| Domain list                                     | ✅ skeleton                                                                     | ❌ no empty message                                                | ❌ blank                                                   | —                                                       | —                                                                   |
| Domain detail                                   | ✅ spinner                                                                      | —                                                                  | ❌ **spinner forever** (error is treated as still loading) | ❌ refresh                                              | ⚠️ "last checked" timestamp updates                                 |
| Add Domain dialog                               | ✅ button, persistent                                                           | —                                                                  | —                                                          | ❌                                                      | navigates                                                           |
| Project list                                    | ✅ skeleton                                                                     | ✅ text                                                            | ❌ blank                                                   | —                                                       | —                                                                   |
| Recently deleted                                | ❌                                                                              | ✅ section hidden                                                  | ❌                                                         | ❌ restore                                              | ⚠️ item disappears                                                  |
| Project detail                                  | ❌ **blank page** until loaded                                                  | —                                                                  | ❌ **blank page**                                          | —                                                       | —                                                                   |
| Project General card                            | —                                                                               | —                                                                  | —                                                          | ✅ inline alert                                         | ❌ no "saved" indication                                            |
| Project Domains card                            | ❌ domain select                                                                | ✅ text                                                            | ❌                                                         | ✅ inline alert                                         | ⚠️ list updates                                                     |
| Project Members card                            | ❌                                                                              | ✅ text                                                            | ❌                                                         | ❌ remove; ✅ dialog alert on save                      | ⚠️ list updates                                                     |
| Project Forms card                              | ❌                                                                              | ✅ text                                                            | ❌                                                         | —                                                       | —                                                                   |
| Add Project / New User dialogs                  | ✅                                                                              | —                                                                  | —                                                          | ✅ inline alert                                         | navigates                                                           |
| Add Form dialog                                 | ✅                                                                              | —                                                                  | —                                                          | ❌                                                      | navigates                                                           |
| Form detail                                     | ❌ **blank page**                                                               | —                                                                  | ❌ **blank page**                                          | —                                                       | —                                                                   |
| Form General card                               | —                                                                               | —                                                                  | —                                                          | ❌                                                      | ❌                                                                  |
| Fields / Security / Receivers cards             | ⚠️ dialog Save spinner only; delete icons show no loading                       | ✅ text                                                            | —                                                          | ❌                                                      | ⚠️ list updates                                                     |
| Template editor                                 | ❌ blank until both queries resolve                                             | ⚠️ starts with an empty editor when there are no versions; no hint | ❌ blank                                                   | ✅ dismissible alert                                    | ❌ no "saved" or "published" confirmation; no unsaved-changes guard |
| Template preview                                | —                                                                               | ⚠️ blank white iframe                                              | —                                                          | ✅ compile-error alert                                  | —                                                                   |
| Bounces / Blocked tables                        | ✅ skeleton                                                                     | ✅ text                                                            | ❌ shows the empty text instead of an error                | ❌ unblock                                              | ⚠️ row disappears                                                   |
| Settings                                        | ✅ spinner                                                                      | ⚠️ unconfigured: shows the form only, no guidance                  | ❌ **spinner forever**                                     | ❌                                                      | ❌                                                                  |
| User list                                       | ✅ skeleton                                                                     | ❌                                                                 | ❌ blank                                                   | —                                                       | —                                                                   |
| User detail                                     | ✅ skeleton card                                                                | —                                                                  | ❌ blank                                                   | —                                                       | —                                                                   |
| User Profile / Permissions cards                | —                                                                               | —                                                                  | —                                                          | ✅ inline alert                                         | ❌                                                                  |
| User Memberships card                           | —                                                                               | ✅ text                                                            | —                                                          | —                                                       | —                                                                   |
| Delete User dialog                              | ✅                                                                              | —                                                                  | —                                                          | ✅ inline alert                                         | ⚠️ dialog closes                                                    |
| Delete Project dialog                           | ✅                                                                              | —                                                                  | —                                                          | ❌                                                      | navigates                                                           |

Cross-cutting:

- **No global notification system.** There is no `VSnackbar` anywhere; no success toasts and no global error handler.
- **Artificial latency:** most mutations and some queries are wrapped in `waitAtleast(…, 1000)` (`helper/waitAtleast.ts`). Every save, refresh, unblock, and domain/bounce list load takes at least 1s, so spinners always show.
- **Shared loading flags:**
    - `BlockedTable.vue:698` and `ProjectMembersCard.vue:383` use one `isPending` for every row, so clicking one row's button spins all of them.
    - `ProjectDomainsCard` and `DeletedProjectsCard` track the active row id correctly.
- **No 404 or forbidden screen.** Routes without permission silently redirect to the Dashboard.

---

## 6. Pain Points

### Unfinished or broken UI

1. **Dashboard is empty** (`dashboard/views/DashboardView.vue`): the post-login landing page is an untranslated `<h1>`.
2. **"Logo" placeholder text** in the app bar (`AppLayout.vue:4`). `index.html` still has `<title>Vite App</title>` and `lang=""`.
3. **Delete Domain dialog is a stub** that renders "Hi" (`DeleteDomainDialog.vue:6`). The menu item label "Delete" is hardcoded English (`DomainListEntry.vue:15`).
4. **"Show current" menu item does nothing** (`DomainDnsRecord.vue:65`). Its label is also hardcoded.
5. The **Domain list "Add" button** is hardcoded English and isn't gated by a `create Domain` permission (`DomainListView.vue:6`), unlike Projects and Users.
6. **Inbound forms can't be deleted** from the UI (the mutation exists, unused).
7. **Inbound form editing isn't permission-gated:** Add/Edit/Delete buttons always show on the form detail page, while project cards check `can('update', …)`.

### Feedback and error handling

8. **Silent failures:** login, onboarding, domain create and refresh, form general save, all field/security/receiver mutations, settings save, project restore and delete. Errors either go unhandled or never reach the UI.
9. **Load errors look like loading or emptiness:** detail pages stay blank or spin forever (§5).
10. **No success confirmation** after saving anything. The only cue is a button spinner that stops.
11. **Destructive actions without confirmation:** delete field, delete security scheme, delete receiver, remove member, unassign domain, unblock address. Deleting a user or project asks for confirmation. Deleting a domain would too, if the dialog were finished.

### Navigation and information architecture

12. **Inconsistent back navigation** (D12): text link vs icon button vs none. Breadcrumbs don't exist, even though forms sit three levels deep (Projects → Project → Form → Template).
13. Forms are **only reachable through their project**; there's no global forms list or search.
14. Access is configured in **two places** (user page: role and direct permissions; project page: members). Neither page links to the other or explains how they combine.
15. The **onboarding stepper** has no back step and its steps aren't clickable.
16. **No mobile navigation:** the tab bar overflows on small screens. The app bar has no user identity (who am I, which role).
17. **The settings health icon** in the nav tab is the only global status signal. It has no tooltip or explanation.

### Visual consistency

18. **Every button is yellow and large by default** (`plugins/vuetify.ts`), so primary and secondary actions look the same. Overrides are ad hoc: `size="default"` on Refresh, `size="small"` on table and list actions, `variant="text"` or `"tonal"` here and there.
19. **Cancel/Abort buttons are red** (`color="error"`) in create/edit dialogs (`Add*Dialog`, `FieldDialog`, `SecurityDialog`, `ReceiverDialog`) but neutral in delete and member dialogs. Red reads as destructive.
20. **Dialog inconsistency:**
    - Widths: 500 / 600 / 700.
    - Close (✕) icon: only on create dialogs.
    - Open mechanism: activator slot vs parent-controlled v-model.
    - Form wrapper: some wrap a `<form>` (Enter submits); `ProjectMemberDialog` and the delete dialogs don't.
    - `persistent` while saving: only on activator-style dialogs.
21. **Field variants mixed:** text fields are outlined, but `VSelect` and `VCombobox` aren't in the defaults and render in the filled variant on the same forms (e.g. `GeneralCard.vue`, `AddUserDialog.vue`).
22. **Card title styles mixed:** the `title` prop vs a slot with `text-body-large` and a prepend icon (D1, Settings).
23. **"Add" action placement varies:** card header (`FieldsCard`, `SecurityCard`, `ReceiversCard`), card footer (`ProjectFormsCard`, `ProjectMembersCard`), or inline select plus button (`ProjectDomainsCard`).
24. **List cards behave differently:** some are real links with hover, one navigates through JS, one is a link without hover; status chips sit left on domains and right everywhere else (§3).
25. **Date formats differ:** `DD.MM.YYYY HH:mm:ss` (DNS cards) vs `toLocaleString()` (bounces, blocked, deleted projects).
26. The **Valid/Invalid chip** renders differently in the domain header and in the record rows (D2).
27. **Raw `<h1>`/`<h2>`** with per-page margin patches; no consistent page-header component.
28. Disabled fields stay visible in read-only mode (`ProjectGeneralCard`, `UserProfileCard`) instead of a read-only display.

### Layout and responsiveness

29. The **DNS record row** (`DomainDnsRecord.vue`) repeats its column-header row for every record and uses fixed 12-column widths. Long DKIM values are truncated in a compact 0.75rem input; the only way to read them is copy or select.
30. **Tables have no sort, filter, search, or pagination.** Bounces will grow without bound.
31. The **template editor** uses a fixed 480px minimum height, doesn't adapt to the viewport, and the Monaco theme doesn't match the app.

### Content

32. Copy and labels mix styles: "Abort" (instead of the more common "Cancel"), Title Case vs sentence case ("New Domain" vs "Delete project", "Sending Domain" vs "Sending domain"), and the hardcoded English strings noted above.
33. Nothing helps first-time users after onboarding: the Dashboard is empty, so new users don't know to start in Projects → Add.
