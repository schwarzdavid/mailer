# Projects — Design

Date: 2026-07-16
Status: Approved by owner (design dialogue); pending spec review

## Goal

Introduce projects as the organizing container for inbound forms and domains. Every
inbound form belongs to exactly one project, fixed at creation. Domains remain a
global pool configured standalone, but can be assigned to any number of projects
(many-to-many). When creating or editing an inbound form, only domains assigned to
the form's project are selectable.

## Context

- `inbound_form.domainId` is a nullable FK to `domains` (SET NULL on domain delete).
  Receivers require the form to have a domain; sender addresses must match the
  domain's FQDN (`InboundFormService.assertEmailFrom`).
- The frontend domain selects (`AddInboundFormDialog.vue`, `GeneralCard.vue`)
  currently list all domains via `useDomainsQuery`.
- Navigation is flat tabs: Dashboard, Domains, Forms, Bounces, Settings.
- Migrations run 001–008; the bounce module already uses `@nestjs/schedule` for
  recurring jobs.

## Decisions (from design dialogue)

1. **UI model:** new "Projects" nav tab → project list → project detail page showing
   the project's inbound forms and assigned domains. The standalone Forms tab is
   removed; forms are reached through their project. The Domains tab stays global.
2. **Migration of existing data:** if inbound forms exist, migration creates a
   `Default` project, assigns all forms to it, and assigns every domain referenced by
   those forms to it. `projectId` is NOT NULL from the start.
3. **Deletion:** soft delete with a 30-day grace period (hardcoded constant), then a
   scheduled job hard-deletes the project cascading to its forms.
4. **Soft-deleted behavior:** the project's forms immediately stop accepting public
   submissions (404). The project moves to a "recently deleted" section and can be
   restored, re-enabling the forms exactly as they were.
5. **Integrity:** removing a domain from a project is blocked (400) while forms in
   that project use it.
6. **Forms are not movable:** a form's project is fixed at creation; `updateForm`
   does not accept `projectId`.
7. **Soft-delete mechanism:** Sequelize `paranoid: true` on the project model —
   `destroy()` soft-deletes, `restore()` restores, `destroy({ force: true })` purges,
   and all normal queries (including includes) exclude trashed projects automatically.

## Backend

New feature module `apps/backend/src/modules/project/` following the standard
layering (controller / services / models / interfaces / dtos).

### Data model — migration `009-create-projects.ts`

Table `projects`:

| Column                | Type        | Notes                          |
| --------------------- | ----------- | ------------------------------ |
| projectId             | INTEGER PK  | autoincrement                  |
| name                  | STRING(255) | not null, unique               |
| deletedAt             | DATE        | nullable; paranoid column      |
| createdAt / updatedAt | DATE        | standard                       |

Because soft-deleted rows keep their name until purged, a name sitting in the 30-day
trash blocks reuse — restore or wait.

Table `project_domains` (join):

| Column                | Type       | Notes                                  |
| --------------------- | ---------- | -------------------------------------- |
| projectDomainId       | INTEGER PK | autoincrement                          |
| projectId             | INTEGER    | FK → projects, CASCADE delete/update   |
| domainId              | INTEGER    | FK → domains, CASCADE delete/update    |
| createdAt / updatedAt | DATE       | standard                               |

