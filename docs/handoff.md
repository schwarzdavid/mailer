# Handoff

What to build, in one place. Exact values live in `tokens.json`, theme code in **Vuetify theme mapping**, behavior rules in **Interaction patterns**, and each component and screen card has its own README. This page lists what exists, where it is used, and what changes compared with the app as of 13 Oct 2026 (`docs/ui-inventory.md`; "D" and "pain point" numbers refer to it).

Suggested order: the theme, defaults and fonts first (no screen changes needed), then the shared wrappers, then the screens.

## Token set

Every color token becomes a Vuetify theme color of the same name, so token names are the names in code.

| Group                      | Tokens                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Lands in                                                                         |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Color, 34 × light and dark | **Brand:** `primary`, `primary-hover`, `primary-pressed`, `on-primary`, `primary-container`, `on-primary-container`. **Surfaces:** `background`, `surface`, `surface-hover`, `surface-sunken`, `surface-overlay`, `surface-inverse`, `on-surface-inverse`, `inverse-primary`, `scrim`. **Lines and text:** `border`, `border-strong`, `ink`, `ink-muted`, `ink-disabled`, `disabled-surface`, `focus`. **Status:** `success`, `warning`, `error` and `info`, each with `on-*` and `*-container` | `themes.light` / `themes.dark` in `plugins/vuetify.ts`; `defaultTheme: 'system'` |
| Type, 13 roles             | `display-small`, `headline-small`, `title-large`, `title-medium`, `title-small`, `body-large`, `body-medium`, `body-small`, `label-large`, `label-medium`, `label-small`, `code-medium`, `code-small`. Families: Noto Sans and JetBrains Mono                                                                                                                                                                                                                                                   | Vuetify `$typography` map; fonts self-hosted via `@fontsource`                   |
| Spacing, 9                 | `space-1` 4 · `2` 8 · `3` 12 · `4` 16 · `5` 20 · `6` 24 · `8` 32 · `12` 48 · `16` 64                                                                                                                                                                                                                                                                                                                                                                                                            | Vuetify spacing utilities, unchanged                                             |
| Radius, 4                  | `radius-sm` 4 · `radius-md` 6 · `radius-lg` 10 · `radius-full`                                                                                                                                                                                                                                                                                                                                                                                                                                  | `$rounded` map; drop `global.rounded: false`                                     |
| Shadow, 3                  | `shadow-sm`, `shadow-md`, `shadow-lg`                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `$shadow-key-*` for elevations 8 and 24; cards stay flat                         |
| Breakpoint, 4              | `bp-sm` 600 · `bp-md` 960 · `bp-lg` 1280 · `bp-xl` 1920                                                                                                                                                                                                                                                                                                                                                                                                                                         | Vuetify defaults, unchanged                                                      |
| Size, 13                   | `sidebar-width` 248, `rail-width` 72, `appbar-height` 56, `content-max` 1120, `dialog-sm` 440 · `md` 560 · `lg` 720, `control-sm` 32 · `md` 40, `touch-target` 44, `icon-sm` 16 · `md` 20 · `lg` 24                                                                                                                                                                                                                                                                                             | Layout components and dialog widths                                              |
| Opacity, 6                 | `hover` .06, `focus` .10, `pressed` .14, `selected` .10, `activated` .12, `border` 1                                                                                                                                                                                                                                                                                                                                                                                                            | Theme `variables`                                                                |

Three rules carry most of the system:

- **Yellow is a fill only.** Use it for the one primary button per view and the logo, always with `on-primary` text.
- **`primary-container` means "you are here".**
- **Status is never color alone.**

Every text pair passes 4.5:1, and every control boundary and the focus ring pass 3:1, in both themes.

## Components and where they are used

"New" marks a wrapper or component the app doesn't have today. Everything else is a Vuetify component with new global defaults.

