# User Management & Permissions — Design

Date: 2026-07-16
Status: Approved design, pending implementation plan

## Goal

Introduce user management with a role/permission system. Global permissions gate application areas (domains, projects, bounces, settings, users); project access is granted per user via memberships or the global `projects.all` permission. Three default roles ship out of the box: Super Admin, Admin, User.

## Decisions (from brainstorming)

- Roles are database entities with permission sets. The schema supports custom roles, but **no role create/update/delete endpoints or UI ship now** — only the three seeded defaults. Role editing is a future feature the schema must not block.
- **One role per user.** Effective permissions = role permissions ∪ direct user grants.
- **Full CRUD permission catalog** per area (see below).
- New users are **created by an admin with an initial password** (shared out-of-band). No invite emails.
- **Super Admins:** a Super Admin can promote other users to Super Admin. Super Admin accounts can only be edited/demoted/deleted by another Super Admin, and never the last one — the system always keeps at least one. Admins cannot touch Super Admins.
- **Project creators** without `projects.all` automatically receive a full membership (`read`, `update`, `delete`) on the project they create.
- **Membership management** (grant/revoke/change project access) is allowed by global `users.update` **or** project-scoped `update` on that project.
- **Domains inside a project:** assigning/unassigning a domain to a project requires global `domains.read` **and** project-scoped `update`.
- **No permissions below project level.** Forms inherit their parent project's scoping.
- Architecture: **CASL** (`@casl/ability`) as the authorization evaluation layer on both backend and frontend, on top of normalized permission tables.

## Permission catalog

Defined once as TypeScript string constants in the backend (`Permission` union type); stored values are validated against it.

| Area     | Global permissions                                                              |
| -------- | ------------------------------------------------------------------------------- |
| Domains  | `domains.read`, `domains.create`, `domains.update`, `domains.delete`            |
| Projects | `projects.create`, `projects.all`                                               |
| Bounces  | `bounces.read`, `bounces.block`, `bounces.unblock`                              |
| Settings | `settings.read`, `settings.update`                                              |
| Users    | `users.read`, `users.create`, `users.update`, `users.delete`                    |
| Roles    | `roles.read` (`roles.create/update/delete` reserved for the future role editor) |

Project-scoped permission levels (stored on memberships): `read`, `update`, `delete`. Holding `projects.all` behaves like holding all three levels on every project.

Semantics:

- `read` on a project: view the project, its forms, submissions, and assigned domains.
- `update` on a project: rename the project, create/edit/delete its forms, assign/unassign domains (additionally requires global `domains.read`), manage members (see membership management rule).
- `delete` on a project: soft-delete and restore the project.

## Data model

Migration `010-create-permissions.ts` (umzug, `up`/`down` over `QueryInterface`):

- `roles` — `roleId` PK auto-increment, `name` STRING unique, `type` STRING (`'super_admin' | 'admin' | 'user' | 'custom'`), timestamps. Code keys on `type`, never on the display name.
- `role_permissions` — `rolePermissionId` PK, `roleId` FK → roles (CASCADE), `permission` STRING; unique `(roleId, permission)`.
- `user_permissions` — `userPermissionId` PK, `userId` FK → users (CASCADE), `permission` STRING; unique `(userId, permission)`.
- `project_members` — `projectMemberId` PK, `projectId` FK → projects (CASCADE), `userId` FK → users (CASCADE), `permission` STRING (`'read' | 'update' | 'delete'`); unique `(projectId, userId, permission)`. One row per granted level, mirroring the `project_domains` pattern.
- `users.roleId` — new FK → roles. Added nullable, backfilled, then set NOT NULL.

Seeding happens **inline in the migration** (no runtime seeder):

- Insert the three roles: `Super Admin` (`super_admin`), `Admin` (`admin`), `User` (`user`).
- Insert the full catalog (inlined list) as Admin's `role_permissions` rows, including `projects.all`.
- Super Admin gets **no stored permissions** — its `type` grants everything in code, making it unrevokable by construction.
- The User role gets no permissions.
- Backfill: every existing user gets the Super Admin role (today only the onboarding user can exist).

Convention going forward: when a future feature adds a catalog permission, its migration also inserts the corresponding `role_permissions` rows for the Admin role, keeping "Admin can do everything" true without runtime magic that would conflict with the future role editor.

`down` drops the tables and the `users.roleId` column.

Sequelize models follow existing conventions (`sequelize-typescript`, interfaces in `interfaces/`, `@BelongsToMany(() => UserModel, () => ProjectMemberModel)` on `ProjectModel`, `@BelongsTo(() => RoleModel)` on `UserModel`).

## Backend

### New module `apps/backend/src/modules/permission/`

