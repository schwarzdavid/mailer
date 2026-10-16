# Role Management & Permission Refactor — Design

Date: 2026-10-16
Status: Approved design, pending implementation plan
Builds on: `docs/superpowers/specs/2026-07-16-user-management-design.md`

## Goal

Make roles the primary way to grant access, inspired by self-hosted GitLab:

- Roles become editable: custom global **and project** roles can be created, edited and deleted in a new Roles area. The seeded roles are ordinary, pre-configured roles.
- Creating a user puts the global role in the foreground; extra permissions are added in a collapsed "Advanced" section and can only be **added**, never taken away from the role.
- Inviting a project member works the same way with a project role plus optional extra project permissions.
- Nobody can grant a role or permission they do not hold themselves, on any level.

## Decisions (from brainstorming)

- **Seeded roles are editable.** Admin, User and the four seeded project roles are regular rows: name, description and permissions can change; they can be deleted while unused. The **Super Admin** role stays locked in code (not editable, not deletable, `type === 'super_admin'` still means "manage all").
- **Project permissions get finer** (6 instead of 3) so project roles mean something.
- **One `roles` table for both scopes.** `roles.scope` is `'global' | 'project'`. Project roles are managed in the same UI as global roles.
- **Roles UI** is its own admin navigation entry "Roles" (`/roles`, `/roles/:roleId`), gated by `roles.read`.
- **Strict "hold" rule.** A principal may only grant what they hold; for project grants, "hold" means on that project. Global `users.update` lets a caller open the members card and remove members, but does not let them grant anything they do not hold on the project.
- **"Advanced" sections are collapsed by default** and open/close with an animated expand transition (reduced-motion is honored by the existing global rule).
- Labels and descriptions of roles come from the database (`name`, `description`), not from i18n keys per role type, because names are editable.

## Permission catalog

### Global (`Permission`)

Existing 16 plus three new ones, all mapped to CASL abilities in `GLOBAL_PERMISSION_ABILITIES`:

| New permission | Ability            |
| -------------- | ------------------ |
| `roles.create` | `create` on `Role` |
| `roles.update` | `update` on `Role` |
| `roles.delete` | `delete` on `Role` |

The migration inserts the three into the Admin role's `role_permissions` (existing convention: Admin can do everything).

### Project (`ProjectPermission`)

`PROJECT_PERMISSIONS = ['read', 'update', 'delete', 'forms.manage', 'api_keys.manage', 'members.manage']`

| Permission        | Grants on the project                                                                                           |
| ----------------- | --------------------------------------------------------------------------------------------------------------- |
| `read`            | View the project, its forms (incl. receivers and templates), sent-mail log, API key list and assigned domains   |
| `update`          | Rename the project, assign/unassign domains (assignment additionally requires global `domains.read`, unchanged) |
| `delete`          | Soft-delete and restore the project                                                                             |
| `forms.manage`    | Create/update/delete forms, fields, security settings, receivers, template drafts and publishing                |
| `api_keys.manage` | Create and revoke API keys                                                                                      |
| `members.manage`  | Add, change and remove project members; list the project roles                                                  |

Rules:

- Each project permission is used verbatim as the CASL action on the `Project` subject (`can('forms.manage', 'Project', { projectId: { $in: [...] } })`). `AbilityAction` gains `'forms.manage' | 'api_keys.manage' | 'members.manage'`.
- `projects.all` and Super Admin still mean all six permissions on every project.
- `read` is **required for every project role** (backend validation, UI locks the checkbox). Without `read` a membership is dead, because every project check asserts `read` first (404 semantics stay).
- Existing helper semantics stay: a missing `read` yields 404, a missing other permission on a readable project yields 403.

### Backend enforcement mapping (old → new)

| Operation                                                                      | Old level | New permission    |
| ------------------------------------------------------------------------------ | --------- | ----------------- |
| Project detail/list, messages list, API key list, form list/get, domain lookup | `read`    | `read`            |
| Rename, assign/unassign domain                                                 | `update`  | `update`          |
| Delete, restore                                                                | `delete`  | `delete`          |
| Form create/update/delete, fields, security, receivers, template draft/publish | `update`  | `forms.manage`    |
| API key create/revoke                                                          | `update`  | `api_keys.manage` |
| Members list/put/delete, implicit access, project roles list                   | `update`  | `members.manage`  |