| Component                                                    | Built as                                                                                                                               | Used on                                                                                                                                                                                         |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AppNavigation** (new)                                      | `VNavigationDrawer` (permanent, rail or temporary) and `VAppBar` on phones; items `{ title, icon, to, section, can }`; account `VMenu` | Every app page; the rail on the template editor. Not on Login or Setup                                                                                                                          |
| **AppLogo** (new)                                            | Inline SVG; `size`, `wordmark`                                                                                                         | Sidebar, phone app bar, Login, Setup bar, favicon                                                                                                                                               |
| **PageHeader** (new)                                         | `VBreadcrumbs`; slots `status`, `meta`, `actions`, `tabs`                                                                              | Every app page                                                                                                                                                                                  |
| **SectionCard** (new wrapper)                                | `VCard` flat with border; `title`, `description`, `count`, `loading`; slots `actions`, `footer`; danger-zone variant                   | Every app page, the Login card and the Setup steps                                                                                                                                              |
| **Button**                                                   | `VBtn`; primary, secondary, tertiary, destructive and destructive-subtle by props                                                      | Everywhere                                                                                                                                                                                      |
| **IconButton**                                               | `VBtn icon` with `VTooltip`; overflow `VMenu`                                                                                          | Row actions and overflow menus (Project, Form, Users, the template versions menu), CopyField, dialog ✕, password show/hide, phone Log out in Setup                                              |
| **TextField**                                                | `VTextField`, `VTextarea`                                                                                                              | Login; Setup steps 1–2; Settings; General on Project and Form; User profile; template subject; every form dialog                                                                                |
| **Select**                                                   | `VSelect`, `VAutocomplete`, `VCombobox` with the same defaults                                                                         | Sender domain (Form, New form, Assign domain), Add member, field type, check type and location, receiver recipient and Reply-To, user role                                                      |
| **NumberInput**                                              | `VNumberInput`, stacked controls                                                                                                       | Field dialog (lengths, minimum, maximum), reCAPTCHA minimum score                                                                                                                               |
| **Checkbox**                                                 | `VCheckbox` in `ink`                                                                                                                   | User permissions grid, member permissions, field "Required"                                                                                                                                     |
| **Switch**                                                   | `VSwitch` inset, with `loading`                                                                                                        | Form "Accept submissions" (saves immediately), receiver Active                                                                                                                                  |
| **StatusBadge** (new wrapper)                                | `VChip` outlined pill with a dot; `tone`, or `kind` + `value`                                                                          | DNS state (Dashboard, Domains, Domain, Settings, Setup, Assign domain), Active/Inactive (Dashboard, Project, Form), template state (Form, Template editor), bounce type (Bounces)               |
| **Tag**, **Count** (new wrappers)                            | `VChip` label on `surface-sunken`; small pill                                                                                          | **Tag:** roles (Users, User), project permissions (Project members, User memberships), "Read only", "You", DNS record types, field types. **Count:** Bounces tabs and SectionCard titles        |
| **ListRow**                                                  | `VList`, `VListItem :to`                                                                                                               | Dashboard lists; Projects and Recently deleted; the forms, sender domains and members cards on Project; checks and receivers on Form; Domains; Domain "Used by"; User memberships               |
| **DataTable**                                                | `VDataTableServer` (bounces, blocked addresses) and `VDataTable` (fields, users); rows stack on phones                                 | Bounces (both tabs), Form fields, Users                                                                                                                                                         |
| **DnsRecordsCard**, **DnsRecord** (new)                      | SectionCard with a meter; `VSheet` with CopyField, StatusBadge and Tag                                                                 | Setup step 3, Domain, Settings; the meter alone on the dashboard's delivery health                                                                                                              |
| **CopyField** (new)                                          | A well, an IconButton and `useClipboard`                                                                                               | DNS hosts and values, form endpoint, example HTML form, reCAPTCHA secret                                                                                                                        |
| **InlineAlert**                                              | `VAlert` tonal                                                                                                                         | Failed saves in cards and dialogs, Login errors and session expiry, apex-domain warning, the permissions explainer, the read-only notice, a project without a sender domain, Settings all valid |
| **Snackbar** (new `useNotify()`)                             | One `VSnackbarQueue` in `AppLayout`                                                                                                    | Undo, confirmations after create, save and publish, one-click failures with Retry                                                                                                               |
| **FormDialog**, **ConfirmDialog** (new, with `useConfirm()`) | `VDialog` with `VCard`; three widths                                                                                                   | New project, domain, form and user; Assign domain; member, field, check and receiver dialogs; every delete; changing the sending domain; Publish; Discard changes                               |
| **EmptyState** (new wrapper)                                 | `VEmptyState`; `size` page or section; `tone` neutral or success                                                                       | Empty lists and cards on every page, "No template yet", no bounces (success), no matches, the dashboard's "nothing needs you"                                                                   |
| **ErrorState** (new wrapper)                                 | `VEmptyState`; `kind` load, notFound or forbidden; Retry wired to `refetch()`                                                          | Page and card load failures, 404 (Project, Form, unknown URLs), 403 (any route without permission)                                                                                              |
| **Skeleton** presets (new)                                   | `VSkeletonLoader`: `PageSkeleton`, `ListSkeleton`, `TableSkeleton`, `DnsRecordSkeleton`, `EditorSkeleton`                              | First load of every page                                                                                                                                                                        |
| **StatTile** (new)                                           | A link card with a value in `display-small`                                                                                            | Dashboard                                                                                                                                                                                       |
| **SetupStepper** (new)                                       | Steps as links; a compact "Step 2 of 3" bar on phones                                                                                  | Setup                                                                                                                                                                                           |
| **SetupChecklist** (new)                                     | A step list derived from data, with one primary button                                                                                 | The "Get started" card on a new install's dashboard                                                                                                                                             |