- `permission.constants.ts` — permission catalog, role types, seeded role definitions.
- `services/ability-factory.service.ts` — `createForUser(user): Promise<AppAbility>`:
    - Loads permission inputs (role type, role permissions, direct permissions, project memberships) with Redis caching (`auth:permissions:<userId>`, 60s TTL).
    - `type === 'super_admin'` → `can('manage', 'all')`, nothing else.
    - Maps stored global permissions to rules: `domains.read` → `can('read', 'Domain')`, `projects.all` → `can(['read','update','delete'], 'Project')`, `bounces.block` → `can('block', 'Bounce')`, etc. `projects.create` → `can('create', 'Project')`.
    - Membership rows → conditional rules per level: `can('update', 'Project', { projectId: { $in: [...] } })`.
    - Non-Super-Admins get inverted rules: `cannot(['update', 'delete'], 'User', { roleType: 'super_admin' })` — encodes "Admins can't touch Super Admins". User subjects carry a flattened `roleType` for condition matching.
    - Also exposes the raw membership map (projectId → levels) for SQL list scoping, from the same cached inputs.
- `guards/policies.guard.ts` + `decorators/RequireAbility.ts` — NestJS policies pattern. `@RequireAbility({ action, subject })` sets metadata; the guard builds the ability, checks requirements, and attaches the ability to the request. Routes without the metadata pass through (only the JWT check applies), so unannotated routes keep current behavior.
- `decorators/CurrentAbility.ts` — param decorator returning `request.ability` for conditional checks.
- `@JwtAuth()` is extended to compose `JwtAuthGuard` + `PoliciesGuard`.

CASL vocabulary — actions: `read`, `create`, `update`, `delete`, `block`, `unblock`, `manage`; subjects: `Domain`, `Project`, `Bounce`, `Settings`, `User`, `Role`, `all`.

### Enforcement rules

- Static route checks via `@RequireAbility` (e.g. `{ action: 'create', subject: 'Domain' }` on `POST /domain`).
- Per-project checks are dynamic: services load the row and run `ForbiddenError.from(ability).throwUnlessCan('update', subject('Project', project))`.
- List scoping: `getProjects()` applies no filter when the ability allows unconditional `read Project`; otherwise `WHERE projectId IN (membership read IDs)`. Same rule for the deleted-projects list and restore, using the `delete` level.
- Inbound-form endpoints check the parent project: `read` for GETs, `update` for mutations.
- Domain assignment endpoints require `read Domain` and project `update`.
- Membership endpoints require `update User` (global) or `update` on that project.
- Service-level assertions (not expressible in CASL):
    - Assigning the Super Admin role (create or update) requires the caller to be a Super Admin.
    - The last Super Admin cannot be demoted or deleted.
    - A user cannot delete themselves.

### Error semantics

- Project-scoped reads where the caller lacks `read`: **404** (existence hiding).
- Acting on a visible project without the required level: **403**.
- Global permission failures: **403**.

### Caching & invalidation

Permission inputs cached in Redis under `auth:permissions:<userId>` (60s TTL). Explicit invalidation:

| Change              | Invalidate                                                                                      |
| ------------------- | ----------------------------------------------------------------------------------------------- |
| User role change    | `auth:user:<id>` + `auth:permissions:<id>`                                                      |
| Direct-grant change | `auth:permissions:<id>`                                                                         |
| Membership change   | `auth:permissions:<affected userId>`                                                            |
| User delete         | both keys; the JWT dies at next request because `JwtStrategy.validate` no longer finds the user |

### Setup module

`registerFirstUser` assigns the Super Admin role (looked up by `type`). Endpoints stay public and otherwise unchanged.

## API surface

### `UserController` (`/user`, currently empty)

| Endpoint                        | Ability       | Notes                                                                                       |
| ------------------------------- | ------------- | ------------------------------------------------------------------------------------------- |
| `GET /user`                     | `read User`   | List with role name/type                                                                    |
| `POST /user`                    | `create User` | firstName, lastName, email, initial password, optional `roleId` (defaults to the User role) |
| `GET /user/:userId`             | `read User`   | Detail: role, direct permissions, project memberships                                       |
| `PATCH /user/:userId`           | `update User` | name/email/password/roleId; CASL blocks Super Admin targets for non-Super-Admins            |
| `DELETE /user/:userId`          | `delete User` | Service asserts: not self, not the last Super Admin                                         |
| `PUT /user/:userId/permissions` | `update User` | Replaces the direct-grant set; values validated against the catalog                         |

Permission values are declared as an OpenAPI enum on the DTOs (`@ApiProperty({ enum: PERMISSIONS })`), so the generated client exposes the catalog as a typed union + Zod enum — the frontend derives its permission checkbox grids from generated types instead of hardcoding the list.

### `RoleController` (`/role`)

- `GET /role` — `read Role` — roles with their permission lists (role dropdown, permission checkbox grid, future editor). No create/update/delete.

### Project members (on `ProjectController`)