Member management keeps its OR rule: global `update User` **or** `members.manage` on the project.

## Data model (migration `016-add-role-scopes-and-project-roles.ts`)

Models and migration must match exactly (`test/schema.e2e-spec.ts` compares columns, nullability, indexes and FK actions).

### `roles`

- Add `scope` STRING(16) NOT NULL (`'global' | 'project'`): added nullable, backfilled with `'global'`, then set NOT NULL (pattern of `010`).
- Add `description` STRING(255) NULL.
- Replace unique index `roles_name_unique` (name) with `roles_scope_name_unique` (scope, name). The model drops `@Unique` on `name` and declares the composite index in `@Table({ indexes })`.
- `type` keeps its values. Meaning after this change: `super_admin` = locked system role; `user` = pre-selected role in the "New user" dialog; `admin` and `custom` carry no behavior. Project roles are always `type: 'custom'`.
- Backfill descriptions of the seeded global roles (moved out of i18n): Super Admin "Every permission, including changing other Super admins", Admin "Every permission, but can't change Super admins", User "No permissions of its own; add them per user or through project memberships".

### Seeded project roles (`scope: 'project'`, `type: 'custom'`)

| Name       | Description                                                        | Permissions                                                           |
| ---------- | ------------------------------------------------------------------ | --------------------------------------------------------------------- |
| Viewer     | Sees the project, its forms and sent mail.                         | `read`                                                                |
| Editor     | Builds forms and templates.                                        | `read`, `forms.manage`                                                |
| Maintainer | Runs the project day to day: forms, API keys, members and domains. | `read`, `update`, `forms.manage`, `api_keys.manage`, `members.manage` |
| Owner      | Everything, including deleting the project.                        | all six                                                               |

### `project_members` (restructured)

One row per membership instead of one row per permission:

- `project_members`: `projectMemberId` PK, `projectId` FK → projects (CASCADE), `userId` FK → users (CASCADE), `roleId` FK → roles (`onDelete: RESTRICT`, `onUpdate: CASCADE`), timestamps. Unique index `project_members_unique` (projectId, userId); index `project_members_user` (userId).
- New `project_member_permissions`: `projectMemberPermissionId` PK, `projectMemberId` FK → project_members (CASCADE), `permission` STRING(32), timestamps. Unique index `project_member_permissions_unique` (projectMemberId, permission). These rows are the **extras** granted on top of the role.
- Effective project permissions of a membership = role permissions ∪ extras.
- `ProjectMemberModel` gets `@BelongsTo(() => RoleModel)` (typed `Relation<RoleModel>`) and `@HasMany(() => ProjectMemberPermissionModel)`.

### Data migration (`up`)

1. Rename the old table to `project_members_legacy`, create the new tables, then convert every `(projectId, userId)` group:
    - `expanded = old ∪ {read} ∪ (old ∋ update ? {update, forms.manage, api_keys.manage, members.manage} : ∅)`. Old `update` covered forms, keys, members and renaming, so it expands to all four. `read` is always added: a membership without it was ineffective before, and keeping the row means the admin intended access.
    - Role = the seeded project role with the largest permission set that is a subset of `expanded` (Owner ⊃ Maintainer ⊃ Editor ⊃ Viewer, so the choice is unique). Extras = `expanded − role permissions`.
2. Drop `project_members_legacy`.

`down` reverses: recreate the legacy shape, map `read → read`, `delete → delete`, any of `update|forms.manage|api_keys.manage|members.manage → update` from the effective set, drop the new tables, delete every `scope = 'project'` role (and its `role_permissions`), remove `roles.create/update/delete` from `role_permissions`, drop `scope` and `description`, restore `roles_name_unique`.

## Backend

### Constants (`permission.constants.ts`)