These Vuetify components are used as they are, styled by the theme:

- `VTabs` for the Bounces tabs.
- `VChipGroup` filter chips in the table toolbar.
- `VBtnToggle` for Code/Preview on phones and Desktop/Mobile in the template preview.
- `VMenu` for the account, row and versions menus.
- `VAvatar`, `VTooltip`, and `VProgressLinear` for refetches.
- Disclosures for the example HTML form, "Found a different value" and error Details.

### Today's components, and what replaces them

| Today                                                                                                   | Becomes                                                                                             |
| ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `AppLayout` tabs, "Logo" text, Logout button                                                            | AppNavigation and AppLogo                                                                           |
| `AuthLayout`; `OnboardingView` with its three step partials                                             | The Login frame; Setup with SetupStepper (`SendingDomainForm` stays and serves step 2 and Settings) |
| `DomainVerificationChip`, the chips inside `DomainDnsRecord`, the three Active/Inactive chips           | StatusBadge                                                                                         |
| Role and permission chips                                                                               | Tag                                                                                                 |
| `DomainDnsRecord`, `DomainDnsCard`, `SendingDomainRecordsCard`                                          | DnsRecord and DnsRecordsCard                                                                        |
| `DomainListEntry`, `ProjectListEntry`, `InboundFormListEntry`, the deleted-project row                  | ListRow                                                                                             |
| `UserListEntry`                                                                                         | A DataTable row                                                                                     |
| `Add*Dialog`, `FieldDialog`, `SecurityDialog`, `ReceiverDialog`, `ProjectMemberDialog`, `Delete*Dialog` | Their content stays, inside FormDialog or ConfirmDialog                                             |
| `MonacoEditor`, `TemplatePreview`                                                                       | Kept, with a Monaco theme built from tokens, a viewport-high layout and the Desktop/Mobile toggle   |
| `AddInboundFormDialog` in `inbound-forms/views/list/partials`                                           | Move it to `inbound-forms/components`; it opens from the project page and the dashboard             |

## What changes

### Merged