Unique index on `(projectId, domainId)`. Deleting a domain silently drops its
assignments (consistent with today's SET NULL on forms).

Change to `inbound_form`: new column `projectId` INTEGER NOT NULL, FK → projects,
ON DELETE CASCADE, ON UPDATE CASCADE. The cascade only fires at purge time — normal
deletion is soft and never touches the FK.

Migration steps:

1. Create `projects` and `project_domains`.
2. Add `inbound_form.projectId` as nullable.
3. If forms exist: insert a `Default` project, point all forms at it, insert a
   `project_domains` row per distinct `domainId` referenced by those forms.
4. Alter `projectId` to NOT NULL.
5. `down`: drop the column, drop both tables.

### Models

- `ProjectModel` — `@Table({ tableName: 'projects', timestamps: true, paranoid: true })`,
  `@BelongsToMany(() => DomainModel, through ProjectDomainModel)`,
  `@HasMany(() => InboundFormModel)`.
- `ProjectDomainModel` — the through model.
- `InboundFormModel` gains the `projectId` column and `@BelongsTo(() => ProjectModel)`.
- Interface `Project`: `{ projectId, name, createdAt, updatedAt, deletedAt: Date | null }`.

### API

All endpoints `@JwtAuth`, tag `project`:

| Endpoint                                        | Behavior                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------- |
| `POST /project`                                 | Create `{ name }`; unique violation → 400 "Name is already in use"   |
| `GET /project`                                  | Active projects with `inboundFormCount` and `domainCount`            |
| `GET /project/deleted`                          | Trashed projects with `deletedAt` and computed `purgeAt` (+30 days)  |
| `GET /project/:projectId`                       | `ProjectDetailDto`: project + assigned domains (`DomainDto[]`)       |
| `PATCH /project/:projectId`                     | Rename                                                               |
| `DELETE /project/:projectId`                    | Soft delete; forms stop accepting submissions immediately            |
| `POST /project/:projectId/restore`              | Restore from trash (loads with `paranoid: false`); 404 if not trashed |
| `POST /project/:projectId/domains`              | Assign domain `{ domainId }`, idempotent (`findOrCreate`)            |
| `DELETE /project/:projectId/domains/:domainId`  | Unassign; 400 while forms in this project use the domain             |

### Purge job

`ProjectPurgeService` with an hourly `@nestjs/schedule` `@Interval` (same pattern as
the bounce poller): `destroy({ force: true })` for projects whose `deletedAt` is older
than `PROJECT_PURGE_AFTER_DAYS = 30` (constant in `project.constants.ts`). Errors are
logged and swallowed per run.

### Inbound-form module changes

- `createForm` requires `projectId`: validates the project exists (paranoid scope
  hides trashed ones) and, when `domainId` is set, that the domain is assigned to
  that project → otherwise 400 "Domain does not belong to the project".
- `updateForm` does not accept `projectId`; a `domainId` change validates project
  membership in addition to the existing receiver checks.
- `GET /inbound-form` gains an optional `projectId` query filter.
- Public submission path (`submitForm` by slug) includes the project; a trashed
  project resolves to `null` under the paranoid scope → 404, indistinguishable from
  a nonexistent form.
- `InboundFormDto` gains `projectId`; `InboundFormCreateDto` requires it;
  `InboundFormUpdateDto` does not include it.

After backend changes regenerate the contract: `pnpm --filter backend generate`,
then `pnpm --filter api build`.

## Frontend

### Navigation & routes

- Tabs: Dashboard, **Projects**, Domains, Bounces, Settings (Forms tab removed).
- New routes `/projects` (`PROJECT_LIST`) and `/projects/:projectId`
  (`PROJECT_DETAILS`); `INBOUND_FORM_LIST` removed from `RouteNames`.
- Form detail/template routes stay at `/forms/:inboundFormId...`; the form page
  links back to its project via the form's `projectId`.

### New module `modules/projects/`

- `queries/`: `useProjectsQuery` (`['projects']`), `useProjectQuery`
  (`['projects', id]`), `useDeletedProjectsQuery` (`['projects.deleted']`).
- `mutations/`: create, rename, delete (soft), restore, assign domain, unassign
  domain — each invalidating the affected keys.
- `views/list/ProjectListView.vue`: project cards (name, counts), `AddProjectDialog`,
  and a "recently deleted" section with purge date and restore button.
- `views/details/ProjectDetailView.vue`: general card (rename / delete), domains card
  (assigned domains, add-select from the global pool, remove buttons), and the
  project's forms list (reusing `InboundFormListEntry` and the create dialog).

### Inbound-forms module changes

- `InboundFormListView` deleted; `useInboundFormsQuery` takes `projectId`
  (key `['inboundForms', projectId]`).
- `AddInboundFormDialog` receives `projectId` from the project detail page; its
  domain select lists the project's domains (from `useProjectQuery`).
- `GeneralCard`: same domain-select swap via the form's `projectId`; project shown
  read-only with a back-link to the project.

### i18n

New `module.projects.*` keys and shared `field.project`; validation follows the
existing Zod↔i18n wiring.

## Error handling

- Duplicate project name → 400 "Name is already in use".
- Unassign a domain used by forms in the project → 400 "The domain is used by N
  forms in this project".
- Form create/update with a domain not in its project → 400 "Domain does not belong
  to the project".
- Restore of a non-trashed project → 404.
- Public submission to a form of a trashed project → 404.

## Testing

Type-safe mocks per repo convention (`vi.fn<Service['method']>()`, domain-typed
fixtures).

- **Backend unit:** `project.service.spec.ts` (CRUD, soft delete/restore,
  assign/unassign incl. blocking rule), `project-purge.service.spec.ts` (purges only
  past 30 days, uses `force`), `project.controller.spec.ts`, updates to
  `inbound-form.service.spec.ts` (required `projectId`, domain-membership rule) and
  the submission spec (trashed project → 404).
- **Backend e2e:** new `test/project.e2e-spec.ts` — create → assign domain → create
  form → blocked unassign → soft delete → public submit 404 → restore → submit works.
  Existing `inbound-form`/`domain` e2e specs updated for the required project.
- **Frontend:** specs for new queries/mutations and `ProjectListView`;
  `AppLayout.spec` updated (nav tabs); `InboundFormListView` spec removed.
- Gate: `pnpm check`.