- `GLOBAL_PERMISSIONS` + the three role permissions; `GLOBAL_PERMISSION_ABILITIES` extended.
- `PROJECT_PERMISSIONS` as above; `PROJECT_ROLE_REQUIRED_PERMISSION = 'read'`.
- `ROLE_SCOPES = ['global', 'project'] as const`, `type RoleScope`.
- `ROLE_PERMISSIONS = [...GLOBAL_PERMISSIONS, ...PROJECT_PERMISSIONS]` for DTO validation; `type RolePermission = Permission | ProjectPermission`.
- `ROLE_TYPES` unchanged.

### Interfaces

- `Role`: `{ roleId, name, scope, type, description: string | null, createdAt, updatedAt }`.
- `RoleWithPermissions extends Role { permissions: RolePermission[] }`.
- `RoleSummary extends RoleWithPermissions { assignmentCount: number }` — users holding a global role, memberships holding a project role.
- `RoleCreateInput { name, scope, description: string | null, permissions }`, `RoleUpdateInput { name?, description?, permissions? }`.
- `ProjectMember { projectMemberId, projectId, userId, roleId, createdAt, updatedAt }`, `ProjectMemberPermission { projectMemberPermissionId, projectMemberId, permission, createdAt, updatedAt }`.
- `ProjectMemberRole { roleId, name }`.
- `ProjectMemberInfo { userId, firstName, lastName, email, role: ProjectMemberRole, permissions: ProjectPermission[] }` (permissions = extras).
- `ProjectMembership { projectId, projectName, role: ProjectMemberRole, permissions: ProjectPermission[] }` (extras).
- `ProjectMemberGrant { roleId, permissions: ProjectPermission[] }`.
- `UserCreate` gets `roleId` required; a new `ManagedUserCreate = UserCreate & { permissions: Permission[] }` feeds `createManagedUser`.

### Hold helpers (`permission/helpers/`)

- `holdsPermission(ability, permission)` (global, existing).
- `holdsProjectPermissionEverywhere(ability, permission)`: `ability.rulesFor(permission, 'Project').some(rule => !rule.inverted && rule.conditions === undefined)` — true only through `projects.all` or Super Admin.
- `heldPermissions(ability): Permission[]` and `heldProjectPermissionsEverywhere(ability): ProjectPermission[]` — the catalog filtered by the two predicates.
- `holdsRolePermission(ability, scope, permission)`: global → `holdsPermission`, project → `holdsProjectPermissionEverywhere`.
- `assertPermissionChangesHeld(current, requested, isHeld)`: generic version of today's `UserService` private method; every permission added or removed must satisfy `isHeld`, else `ForbiddenException('You cannot grant or revoke permissions you do not hold: …')`. Shared by user grants, member extras and role edits.
- `assertRoleGrantable(role, isHeld)`: every role permission must satisfy `isHeld`, else `ForbiddenException('You cannot assign a role with permissions you do not hold')`. Callers keep the explicit Super Admin check (that role has no stored permissions).
- `project-access.ts` gains `assertProjectPermission(ability, permission, projectId)` (asserts `read` → 404, then the permission → 403); `assertProjectUpdatable/Deletable` become thin wrappers over it; `canOnProject` unchanged.

### `AbilityFactory`

- `PermissionInputs.memberships` becomes `{ projectId: number; permissions: ProjectPermission[] }[]` holding the **effective** set (role ∪ extras). Loading includes `RoleModel → RolePermissionModel` and `ProjectMemberPermissionModel`.
- `createForUser` emits one `can(permission, 'Project', { projectId: { $in } })` per project permission; `projects.all` keeps mapping to all six unconditional rules via `GLOBAL_PERMISSION_ABILITIES`.
- `getProjectIdsFor(user, permission)` works on the effective sets. The cache key and invalidation stay as they are.

### `PermissionCacheService`

- New `invalidateUsers(userIds: number[])` (parallel `invalidateUser`).

### `RoleService`