- `GET /project/:projectId/members` — list members with levels.
- `PUT /project/:projectId/members/:userId` — body `{ permissions: ['read', 'update'] }`, replaces the member's levels.
- `DELETE /project/:projectId/members/:userId` — removes the member.
- All three: `update User` (global) or `update` on that project.

### Auth

- `UserDto` gains `role` (roleId, name, type).
- New `GET /auth/ability` — returns the caller's CASL rules as plain DTOs (`{ action, subject, conditions?, inverted? }`). The frontend hydrates its `Ability` from this; rule-building logic exists only in the backend. Project responses need no `myPermissions` field — the `$in` conditions travel with the rules and allow local per-project evaluation.

### Existing controllers annotated

- Domain: `read`/`create`/`update`/`delete Domain` per route.
- Bounce: `read`/`block`/`unblock Bounce`.
- Settings: `read`/`update Settings`.
- Project: `create Project` on POST (with creator auto-membership); list endpoints scoped; detail/update/delete/restore via per-project checks; domain assign/unassign additionally require `read Domain`.

After backend changes: `pnpm --filter backend generate` then `pnpm --filter api build` to regenerate the typed client (`UserApi`, `RoleApi`, extended `AuthApi`).

## Frontend

### Ability plumbing

- Dependencies: `@casl/ability`, `@casl/vue`.
- `src/plugins/casl.ts` creates a singleton empty `MongoAbility`, provided app-wide via `abilitiesPlugin`.
- New `useAbilityQuery` (`['auth.ability']`) fetches `GET /auth/ability` and calls `ability.update(rules)`. Logout resets to `ability.update([])`.
- Components use `useAbility()`: `can('create', 'Domain')` gates buttons; `can('update', subject('Project', project))` for per-project UI.

### Router

- Route `meta` gains an optional ability requirement `{ action, subject }`.
- The existing global `beforeEach` adds one step: after the auth fetch succeeds, ensure the ability query is loaded, check the route requirement, redirect failures to the dashboard (reachable by all authenticated users).
- New `RouteNames.USER_LIST`, `RouteNames.USER_DETAILS`.

### Navigation (`AppLayout.vue`)

Tabs render conditionally: Projects always (list is server-scoped), Domains `read Domain`, Bounces `read Bounce`, Settings `read Settings`, new Users tab `read User`.

### New `modules/users/` (mirrors the projects module structure)

- `UserListView` — user table (name, email, role chip), create-user dialog (name, email, initial password, role dropdown via `useRolesQuery`), delete with confirmation. Gated by `create User` / `delete User`.
- `UserDetailView` — three cards:
    1. Profile: name/email/password reset, role dropdown (Super Admin option hidden unless the caller is a Super Admin).
    2. Direct permissions: checkbox grid grouped by area, derived from the generated permission enum.
    3. Project memberships: read-only list (editing happens on the project page).
- `queries/`: `useUsersQuery`, `useUserQuery`, `useRolesQuery`. `mutations/`: create/update/delete user, update permissions. Cache updates via `setQueryData`/invalidation as in the projects module. Mutations affecting the current user also invalidate `['auth.ability']` and `['auth.user']`.

### Project detail view

New Members section, visible when the caller can manage members (`update User` globally or `update` on this project): user picker (via `useUsersQuery`, requires `users.read` — hidden otherwise, leaving only level-editing/removal of existing members), level checkboxes (`read`/`update`/`delete`), remove member.

### Forms & i18n

vee-validate + Zod schemas matching backend constraints (email format, password min length 8). All copy in `src/locales/en.json`: feature keys under `users.*`, shared `permissions.*` labels for checkbox grids.

## Testing

- **Backend unit** (Vitest + SWC, typed mocks per repo convention):
    - `AbilityFactory`: table-driven — super admin ⇒ manage all; admin ⇒ cannot update/delete super-admin users; membership `$in` conditions; `projects.all`; direct grants union with role grants.
    - `PoliciesGuard`: metadata honored; no-metadata passthrough; ability attached to request.
    - `UserService`: last-super-admin protection, self-delete block, super-admin role assignment restriction, permission replacement, cache invalidation calls.
    - `ProjectService`: list scoping, creator auto-membership, member-management OR-rule, 404 vs 403 semantics.
- **Backend e2e** (Testcontainers): admin creates a user → that user logs in → receives 403/404 where expected → gains access after membership grant; admin attempts on a super admin rejected; last-super-admin delete rejected; setup assigns Super Admin.
- **Frontend** (jsdom, `mountView`/`withVueQuery`): users module view specs, guard redirect without required ability, nav tab visibility, members section visibility — with stubbed ability rules.

## Explicit non-goals

- Role create/update/delete (endpoints and UI) — schema supports it; feature deferred.
- Email invite flow for new users.
- Self-service profile page / own-password change for users without `users.update`.
- Permissions below project level (per-form grants).