- **DNS records cards** (D1): Domain, Settings and Setup step 3 now share one DnsRecordsCard.
- **Status chips** (D2, D3, pain point 26) become StatusBadge. **Role and permission chips** (D4, D5) become Tag, in one size.
- **Copy** (D6): CopyField is the only copy pattern.
- **Dialog shells** (D7–D9): FormDialog and ConfirmDialog, with three widths and one way to open them.
- **Page headers** (D10, pain point 27): PageHeader replaces raw `<h1>` and per-page margins.
- **Loading** (D11, D14): five Skeleton presets replace copied skeletons and the 128px full-page spinners.
- **Back navigation** (D12): breadcrumbs only.
- **Yellow full-screen shells** (D13): Login and Setup both sit on `background`; yellow stays on the logo and the primary button.

### Split or moved

- **Form page:** General splits into a new first card, Endpoint (URL, "Accept submissions" and the example HTML form), and General (name, slug, sender domain).
- **Project page:**
    - Cards now run Inbound forms, Sender domains, Members, General, then a Delete project danger zone. Delete was a red text button beside Save.
    - Assigning a domain moves from an inline select plus button to an Assign domain dialog.
    - "Add" moves into card headers everywhere; it was in the footer for forms and members (pain point 23).
- **Deleting a domain** moves from the list's ⋮ menu to the domain page, and is blocked while a project uses the domain.
- **Users:** cards with a trash icon become a table with a row menu. Delete user also sits in a danger zone on the user page.
- **Bounces:** each tab gets its own URL.
- **Template editor on phones:** Code and Preview become tabs.
- **Logout** moves into the account menu, which also shows who is signed in and holds the theme switch.
- **First run** (onboarding) becomes a shell-less Setup that only configures the server. The usage steps (sender domain, project, form, template) move to a Get started card on the dashboard.

### Dropped

- Top tab bar, the "Logo" placeholder, the yellow Logout button, back arrows and "← Back".
- The domain row ⋮ menu with its stub "Hi" dialog, and the dead "Show current" item. What DNS returns now shows under "Found a different value".
- The disabled Project field on the form page; the breadcrumb shows the project.
- Disabled inputs as a read-only view (pain point 28). Read-only users see plain text and no actions.
- Red Cancel buttons; the labels "Abort", "Welcome Back" and "Add", and Title Case.
- `waitAtleast(…, 1000)` on queries. Keep at most a 300ms minimum on button spinners.
- The global `VBtn` default (`color: 'primary', size: 'large'`), `rounded: false`, the `@mdi/font` webfont (switch to `@mdi/js`) and the fixed 480px editor height.
- **No function or data is dropped.** Every action and value from today has a place, including Recently deleted with Restore, template versions, `{{` autocomplete, finishing setup with invalid records, the apex-domain warning, and "Super admin" being offered only to Super admins.

### Renamed

- "Direct permissions" → "Permissions"
- "Security schemes" → "Security checks"
- "Refresh" → "Check again"
- "Domains" card on the project page → "Sender domains"
- "Add" → "New project", "New domain", "New form", "New user"
- "Welcome Back" / "Login" → "Log in"

### Added

- **Dashboard:**
    - "Needs attention", stats, every form grouped by project (the route to forms besides the project page; no Forms nav item), delivery health and recent bounces.
    - "Get started" on a new install.
    - Each card loads and fails independently.
- **UI for existing backend features:**
    - deleting an inbound form (the mutation exists, unused);
    - a real domain delete that checks usage first;
    - a "Used by" card on the domain page.
- **404 and 403 pages** inside the shell, instead of a silent redirect to the dashboard.
- **Snackbars**, with Undo and Retry. Today there is no notification system at all.
- **Unsaved-changes guard** on cards, dialogs and the template editor.
- **Dark theme** with a System / Light / Dark switch.
- **Bounces:** search, type filter, sorting and paging.
- **Setup:** completed steps are clickable, and a logout midway resumes at the first open step.
- **Login:** an error for wrong credentials, a session-expired notice, and a return to the page after a 401.
- **Access:**
    - a Rules column in the fields table;
    - a note under project Members naming who else can open the project;
    - links both ways between user memberships and project members (pain point 14).