- `getRoles(): RoleSummary[]` — all scopes, includes permissions and `assignmentCount`.
- `getRoleById(roleId): RoleWithPermissions` — `NotFoundException('Unknown role')`.
- `getRoleByType(type)` unchanged (setup, tests).
- `getProjectRoles(): RoleWithPermissions[]` — `scope = 'project'`, ordered by roleId.
- `createRole(input, ability): RoleWithPermissions` — 400 when a permission does not belong to the scope, 400 when a project role lacks `read`, 403 when the principal does not hold every permission (`holdsRolePermission`), 400 `'Name is already in use'` on the unique violation. Role and permissions are written in one transaction.
- `updateRole(roleId, update, ability): RoleWithPermissions` — 403 `'The super admin role cannot be changed'` for `type === 'super_admin'`; name/description applied; when `permissions` is given: scope and `read` validation, `assertPermissionChangesHeld` against the current set, replace rows in a transaction; afterwards `invalidateUsers(affected)` where affected = users with that `roleId` (global) or distinct `userId`s of memberships with that `roleId` (project).
- `deleteRole(roleId, ability)` — 403 for Super Admin; 400 `'The role is still assigned to N users'` / `'… N project members'` when `assignmentCount > 0`; otherwise destroy (role_permissions cascade).
- `findRole(roleId): RoleWithPermissions | null` — lookup used by user/member assignment. Callers turn `null` into a 400 (`'Unknown role'`), matching the existing e2e expectation; a wrong scope is also 400 (`'Unknown global role'` / `'Unknown project role'`). Only the role endpoints answer 404.

### `ProjectMemberService`

- `getMembers(projectId, ability): ProjectMemberInfo[]` — includes `UserModel` and `RoleModel`, extras from `ProjectMemberPermissionModel`.
- `getProjectRoles(projectId, ability)` — `assertCanManageMembers`, then `roleService.getProjectRoles()`.
- `setMember(projectId, userId, grant: ProjectMemberGrant, ability)` — `assertCanManageMembers`; 404 unknown user; 400 unknown/global role; `assertRoleGrantable(role, p => canOnProject(ability, p, projectId))`; extras deduplicated and checked with `assertPermissionChangesHeld(currentExtras, requestedExtras, p => canOnProject(ability, p, projectId))`; upsert the member row and replace extras in one transaction; `invalidateUser(userId)`.
- `removeMember` unchanged.
- `getMembershipsForUser(userId): ProjectMembership[]` — one row per membership with role and extras.
- `countMembershipsPerUser()` — count rows per user (no dedupe needed any more).
- `grantFullAccess(projectId, userId, transaction)` — used by `ProjectService.createProject` for creators without `projects.all`: picks the project role whose permission set covers the whole catalog (lowest roleId first); if none exists, the role with the most permissions plus the missing permissions as extras. Always results in all six effective permissions.
- `assertCanManageMembers`: `ability.can('update', 'User')` **or** `assertProjectPermission(ability, 'members.manage', projectId)`.
- `getImplicitAccess` unchanged.

### `ProjectService`

- `createProject` calls `projectMemberService.grantFullAccess` inside its transaction instead of inserting member rows itself. `countMembers` counts rows per project.

### `UserService`

- `createManagedUser(user: ManagedUserCreate, principal, ability)` — role by id (400), scope must be global (400), Super Admin role only by Super Admins (403), `assertRoleGrantable(role, p => holdsPermission(ability, p))`, `assertPermissionChangesHeld([], permissions, …)`; user row and `user_permissions` are written in one transaction; duplicate email stays 400.
- `updateUser` — a role change runs the same grantable rule (replaces `assertRoleAssignable`). Downgrading a target to a role the principal holds is allowed; the old role is not checked (CASL already shields Super Admin targets).
- `replaceUserPermissions` uses the shared helper; behavior unchanged.
- `getUserById` returns the new membership shape.

### Other services

- `InboundFormService`: `createForm`, `updateForm`, `deleteForm`, `replaceFields`, `replaceSecurity`, receiver and template mutations assert `forms.manage`; reads keep `read`. `loadFormChecked` takes `'read' | 'forms.manage'`.
- `ApiKeyService`: `createKey`/`revokeKey` assert `api_keys.manage`.
- `ProjectService` rename/domains keep `update`; delete/restore keep `delete`. `MailMessageService` and `DomainService` keep `read`.

### API surface

`RoleController` (`/role`, tag `role`):

| Endpoint               | Ability       | Body / result                                                                |
| ---------------------- | ------------- | ---------------------------------------------------------------------------- |
| `GET /role`            | `read Role`   | `RoleDto[]`                                                                  |
| `GET /role/:roleId`    | `read Role`   | `RoleDto`, 404 unknown                                                       |
| `POST /role`           | `create Role` | `RoleCreateDto { name, scope, description?, permissions }` → `RoleDto` (201) |
| `PATCH /role/:roleId`  | `update Role` | `RoleUpdateDto { name?, description?, permissions? }` → `RoleDto`            |
| `DELETE /role/:roleId` | `delete Role` | 200, 400 while assigned, 403 for Super Admin                                 |

`ProjectController` additions/changes:

| Endpoint                                  | Check                           | Body / result                                                       |
| ----------------------------------------- | ------------------------------- | ------------------------------------------------------------------- |
| `GET /project/:projectId/roles`           | manage-members rule             | `ProjectRoleDto[] { roleId, name, description, permissions }`       |
| `PUT /project/:projectId/members/:userId` | manage-members rule + hold rule | `ProjectMemberPutDto { roleId, permissions?: ProjectPermission[] }` |
| `GET /project/:projectId/members`         | manage-members rule             | `ProjectMemberDto { …, role: { roleId, name }, permissions }`       |

`AuthController`:

- `GET /auth/permissions` → `AuthPermissionsDto { permissions: Permission[]; projectPermissions: ProjectPermission[] }`: what the caller holds globally and unconditionally on projects (`heldPermissions`, `heldProjectPermissionsEverywhere`). operationId `getHeldPermissions`.

`UserController`:

- `POST /user`: `UserCreateDto.roleId` becomes required; new optional `permissions: Permission[]` (direct grants, hold-checked, written atomically).
- `UserDetailDto.memberships` → `UserMembershipDto { projectId, projectName, role: { roleId, name }, permissions }`.

DTO notes:

- `RoleDto` gains `scope` (`enum: ROLE_SCOPES, enumName: 'RoleScope'`), `description: string | null`, `assignmentCount: number`.
- `RoleCreateDto.permissions` / `RoleUpdateDto.permissions` validate with `@IsIn(ROLE_PERMISSIONS, { each: true })` and `@ApiProperty({ enum: ROLE_PERMISSIONS, enumName: 'RolePermission', isArray: true })`; `name` 1–100 chars, `description` ≤ 255 chars (nullable).
- `ProjectMemberPutDto.permissions` is optional and defaults to `[]`; `ArrayNotEmpty` is gone.
- operationIds (unique across the API): `getRoles`, `getRole`, `createRole`, `updateRole`, `deleteRole`, `getProjectRoles`, `getHeldPermissions`.
- `route-access.spec.ts` matrix gains: `GET /role/:roleId` (`read:Role`), `POST /role` (`create:Role`, scoped), `PATCH /role/:roleId` (`update:Role`, scoped), `DELETE /role/:roleId` (`delete:Role`, scoped), `GET /project/:projectId/roles` (scoped), `GET /auth/permissions` (scoped).

After backend changes: `pnpm --filter backend generate` then `pnpm --filter api build`.

### Setup

Unchanged: `registerFirstUser` assigns the role with `type === 'super_admin'`.

### Error semantics

- Hold-rule violations and the Super Admin lock: 403.
- Unknown role/scope in a request body, missing `read` on a project role, duplicate name, role still assigned: 400.
- `GET/PATCH/DELETE /role/:roleId` with an unknown id: 404.
- Project reads without `read`: 404; other missing project permissions: 403 (unchanged).

## Frontend

### Auth plumbing

- `useAuthPermissionsQuery` (`['auth.permissions']`, `staleTime: 60_000`) fetches `GET /auth/permissions`. Login removes it like `['auth.ability']`; the user-update and user-permissions mutations invalidate it alongside `['auth.ability']` when the current user is affected; role mutations always invalidate `['auth.ability']` and `['auth.permissions']`.
- "Grantable" on the client:
    - Global role: every `role.permissions` entry is in `held.permissions`, and `type !== 'super_admin'` unless the current user is a Super Admin.
    - Global permission checkbox: enabled only when in `held.permissions`.
    - Project role on project X: every permission satisfies `ability.can(permission, subject('Project', { projectId }))`.
    - Project permission checkbox on project X: same per-permission check.
    - Project role editor: enabled only when in `held.projectPermissions`.