- **Template editor:**
    - "Live" in the versions menu, an "Unsaved changes" marker and Ctrl/Cmd+S;
    - a compile error tints its line and keeps the last good preview;
    - a phone layout.
- **Optional extras**, cheap to drop: the example HTML form, the Desktop/Mobile preview toggle, the "Use field layout" starter and the full-screen editor.

### Behavior, app-wide

| Area                    | Rule                                                                                                                                                                                                                                                                                                                                            |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Feedback**            | A problem the user can fix where they look shows there (field error, InlineAlert in the card or dialog). A one-click action reverts and shows a snackbar with Retry. This ends the silent failures in login, setup, domain create and check, form General, field, check and receiver changes, settings save, restore and delete (pain point 8). |
| **Load errors**         | ErrorState in the region that failed, never blank or an endless spinner (pain point 9)                                                                                                                                                                                                                                                          |
| **Destructive actions** | **Confirm:** project, user, domain, form, and a receiver that has a template. **8s Undo, sent when the timer ends:** field, check, member, unassigning a domain, a receiver without a template, unblock. Removals that had no confirmation become undoable (pain point 11).                                                                     |
| **Loading**             | Skeleton on first load after 150ms; a 2px bar while refetching. A spinner shows only on the button or row that triggered it, which fixes the shared `isPending` in `BlockedTable` and `ProjectMembersCard`.                                                                                                                                     |
| **Saving**              | Card forms save with Save in the footer and show "Unsaved changes" and Discard. Switches save immediately. Creating navigates to the new item and confirms with a snackbar.                                                                                                                                                                     |
| **Permissions**         | What the user can't do is absent, not disabled. Form, receiver and template editing need `update Project` (pain point 7); New domain needs `create Domain` (pain point 5); Delete form needs `delete Project`.                                                                                                                                  |
| **Navigation**          | Sidebar highlight from `meta.section`, breadcrumbs from `meta.breadcrumb`. Every row that opens a page is a real link (domain rows were JS clicks).                                                                                                                                                                                             |
| **Dialogs**             | Opened by the parent; Enter submits; persistent while saving; full screen below `bp-sm`. Destructive confirms focus Cancel. Cancel is never red.                                                                                                                                                                                                |
| **Dates**               | One formatter: relative within 24h with the absolute date in a tooltip, otherwise `14 Oct 2026, 13:45` (pain point 25)                                                                                                                                                                                                                          |
| **Health signal**       | The Settings item gets a warning dot with an accessible description, and the dashboard lists the open records. A confirmation comes before changing the sending domain or an IP.                                                                                                                                                                |
| **Responsive**          | Top app bar and drawer below `bp-sm`, a rail up to `bp-md`. Tables and DNS records stack, form dialogs go full screen, and touch targets are 44px.                                                                                                                                                                                              |
| **Document**            | `<title>` is "Page · Mail Admin"; `lang` follows the locale; favicon from the mark (pain point 2)                                                                                                                                                                                                                                               |

## API work these screens assume

These were checked against today's DTOs. Everything else uses existing endpoints.

1. **Forms across projects** for the dashboard, with each receiver's template state for "Needs attention". Today forms are listed only per project.
2. **Project list:** a member count and a sender-domain health flag. `ProjectListDto` has only `inboundFormCount` and `domainCount`.
3. **User list:** a membership count. `UserDto` has no memberships; only `UserDetailDto` does.
4. **Domain → projects lookup**, for "Used by" and to block deleting a domain in use.
5. **Bounces:**
    - server-side paging, search, type filter and sort;
    - a 7-day count, which the client can compute until the list grows.
6. **The DNS check** should return what DNS currently holds when a record differs. Without it, show the badge alone.
7. **Setup progress per step** (account, sending domain, finished). `GET /setup/status` returns only `needsSetup`, which can't resume at a step or mark setup as finished.