- Per-project checks keep using CASL; no mapping logic is duplicated on the client.

### Shared pieces

- `DisclosureBox` (existing, `src/components/`) is rebuilt: a `<button>` summary with `aria-expanded`/`aria-controls` toggles a `VExpandTransition`-wrapped content panel. Props: `summary`, `defaultOpen` (default `false`). Collapsed by default; the global reduced-motion rule zeroes the transition. Existing usages (`EndpointCard`, `DnsRecord`) keep their API.
- `modules/roles/permissionCatalog.ts`: `GLOBAL_PERMISSION_GROUPS` (moved from `modules/users/permissionGroups.ts`, extended with the three role permissions) and `PROJECT_PERMISSION_GROUPS` (`project`: read/update/delete; `content`: forms.manage, api_keys.manage; `members`: members.manage). i18n keys use `_` instead of `.` (`permissions.labels.roles_create`, `permissions.project.forms_manage`) because vue-i18n treats dots as path separators.
- `modules/roles/components/PermissionGrid.vue`: props `scope`, `modelValue` (selected, excluding locked), `locked` (from the role: checked + disabled, hint "From role: {role}" via `lockedHint`), `grantable` (toggleable permissions; others disabled with hint "You don't hold this permission"), `required` (checked + disabled and always kept inside `modelValue`, e.g. project `read` in the role editor), `readonly`. Replaces the inline grids in `UserPermissionsCard` and `ProjectMemberDialog`.
- `RoleSelect` gains `scope` (default `global`) and `includeRoleId` (keeps the target's current role in the list even when it is not grantable); the subtitle is `role.description`. Options are filtered by the grantable rule above.
- `useRoleLabels` returns `role.name`; the `roles.*` and `module.users.roles.*` i18n keys are removed. `UserListView` keeps `ROLE_ORDER` for sorting.

### Roles module (`modules/roles/`)

- `queries/useRolesQuery` (moved here, key `['roles']`), `queries/useRoleQuery(roleId)` (`['roles', roleId]`).
- `mutations/useRoleCreateMutation`, `useRoleUpdateMutation`, `useRoleDeleteMutation` — invalidate `['roles']`, `['users']`, `['auth.ability']`, `['auth.permissions']`.
- Router: `/roles` (`RouteNames.ROLE_LIST`) and `/roles/:roleId` (`RouteNames.ROLE_DETAILS`), `meta.section: 'roles'` (added to the `RouteMeta.section` union), `ability: { action: 'read', subject: 'Role' }`. Navigation: admin group entry "Roles" (`mdiShieldAccountOutline`), visible with `read Role`; `nav.permission.Role` added.
- `views/list/RoleListView.vue`: `PageHeader` "Roles" with "New role" (`create Role`). Two flush `SectionCard`s, "Global roles" and "Project roles", each a list of `ListRow`s linking to the detail: name (+ "System" `TagLabel` for Super Admin), description as subtitle, meta "N permissions" (Super Admin: "All permissions") and "N users" / "N members". Loading/error/empty states via the shared components.
- `views/list/partials/AddRoleDialog.vue` (`FormDialog`): name, scope (`VSelect`, default global), description, optional "Start from" (roles of the chosen scope; copies their permissions). Submits `POST /role` with the copied permissions (or `['read']` for a fresh project role, `[]` for a fresh global role) and navigates to the new role's detail page.
- `views/details/RoleDetailView.vue`: `PageHeader` with the name, breadcrumb "Roles", scope `TagLabel`. Cards:
    1. `RoleProfileCard` — name and description with `SaveFooter`; read-only `ReadonlyValue`s without `update Role` or for Super Admin.
    2. `RolePermissionsCard` — `PermissionGrid` with `grantable` = `held.permissions` (global) or `held.projectPermissions` (project), `required = ['read']` for project roles, `SaveFooter`. Super Admin shows an `InlineAlert` ("System role with every permission") instead.
    3. Assignments note — "Assigned to N users" linking to the users list (global) or "Assigned to N project members" (project).
    4. Danger zone (`delete Role`, not Super Admin) — delete with confirm when `assignmentCount === 0`; otherwise the description explains that the role must be unassigned first and the button is absent.

### Users module

- `AddUserDialog`: `RoleSelect` (grantable global roles, pre-selects the `type === 'user'` role when present), then `DisclosureBox` "Advanced: additional permissions" containing a `PermissionGrid` with `locked` = the selected role's permissions and `grantable` = `held.permissions`. Changing the role drops extras the new role already covers. Submits `{ …, roleId, permissions: extras }`.
- `UserProfileCard`: `RoleSelect` with `includeRoleId = user.role.roleId`.
- `UserPermissionsCard`: `PermissionGrid` (`locked` = role permissions, `grantable` = held).
- `UserMembershipsCard`: role `TagLabel` plus one `TagLabel` per extra.

### Projects module

- `queries/useProjectRolesQuery(projectId)` (`['projects', projectId, 'roles']`).
- `ProjectMemberDialog`: user picker (unchanged), project-role `VSelect` (description as subtitle) filtered to roles grantable on this project plus the member's current role when editing; adding pre-selects the grantable role with the fewest permissions (ties by name). `DisclosureBox` "Advanced: additional permissions" with a project-scope `PermissionGrid` (`locked` = role permissions, `grantable` = permissions held on this project). Submits `{ roleId, permissions }`.
- `ProjectMembersCard`: role `TagLabel` plus extra `TagLabel`s per member; the card receives `canManage` from the view.
- `ProjectDetailView` gating: forms card `forms.manage`, domains and general cards `update`, members card `members.manage || update User`, API keys card `api_keys.manage`, danger zone `delete`. The "Read only" tag and alert show when none of the write permissions is held. `InboundFormDetailView` and `FormsByProjectCard` use `forms.manage` where they used `update`.
- `helpers/projectPermissions.ts`: `PROJECT_PERMISSIONS` lists all six in catalog order; `sortedPermissions` unchanged.
- i18n under `module.projects.members.*` and `module.roles.*`; shared `permissions.*` labels extended.

## Testing

- **Backend unit** (Vitest + SWC, typed mocks):
    - `RoleService`: create validates scope/`read`/hold/duplicate; update refuses Super Admin, applies hold rule to the diff, invalidates affected users; delete refuses Super Admin and assigned roles; summaries carry assignment counts.
    - `ProjectMemberService`: role grantable on the project, extras diff held, upsert + replace in a transaction, `grantFullAccess` picks the covering role or falls back to extras, manage-members OR rule with `members.manage`.
    - `UserService`: create with role + extras atomically, grantable rule on create/update, Super Admin only by Super Admins.
    - `AbilityFactory`: effective membership permissions (role ∪ extras), six project actions, `projects.all` expansion.
    - Helpers: `holdsProjectPermissionEverywhere`, `heldPermissions`, `assertPermissionChangesHeld`, `assertRoleGrantable`, `assertProjectPermission`.
    - `route-access.spec.ts` matrix updated.
- **Backend e2e** (Testcontainers): new `role.e2e-spec.ts` (CRUD, hold rule, Super Admin lock, delete while assigned, cache invalidation on role edit takes effect on the next request); `permission.e2e-spec.ts`, `user.e2e-spec.ts`, `project.e2e-spec.ts` adapted to the new catalog, member body and seeded role count (7); `schema`/`migrations` e2e cover the new tables; a migration test converts legacy member rows (role + extras, `down` round-trip).
- **Frontend** (jsdom): `DisclosureBox` (collapsed by default, toggles, `aria-expanded`), `PermissionGrid` (locked/grantable/required states), `RoleSelect` filtering, `AddUserDialog` advanced section and payload, `ProjectMemberDialog` role pre-selection and payload, `RoleListView`, `AddRoleDialog`, `RoleDetailView` cards and danger zone, `ProjectDetailView` gating per permission, navigation entry visibility, updated existing specs and fixtures.

## Explicit non-goals

- Permissions below project level (per-form grants).
- Role hierarchy or inheritance between roles.
- Reassigning users automatically when a role is deleted (deletion is blocked instead).
- Audit log of permission changes.
- Translated role names (names live in the database, the app is English-only).
- Reset of a seeded role to its default configuration.
