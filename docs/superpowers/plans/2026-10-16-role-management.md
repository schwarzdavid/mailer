# Role Management & Permission Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make roles the primary way to grant access: editable global and project roles managed in a new Roles area, a finer project-permission catalog, "Advanced" extra-permission sections on user creation and project invites, and a strict "you can only grant what you hold" rule on every level.

**Architecture:** The existing `permission` module (CASL abilities built from `roles`, `role_permissions`, `user_permissions`, `project_members`) is extended rather than replaced: `roles` gains a `scope` (`global` | `project`) and `description`, `project_members` becomes one row per membership carrying a `roleId` plus a `project_member_permissions` table for extras, and the project-permission catalog grows from three to six values that double as CASL actions on the `Project` subject. Hold-rule helpers (`holdsPermission`, `holdsProjectPermissionEverywhere`, `assertPermissionChangesHeld`, `assertRoleGrantable`) live in the permission module and are reused by the role, user and member services. The frontend gets a `modules/roles/` feature (list, create dialog, detail editor), a shared `PermissionGrid`, an animated `DisclosureBox`, and a `GET /auth/permissions` query that tells the client what the caller holds.

**Tech Stack:** NestJS 12 (native ESM, `.js` import suffixes), sequelize-typescript + umzug migrations, `@casl/ability`, class-validator/class-transformer, `@nestjs/swagger`, Vitest (SWC) + supertest/Testcontainers e2e; Vue 3 + Vuetify 3 + TanStack Query + vue-i18n + vee-validate/Zod + `@casl/vue`, Vitest (jsdom), generated client in `packages/api` (`@hey-api/openapi-ts`).

**Spec:** `docs/superpowers/specs/2026-10-16-role-management-design.md`

## Global Constraints

- **Never touch git.** No `git add`/commit/push. Every "commit" step below is a verification step instead; the user handles version control.
- **No comments** in code (CLAUDE.md). Clear names instead. The only exception is the existing `//` convention for non-obvious _why_, which no task here needs.
- **Read before you write**: read each file before modifying it, including files this plan quotes.
- ESM: relative imports end in `.js` (directories: `./dtos/index.js`); `import.meta.dirname` instead of `__dirname`. Singular model associations to classes in circular import chains use `Relation<T>` from `src/types/relation.ts`.
- Prettier owns formatting (4-space indent, single quotes, no semicolons, trailing commas). Run `pnpm format:fix` instead of hand-formatting; run `pnpm lint` and `pnpm typecheck` before declaring a task done.
- Test doubles: `vi.fn<Service['method']>()` held as `Mock<…>`; typed fixtures with domain interfaces/DTO types, no loose literals or `as` casts on domain data. Sequelize rows in tests are `Interface & { get(options): Interface }`.
- Backend unit tests run with `pnpm --filter backend exec vitest run <file>`; frontend with `pnpm --filter frontend exec vitest run <file>`. Backend e2e: `pnpm --filter backend test:e2e` (needs Docker; long first run).
- `test/schema.e2e-spec.ts` compares every registered model with the migrated database (columns, types, lengths, nullability, index names, FK referential actions) and `test/migrations.e2e-spec.ts` round-trips every migration (`up` → `down` must restore the previous schema exactly). Models and migration must match to the letter.
- The permission catalog is the single source of truth in `apps/backend/src/modules/permission/permission.constants.ts`; OpenAPI enums are declared on DTOs with `@ApiProperty({ enum, enumName })` so the generated client exposes them as typed unions. Enum names used here: `Permission` (global), `ProjectPermission`, `CatalogPermission` (global ∪ project), `RoleScope`, `RoleType`.
- operationIds are controller method names and must be unique across the API. New ones: `getRole`, `createRole`, `updateRole`, `deleteRole`, `getProjectRoles`, `getHeldPermissions`.
- After backend endpoint changes: `pnpm --filter backend generate` then `pnpm --filter api build` (Task 11). Frontend tasks (12+) depend on the regenerated client.
- Frontend conventions: shared components only (`SectionCard`, `ListRow`, `TagLabel`, `FormDialog`, `SaveFooter`, `InlineAlert`, `EmptyState`/`ErrorState`, skeletons, `DisclosureBox`), what a user can't do is absent (not disabled) unless the control explains why (locked/not-held permission checkboxes carry a hint), irreversible destructive actions use `useConfirm`, i18n keys live only in `src/locales/en.json` (no SFC i18n blocks; feature copy under `module.<feature>.*`), views go through query/mutation composables, never the SDK directly, route names come from `RouteNames`.
- vue-i18n treats `.` in a key as a path separator: permission labels use `_` (`permissions.labels.roles_create`, `permissions.project.forms_manage`).
- Role names and descriptions come from the database (`name`, `description`), never from i18n keys per role type.

## Review Focus

1. **A member manager picks a role whose permissions they do not fully hold on that project** (Maintainer without `delete` assigns Owner) — expected 403 and no change. Pinned in Task 6 (`setMember` "rejects a role with permissions the caller does not hold on the project") and Task 11 (`role.e2e-spec.ts`).
2. **Deleting a role that memberships still reference** — the FK is `RESTRICT`, so without a guard this would be a 500. Expected 400 naming the count. Pinned in Task 4 (`deleteRole` "refuses while project members hold the role") and Task 11.
3. **A `roles.update` holder without `projects.all` adds `delete` to the Viewer project role** — that would grant `delete` on every project. Expected 403. Pinned in Task 4 (`updateRole` "requires unconditional project permissions for project roles") and Task 11.
4. **Legacy membership rows without `read` (e.g. only `update`)** — they were dead before, the migration must not crash on them. Expected Viewer + extras, with `read` added. Pinned in Task 2 (`role-membership-migration.e2e-spec.ts`).
5. **A role's permissions change while a user with that role has a cached permission set** — the change must apply on their next request. Pinned in Task 4 (`updateRole` invalidates every affected user) and Task 11 (`role.e2e-spec.ts` "applies role permission changes to existing sessions").

### Spec clarifications made while planning

- The spec names the global ∪ project union `ROLE_PERMISSIONS`/`RolePermission`. The backend already has a `RolePermission` row interface (the `role_permissions` entity), so the union is `CATALOG_PERMISSIONS` / `CatalogPermission` here, and the OpenAPI enum is `CatalogPermission`. Everything else keeps the spec's names.
- `assertRoleGrantable` takes the permission list directly (`assertRoleGrantable(permissions, isHeld)`) so callers can narrow a role's `CatalogPermission[]` to `Permission[]` or `ProjectPermission[]` with the type guards `isGlobalPermission`/`isProjectPermission` before checking.
- `RoleService.getRoleById` returns a `RoleSummary` (with `assignmentCount`) so every role endpoint serializes a complete `RoleDto`; `findRole` returns `RoleWithPermissions | null` for assignment paths.
- `DELETE /role/:roleId` needs no `@CurrentAbility()` (no hold check on delete), so its route-access entry is `scopedByPrincipal: false`.
- The migration converts member rows by reading them into memory, dropping the old table and creating the new ones (renaming would collide on index and sequence names).
- `setMember` replaces the membership row (destroy + create) like the existing implementation did; extras cascade with the row.
- `PermissionGrid` is a generic SFC (`generic="T extends string"`) that receives its `groups` as a prop so callers keep `Permission[]`/`ProjectPermission[]` typing without casts.
- Deleting a form needs `forms.manage` (not project `delete`), so `InboundFormDetailView` shows the form danger zone with `forms.manage`.

---

## File Structure

**Create (backend)**

- `apps/backend/src/migrations/016-add-role-scopes-and-project-roles.ts` — schema + data migration.
- `apps/backend/src/modules/permission/models/project-member-permission.model.ts` — extras table model.
- `apps/backend/src/modules/permission/helpers/permission-grants.ts` (+ `.spec.ts`) — `assertPermissionChangesHeld`, `assertRoleGrantable`.
- `apps/backend/src/modules/permission/helpers/holds-permission.spec.ts` — tests for the extended hold helpers.
- `apps/backend/src/modules/permission/dtos/role-create.dto.ts` (+ `.spec.ts`) — `RoleCreateDto`, `RoleUpdateDto`.
- `apps/backend/src/modules/permission/dtos/project-member-role.dto.ts` — `ProjectMemberRoleDto` shared by project and user DTOs.
- `apps/backend/src/modules/auth/dtos/auth-permissions.dto.ts` — `AuthPermissionsDto`.
- `apps/backend/test/role.e2e-spec.ts` — role CRUD + hold rule e2e.
- `apps/backend/test/role-membership-migration.e2e-spec.ts` — migration 016 conversion test.

**Modify (backend)**

- `apps/backend/src/modules/permission/permission.constants.ts`, `interfaces/app-ability.ts`, `interfaces/role.interface.ts`, `interfaces/project-member.interface.ts`
- `apps/backend/src/modules/permission/helpers/holds-permission.ts`, `helpers/project-access.ts` (+ spec)
- `apps/backend/src/modules/permission/models/role.model.ts`, `models/role-permission.model.ts`, `models/project-member.model.ts`, `permission.module.ts`
- `apps/backend/src/modules/permission/services/ability-factory.service.ts` (+ spec), `services/permission-cache.service.ts` (+ spec), `services/role.service.ts` (+ spec), `services/project-member.service.ts` (+ spec)
- `apps/backend/src/modules/permission/controller/role.controller.ts` (+ spec), `dtos/role.dto.ts`
- `apps/backend/src/modules/project/services/project.service.ts` (+ spec), `controller/project.controller.ts` (+ spec), `dtos/project-member.dto.ts`
- `apps/backend/src/modules/user/interfaces/user.interface.ts`, `mappers/user.mapper.ts` (+ spec), `services/user.service.ts` (+ spec), `controller/user.controller.ts` (+ spec), `dtos/user.dto.ts`, `dtos/user-create.dto.ts` (+ spec)
- `apps/backend/src/modules/auth/controller/auth.controller.ts` (+ spec)
- `apps/backend/src/modules/inbound-form/services/inbound-form.service.ts` (+ spec), `controller/inbound-form.controller.ts` (+ spec)
- `apps/backend/src/modules/api-key/services/api-key.service.ts` (+ spec)
- `apps/backend/src/route-access.spec.ts`
- `apps/backend/test/support/session.ts`, `test/permission.e2e-spec.ts`, `test/user.e2e-spec.ts`, `test/project.e2e-spec.ts`, `test/inbound-form-management.e2e-spec.ts`, `test/public-send.e2e-spec.ts`
- `README.md`

**Create (frontend)**

- `apps/frontend/src/modules/auth/queries/useAuthPermissionsQuery.ts` (+ spec)
- `apps/frontend/src/modules/roles/permissionCatalog.ts` (+ `__tests__/permissionCatalog.spec.ts`)
- `apps/frontend/src/modules/roles/components/PermissionGrid.vue` (+ `__tests__/PermissionGrid.spec.ts`)
- `apps/frontend/src/modules/roles/queries/useRolesQuery.ts` (moved from users), `queries/useRoleQuery.ts` (+ specs)
- `apps/frontend/src/modules/roles/mutations/useRoleCreateMutation.ts`, `useRoleUpdateMutation.ts`, `useRoleDeleteMutation.ts` (+ specs)
- `apps/frontend/src/modules/roles/views/list/RoleListView.vue`, `views/list/partials/AddRoleDialog.vue` (+ specs)
- `apps/frontend/src/modules/roles/views/details/RoleDetailView.vue`, `views/details/partials/RoleProfileCard.vue`, `views/details/partials/RolePermissionsCard.vue` (+ specs)
- `apps/frontend/src/modules/roles/__tests__/roleFixtures.ts`
- `apps/frontend/src/modules/projects/queries/useProjectRolesQuery.ts` (+ spec)
- `apps/frontend/src/components/__tests__/DisclosureBox.spec.ts`

**Modify (frontend)**

- `apps/frontend/src/components/DisclosureBox.vue`
- `apps/frontend/src/__tests__/fixtures.ts`, `src/modules/users/views/__tests__/userFixtures.ts`
- `apps/frontend/src/modules/auth/mutations/useLoginMutation.ts`
- `apps/frontend/src/modules/users/components/RoleSelect.vue`, `composables/useRoleLabel.ts`, `mutations/useUserUpdateMutation.ts`, `mutations/useUserPermissionsMutation.ts`, `views/list/partials/AddUserDialog.vue`, `views/details/partials/UserProfileCard.vue`, `views/details/partials/UserPermissionsCard.vue`, `views/details/partials/UserMembershipsCard.vue` (+ specs); delete `modules/users/permissionGroups.ts`, `__tests__/permissionGroups.spec.ts`, `queries/useRolesQuery.ts`, `queries/__tests__/useRolesQuery.spec.ts`
- `apps/frontend/src/modules/projects/helpers/projectPermissions.ts`, `mutations/useProjectMemberSetMutation.ts`, `views/details/ProjectDetailView.vue`, `views/details/partials/ProjectMemberDialog.vue`, `views/details/partials/ProjectMembersCard.vue` (+ specs)
- `apps/frontend/src/modules/inbound-forms/views/details/InboundFormDetailView.vue`, `src/modules/dashboard/views/partials/FormsByProjectCard.vue`
- `apps/frontend/src/router/index.ts`, `src/router/RouteNames.ts`, `src/modules/dashboard/layouts/partials/AppNavigation.vue` (+ `AppLayout.spec.ts`)
- `apps/frontend/src/locales/en.json`
- `apps/frontend/e2e/07-users.spec.ts`

---

### Task 1: Permission catalog, interfaces and hold helpers

**Files:**

- Modify: `apps/backend/src/modules/permission/permission.constants.ts`
- Modify: `apps/backend/src/modules/permission/interfaces/app-ability.ts`
- Modify: `apps/backend/src/modules/permission/interfaces/role.interface.ts`
- Modify: `apps/backend/src/modules/permission/interfaces/project-member.interface.ts`
- Modify: `apps/backend/src/modules/permission/helpers/holds-permission.ts`
- Create: `apps/backend/src/modules/permission/helpers/holds-permission.spec.ts`
- Create: `apps/backend/src/modules/permission/helpers/permission-grants.ts`
- Create: `apps/backend/src/modules/permission/helpers/permission-grants.spec.ts`
- Modify: `apps/backend/src/modules/permission/helpers/project-access.ts`
- Modify: `apps/backend/src/modules/permission/helpers/project-access.spec.ts`
- Modify: `apps/backend/src/modules/user/mappers/user.mapper.ts`

**Interfaces:**

- Produces (constants): `GLOBAL_PERMISSIONS` (+ `roles.create|update|delete`), `PROJECT_PERMISSIONS = ['read','update','delete','forms.manage','api_keys.manage','members.manage']`, `PROJECT_ROLE_REQUIRED_PERMISSION = 'read'`, `CATALOG_PERMISSIONS`, `type CatalogPermission = Permission | ProjectPermission`, `ROLE_SCOPES = ['global','project']`, `type RoleScope`, `isGlobalPermission(value: string): value is Permission`, `isProjectPermission(value: string): value is ProjectPermission`, `permissionsForScope(scope): readonly CatalogPermission[]`.
- Produces (types): `AbilityAction` gains `'forms.manage' | 'api_keys.manage' | 'members.manage'`; `Role { roleId, name, scope, type, description: string | null, createdAt, updatedAt }`, `RoleWithPermissions { permissions: CatalogPermission[] }`, `RoleSummary { assignmentCount: number }`, `RoleCreateInput`, `RoleUpdateInput`; `ProjectMember { projectMemberId, projectId, userId, roleId, … }`, `ProjectMemberPermission`, `ProjectMemberRole { roleId, name }`, `ProjectMemberGrant { roleId, permissions: ProjectPermission[] }`, `ProjectMembership { …, role, permissions }`, `ProjectMemberInfo { …, role, permissions }`.
- Produces (helpers): `holdsPermission(ability, permission)`, `holdsProjectPermissionEverywhere(ability, permission)`, `heldPermissions(ability)`, `heldProjectPermissionsEverywhere(ability)`, `holdsRolePermission(ability, scope, permission)`, `assertPermissionChangesHeld(current, requested, isHeld)`, `assertRoleGrantable(permissions, isHeld)`, `assertProjectPermission(ability, permission, projectId)`.

Typechecking will fail after this task until Tasks 2–8 adapt the models, services and DTOs; that is expected. Run only the spec files named below.

- [ ] **Step 1: Rewrite `permission.constants.ts`**

```ts
import { AbilityAction, AbilitySubjectName } from './interfaces/app-ability.js'

export const GLOBAL_PERMISSIONS = [
    'domains.read',
    'domains.create',
    'domains.update',
    'domains.delete',
    'projects.create',
    'projects.all',
    'bounces.read',
    'bounces.block',
    'bounces.unblock',
    'settings.read',
    'settings.update',
    'users.read',
    'users.create',
    'users.update',
    'users.delete',
    'roles.read',
    'roles.create',
    'roles.update',
    'roles.delete',
] as const

export type Permission = (typeof GLOBAL_PERMISSIONS)[number]

export const PROJECT_PERMISSIONS = [
    'read',
    'update',
    'delete',
    'forms.manage',
    'api_keys.manage',
    'members.manage',
] as const

export type ProjectPermission = (typeof PROJECT_PERMISSIONS)[number]

export const PROJECT_ROLE_REQUIRED_PERMISSION: ProjectPermission = 'read'

export const CATALOG_PERMISSIONS = [...GLOBAL_PERMISSIONS, ...PROJECT_PERMISSIONS] as const

export type CatalogPermission = Permission | ProjectPermission

export const ROLE_SCOPES = ['global', 'project'] as const

export type RoleScope = (typeof ROLE_SCOPES)[number]

export const ROLE_TYPES = ['super_admin', 'admin', 'user', 'custom'] as const

export type RoleType = (typeof ROLE_TYPES)[number]

const GLOBAL_PERMISSION_SET: ReadonlySet<string> = new Set(GLOBAL_PERMISSIONS)
const PROJECT_PERMISSION_SET: ReadonlySet<string> = new Set(PROJECT_PERMISSIONS)

export function isGlobalPermission(value: string): value is Permission {
    return GLOBAL_PERMISSION_SET.has(value)
}

export function isProjectPermission(value: string): value is ProjectPermission {
    return PROJECT_PERMISSION_SET.has(value)
}

export function permissionsForScope(scope: RoleScope): readonly CatalogPermission[] {
    return scope === 'global' ? GLOBAL_PERMISSIONS : PROJECT_PERMISSIONS
}

export const GLOBAL_PERMISSION_ABILITIES: Record<
    Permission,
    readonly (readonly [AbilityAction, AbilitySubjectName])[]
> = {
    'domains.read': [['read', 'Domain']],
    'domains.create': [['create', 'Domain']],
    'domains.update': [['update', 'Domain']],
    'domains.delete': [['delete', 'Domain']],
    'projects.create': [['create', 'Project']],
    'projects.all': PROJECT_PERMISSIONS.map((permission) => [permission, 'Project'] as const),
    'bounces.read': [['read', 'Bounce']],
    'bounces.block': [['block', 'Bounce']],
    'bounces.unblock': [['unblock', 'Bounce']],
    'settings.read': [['read', 'Settings']],
    'settings.update': [['update', 'Settings']],
    'users.read': [['read', 'User']],
    'users.create': [['create', 'User']],
    'users.update': [['update', 'User']],
    'users.delete': [['delete', 'User']],
    'roles.read': [['read', 'Role']],
    'roles.create': [['create', 'Role']],
    'roles.update': [['update', 'Role']],
    'roles.delete': [['delete', 'Role']],
}

export const AUTH_USER_CACHE_PREFIX = 'auth:user:'

export const AUTH_PERMISSIONS_CACHE_PREFIX = 'auth:permissions:'
```

- [ ] **Step 2: Extend `AbilityAction` in `interfaces/app-ability.ts`**

Replace the first type alias only:

```ts
export type AbilityAction =
    | 'manage'
    | 'read'
    | 'create'
    | 'update'
    | 'delete'
    | 'block'
    | 'unblock'
    | 'forms.manage'
    | 'api_keys.manage'
    | 'members.manage'
```

- [ ] **Step 3: Rewrite `interfaces/role.interface.ts`**

```ts
import { CatalogPermission, Permission, RoleScope, RoleType } from '../permission.constants.js'

export interface Role {
    roleId: number
    name: string
    scope: RoleScope
    type: RoleType
    description: string | null
    createdAt: Date
    updatedAt: Date
}

export interface RoleWithPermissions extends Role {
    permissions: CatalogPermission[]
}

export interface RoleSummary extends RoleWithPermissions {
    assignmentCount: number
}

export interface RoleCreateInput {
    name: string
    scope: RoleScope
    description: string | null
    permissions: CatalogPermission[]
}

export interface RoleUpdateInput {
    name?: string
    description?: string | null
    permissions?: CatalogPermission[]
}

export interface RolePermission {
    rolePermissionId: number
    roleId: number
    permission: CatalogPermission
    createdAt: Date
    updatedAt: Date
}

export type RolePermissionCreate = Omit<RolePermission, 'rolePermissionId' | 'createdAt' | 'updatedAt'>

export interface UserPermission {
    userPermissionId: number
    userId: number
    permission: Permission
    createdAt: Date
    updatedAt: Date
}

export type UserPermissionCreate = Omit<UserPermission, 'userPermissionId' | 'createdAt' | 'updatedAt'>
```

- [ ] **Step 4: Rewrite `interfaces/project-member.interface.ts`**

```ts
import { ProjectPermission } from '../permission.constants.js'

export interface ProjectMember {
    projectMemberId: number
    projectId: number
    userId: number
    roleId: number
    createdAt: Date
    updatedAt: Date
}

export type ProjectMemberCreate = Omit<ProjectMember, 'projectMemberId' | 'createdAt' | 'updatedAt'>

export interface ProjectMemberPermission {
    projectMemberPermissionId: number
    projectMemberId: number
    permission: ProjectPermission
    createdAt: Date
    updatedAt: Date
}

export type ProjectMemberPermissionCreate = Omit<
    ProjectMemberPermission,
    'projectMemberPermissionId' | 'createdAt' | 'updatedAt'
>

export interface ProjectMemberRole {
    roleId: number
    name: string
}

export interface ProjectMemberGrant {
    roleId: number
    permissions: ProjectPermission[]
}

export interface ProjectMembership {
    projectId: number
    projectName: string
    role: ProjectMemberRole
    permissions: ProjectPermission[]
}

export interface ProjectMemberInfo {
    userId: number
    firstName: string
    lastName: string
    email: string
    role: ProjectMemberRole
    permissions: ProjectPermission[]
}
```

- [ ] **Step 5: Write the failing hold-helper tests**

`apps/backend/src/modules/permission/helpers/holds-permission.spec.ts`:

```ts
import { createMongoAbility } from '@casl/ability'
import { describe, expect, it } from 'vitest'
import {
    heldPermissions,
    heldProjectPermissionsEverywhere,
    holdsPermission,
    holdsProjectPermissionEverywhere,
    holdsRolePermission,
} from './holds-permission.js'
import { AppAbility } from '../interfaces/app-ability.js'
import { GLOBAL_PERMISSIONS, PROJECT_PERMISSIONS } from '../permission.constants.js'

const superAdmin = createMongoAbility<AppAbility>([{ action: 'manage', subject: 'all' }])
const allProjects = createMongoAbility<AppAbility>([
    { action: 'read', subject: 'Domain' },
    ...PROJECT_PERMISSIONS.map((permission) => ({ action: permission, subject: 'Project' as const })),
])
const member = createMongoAbility<AppAbility>([
    { action: 'read', subject: 'Project', conditions: { projectId: { $in: [1] } } },
    { action: 'forms.manage', subject: 'Project', conditions: { projectId: { $in: [1] } } },
    { action: 'read', subject: 'User' },
    { action: 'update', subject: 'User', conditions: { 'role.type': 'super_admin' }, inverted: true },
])

describe('holdsPermission', () => {
    it('is true for unconditional rules and manage-all', () => {
        expect(holdsPermission(superAdmin, 'roles.delete')).toBe(true)
        expect(holdsPermission(allProjects, 'domains.read')).toBe(true)
        expect(holdsPermission(allProjects, 'projects.all')).toBe(true)
    })

    it('ignores conditional and inverted rules', () => {
        expect(holdsPermission(member, 'users.read')).toBe(true)
        expect(holdsPermission(member, 'users.update')).toBe(false)
        expect(holdsPermission(member, 'projects.all')).toBe(false)
    })
})

describe('holdsProjectPermissionEverywhere', () => {
    it('only counts unconditional project rules', () => {
        expect(holdsProjectPermissionEverywhere(superAdmin, 'delete')).toBe(true)
        expect(holdsProjectPermissionEverywhere(allProjects, 'members.manage')).toBe(true)
        expect(holdsProjectPermissionEverywhere(member, 'forms.manage')).toBe(false)
    })
})

describe('held permission lists', () => {
    it('lists the whole catalog for super admins', () => {
        expect(heldPermissions(superAdmin)).toEqual([...GLOBAL_PERMISSIONS])
        expect(heldProjectPermissionsEverywhere(superAdmin)).toEqual([...PROJECT_PERMISSIONS])
    })

    it('lists only what is held unconditionally, in catalog order', () => {
        expect(heldPermissions(member)).toEqual(['users.read'])
        expect(heldProjectPermissionsEverywhere(member)).toEqual([])
        expect(heldProjectPermissionsEverywhere(allProjects)).toEqual([...PROJECT_PERMISSIONS])
    })
})

describe('holdsRolePermission', () => {
    it('routes global and project permissions to the matching check', () => {
        expect(holdsRolePermission(allProjects, 'global', 'domains.read')).toBe(true)
        expect(holdsRolePermission(allProjects, 'project', 'delete')).toBe(true)
        expect(holdsRolePermission(member, 'project', 'forms.manage')).toBe(false)
    })

    it('rejects permissions that do not belong to the scope', () => {
        expect(holdsRolePermission(superAdmin, 'global', 'forms.manage')).toBe(false)
        expect(holdsRolePermission(superAdmin, 'project', 'domains.read')).toBe(false)
    })
})
```

`apps/backend/src/modules/permission/helpers/permission-grants.spec.ts`:

```ts
import { ForbiddenException } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import { assertPermissionChangesHeld, assertRoleGrantable } from './permission-grants.js'
import { Permission } from '../permission.constants.js'

const holds = (held: Permission[]) => (permission: Permission) => held.includes(permission)

describe('assertPermissionChangesHeld', () => {
    it('passes when every added and removed permission is held', () => {
        expect(() =>
            assertPermissionChangesHeld(['users.read'], ['users.update'], holds(['users.read', 'users.update'])),
        ).not.toThrow()
    })

    it('ignores permissions that stay unchanged', () => {
        expect(() => assertPermissionChangesHeld(['settings.update'], ['settings.update'], holds([]))).not.toThrow()
    })

    it('names every permission the caller may not grant or revoke', () => {
        expect(() => assertPermissionChangesHeld(['users.delete'], ['settings.update'], holds(['users.read']))).toThrow(
            new ForbiddenException(
                'You cannot grant or revoke permissions you do not hold: settings.update, users.delete',
            ),
        )
    })
})

describe('assertRoleGrantable', () => {
    it('passes when every role permission is held', () => {
        expect(() =>
            assertRoleGrantable(['users.read', 'users.update'], holds(['users.read', 'users.update'])),
        ).not.toThrow()
    })

    it('rejects roles holding more than the caller', () => {
        expect(() => assertRoleGrantable(['users.read', 'roles.delete'], holds(['users.read']))).toThrow(
            new ForbiddenException('You cannot assign a role with permissions you do not hold: roles.delete'),
        )
    })
})
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `pnpm --filter backend exec vitest run src/modules/permission/helpers/holds-permission.spec.ts src/modules/permission/helpers/permission-grants.spec.ts`
Expected: FAIL (missing exports / module not found).

- [ ] **Step 7: Rewrite `helpers/holds-permission.ts`**

```ts
import { AbilityAction, AbilitySubjectName, AppAbility } from '../interfaces/app-ability.js'
import {
    CatalogPermission,
    GLOBAL_PERMISSION_ABILITIES,
    GLOBAL_PERMISSIONS,
    isGlobalPermission,
    isProjectPermission,
    Permission,
    PROJECT_PERMISSIONS,
    ProjectPermission,
    RoleScope,
} from '../permission.constants.js'

function holdsUnconditionally(ability: AppAbility, action: AbilityAction, subjectName: AbilitySubjectName): boolean {
    return ability.rulesFor(action, subjectName).some((rule) => !rule.inverted && rule.conditions === undefined)
}

export function holdsPermission(ability: AppAbility, permission: Permission): boolean {
    return GLOBAL_PERMISSION_ABILITIES[permission].every(([action, subjectName]) =>
        holdsUnconditionally(ability, action, subjectName),
    )
}

export function holdsProjectPermissionEverywhere(ability: AppAbility, permission: ProjectPermission): boolean {
    return holdsUnconditionally(ability, permission, 'Project')
}

export function heldPermissions(ability: AppAbility): Permission[] {
    return GLOBAL_PERMISSIONS.filter((permission) => holdsPermission(ability, permission))
}

export function heldProjectPermissionsEverywhere(ability: AppAbility): ProjectPermission[] {
    return PROJECT_PERMISSIONS.filter((permission) => holdsProjectPermissionEverywhere(ability, permission))
}

export function holdsRolePermission(ability: AppAbility, scope: RoleScope, permission: CatalogPermission): boolean {
    if (scope === 'global') {
        return isGlobalPermission(permission) && holdsPermission(ability, permission)
    }

    return isProjectPermission(permission) && holdsProjectPermissionEverywhere(ability, permission)
}
```

- [ ] **Step 8: Create `helpers/permission-grants.ts`**

```ts
import { ForbiddenException } from '@nestjs/common'

export function assertPermissionChangesHeld<T extends string>(
    current: readonly T[],
    requested: readonly T[],
    isHeld: (permission: T) => boolean,
): void {
    const changed = [
        ...requested.filter((permission) => !current.includes(permission)),
        ...current.filter((permission) => !requested.includes(permission)),
    ]
    const notHeld = [...new Set(changed.filter((permission) => !isHeld(permission)))].sort()

    if (notHeld.length > 0) {
        throw new ForbiddenException(`You cannot grant or revoke permissions you do not hold: ${notHeld.join(', ')}`)
    }
}

export function assertRoleGrantable<T extends string>(
    permissions: readonly T[],
    isHeld: (permission: T) => boolean,
): void {
    const notHeld = [...new Set(permissions.filter((permission) => !isHeld(permission)))].sort()

    if (notHeld.length > 0) {
        throw new ForbiddenException(`You cannot assign a role with permissions you do not hold: ${notHeld.join(', ')}`)
    }
}
```

- [ ] **Step 9: Add `assertProjectPermission` to `helpers/project-access.ts`**

Replace the file body after `canOnProject`:

```ts
export function assertProjectReadable(ability: AppAbility, projectId: number): void {
    if (!canOnProject(ability, 'read', projectId)) {
        throw new NotFoundException('Unknown project')
    }
}

export function assertProjectPermission(ability: AppAbility, permission: ProjectPermission, projectId: number): void {
    assertProjectReadable(ability, projectId)
    if (!canOnProject(ability, permission, projectId)) {
        throw new ForbiddenException('Missing project permission')
    }
}

export function assertProjectUpdatable(ability: AppAbility, projectId: number): void {
    assertProjectPermission(ability, 'update', projectId)
}

export function assertProjectDeletable(ability: AppAbility, projectId: number): void {
    assertProjectPermission(ability, 'delete', projectId)
}
```

Append to `project-access.spec.ts` (import `assertProjectPermission` too):

```ts
it('checks any catalog permission after the read gate', () => {
    const editor = createMongoAbility<AppAbility>([
        { action: 'read', subject: 'Project', conditions: { projectId: { $in: [1] } } },
        { action: 'forms.manage', subject: 'Project', conditions: { projectId: { $in: [1] } } },
    ])

    expect(() => assertProjectPermission(editor, 'forms.manage', 1)).not.toThrow()
    expect(() => assertProjectPermission(editor, 'api_keys.manage', 1)).toThrow(ForbiddenException)
    expect(() => assertProjectPermission(editor, 'forms.manage', 2)).toThrow(NotFoundException)
})
```

- [ ] **Step 10: Carry `scope` and `description` through `user.mapper.ts`**

```ts
export function toRole({ roleId, name, scope, type, description, createdAt, updatedAt }: Role): Role {
    return { roleId, name, scope, type, description, createdAt, updatedAt }
}
```

Read `user.mapper.spec.ts`; its role fixtures need `scope: 'global'` and `description: null` now.

- [ ] **Step 11: Run the helper tests to verify they pass**

Run: `pnpm --filter backend exec vitest run src/modules/permission/helpers src/modules/user/mappers`
Expected: PASS for `holds-permission`, `permission-grants`, `project-access`, `user.mapper`.

- [ ] **Step 12: Verify instead of committing**

Run `pnpm --filter backend exec prettier --check src/modules/permission src/modules/user/mappers`. Fix with `pnpm format:fix` if needed. Leave git alone.

---

### Task 2: Migration 016, models and the conversion test

**Files:**

- Create: `apps/backend/src/migrations/016-add-role-scopes-and-project-roles.ts`
- Modify: `apps/backend/src/modules/permission/models/role.model.ts`
- Modify: `apps/backend/src/modules/permission/models/role-permission.model.ts`
- Modify: `apps/backend/src/modules/permission/models/project-member.model.ts`
- Create: `apps/backend/src/modules/permission/models/project-member-permission.model.ts`
- Modify: `apps/backend/src/modules/permission/permission.module.ts`
- Create: `apps/backend/test/role-membership-migration.e2e-spec.ts`
- Test: `apps/backend/test/schema.e2e-spec.ts`, `apps/backend/test/migrations.e2e-spec.ts` (existing, must stay green)

**Interfaces:**

- Consumes: `Role`, `RolePermission`, `ProjectMember`, `ProjectMemberPermission` from Task 1.
- Produces: `RoleModel` (+ `scope`, `description`, composite unique index), `ProjectMemberModel` (`roleId`, `role: Relation<RoleModel>`, `permissions: ProjectMemberPermissionModel[]`), `ProjectMemberPermissionModel`; seeded project roles Viewer/Editor/Maintainer/Owner; Admin gains `roles.create|update|delete`.

- [ ] **Step 1: Write the failing migration e2e test**

`apps/backend/test/role-membership-migration.e2e-spec.ts`:

```ts
import { QueryTypes, type Sequelize } from 'sequelize'
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { createConnection, loadMigrations, type Migration } from './support/migrations.js'

const MIGRATION = '016-add-role-scopes-and-project-roles.ts'

interface MemberRow {
    projectId: number
    userId: number
    roleName: string
    extras: string[]
}

interface LegacyRow {
    projectId: number
    userId: number
    permission: string
}

describe('016 role scopes and project roles (e2e)', () => {
    const env = inject('e2eEnv')
    const database = 'role_membership_migration'
    let admin: Sequelize
    let sequelize: Sequelize
    let target: Migration
    let projectId: number
    let superAdminRoleId: number

    const run = (step: 'up' | 'down') => target[step]({ name: target.name, context: sequelize.getQueryInterface() })

    async function seedUser(email: string): Promise<number> {
        const [rows] = (await sequelize.query(
            `INSERT INTO "users" ("firstName", "lastName", "email", "password", "roleId", "createdAt", "updatedAt")
             VALUES ('Mig', 'User', :email, 'hash', :roleId, NOW(), NOW()) RETURNING "userId"`,
            { replacements: { email, roleId: superAdminRoleId } },
        )) as [{ userId: number }[], unknown]
        return rows[0]!.userId
    }

    async function seedLegacy(userId: number, permissions: string[]): Promise<void> {
        for (const permission of permissions) {
            await sequelize.query(
                `INSERT INTO "project_members" ("projectId", "userId", "permission", "createdAt", "updatedAt")
                 VALUES (:projectId, :userId, :permission, NOW(), NOW())`,
                { replacements: { projectId, userId, permission } },
            )
        }
    }

    async function memberRows(): Promise<MemberRow[]> {
        const rows = await sequelize.query<{
            projectId: number
            userId: number
            roleName: string
            extras: string[] | null
        }>(
            `SELECT m."projectId", m."userId", r."name" AS "roleName",
                    array_remove(array_agg(p."permission" ORDER BY p."permission"), NULL) AS "extras"
             FROM "project_members" m
             JOIN "roles" r ON r."roleId" = m."roleId"
             LEFT JOIN "project_member_permissions" p ON p."projectMemberId" = m."projectMemberId"
             GROUP BY m."projectId", m."userId", r."name" ORDER BY m."userId"`,
            { type: QueryTypes.SELECT },
        )
        return rows.map((row) => ({ ...row, extras: row.extras ?? [] }))
    }

    async function legacyRows(): Promise<LegacyRow[]> {
        return sequelize.query<LegacyRow>(
            'SELECT "projectId", "userId", "permission" FROM "project_members" ORDER BY "userId", "permission"',
            { type: QueryTypes.SELECT },
        )
    }

    beforeAll(async () => {
        admin = createConnection(env)
        const migrations = await loadMigrations()
        target = migrations.find((migration) => migration.name === MIGRATION)!

        await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`)
        await admin.query(`CREATE DATABASE "${database}"`)
        sequelize = createConnection(env, database)
        for (const migration of migrations.filter((migration) => migration.name < MIGRATION)) {
            await migration.up({ name: migration.name, context: sequelize.getQueryInterface() })
        }
        const roles = await sequelize.query<{ roleId: number }>(
            `SELECT "roleId" FROM "roles" WHERE "type" = 'super_admin'`,
            { type: QueryTypes.SELECT },
        )
        superAdminRoleId = roles[0]!.roleId
    })

    beforeEach(async () => {
        await sequelize.query('TRUNCATE "project_members", "projects", "users" RESTART IDENTITY CASCADE')
        const [projects] = (await sequelize.query(
            `INSERT INTO "projects" ("name", "createdAt", "updatedAt") VALUES ('Migration', NOW(), NOW())
             RETURNING "projectId"`,
        )) as [{ projectId: number }[], unknown]
        projectId = projects[0]!.projectId
    })

    afterAll(async () => {
        await sequelize?.close()
        await admin?.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`)
        await admin?.close()
    })

    it('maps legacy permission sets to the seeded project roles and back', async () => {
        const owner = await seedUser('owner@migration.test')
        const maintainer = await seedUser('maintainer@migration.test')
        const viewer = await seedUser('viewer@migration.test')
        const deleter = await seedUser('deleter@migration.test')
        const orphan = await seedUser('orphan@migration.test')
        await seedLegacy(owner, ['read', 'update', 'delete'])
        await seedLegacy(maintainer, ['read', 'update'])
        await seedLegacy(viewer, ['read'])
        await seedLegacy(deleter, ['read', 'delete'])
        await seedLegacy(orphan, ['update'])

        await run('up')

        expect(await memberRows()).toEqual([
            { projectId, userId: owner, roleName: 'Owner', extras: [] },
            { projectId, userId: maintainer, roleName: 'Maintainer', extras: [] },
            { projectId, userId: viewer, roleName: 'Viewer', extras: [] },
            { projectId, userId: deleter, roleName: 'Viewer', extras: ['delete'] },
            { projectId, userId: orphan, roleName: 'Maintainer', extras: [] },
        ])
        const roles = await sequelize.query<{ name: string; scope: string; description: string | null }>(
            `SELECT "name", "scope", "description" FROM "roles" ORDER BY "roleId"`,
            { type: QueryTypes.SELECT },
        )
        expect(roles.map((role) => [role.name, role.scope])).toEqual([
            ['Super Admin', 'global'],
            ['Admin', 'global'],
            ['User', 'global'],
            ['Viewer', 'project'],
            ['Editor', 'project'],
            ['Maintainer', 'project'],
            ['Owner', 'project'],
        ])
        expect(roles.every((role) => role.description !== null)).toBe(true)
        const adminPermissions = await sequelize.query<{ permission: string }>(
            `SELECT rp."permission" FROM "role_permissions" rp JOIN "roles" r ON r."roleId" = rp."roleId"
             WHERE r."type" = 'admin' AND rp."permission" LIKE 'roles.%' ORDER BY rp."permission"`,
            { type: QueryTypes.SELECT },
        )
        expect(adminPermissions.map((row) => row.permission)).toEqual([
            'roles.create',
            'roles.delete',
            'roles.read',
            'roles.update',
        ])

        await run('down')

        expect(await legacyRows()).toEqual([
            { projectId, userId: owner, permission: 'delete' },
            { projectId, userId: owner, permission: 'read' },
            { projectId, userId: owner, permission: 'update' },
            { projectId, userId: maintainer, permission: 'read' },
            { projectId, userId: maintainer, permission: 'update' },
            { projectId, userId: viewer, permission: 'read' },
            { projectId, userId: deleter, permission: 'delete' },
            { projectId, userId: deleter, permission: 'read' },
            { projectId, userId: orphan, permission: 'read' },
            { projectId, userId: orphan, permission: 'update' },
        ])
        const remaining = await sequelize.query<{ count: string }>(
            `SELECT COUNT(*) AS "count" FROM "roles" WHERE "name" IN ('Viewer', 'Editor', 'Maintainer', 'Owner')`,
            { type: QueryTypes.SELECT },
        )
        expect(Number(remaining[0]!.count)).toBe(0)
    })

    it('migrates an empty member table', async () => {
        await run('up')
        expect(await memberRows()).toEqual([])
        await run('down')
        expect(await legacyRows()).toEqual([])
    })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter backend exec vitest run --config vitest.config.e2e.ts test/role-membership-migration.e2e-spec.ts`
Expected: FAIL ("Cannot read properties of undefined" because the migration file does not exist yet). Docker must be running.

- [ ] **Step 3: Write the migration**

`apps/backend/src/migrations/016-add-role-scopes-and-project-roles.ts`:

```ts
import type { MigrationFn } from 'umzug'
import { DataTypes, QueryTypes, type QueryInterface } from 'sequelize'

const ROLE_MANAGEMENT_PERMISSIONS = ['roles.create', 'roles.update', 'roles.delete']

const PROJECT_PERMISSIONS = ['read', 'update', 'delete', 'forms.manage', 'api_keys.manage', 'members.manage']

const LEGACY_UPDATE_EXPANSION = ['update', 'forms.manage', 'api_keys.manage', 'members.manage']

const GLOBAL_ROLE_DESCRIPTIONS: Record<string, string> = {
    super_admin: 'Every permission, including changing other Super admins',
    admin: "Every permission, but can't change Super admins",
    user: 'No permissions of its own; add them per user or through project memberships',
}

const PROJECT_ROLES = [
    { name: 'Viewer', description: 'Sees the project, its forms and sent mail.', permissions: ['read'] },
    { name: 'Editor', description: 'Builds forms and templates.', permissions: ['read', 'forms.manage'] },
    {
        name: 'Maintainer',
        description: 'Runs the project day to day: forms, API keys, members and domains.',
        permissions: ['read', 'update', 'forms.manage', 'api_keys.manage', 'members.manage'],
    },
    { name: 'Owner', description: 'Everything, including deleting the project.', permissions: PROJECT_PERMISSIONS },
]

interface LegacyMemberRow {
    projectId: number
    userId: number
    permission: string
}

interface MemberRow {
    projectMemberId: number
    projectId: number
    userId: number
    roleId: number
}

interface RolePermissionRow {
    roleId: number
    permission: string
}

interface MemberPermissionRow {
    projectMemberId: number
    permission: string
}

interface SeededRole {
    roleId: number
    permissions: string[]
}

const timestamps = {
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
}

function stamped<T extends object>(row: T): T & { createdAt: Date; updatedAt: Date } {
    return { ...row, createdAt: new Date(), updatedAt: new Date() }
}

function expandLegacyPermissions(permissions: string[]): string[] {
    const expanded = new Set(['read', ...permissions])
    if (permissions.includes('update')) {
        for (const permission of LEGACY_UPDATE_EXPANSION) {
            expanded.add(permission)
        }
    }
    return PROJECT_PERMISSIONS.filter((permission) => expanded.has(permission))
}

function pickLargestCoveredRole(roles: SeededRole[], effective: string[]): SeededRole {
    return roles
        .filter((role) => role.permissions.every((permission) => effective.includes(permission)))
        .reduce((best, role) => (role.permissions.length > best.permissions.length ? role : best))
}

function collapseToLegacy(effective: string[]): string[] {
    const legacy = new Set<string>()
    for (const permission of effective) {
        if (permission === 'read' || permission === 'delete') {
            legacy.add(permission)
        } else if (LEGACY_UPDATE_EXPANSION.includes(permission)) {
            legacy.add('update')
        }
    }
    return ['read', 'update', 'delete'].filter((permission) => legacy.has(permission))
}

async function createMemberTables(queryInterface: QueryInterface): Promise<void> {
    await queryInterface.createTable('project_members', {
        projectMemberId: { type: DataTypes.INTEGER, allowNull: false, primaryKey: true, autoIncrement: true },
        projectId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: { model: 'projects', key: 'projectId' },
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE',
        },
        userId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: { model: 'users', key: 'userId' },
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE',
        },
        roleId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: { model: 'roles', key: 'roleId' },
            onDelete: 'RESTRICT',
            onUpdate: 'CASCADE',
        },
        ...timestamps,
    })
    await queryInterface.addIndex('project_members', ['projectId', 'userId'], {
        name: 'project_members_unique',
        unique: true,
    })
    await queryInterface.addIndex('project_members', ['userId'], { name: 'project_members_user' })

    await queryInterface.createTable('project_member_permissions', {
        projectMemberPermissionId: { type: DataTypes.INTEGER, allowNull: false, primaryKey: true, autoIncrement: true },
        projectMemberId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: { model: 'project_members', key: 'projectMemberId' },
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE',
        },
        permission: { type: DataTypes.STRING(32), allowNull: false },
        ...timestamps,
    })
    await queryInterface.addIndex('project_member_permissions', ['projectMemberId', 'permission'], {
        name: 'project_member_permissions_unique',
        unique: true,
    })
}

async function createLegacyMemberTable(queryInterface: QueryInterface): Promise<void> {
    await queryInterface.createTable('project_members', {
        projectMemberId: { type: DataTypes.INTEGER, allowNull: false, primaryKey: true, autoIncrement: true },
        projectId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: { model: 'projects', key: 'projectId' },
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE',
        },
        userId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: { model: 'users', key: 'userId' },
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE',
        },
        permission: { type: DataTypes.STRING(16), allowNull: false },
        ...timestamps,
    })
    await queryInterface.addIndex('project_members', ['projectId', 'userId', 'permission'], {
        name: 'project_members_unique',
        unique: true,
    })
    await queryInterface.addIndex('project_members', ['userId'], { name: 'project_members_user' })
}

export const up: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
    await queryInterface.addColumn('roles', 'scope', { type: DataTypes.STRING(16), allowNull: true })
    await queryInterface.sequelize.query(`UPDATE "roles" SET "scope" = 'global'`)
    await queryInterface.changeColumn('roles', 'scope', { type: DataTypes.STRING(16), allowNull: false })
    await queryInterface.addColumn('roles', 'description', { type: DataTypes.STRING(255), allowNull: true })
    await queryInterface.removeIndex('roles', 'roles_name_unique')
    await queryInterface.addIndex('roles', ['scope', 'name'], { name: 'roles_scope_name_unique', unique: true })

    for (const [type, description] of Object.entries(GLOBAL_ROLE_DESCRIPTIONS)) {
        await queryInterface.sequelize.query(
            `UPDATE "roles" SET "description" = :description WHERE "type" = :type AND "description" IS NULL`,
            { replacements: { description, type } },
        )
    }

    const adminRoles = await queryInterface.sequelize.query<{ roleId: number }>(
        `SELECT "roleId" FROM "roles" WHERE "type" = 'admin'`,
        { type: QueryTypes.SELECT },
    )
    if (adminRoles.length > 0) {
        await queryInterface.bulkInsert(
            'role_permissions',
            adminRoles.flatMap(({ roleId }) =>
                ROLE_MANAGEMENT_PERMISSIONS.map((permission) => stamped({ roleId, permission })),
            ),
        )
    }

    const seededRoles: SeededRole[] = []
    for (const role of PROJECT_ROLES) {
        const [rows] = (await queryInterface.sequelize.query(
            `INSERT INTO "roles" ("name", "scope", "type", "description", "createdAt", "updatedAt")
             VALUES (:name, 'project', 'custom', :description, NOW(), NOW()) RETURNING "roleId"`,
            { replacements: { name: role.name, description: role.description } },
        )) as [{ roleId: number }[], unknown]
        const roleId = rows[0]!.roleId
        await queryInterface.bulkInsert(
            'role_permissions',
            role.permissions.map((permission) => stamped({ roleId, permission })),
        )
        seededRoles.push({ roleId, permissions: role.permissions })
    }

    const legacyRows = await queryInterface.sequelize.query<LegacyMemberRow>(
        `SELECT "projectId", "userId", "permission" FROM "project_members" ORDER BY "projectMemberId"`,
        { type: QueryTypes.SELECT },
    )
    await queryInterface.dropTable('project_members')
    await createMemberTables(queryInterface)

    const grouped = new Map<string, LegacyMemberRow[]>()
    for (const row of legacyRows) {
        const key = `${row.projectId}:${row.userId}`
        grouped.set(key, [...(grouped.get(key) ?? []), row])
    }
    for (const rows of grouped.values()) {
        const { projectId, userId } = rows[0]!
        const effective = expandLegacyPermissions(rows.map((row) => row.permission))
        const role = pickLargestCoveredRole(seededRoles, effective)
        const [inserted] = (await queryInterface.sequelize.query(
            `INSERT INTO "project_members" ("projectId", "userId", "roleId", "createdAt", "updatedAt")
             VALUES (:projectId, :userId, :roleId, NOW(), NOW()) RETURNING "projectMemberId"`,
            { replacements: { projectId, userId, roleId: role.roleId } },
        )) as [{ projectMemberId: number }[], unknown]
        const extras = effective.filter((permission) => !role.permissions.includes(permission))
        if (extras.length > 0) {
            await queryInterface.bulkInsert(
                'project_member_permissions',
                extras.map((permission) => stamped({ projectMemberId: inserted[0]!.projectMemberId, permission })),
            )
        }
    }
}

export const down: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
    const members = await queryInterface.sequelize.query<MemberRow>(
        `SELECT "projectMemberId", "projectId", "userId", "roleId" FROM "project_members" ORDER BY "projectMemberId"`,
        { type: QueryTypes.SELECT },
    )
    const rolePermissions = await queryInterface.sequelize.query<RolePermissionRow>(
        `SELECT "roleId", "permission" FROM "role_permissions"`,
        { type: QueryTypes.SELECT },
    )
    const memberPermissions = await queryInterface.sequelize.query<MemberPermissionRow>(
        `SELECT "projectMemberId", "permission" FROM "project_member_permissions"`,
        { type: QueryTypes.SELECT },
    )

    const legacyRows: LegacyMemberRow[] = []
    for (const member of members) {
        const effective = [
            ...rolePermissions.filter((row) => row.roleId === member.roleId).map((row) => row.permission),
            ...memberPermissions
                .filter((row) => row.projectMemberId === member.projectMemberId)
                .map((row) => row.permission),
        ]
        for (const permission of collapseToLegacy(effective)) {
            legacyRows.push({ projectId: member.projectId, userId: member.userId, permission })
        }
    }

    await queryInterface.dropTable('project_member_permissions')
    await queryInterface.dropTable('project_members')
    await createLegacyMemberTable(queryInterface)
    if (legacyRows.length > 0) {
        await queryInterface.bulkInsert('project_members', legacyRows.map(stamped))
    }

    await queryInterface.sequelize.query(`DELETE FROM "roles" WHERE "scope" = 'project'`)
    await queryInterface.bulkDelete('role_permissions', { permission: ROLE_MANAGEMENT_PERMISSIONS })
    await queryInterface.removeIndex('roles', 'roles_scope_name_unique')
    await queryInterface.removeColumn('roles', 'description')
    await queryInterface.removeColumn('roles', 'scope')
    await queryInterface.addIndex('roles', ['name'], { name: 'roles_name_unique', unique: true })
}
```

- [ ] **Step 4: Update `RoleModel`**

Replace the class and table decorator in `models/role.model.ts` (drop the `Unique` import):

```ts
@Table({
    timestamps: true,
    tableName: 'roles',
    indexes: [
        {
            name: 'roles_scope_name_unique',
            unique: true,
            fields: ['scope', 'name'],
        },
    ],
})
export class RoleModel extends Model<Role, RoleCreate> implements Role {
    @PrimaryKey
    @AutoIncrement
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare roleId: number

    @AllowNull(false)
    @Column(DataType.STRING(255))
    declare name: string

    @AllowNull(false)
    @Column(DataType.STRING(16))
    declare scope: RoleScope

    @AllowNull(false)
    @Column(DataType.STRING(32))
    declare type: RoleType

    @AllowNull(true)
    @Column(DataType.STRING(255))
    declare description: string | null

    @HasMany(() => RolePermissionModel, {
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
    })
    declare permissions: RolePermissionModel[]

    @CreatedAt
    declare createdAt: Date

    @UpdatedAt
    declare updatedAt: Date
}
```

Import `RoleScope` next to `RoleType`. `RoleCreate` stays `Omit<Role, 'roleId' | 'createdAt' | 'updatedAt'>`.

- [ ] **Step 5: Widen `RolePermissionModel.permission`**

In `models/role-permission.model.ts` change the import and the declared type to `CatalogPermission` (`declare permission: CatalogPermission`). Column type stays `STRING(64)`.

- [ ] **Step 6: Rewrite `ProjectMemberModel` and add `ProjectMemberPermissionModel`**

`models/project-member.model.ts`:

```ts
import {
    AllowNull,
    AutoIncrement,
    BelongsTo,
    Column,
    CreatedAt,
    DataType,
    ForeignKey,
    HasMany,
    Model,
    PrimaryKey,
    Table,
    UpdatedAt,
} from 'sequelize-typescript'
import type { ProjectMember, ProjectMemberCreate } from '../interfaces/project-member.interface.js'
import { ProjectModel } from '../../project/models/project.model.js'
import { UserModel } from '../../user/models/user.model.js'
import { RoleModel } from './role.model.js'
import { ProjectMemberPermissionModel } from './project-member-permission.model.js'
import type { Relation } from '../../../types/relation.js'

@Table({
    timestamps: true,
    tableName: 'project_members',
    indexes: [
        {
            name: 'project_members_unique',
            unique: true,
            fields: ['projectId', 'userId'],
        },
        {
            name: 'project_members_user',
            fields: ['userId'],
        },
    ],
})
export class ProjectMemberModel extends Model<ProjectMember, ProjectMemberCreate> implements ProjectMember {
    @PrimaryKey
    @AutoIncrement
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare projectMemberId: number

    @ForeignKey(() => ProjectModel)
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare projectId: number

    @ForeignKey(() => UserModel)
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare userId: number

    @ForeignKey(() => RoleModel)
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare roleId: number

    @BelongsTo(() => ProjectModel, {
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
    })
    declare project?: Relation<ProjectModel>

    @BelongsTo(() => UserModel, {
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
    })
    declare user?: Relation<UserModel>

    @BelongsTo(() => RoleModel, {
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
    })
    declare role?: Relation<RoleModel>

    @HasMany(() => ProjectMemberPermissionModel, {
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
    })
    declare permissions: ProjectMemberPermissionModel[]

    @CreatedAt
    declare createdAt: Date

    @UpdatedAt
    declare updatedAt: Date
}
```

`models/project-member-permission.model.ts`:

```ts
import {
    AllowNull,
    AutoIncrement,
    Column,
    CreatedAt,
    DataType,
    ForeignKey,
    Model,
    PrimaryKey,
    Table,
    UpdatedAt,
} from 'sequelize-typescript'
import type { ProjectMemberPermission, ProjectMemberPermissionCreate } from '../interfaces/project-member.interface.js'
import type { ProjectPermission } from '../permission.constants.js'
import { ProjectMemberModel } from './project-member.model.js'

@Table({
    timestamps: true,
    tableName: 'project_member_permissions',
    indexes: [
        {
            name: 'project_member_permissions_unique',
            unique: true,
            fields: ['projectMemberId', 'permission'],
        },
    ],
})
export class ProjectMemberPermissionModel
    extends Model<ProjectMemberPermission, ProjectMemberPermissionCreate>
    implements ProjectMemberPermission
{
    @PrimaryKey
    @AutoIncrement
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare projectMemberPermissionId: number

    @ForeignKey(() => ProjectMemberModel)
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare projectMemberId: number

    @AllowNull(false)
    @Column(DataType.STRING(32))
    declare permission: ProjectPermission

    @CreatedAt
    declare createdAt: Date

    @UpdatedAt
    declare updatedAt: Date
}
```

`ProjectMemberModel` ↔ `ProjectMemberPermissionModel` import each other; the only singular association is on the permission side and it is declared via `@ForeignKey` only (no `@BelongsTo`), so no `Relation<>` is needed there.

- [ ] **Step 7: Register the model in `permission.module.ts`**

Add `ProjectMemberPermissionModel` to the `SequelizeModule.forFeature([...])` list (import from `./models/project-member-permission.model.js`).

- [ ] **Step 8: Run the migration test**

Run: `pnpm --filter backend exec vitest run --config vitest.config.e2e.ts test/role-membership-migration.e2e-spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 9: Run the schema and round-trip suites**

Run: `pnpm --filter backend exec vitest run --config vitest.config.e2e.ts test/schema.e2e-spec.ts test/migrations.e2e-spec.ts`
Expected: PASS. If `schema` reports a mismatch, align the model (not the migration) unless the migration deviates from the spec's table definitions above.

- [ ] **Step 10: Verify instead of committing**

`pnpm --filter backend exec prettier --check src/migrations src/modules/permission/models`. Fix with `pnpm format:fix`.

---

### Task 3: AbilityFactory builds effective membership permissions

**Files:**

- Modify: `apps/backend/src/modules/permission/services/ability-factory.service.ts`
- Modify: `apps/backend/src/modules/permission/services/ability-factory.service.spec.ts`

**Interfaces:**

- Consumes: `ProjectMemberModel` with `role` and `permissions` includes (Task 2), `isGlobalPermission`, `PROJECT_PERMISSIONS` (Task 1).
- Produces: `PermissionInputs.memberships: { projectId: number; permissions: ProjectPermission[] }[]` (effective = role ∪ extras); `createForUser` emits one conditional rule per project permission; `getProjectIdsFor(user, permission)` unchanged signature.

- [ ] **Step 1: Update the spec**

In `ability-factory.service.spec.ts`:

- Import `ProjectMemberPermissionModel`-free row type and the `CatalogPermission` type:

```ts
import { CatalogPermission, Permission, ProjectPermission, RoleType } from '../permission.constants.js'

interface MemberRow {
    projectId: number
    role: { permissions: { permission: CatalogPermission }[] }
    permissions: { permission: ProjectPermission }[]
}

function membershipRow(
    projectId: number,
    rolePermissions: ProjectPermission[],
    extras: ProjectPermission[] = [],
): MemberRow {
    return {
        projectId,
        role: { permissions: rolePermissions.map((permission) => ({ permission })) },
        permissions: extras.map((permission) => ({ permission })),
    }
}
```

- Change `memberFindAll` to `Mock<(options: object) => Promise<MemberRow[]>>` and `stubInputs`'s third parameter to `memberships: MemberRow[]`.
- Replace the test `scopes project permissions to membership rows`:

```ts
it('scopes project permissions to the role and extras of each membership', async () => {
    stubInputs('user', [], [membershipRow(1, ['read'], ['forms.manage']), membershipRow(2, ['read', 'update'])])

    const ability = await factory.createForUser(user)

    expect(ability.can('read', subject('Project', { projectId: 1 }))).toBe(true)
    expect(ability.can('forms.manage', subject('Project', { projectId: 1 }))).toBe(true)
    expect(ability.can('update', subject('Project', { projectId: 1 }))).toBe(false)
    expect(ability.can('update', subject('Project', { projectId: 2 }))).toBe(true)
    expect(ability.can('forms.manage', subject('Project', { projectId: 2 }))).toBe(false)
    expect(ability.can('read', subject('Project', { projectId: 3 }))).toBe(false)
})

it('grants every project permission everywhere through projects.all', async () => {
    stubInputs('user', ['projects.all'], [])

    const ability = await factory.createForUser(user)

    for (const permission of [
        'read',
        'update',
        'delete',
        'forms.manage',
        'api_keys.manage',
        'members.manage',
    ] as const) {
        expect(ability.can(permission, subject('Project', { projectId: 42 }))).toBe(true)
    }
})
```

- Replace the cached-inputs fixtures: every `memberships` literal of the shape `{ projectId, permission }` becomes `{ projectId, permissions: [...] }`, e.g. in `lists project ids for a membership level`:

```ts
            memberships: [
                { projectId: 1, permissions: ['read'] },
                { projectId: 2, permissions: ['update'] },
            ],
```

and the expectation stays `resolves.toEqual([1])` for `'read'`.

- `caches freshly loaded inputs` keeps `memberships: []`.

- [ ] **Step 2: Run the spec to verify it fails**

Run: `pnpm --filter backend exec vitest run src/modules/permission/services/ability-factory.service.spec.ts`
Expected: FAIL (type errors on `memberships` / wrong rules).

- [ ] **Step 3: Rewrite the service**

```ts
import { Inject, Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/sequelize'
import { Cache, CACHE_MANAGER } from '@nestjs/cache-manager'
import { AbilityBuilder, createMongoAbility } from '@casl/ability'
import { RoleModel } from '../models/role.model.js'
import { RolePermissionModel } from '../models/role-permission.model.js'
import { UserPermissionModel } from '../models/user-permission.model.js'
import { ProjectMemberModel } from '../models/project-member.model.js'
import { ProjectMemberPermissionModel } from '../models/project-member-permission.model.js'
import { User } from '../../user/interfaces/user.interface.js'
import {
    AUTH_PERMISSIONS_CACHE_PREFIX,
    GLOBAL_PERMISSION_ABILITIES,
    isGlobalPermission,
    Permission,
    PROJECT_PERMISSIONS,
    ProjectPermission,
    RoleType,
} from '../permission.constants.js'
import { AppAbility } from '../interfaces/app-ability.js'

export interface PermissionInputs {
    roleType: RoleType
    permissions: Permission[]
    memberships: { projectId: number; permissions: ProjectPermission[] }[]
}

function effectiveProjectPermissions(row: ProjectMemberModel): ProjectPermission[] {
    const granted = new Set<string>([
        ...(row.role?.permissions ?? []).map((entry) => entry.permission),
        ...(row.permissions ?? []).map((entry) => entry.permission),
    ])

    return PROJECT_PERMISSIONS.filter((permission) => granted.has(permission))
}

@Injectable()
export class AbilityFactory {
    constructor(
        @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
        @InjectModel(RoleModel) private readonly roleModel: typeof RoleModel,
        @InjectModel(RolePermissionModel) private readonly rolePermissionModel: typeof RolePermissionModel,
        @InjectModel(UserPermissionModel) private readonly userPermissionModel: typeof UserPermissionModel,
        @InjectModel(ProjectMemberModel) private readonly projectMemberModel: typeof ProjectMemberModel,
    ) {}

    async createForUser(user: User): Promise<AppAbility> {
        const inputs = await this.getPermissionInputs(user)
        const { can, cannot, build } = new AbilityBuilder<AppAbility>(createMongoAbility)

        if (inputs.roleType === 'super_admin') {
            can('manage', 'all')
            return build()
        }

        for (const permission of inputs.permissions) {
            for (const [action, subjectName] of GLOBAL_PERMISSION_ABILITIES[permission]) {
                can(action, subjectName)
            }
        }

        for (const projectPermission of PROJECT_PERMISSIONS) {
            const projectIds = inputs.memberships
                .filter((membership) => membership.permissions.includes(projectPermission))
                .map((membership) => membership.projectId)

            if (projectIds.length > 0) {
                can(projectPermission, 'Project', { projectId: { $in: projectIds } })
            }
        }

        cannot(['update', 'delete'], 'User', { 'role.type': 'super_admin' })

        return build()
    }

    async hasAllProjectsAccess(user: User): Promise<boolean> {
        const inputs = await this.getPermissionInputs(user)

        return inputs.roleType === 'super_admin' || inputs.permissions.includes('projects.all')
    }

    async getProjectIdsFor(user: User, permission: ProjectPermission): Promise<number[] | 'all'> {
        if (await this.hasAllProjectsAccess(user)) {
            return 'all'
        }

        const inputs = await this.getPermissionInputs(user)

        return inputs.memberships
            .filter((membership) => membership.permissions.includes(permission))
            .map((membership) => membership.projectId)
    }

    async getPermissionInputs(user: User): Promise<PermissionInputs> {
        const cacheKey = AUTH_PERMISSIONS_CACHE_PREFIX + user.userId
        const cached = await this.cacheManager.get<PermissionInputs>(cacheKey)
        if (cached) {
            return cached
        }

        const [role, rolePermissions, userPermissions, memberships] = await Promise.all([
            this.roleModel.findByPk(user.roleId, { rejectOnEmpty: true }),
            this.rolePermissionModel.findAll({ where: { roleId: user.roleId } }),
            this.userPermissionModel.findAll({ where: { userId: user.userId } }),
            this.projectMemberModel.findAll({
                where: { userId: user.userId },
                include: [{ model: RoleModel, include: [RolePermissionModel] }, ProjectMemberPermissionModel],
            }),
        ])

        const permissions = [
            ...new Set([
                ...rolePermissions.map((row) => row.permission).filter(isGlobalPermission),
                ...userPermissions.map((row) => row.permission),
            ]),
        ]

        const inputs: PermissionInputs = {
            roleType: role.type,
            permissions,
            memberships: memberships.map((row) => ({
                projectId: row.projectId,
                permissions: effectiveProjectPermissions(row),
            })),
        }

        void this.cacheManager.set(cacheKey, inputs).catch(() => undefined)

        return inputs
    }
}
```

- [ ] **Step 4: Run the spec to verify it passes**

Run: `pnpm --filter backend exec vitest run src/modules/permission/services/ability-factory.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Verify instead of committing**

`pnpm --filter backend exec prettier --check src/modules/permission/services/ability-factory.service.ts src/modules/permission/services/ability-factory.service.spec.ts`.

---

### Task 4: Cache fan-out and the role service (CRUD, hold rule, locks)

**Files:**

- Modify: `apps/backend/src/modules/permission/services/permission-cache.service.ts`
- Modify: `apps/backend/src/modules/permission/services/permission-cache.service.spec.ts`
- Modify: `apps/backend/src/modules/permission/services/role.service.ts`
- Modify: `apps/backend/src/modules/permission/services/role.service.spec.ts`

**Interfaces:**

- Consumes: `RoleModel`, `RolePermissionModel`, `UserModel`, `ProjectMemberModel` (Tasks 1–2), hold helpers (Task 1).
- Produces: `PermissionCacheService.invalidateUsers(userIds: number[]): Promise<void>`; `RoleService.getRoles(): Promise<RoleSummary[]>`, `getRoleById(roleId): Promise<RoleSummary>` (404), `findRole(roleId): Promise<RoleWithPermissions | null>`, `getRoleByType(type): Promise<Role>`, `getProjectRoles(): Promise<RoleWithPermissions[]>`, `createRole(input: RoleCreateInput, ability): Promise<RoleSummary>`, `updateRole(roleId, update: RoleUpdateInput, ability): Promise<RoleSummary>`, `deleteRole(roleId): Promise<void>`.

- [ ] **Step 1: Add `invalidateUsers` with a test**

In `permission-cache.service.spec.ts` add (read the file first; reuse its `del` mock):

```ts
it('invalidates several users at once and skips the round trip for none', async () => {
    await service.invalidateUsers([3, 4])
    expect(del).toHaveBeenCalledWith('auth:user:3')
    expect(del).toHaveBeenCalledWith('auth:permissions:3')
    expect(del).toHaveBeenCalledWith('auth:user:4')
    expect(del).toHaveBeenCalledWith('auth:permissions:4')

    del.mockClear()
    await service.invalidateUsers([])
    expect(del).not.toHaveBeenCalled()
})
```

Implementation in `permission-cache.service.ts`:

```ts
    async invalidateUsers(userIds: number[]): Promise<void> {
        await Promise.all(userIds.map((userId) => this.invalidateUser(userId)))
    }
```

Run: `pnpm --filter backend exec vitest run src/modules/permission/services/permission-cache.service.spec.ts` → PASS.

- [ ] **Step 2: Write the failing role service spec**

Replace `role.service.spec.ts` with:

```ts
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { getModelToken } from '@nestjs/sequelize'
import { Test, TestingModule } from '@nestjs/testing'
import { Sequelize } from 'sequelize-typescript'
import type { Transaction } from 'sequelize'
import { UniqueConstraintError } from 'sequelize'
import { createMongoAbility } from '@casl/ability'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { RoleService } from './role.service.js'
import { PermissionCacheService } from './permission-cache.service.js'
import { RoleModel } from '../models/role.model.js'
import { RolePermissionModel } from '../models/role-permission.model.js'
import { ProjectMemberModel } from '../models/project-member.model.js'
import { UserModel } from '../../user/models/user.model.js'
import { Role } from '../interfaces/role.interface.js'
import { AppAbility } from '../interfaces/app-ability.js'
import { CatalogPermission, PROJECT_PERMISSIONS } from '../permission.constants.js'

const adminRole: Role = {
    roleId: 2,
    name: 'Admin',
    scope: 'global',
    type: 'admin',
    description: 'Everything',
    createdAt: new Date(),
    updatedAt: new Date(),
}
const superAdminRole: Role = { ...adminRole, roleId: 1, name: 'Super Admin', type: 'super_admin' }
const viewerRole: Role = { ...adminRole, roleId: 5, name: 'Viewer', scope: 'project', type: 'custom' }

type RoleRow = Role & { permissions: { permission: CatalogPermission }[] } & {
    get: (options: { plain: true }) => Role & { permissions: { permission: CatalogPermission }[] }
}

function roleRow(role: Role, permissions: CatalogPermission[] = []): RoleRow {
    const plain = { ...role, permissions: permissions.map((permission) => ({ permission })) }
    return { ...plain, get: () => plain }
}

type GroupedCount = { roleId: number; count: number }[]

const superAdminAbility = createMongoAbility<AppAbility>([{ action: 'manage', subject: 'all' }])
const roleManagerAbility = createMongoAbility<AppAbility>([
    { action: 'read', subject: 'Role' },
    { action: 'create', subject: 'Role' },
    { action: 'update', subject: 'Role' },
    { action: 'delete', subject: 'Role' },
    { action: 'read', subject: 'User' },
    { action: 'read', subject: 'Project', conditions: { projectId: { $in: [1] } } },
    { action: 'delete', subject: 'Project', conditions: { projectId: { $in: [1] } } },
])

describe('RoleService', () => {
    let service: RoleService
    let findAll: Mock<(options?: object) => Promise<RoleRow[]>>
    let findByPk: Mock<(roleId: number, options?: object) => Promise<RoleRow | null>>
    let findOne: Mock<(options: object) => Promise<RoleRow | null>>
    let roleCreate: Mock<(values: object, options: object) => Promise<{ roleId: number }>>
    let roleUpdate: Mock<(values: object, options: object) => Promise<[number]>>
    let roleDestroy: Mock<(options: object) => Promise<number>>
    let permissionDestroy: Mock<(options: object) => Promise<number>>
    let permissionBulkCreate: Mock<(rows: object[], options?: object) => Promise<object[]>>
    let userCount: Mock<(options?: object) => Promise<number | GroupedCount>>
    let userFindAll: Mock<(options: object) => Promise<{ userId: number }[]>>
    let memberCount: Mock<(options?: object) => Promise<number | GroupedCount>>
    let memberFindAll: Mock<(options: object) => Promise<{ userId: number }[]>>
    let invalidateUsers: Mock<PermissionCacheService['invalidateUsers']>
    let transaction: Mock<Sequelize['transaction']>

    const transactionStub = {} as Transaction

    beforeEach(async () => {
        findAll = vi.fn<typeof findAll>().mockResolvedValue([])
        findByPk = vi.fn<typeof findByPk>().mockResolvedValue(roleRow(adminRole, ['users.read']))
        findOne = vi.fn<typeof findOne>()
        roleCreate = vi.fn<typeof roleCreate>().mockResolvedValue({ roleId: 9 })
        roleUpdate = vi.fn<typeof roleUpdate>().mockResolvedValue([1])
        roleDestroy = vi.fn<typeof roleDestroy>().mockResolvedValue(1)
        permissionDestroy = vi.fn<typeof permissionDestroy>().mockResolvedValue(0)
        permissionBulkCreate = vi.fn<typeof permissionBulkCreate>().mockResolvedValue([])
        userCount = vi.fn<typeof userCount>().mockResolvedValue(0)
        userFindAll = vi.fn<typeof userFindAll>().mockResolvedValue([])
        memberCount = vi.fn<typeof memberCount>().mockResolvedValue(0)
        memberFindAll = vi.fn<typeof memberFindAll>().mockResolvedValue([])
        invalidateUsers = vi.fn<typeof invalidateUsers>().mockResolvedValue(undefined)
        transaction = vi
            .fn<typeof transaction>()
            .mockImplementation((callback) => (callback as (t: Transaction) => Promise<unknown>)(transactionStub))

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                RoleService,
                {
                    provide: getModelToken(RoleModel),
                    useValue: {
                        findAll,
                        findByPk,
                        findOne,
                        create: roleCreate,
                        update: roleUpdate,
                        destroy: roleDestroy,
                    },
                },
                {
                    provide: getModelToken(RolePermissionModel),
                    useValue: { destroy: permissionDestroy, bulkCreate: permissionBulkCreate },
                },
                { provide: getModelToken(UserModel), useValue: { count: userCount, findAll: userFindAll } },
                {
                    provide: getModelToken(ProjectMemberModel),
                    useValue: { count: memberCount, findAll: memberFindAll },
                },
                { provide: PermissionCacheService, useValue: { invalidateUsers } },
                { provide: Sequelize, useValue: { transaction } },
            ],
        }).compile()

        service = module.get(RoleService)
    })

    describe('getRoles', () => {
        it('lists every role with permissions and its assignment count per scope', async () => {
            findAll.mockResolvedValue([roleRow(adminRole, ['users.read']), roleRow(viewerRole, ['read'])])
            userCount.mockResolvedValue([{ roleId: 2, count: 3 }])
            memberCount.mockResolvedValue([{ roleId: 5, count: 7 }])

            const roles = await service.getRoles()

            expect(findAll).toHaveBeenCalledWith({ include: [RolePermissionModel], order: [['roleId', 'ASC']] })
            expect(userCount).toHaveBeenCalledWith({ group: ['roleId'] })
            expect(memberCount).toHaveBeenCalledWith({ group: ['roleId'] })
            expect(roles).toEqual([
                expect.objectContaining({ roleId: 2, permissions: ['users.read'], assignmentCount: 3 }),
                expect.objectContaining({ roleId: 5, permissions: ['read'], assignmentCount: 7 }),
            ])
        })
    })

    describe('getRoleById', () => {
        it('returns the role with its permissions and count', async () => {
            userCount.mockResolvedValue(4)

            await expect(service.getRoleById(2)).resolves.toEqual(
                expect.objectContaining({ roleId: 2, permissions: ['users.read'], assignmentCount: 4 }),
            )
            expect(userCount).toHaveBeenCalledWith({ where: { roleId: 2 } })
        })

        it('answers unknown roles with 404', async () => {
            findByPk.mockResolvedValue(null)

            await expect(service.getRoleById(99)).rejects.toThrow(new NotFoundException('Unknown role'))
        })
    })

    describe('findRole', () => {
        it('returns null instead of throwing', async () => {
            findByPk.mockResolvedValue(null)

            await expect(service.findRole(99)).resolves.toBeNull()
        })
    })

    describe('getProjectRoles', () => {
        it('lists project-scoped roles in id order', async () => {
            findAll.mockResolvedValue([roleRow(viewerRole, ['read'])])

            await expect(service.getProjectRoles()).resolves.toEqual([
                expect.objectContaining({ roleId: 5, scope: 'project', permissions: ['read'] }),
            ])
            expect(findAll).toHaveBeenCalledWith({
                where: { scope: 'project' },
                include: [RolePermissionModel],
                order: [['roleId', 'ASC']],
            })
        })
    })

    describe('createRole', () => {
        const input = {
            name: 'Reviewer',
            scope: 'project' as const,
            description: null,
            permissions: ['read', 'read'] as CatalogPermission[],
        }

        it('creates the role and its deduplicated permissions in one transaction', async () => {
            findByPk.mockResolvedValue(roleRow({ ...viewerRole, roleId: 9, name: 'Reviewer' }, ['read']))

            const created = await service.createRole(input, superAdminAbility)

            expect(roleCreate).toHaveBeenCalledWith(
                { name: 'Reviewer', scope: 'project', type: 'custom', description: null },
                { returning: true, transaction: transactionStub },
            )
            expect(permissionBulkCreate).toHaveBeenCalledWith([{ roleId: 9, permission: 'read' }], {
                transaction: transactionStub,
            })
            expect(created).toEqual(expect.objectContaining({ roleId: 9, name: 'Reviewer' }))
        })

        it('rejects permissions outside the scope', async () => {
            await expect(
                service.createRole({ ...input, permissions: ['read', 'users.read'] }, superAdminAbility),
            ).rejects.toThrow(new BadRequestException('Permission "users.read" is not available for project roles'))
            expect(transaction).not.toHaveBeenCalled()
        })

        it('requires read on project roles', async () => {
            await expect(service.createRole({ ...input, permissions: ['delete'] }, superAdminAbility)).rejects.toThrow(
                new BadRequestException('Project roles must include the read permission'),
            )
        })

        it('requires unconditional project permissions for project roles', async () => {
            await expect(service.createRole(input, roleManagerAbility)).rejects.toThrow(ForbiddenException)
            expect(transaction).not.toHaveBeenCalled()
        })

        it('requires held global permissions for global roles', async () => {
            await expect(
                service.createRole(
                    { name: 'Ops', scope: 'global', description: null, permissions: ['users.read', 'users.delete'] },
                    roleManagerAbility,
                ),
            ).rejects.toThrow(ForbiddenException)
        })

        it('maps duplicate names to a bad request', async () => {
            roleCreate.mockRejectedValue(new UniqueConstraintError({}))

            await expect(service.createRole(input, superAdminAbility)).rejects.toThrow(
                new BadRequestException('Name is already in use'),
            )
        })
    })

    describe('updateRole', () => {
        it('replaces permissions, renames and invalidates every user holding a global role', async () => {
            findByPk.mockResolvedValue(roleRow(adminRole, ['users.read']))
            userFindAll.mockResolvedValue([{ userId: 7 }, { userId: 8 }])

            await service.updateRole(
                2,
                { name: 'Operators', permissions: ['users.read', 'users.update'] },
                superAdminAbility,
            )

            expect(roleUpdate).toHaveBeenCalledWith(
                { name: 'Operators' },
                { where: { roleId: 2 }, transaction: transactionStub },
            )
            expect(permissionDestroy).toHaveBeenCalledWith({ where: { roleId: 2 }, transaction: transactionStub })
            expect(permissionBulkCreate).toHaveBeenCalledWith(
                [
                    { roleId: 2, permission: 'users.read' },
                    { roleId: 2, permission: 'users.update' },
                ],
                { transaction: transactionStub },
            )
            expect(userFindAll).toHaveBeenCalledWith({ attributes: ['userId'], where: { roleId: 2 } })
            expect(invalidateUsers).toHaveBeenCalledWith([7, 8])
        })

        it('invalidates the distinct members holding a project role', async () => {
            findByPk.mockResolvedValue(roleRow(viewerRole, ['read']))
            memberFindAll.mockResolvedValue([{ userId: 3 }, { userId: 3 }, { userId: 4 }])

            await service.updateRole(5, { permissions: ['read', 'forms.manage'] }, superAdminAbility)

            expect(memberFindAll).toHaveBeenCalledWith({ attributes: ['userId'], where: { roleId: 5 } })
            expect(invalidateUsers).toHaveBeenCalledWith([3, 4])
        })

        it('only touches the name and description when permissions are omitted', async () => {
            await service.updateRole(2, { description: 'Runs the place' }, roleManagerAbility)

            expect(roleUpdate).toHaveBeenCalledWith(
                { description: 'Runs the place' },
                { where: { roleId: 2 }, transaction: transactionStub },
            )
            expect(permissionDestroy).not.toHaveBeenCalled()
            expect(invalidateUsers).not.toHaveBeenCalled()
        })

        it('applies the hold rule to the changed permissions only', async () => {
            findByPk.mockResolvedValue(roleRow(adminRole, ['users.read', 'users.delete']))

            await expect(service.updateRole(2, { permissions: ['users.read'] }, roleManagerAbility)).rejects.toThrow(
                ForbiddenException,
            )
            await expect(
                service.updateRole(2, { permissions: ['users.read', 'users.delete'] }, roleManagerAbility),
            ).resolves.toBeDefined()
        })

        it('requires unconditional project permissions for project roles', async () => {
            findByPk.mockResolvedValue(roleRow(viewerRole, ['read']))

            await expect(
                service.updateRole(5, { permissions: ['read', 'delete'] }, roleManagerAbility),
            ).rejects.toThrow(ForbiddenException)
        })

        it('refuses to change the super admin role', async () => {
            findByPk.mockResolvedValue(roleRow(superAdminRole))

            await expect(service.updateRole(1, { name: 'Root' }, superAdminAbility)).rejects.toThrow(
                new ForbiddenException('The super admin role cannot be changed'),
            )
        })
    })

    describe('deleteRole', () => {
        it('deletes an unassigned role', async () => {
            userCount.mockResolvedValue(0)

            await service.deleteRole(2)

            expect(roleDestroy).toHaveBeenCalledWith({ where: { roleId: 2 } })
        })

        it('refuses while users hold the role', async () => {
            userCount.mockResolvedValue(3)

            await expect(service.deleteRole(2)).rejects.toThrow(
                new BadRequestException('The role is still assigned to 3 users'),
            )
            expect(roleDestroy).not.toHaveBeenCalled()
        })

        it('refuses while project members hold the role', async () => {
            findByPk.mockResolvedValue(roleRow(viewerRole, ['read']))
            memberCount.mockResolvedValue(2)

            await expect(service.deleteRole(5)).rejects.toThrow(
                new BadRequestException('The role is still assigned to 2 project members'),
            )
        })

        it('refuses to delete the super admin role', async () => {
            findByPk.mockResolvedValue(roleRow(superAdminRole))

            await expect(service.deleteRole(1)).rejects.toThrow(ForbiddenException)
        })
    })

    it('keeps the catalog order when normalizing project permissions', async () => {
        findByPk.mockResolvedValue(roleRow({ ...viewerRole, roleId: 9 }, [...PROJECT_PERMISSIONS]))

        await service.createRole(
            { name: 'All', scope: 'project', description: null, permissions: ['members.manage', 'read'] },
            superAdminAbility,
        )

        expect(permissionBulkCreate).toHaveBeenCalledWith(
            [
                { roleId: 9, permission: 'read' },
                { roleId: 9, permission: 'members.manage' },
            ],
            { transaction: transactionStub },
        )
    })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm --filter backend exec vitest run src/modules/permission/services/role.service.spec.ts`
Expected: FAIL (missing methods / DI providers).

- [ ] **Step 4: Rewrite `role.service.ts`**

```ts
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/sequelize'
import { Sequelize } from 'sequelize-typescript'
import { UniqueConstraintError } from 'sequelize'
import { RoleModel } from '../models/role.model.js'
import { RolePermissionModel } from '../models/role-permission.model.js'
import { ProjectMemberModel } from '../models/project-member.model.js'
import { UserModel } from '../../user/models/user.model.js'
import { PermissionCacheService } from './permission-cache.service.js'
import {
    Role,
    RoleCreateInput,
    RoleSummary,
    RoleUpdateInput,
    RoleWithPermissions,
} from '../interfaces/role.interface.js'
import { AppAbility } from '../interfaces/app-ability.js'
import { holdsRolePermission } from '../helpers/holds-permission.js'
import { assertPermissionChangesHeld } from '../helpers/permission-grants.js'
import {
    CatalogPermission,
    permissionsForScope,
    PROJECT_ROLE_REQUIRED_PERMISSION,
    RoleScope,
    RoleType,
} from '../permission.constants.js'

interface RoleRow {
    get(options: { plain: true }): Role & { permissions?: { permission: CatalogPermission }[] }
}

function toRoleWithPermissions(row: RoleRow): RoleWithPermissions {
    const { permissions, ...role } = row.get({ plain: true })

    return { ...role, permissions: (permissions ?? []).map((entry) => entry.permission) }
}

@Injectable()
export class RoleService {
    constructor(
        @InjectModel(RoleModel) private readonly roleModel: typeof RoleModel,
        @InjectModel(RolePermissionModel) private readonly rolePermissionModel: typeof RolePermissionModel,
        @InjectModel(UserModel) private readonly userModel: typeof UserModel,
        @InjectModel(ProjectMemberModel) private readonly memberModel: typeof ProjectMemberModel,
        private readonly permissionCacheService: PermissionCacheService,
        private readonly sequelize: Sequelize,
    ) {}

    async getRoles(): Promise<RoleSummary[]> {
        const [rows, userCounts, memberCounts] = await Promise.all([
            this.roleModel.findAll({ include: [RolePermissionModel], order: [['roleId', 'ASC']] }),
            this.userModel.count({ group: ['roleId'] }),
            this.memberModel.count({ group: ['roleId'] }),
        ])
        const countsByRole = (counts: { roleId?: unknown; count: number }[]) =>
            new Map(counts.map((entry) => [Number(entry.roleId), entry.count]))
        const usersPerRole = countsByRole(userCounts)
        const membersPerRole = countsByRole(memberCounts)

        return rows.map((row) => {
            const role = toRoleWithPermissions(row)
            const counts = role.scope === 'global' ? usersPerRole : membersPerRole

            return { ...role, assignmentCount: counts.get(role.roleId) ?? 0 }
        })
    }

    async getRoleById(roleId: number): Promise<RoleSummary> {
        const role = await this.findRole(roleId)
        if (!role) {
            throw new NotFoundException('Unknown role')
        }

        return { ...role, assignmentCount: await this.countAssignments(role) }
    }

    async findRole(roleId: number): Promise<RoleWithPermissions | null> {
        const row = await this.roleModel.findByPk(roleId, { include: [RolePermissionModel] })

        return row ? toRoleWithPermissions(row) : null
    }

    async getRoleByType(type: RoleType): Promise<Role> {
        const row = await this.roleModel.findOne({ where: { type }, rejectOnEmpty: true })

        return row.get({ plain: true })
    }

    async getProjectRoles(): Promise<RoleWithPermissions[]> {
        const rows = await this.roleModel.findAll({
            where: { scope: 'project' },
            include: [RolePermissionModel],
            order: [['roleId', 'ASC']],
        })

        return rows.map((row) => toRoleWithPermissions(row))
    }

    async createRole(input: RoleCreateInput, ability: AppAbility): Promise<RoleSummary> {
        const permissions = this.normalizePermissions(input.scope, input.permissions)
        assertPermissionChangesHeld([], permissions, (permission) =>
            holdsRolePermission(ability, input.scope, permission),
        )

        const roleId = await this.sequelize.transaction(async (transaction) => {
            const created = await this.createRow(
                { name: input.name, scope: input.scope, type: 'custom', description: input.description },
                transaction,
            )
            await this.rolePermissionModel.bulkCreate(
                permissions.map((permission) => ({ roleId: created.roleId, permission })),
                { transaction },
            )

            return created.roleId
        })

        return this.getRoleById(roleId)
    }

    async updateRole(roleId: number, update: RoleUpdateInput, ability: AppAbility): Promise<RoleSummary> {
        const role = await this.getRoleById(roleId)
        this.assertEditable(role)

        const permissions =
            update.permissions === undefined ? undefined : this.normalizePermissions(role.scope, update.permissions)
        if (permissions) {
            assertPermissionChangesHeld(role.permissions, permissions, (permission) =>
                holdsRolePermission(ability, role.scope, permission),
            )
        }

        const changes: Partial<Pick<Role, 'name' | 'description'>> = {}
        if (update.name !== undefined) {
            changes.name = update.name
        }
        if (update.description !== undefined) {
            changes.description = update.description
        }

        await this.sequelize.transaction(async (transaction) => {
            if (Object.keys(changes).length > 0) {
                try {
                    await this.roleModel.update(changes, { where: { roleId }, transaction })
                } catch (error) {
                    if (error instanceof UniqueConstraintError) {
                        throw new BadRequestException('Name is already in use')
                    }
                    throw error
                }
            }
            if (permissions) {
                await this.rolePermissionModel.destroy({ where: { roleId }, transaction })
                await this.rolePermissionModel.bulkCreate(
                    permissions.map((permission) => ({ roleId, permission })),
                    { transaction },
                )
            }
        })

        if (permissions) {
            await this.permissionCacheService.invalidateUsers(await this.assignedUserIds(role))
        }

        return this.getRoleById(roleId)
    }

    async deleteRole(roleId: number): Promise<void> {
        const role = await this.getRoleById(roleId)
        this.assertEditable(role)

        if (role.assignmentCount > 0) {
            const holders = role.scope === 'global' ? 'users' : 'project members'
            throw new BadRequestException(`The role is still assigned to ${role.assignmentCount} ${holders}`)
        }

        await this.roleModel.destroy({ where: { roleId } })
    }

    private async createRow(
        values: { name: string; scope: RoleScope; type: RoleType; description: string | null },
        transaction: import('sequelize').Transaction,
    ): Promise<{ roleId: number }> {
        try {
            return await this.roleModel.create(values, { returning: true, transaction })
        } catch (error) {
            if (error instanceof UniqueConstraintError) {
                throw new BadRequestException('Name is already in use')
            }
            throw error
        }
    }

    private normalizePermissions(scope: RoleScope, permissions: CatalogPermission[]): CatalogPermission[] {
        const allowed = permissionsForScope(scope)
        const unique = new Set(permissions)
        for (const permission of unique) {
            if (!allowed.includes(permission)) {
                throw new BadRequestException(`Permission "${permission}" is not available for ${scope} roles`)
            }
        }
        if (scope === 'project' && !unique.has(PROJECT_ROLE_REQUIRED_PERMISSION)) {
            throw new BadRequestException('Project roles must include the read permission')
        }

        return allowed.filter((permission) => unique.has(permission))
    }

    private assertEditable(role: Role): void {
        if (role.type === 'super_admin') {
            throw new ForbiddenException('The super admin role cannot be changed')
        }
    }

    private countAssignments(role: Role): Promise<number> {
        return role.scope === 'global'
            ? this.userModel.count({ where: { roleId: role.roleId } })
            : this.memberModel.count({ where: { roleId: role.roleId } })
    }

    private async assignedUserIds(role: Role): Promise<number[]> {
        const rows =
            role.scope === 'global'
                ? await this.userModel.findAll({ attributes: ['userId'], where: { roleId: role.roleId } })
                : await this.memberModel.findAll({ attributes: ['userId'], where: { roleId: role.roleId } })

        return [...new Set(rows.map((row) => row.userId))]
    }
}
```

Replace the inline `import('sequelize').Transaction` with a top-level `import type { Transaction } from 'sequelize'` and use `Transaction` (the inline form is shown only to keep the snippet self-contained).

- [ ] **Step 5: Run the spec to verify it passes**

Run: `pnpm --filter backend exec vitest run src/modules/permission/services/role.service.spec.ts`
Expected: PASS. If `count({ group })` typing complains, type the helper parameter as `{ count: number; [key: string]: unknown }[]`.

- [ ] **Step 6: Verify instead of committing**

`pnpm --filter backend exec prettier --check src/modules/permission/services`.

---

### Task 5: Role DTOs, `RoleController` CRUD and the route-access matrix

**Files:**

- Modify: `apps/backend/src/modules/permission/dtos/role.dto.ts`
- Create: `apps/backend/src/modules/permission/dtos/role-create.dto.ts`
- Create: `apps/backend/src/modules/permission/dtos/role-create.dto.spec.ts`
- Create: `apps/backend/src/modules/permission/dtos/project-member-role.dto.ts`
- Modify: `apps/backend/src/modules/permission/controller/role.controller.ts`
- Modify: `apps/backend/src/modules/permission/controller/role.controller.spec.ts`
- Modify: `apps/backend/src/route-access.spec.ts`

**Interfaces:**

- Consumes: `RoleService.getRoles/getRoleById/createRole/updateRole/deleteRole` (Task 4), `RoleSummary`, `RoleCreateInput`, `RoleUpdateInput` (Task 1).
- Produces: `RoleDto { roleId, name, scope, type, description, permissions, assignmentCount }`, `RoleCreateDto { name, scope, description?, permissions }`, `RoleUpdateDto { name?, description?, permissions? }`, `ProjectMemberRoleDto { roleId, name }`; endpoints `GET /role`, `GET /role/:roleId`, `POST /role`, `PATCH /role/:roleId`, `DELETE /role/:roleId` with operationIds `getRoles`, `getRole`, `createRole`, `updateRole`, `deleteRole`.

- [ ] **Step 1: Write the failing DTO spec**

`apps/backend/src/modules/permission/dtos/role-create.dto.spec.ts`:

```ts
import 'reflect-metadata'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { describe, expect, it } from 'vitest'
import { RoleCreateDto, RoleUpdateDto } from './role-create.dto.js'

async function violations(type: new () => object, plain: object): Promise<string[]> {
    const errors = await validate(plainToInstance(type, plain, { exposeDefaultValues: true }))
    return errors.map((error) => error.property)
}

describe('RoleCreateDto', () => {
    const valid = { name: 'Reviewer', scope: 'project', permissions: ['read', 'forms.manage'] }

    it('accepts a role with and without a description', async () => {
        await expect(violations(RoleCreateDto, valid)).resolves.toEqual([])
        await expect(violations(RoleCreateDto, { ...valid, description: 'Reviews forms' })).resolves.toEqual([])
        await expect(violations(RoleCreateDto, { ...valid, description: null })).resolves.toEqual([])
    })

    it('requires name, scope and permissions', async () => {
        await expect(violations(RoleCreateDto, {})).resolves.toEqual(['name', 'scope', 'permissions'])
    })

    it('limits the name to 100 and the description to 255 characters', async () => {
        await expect(
            violations(RoleCreateDto, { ...valid, name: 'x'.repeat(101), description: 'y'.repeat(256) }),
        ).resolves.toEqual(['name', 'description'])
    })

    it.each([['owner'], ['manage'], ['users.impersonate']])('rejects unknown permission %s', async (permission) => {
        await expect(violations(RoleCreateDto, { ...valid, permissions: [permission] })).resolves.toEqual([
            'permissions',
        ])
    })

    it('rejects unknown scopes', async () => {
        await expect(violations(RoleCreateDto, { ...valid, scope: 'team' })).resolves.toEqual(['scope'])
    })
})

describe('RoleUpdateDto', () => {
    it('accepts an empty patch', async () => {
        await expect(violations(RoleUpdateDto, {})).resolves.toEqual([])
    })

    it('applies the create rules to the fields it carries', async () => {
        await expect(
            violations(RoleUpdateDto, { name: '', description: 'y'.repeat(256), permissions: 'read' }),
        ).resolves.toEqual(['name', 'description', 'permissions'])
    })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter backend exec vitest run src/modules/permission/dtos/role-create.dto.spec.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the DTOs**

`apps/backend/src/modules/permission/dtos/role.dto.ts`:

```ts
import { Expose } from 'class-transformer'
import { ApiProperty } from '@nestjs/swagger'
import { CATALOG_PERMISSIONS, ROLE_SCOPES, ROLE_TYPES } from '../permission.constants.js'
import type { CatalogPermission, RoleScope, RoleType } from '../permission.constants.js'

export class RoleDto {
    @Expose()
    roleId!: number

    @Expose()
    name!: string

    @Expose()
    @ApiProperty({ enum: ROLE_SCOPES, enumName: 'RoleScope' })
    scope!: RoleScope

    @Expose()
    @ApiProperty({ enum: ROLE_TYPES, enumName: 'RoleType' })
    type!: RoleType

    @Expose()
    @ApiProperty({ type: String, nullable: true })
    description!: string | null

    @Expose()
    @ApiProperty({ enum: CATALOG_PERMISSIONS, enumName: 'CatalogPermission', isArray: true })
    permissions!: CatalogPermission[]

    @Expose()
    @ApiProperty({ type: Number })
    assignmentCount!: number
}
```

`apps/backend/src/modules/permission/dtos/role-create.dto.ts`:

```ts
import { Expose } from 'class-transformer'
import { ApiProperty } from '@nestjs/swagger'
import { IsArray, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator'
import { CATALOG_PERMISSIONS, ROLE_SCOPES } from '../permission.constants.js'
import type { CatalogPermission, RoleScope } from '../permission.constants.js'

export class RoleCreateDto {
    @Expose()
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    name!: string

    @Expose()
    @IsIn(ROLE_SCOPES)
    @ApiProperty({ enum: ROLE_SCOPES, enumName: 'RoleScope' })
    scope!: RoleScope

    @Expose()
    @IsOptional()
    @IsString()
    @MaxLength(255)
    @ApiProperty({ type: String, required: false, nullable: true })
    description?: string | null

    @Expose()
    @IsArray()
    @IsIn(CATALOG_PERMISSIONS, { each: true })
    @ApiProperty({ enum: CATALOG_PERMISSIONS, enumName: 'CatalogPermission', isArray: true })
    permissions!: CatalogPermission[]
}

export class RoleUpdateDto {
    @Expose()
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    name?: string

    @Expose()
    @IsOptional()
    @IsString()
    @MaxLength(255)
    @ApiProperty({ type: String, required: false, nullable: true })
    description?: string | null

    @Expose()
    @IsOptional()
    @IsArray()
    @IsIn(CATALOG_PERMISSIONS, { each: true })
    @ApiProperty({ enum: CATALOG_PERMISSIONS, enumName: 'CatalogPermission', isArray: true, required: false })
    permissions?: CatalogPermission[]
}
```

`apps/backend/src/modules/permission/dtos/project-member-role.dto.ts`:

```ts
import { Expose } from 'class-transformer'

export class ProjectMemberRoleDto {
    @Expose()
    roleId!: number

    @Expose()
    name!: string
}
```

- [ ] **Step 4: Run the DTO spec to verify it passes**

Run: `pnpm --filter backend exec vitest run src/modules/permission/dtos/role-create.dto.spec.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing controller spec**

Replace `role.controller.spec.ts`:

```ts
import { Test, TestingModule } from '@nestjs/testing'
import { instanceToPlain, plainToInstance } from 'class-transformer'
import { createMongoAbility } from '@casl/ability'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { RoleController } from './role.controller.js'
import { RoleService } from '../services/role.service.js'
import { PoliciesGuard } from '../guards/policies.guard.js'
import { RoleSummary } from '../interfaces/role.interface.js'
import { AppAbility } from '../interfaces/app-ability.js'
import { RoleDto } from '../dtos/role.dto.js'

const adminRole: RoleSummary = {
    roleId: 2,
    name: 'Admin',
    scope: 'global',
    type: 'admin',
    description: 'Everything',
    permissions: ['domains.read', 'users.read'],
    assignmentCount: 3,
    createdAt: new Date(),
    updatedAt: new Date(),
}

const ability = createMongoAbility<AppAbility>([{ action: 'manage', subject: 'all' }])

describe('RoleController', () => {
    let controller: RoleController
    let getRoles: Mock<RoleService['getRoles']>
    let getRoleById: Mock<RoleService['getRoleById']>
    let createRole: Mock<RoleService['createRole']>
    let updateRole: Mock<RoleService['updateRole']>
    let deleteRole: Mock<RoleService['deleteRole']>

    beforeEach(async () => {
        getRoles = vi.fn<typeof getRoles>().mockResolvedValue([adminRole])
        getRoleById = vi.fn<typeof getRoleById>().mockResolvedValue(adminRole)
        createRole = vi.fn<typeof createRole>().mockResolvedValue(adminRole)
        updateRole = vi.fn<typeof updateRole>().mockResolvedValue(adminRole)
        deleteRole = vi.fn<typeof deleteRole>().mockResolvedValue(undefined)

        const module: TestingModule = await Test.createTestingModule({
            controllers: [RoleController],
            providers: [
                { provide: RoleService, useValue: { getRoles, getRoleById, createRole, updateRole, deleteRole } },
            ],
        })
            .overrideGuard(PoliciesGuard)
            .useValue({ canActivate: vi.fn().mockResolvedValue(true) })
            .compile()

        controller = module.get(RoleController)
    })

    it('returns every role with its permissions', async () => {
        await expect(controller.getRoles()).resolves.toEqual([adminRole])
        expect(getRoles).toHaveBeenCalledOnce()
    })

    it('returns one role by id', async () => {
        await expect(controller.getRole(2)).resolves.toEqual(adminRole)
        expect(getRoleById).toHaveBeenCalledWith(2)
    })

    it('creates a role with a null description when none is given', async () => {
        await controller.createRole({ name: 'Ops', scope: 'global', permissions: ['users.read'] }, ability)

        expect(createRole).toHaveBeenCalledWith(
            { name: 'Ops', scope: 'global', description: null, permissions: ['users.read'] },
            ability,
        )
    })

    it('passes partial updates through', async () => {
        await controller.updateRole(2, { permissions: ['users.read'] }, ability)

        expect(updateRole).toHaveBeenCalledWith(2, { permissions: ['users.read'] }, ability)
    })

    it('deletes by id', async () => {
        await controller.deleteRole(2)

        expect(deleteRole).toHaveBeenCalledWith(2)
    })

    it('serializes roles to their public shape only', async () => {
        const [role] = await controller.getRoles()

        const serialized = instanceToPlain(plainToInstance(RoleDto, role, { excludeExtraneousValues: true }), {
            excludeExtraneousValues: true,
        })

        expect(serialized).toEqual({
            roleId: 2,
            name: 'Admin',
            scope: 'global',
            type: 'admin',
            description: 'Everything',
            permissions: ['domains.read', 'users.read'],
            assignmentCount: 3,
        })
    })
})
```

- [ ] **Step 6: Rewrite the controller**

```ts
import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, SerializeOptions } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { JwtAuth } from '../../auth/decorators/JwtAuth.js'
import { RequireAbility } from '../decorators/RequireAbility.js'
import { CurrentAbility } from '../decorators/CurrentAbility.js'
import { ResponseDto } from '../../../decorators/ResponseDto.js'
import { RoleService } from '../services/role.service.js'
import { RoleDto } from '../dtos/role.dto.js'
import { RoleCreateDto, RoleUpdateDto } from '../dtos/role-create.dto.js'
import type { AppAbility } from '../interfaces/app-ability.js'

@JwtAuth()
@ApiTags('role')
@Controller('role')
export class RoleController {
    constructor(private readonly roleService: RoleService) {}

    @RequireAbility({ action: 'read', subject: 'Role' })
    @SerializeOptions({ type: RoleDto })
    @Get()
    async getRoles(): Promise<RoleDto[]> {
        return await this.roleService.getRoles()
    }

    @RequireAbility({ action: 'read', subject: 'Role' })
    @ResponseDto(RoleDto)
    @Get(':roleId')
    async getRole(@Param('roleId', ParseIntPipe) roleId: number): Promise<RoleDto> {
        return await this.roleService.getRoleById(roleId)
    }

    @RequireAbility({ action: 'create', subject: 'Role' })
    @ResponseDto(RoleDto)
    @Post()
    async createRole(@Body() body: RoleCreateDto, @CurrentAbility() ability: AppAbility): Promise<RoleDto> {
        return await this.roleService.createRole(
            {
                name: body.name,
                scope: body.scope,
                description: body.description ?? null,
                permissions: body.permissions,
            },
            ability,
        )
    }

    @RequireAbility({ action: 'update', subject: 'Role' })
    @ResponseDto(RoleDto)
    @Patch(':roleId')
    async updateRole(
        @Param('roleId', ParseIntPipe) roleId: number,
        @Body() body: RoleUpdateDto,
        @CurrentAbility() ability: AppAbility,
    ): Promise<RoleDto> {
        return await this.roleService.updateRole(roleId, body, ability)
    }

    @RequireAbility({ action: 'delete', subject: 'Role' })
    @Delete(':roleId')
    async deleteRole(@Param('roleId', ParseIntPipe) roleId: number): Promise<void> {
        await this.roleService.deleteRole(roleId)
    }
}
```

- [ ] **Step 7: Run the controller spec**

Run: `pnpm --filter backend exec vitest run src/modules/permission/controller/role.controller.spec.ts`
Expected: PASS.

- [ ] **Step 8: Extend the route-access matrix**

In `route-access.spec.ts` replace the `'GET /role'` line with:

```ts
    'GET /role': { guards: jwt, abilities: ['read:Role'], scopedByPrincipal: false },
    'GET /role/:roleId': { guards: jwt, abilities: ['read:Role'], scopedByPrincipal: false },
    'POST /role': { guards: jwt, abilities: ['create:Role'], scopedByPrincipal: true },
    'PATCH /role/:roleId': { guards: jwt, abilities: ['update:Role'], scopedByPrincipal: true },
    'DELETE /role/:roleId': { guards: jwt, abilities: ['delete:Role'], scopedByPrincipal: false },
```

Run: `pnpm --filter backend exec vitest run src/route-access.spec.ts` → PASS (the matrix test lists all routes; other tasks add more entries later and each runs this file again).

- [ ] **Step 9: Verify instead of committing**

`pnpm --filter backend exec prettier --check src/modules/permission src/route-access.spec.ts`.

---

### Task 6: `ProjectMemberService` with roles, extras and full-access grants

**Files:**

- Modify: `apps/backend/src/modules/permission/services/project-member.service.ts`
- Modify: `apps/backend/src/modules/permission/services/project-member.service.spec.ts`
- Modify: `apps/backend/src/modules/project/services/project.service.ts`
- Modify: `apps/backend/src/modules/project/services/project.service.spec.ts`

**Interfaces:**

- Consumes: `RoleService.findRole/getProjectRoles` (Task 4), `ProjectMemberPermissionModel` (Task 2), `assertProjectPermission`, `canOnProject`, `assertRoleGrantable`, `assertPermissionChangesHeld`, `isProjectPermission`, `PROJECT_PERMISSIONS` (Task 1).
- Produces: `getMembers(projectId, ability): Promise<ProjectMemberInfo[]>`, `getProjectRoles(projectId, ability): Promise<RoleWithPermissions[]>`, `setMember(projectId, userId, grant: ProjectMemberGrant, ability): Promise<void>`, `removeMember(projectId, userId, ability)`, `getMembershipsForUser(userId): Promise<ProjectMembership[]>`, `countMembershipsPerUser(): Promise<Map<number, number>>`, `grantFullAccess(projectId, userId, transaction): Promise<void>`, `getImplicitAccess` unchanged.

- [ ] **Step 1: Rewrite the member service spec**

Replace `project-member.service.spec.ts`:

```ts
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { getModelToken } from '@nestjs/sequelize'
import { Test, TestingModule } from '@nestjs/testing'
import { Sequelize } from 'sequelize-typescript'
import type { Transaction } from 'sequelize'
import { createMongoAbility } from '@casl/ability'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { ProjectMemberService } from './project-member.service.js'
import { RoleService } from './role.service.js'
import { PermissionCacheService } from './permission-cache.service.js'
import { ProjectMemberModel } from '../models/project-member.model.js'
import { ProjectMemberPermissionModel } from '../models/project-member-permission.model.js'
import { ProjectModel } from '../../project/models/project.model.js'
import { UserModel } from '../../user/models/user.model.js'
import { RoleModel } from '../models/role.model.js'
import { RolePermissionModel } from '../models/role-permission.model.js'
import { UserPermissionModel } from '../models/user-permission.model.js'
import { RolePermission, RoleWithPermissions, UserPermission } from '../interfaces/role.interface.js'
import { AppAbility } from '../interfaces/app-ability.js'
import { ProjectMember } from '../interfaces/project-member.interface.js'
import { ProjectPermission } from '../permission.constants.js'

const viewer: RoleWithPermissions = {
    roleId: 5,
    name: 'Viewer',
    scope: 'project',
    type: 'custom',
    description: null,
    permissions: ['read'],
    createdAt: new Date(),
    updatedAt: new Date(),
}
const maintainer: RoleWithPermissions = {
    ...viewer,
    roleId: 7,
    name: 'Maintainer',
    permissions: ['read', 'update', 'forms.manage', 'api_keys.manage', 'members.manage'],
}
const owner: RoleWithPermissions = {
    ...viewer,
    roleId: 8,
    name: 'Owner',
    permissions: ['read', 'update', 'delete', 'forms.manage', 'api_keys.manage', 'members.manage'],
}
const globalAdmin: RoleWithPermissions = { ...viewer, roleId: 2, name: 'Admin', scope: 'global', type: 'admin' }

const userManagerAbility = createMongoAbility<AppAbility>([{ action: 'update', subject: 'User' }])
const memberManagerAbility = createMongoAbility<AppAbility>(
    maintainer.permissions.map((permission) => ({
        action: permission as ProjectPermission,
        subject: 'Project' as const,
        conditions: { projectId: { $in: [1] } },
    })),
)
const readOnlyAbility = createMongoAbility<AppAbility>([
    { action: 'read', subject: 'Project', conditions: { projectId: { $in: [1] } } },
])

type MemberRow = ProjectMember & {
    user?: { userId: number; firstName: string; lastName: string; email: string }
    project?: { projectId: number; name: string }
    role?: { roleId: number; name: string }
    permissions: { permission: ProjectPermission }[]
}

function memberRow(partial: Partial<MemberRow>): MemberRow {
    return {
        projectMemberId: 1,
        projectId: 1,
        userId: 2,
        roleId: 5,
        role: { roleId: 5, name: 'Viewer' },
        permissions: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        ...partial,
    }
}

describe('ProjectMemberService', () => {
    let service: ProjectMemberService
    let memberFindAll: Mock<(options: object) => Promise<MemberRow[]>>
    let memberFindOne: Mock<(options: object) => Promise<MemberRow | null>>
    let memberDestroy: Mock<(options: object) => Promise<number>>
    let memberCreate: Mock<(values: object, options: object) => Promise<{ projectMemberId: number }>>
    let memberPermissionBulkCreate: Mock<(rows: object[], options?: object) => Promise<object[]>>
    let projectFindByPk: Mock<(projectId: number) => Promise<object | null>>
    let userFindByPk: Mock<(userId: number) => Promise<object | null>>
    let userCount: Mock<(options: object) => Promise<number>>
    let rolePermissionFindAll: Mock<(options: object) => Promise<Pick<RolePermission, 'roleId'>[]>>
    let userPermissionFindAll: Mock<(options: object) => Promise<Pick<UserPermission, 'userId'>[]>>
    let findRole: Mock<RoleService['findRole']>
    let getProjectRoles: Mock<RoleService['getProjectRoles']>
    let invalidateUser: Mock<PermissionCacheService['invalidateUser']>
    let transaction: Mock<Sequelize['transaction']>

    const transactionStub = {} as Transaction

    beforeEach(async () => {
        memberFindAll = vi.fn<typeof memberFindAll>().mockResolvedValue([])
        memberFindOne = vi.fn<typeof memberFindOne>().mockResolvedValue(null)
        memberDestroy = vi.fn<typeof memberDestroy>().mockResolvedValue(0)
        memberCreate = vi.fn<typeof memberCreate>().mockResolvedValue({ projectMemberId: 11 })
        memberPermissionBulkCreate = vi.fn<typeof memberPermissionBulkCreate>().mockResolvedValue([])
        projectFindByPk = vi.fn<typeof projectFindByPk>().mockResolvedValue({ projectId: 1 })
        userFindByPk = vi.fn<typeof userFindByPk>().mockResolvedValue({ userId: 2 })
        userCount = vi.fn<typeof userCount>().mockResolvedValue(0)
        rolePermissionFindAll = vi.fn<typeof rolePermissionFindAll>().mockResolvedValue([])
        userPermissionFindAll = vi.fn<typeof userPermissionFindAll>().mockResolvedValue([])
        findRole = vi.fn<typeof findRole>().mockResolvedValue(viewer)
        getProjectRoles = vi.fn<typeof getProjectRoles>().mockResolvedValue([viewer, maintainer, owner])
        invalidateUser = vi.fn<typeof invalidateUser>().mockResolvedValue(undefined)
        transaction = vi
            .fn<typeof transaction>()
            .mockImplementation((callback) => (callback as (t: Transaction) => Promise<unknown>)(transactionStub))

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ProjectMemberService,
                {
                    provide: getModelToken(ProjectMemberModel),
                    useValue: {
                        findAll: memberFindAll,
                        findOne: memberFindOne,
                        destroy: memberDestroy,
                        create: memberCreate,
                    },
                },
                {
                    provide: getModelToken(ProjectMemberPermissionModel),
                    useValue: { bulkCreate: memberPermissionBulkCreate },
                },
                { provide: getModelToken(ProjectModel), useValue: { findByPk: projectFindByPk } },
                { provide: getModelToken(UserModel), useValue: { findByPk: userFindByPk, count: userCount } },
                { provide: getModelToken(RolePermissionModel), useValue: { findAll: rolePermissionFindAll } },
                { provide: getModelToken(UserPermissionModel), useValue: { findAll: userPermissionFindAll } },
                { provide: RoleService, useValue: { findRole, getProjectRoles } },
                { provide: PermissionCacheService, useValue: { invalidateUser } },
                { provide: Sequelize, useValue: { transaction } },
            ],
        }).compile()

        service = module.get(ProjectMemberService)
    })

    describe('getMembers', () => {
        it('lists members with their role and extra permissions', async () => {
            const user = { userId: 2, firstName: 'Grace', lastName: 'Hopper', email: 'grace@example.com' }
            memberFindAll.mockResolvedValue([memberRow({ user, permissions: [{ permission: 'delete' }] })])

            const members = await service.getMembers(1, userManagerAbility)

            expect(memberFindAll).toHaveBeenCalledWith({
                where: { projectId: 1 },
                include: [UserModel, RoleModel, ProjectMemberPermissionModel],
                order: [['projectMemberId', 'ASC']],
            })
            expect(members).toEqual([
                {
                    userId: 2,
                    firstName: 'Grace',
                    lastName: 'Hopper',
                    email: 'grace@example.com',
                    role: { roleId: 5, name: 'Viewer' },
                    permissions: ['delete'],
                },
            ])
        })

        it('allows member managers without user management rights', async () => {
            await expect(service.getMembers(1, memberManagerAbility)).resolves.toEqual([])
        })

        it('rejects members without members.manage', async () => {
            await expect(service.getMembers(1, readOnlyAbility)).rejects.toThrow(ForbiddenException)
        })

        it('hides projects the caller cannot read', async () => {
            await expect(service.getMembers(2, readOnlyAbility)).rejects.toThrow(NotFoundException)
        })

        it('rejects unknown projects', async () => {
            projectFindByPk.mockResolvedValue(null)

            await expect(service.getMembers(1, userManagerAbility)).rejects.toThrow(
                new NotFoundException('Unknown project'),
            )
        })
    })

    describe('getProjectRoles', () => {
        it('serves the project roles to member managers only', async () => {
            await expect(service.getProjectRoles(1, memberManagerAbility)).resolves.toEqual([viewer, maintainer, owner])
            await expect(service.getProjectRoles(1, readOnlyAbility)).rejects.toThrow(ForbiddenException)
        })
    })

    describe('setMember', () => {
        it('replaces the membership with the role and extras in a transaction and invalidates the cache', async () => {
            findRole.mockResolvedValue(maintainer)

            await service.setMember(1, 2, { roleId: 7, permissions: ['delete', 'read', 'delete'] }, userManagerAbility)

            expect(memberDestroy).toHaveBeenCalledWith({
                where: { projectId: 1, userId: 2 },
                transaction: transactionStub,
            })
            expect(memberCreate).toHaveBeenCalledWith(
                { projectId: 1, userId: 2, roleId: 7 },
                { returning: true, transaction: transactionStub },
            )
            expect(memberPermissionBulkCreate).toHaveBeenCalledWith([{ projectMemberId: 11, permission: 'delete' }], {
                transaction: transactionStub,
            })
            expect(invalidateUser).toHaveBeenCalledWith(2)
        })

        it('rejects unknown target users', async () => {
            userFindByPk.mockResolvedValue(null)

            await expect(service.setMember(1, 2, { roleId: 5, permissions: [] }, userManagerAbility)).rejects.toThrow(
                new NotFoundException('Unknown user'),
            )
        })

        it('rejects unknown and global roles', async () => {
            findRole.mockResolvedValueOnce(null).mockResolvedValueOnce(globalAdmin)

            await expect(service.setMember(1, 2, { roleId: 99, permissions: [] }, userManagerAbility)).rejects.toThrow(
                new BadRequestException('Unknown project role'),
            )
            await expect(service.setMember(1, 2, { roleId: 2, permissions: [] }, userManagerAbility)).rejects.toThrow(
                new BadRequestException('Unknown project role'),
            )
            expect(transaction).not.toHaveBeenCalled()
        })

        it('rejects a role with permissions the caller does not hold on the project', async () => {
            findRole.mockResolvedValue(owner)

            await expect(service.setMember(1, 2, { roleId: 8, permissions: [] }, memberManagerAbility)).rejects.toThrow(
                new ForbiddenException('You cannot assign a role with permissions you do not hold: delete'),
            )
            expect(transaction).not.toHaveBeenCalled()
        })

        it('rejects extras the caller does not hold on the project', async () => {
            await expect(
                service.setMember(1, 2, { roleId: 5, permissions: ['delete'] }, memberManagerAbility),
            ).rejects.toThrow(new ForbiddenException('You cannot grant or revoke permissions you do not hold: delete'))
        })

        it('rejects revoking extras the caller does not hold on the project', async () => {
            memberFindOne.mockResolvedValue(memberRow({ permissions: [{ permission: 'delete' }] }))

            await expect(service.setMember(1, 2, { roleId: 5, permissions: [] }, memberManagerAbility)).rejects.toThrow(
                ForbiddenException,
            )
        })

        it('lets a users.update holder without project access change nothing they do not hold', async () => {
            findRole.mockResolvedValue(viewer)

            await expect(service.setMember(1, 2, { roleId: 5, permissions: [] }, userManagerAbility)).rejects.toThrow(
                new ForbiddenException('You cannot assign a role with permissions you do not hold: read'),
            )
        })

        it('lets member managers assign roles they fully hold', async () => {
            findRole.mockResolvedValue(maintainer)

            await service.setMember(1, 2, { roleId: 7, permissions: [] }, memberManagerAbility)

            expect(memberCreate).toHaveBeenCalledWith(
                { projectId: 1, userId: 2, roleId: 7 },
                { returning: true, transaction: transactionStub },
            )
            expect(memberPermissionBulkCreate).toHaveBeenCalledWith([], { transaction: transactionStub })
        })

        it('hides projects the caller cannot read', async () => {
            await expect(service.setMember(2, 2, { roleId: 5, permissions: [] }, memberManagerAbility)).rejects.toThrow(
                new NotFoundException('Unknown project'),
            )
        })

        it('does not invalidate the cache when the transaction fails', async () => {
            findRole.mockResolvedValue(maintainer)
            memberCreate.mockRejectedValue(new Error('constraint violated'))

            await expect(service.setMember(1, 2, { roleId: 7, permissions: [] }, memberManagerAbility)).rejects.toThrow(
                'constraint violated',
            )
            expect(invalidateUser).not.toHaveBeenCalled()
        })
    })

    describe('removeMember', () => {
        it('destroys the row and invalidates the cache', async () => {
            await service.removeMember(1, 2, memberManagerAbility)

            expect(memberDestroy).toHaveBeenCalledWith({ where: { projectId: 1, userId: 2 } })
            expect(invalidateUser).toHaveBeenCalledWith(2)
        })

        it('rejects members without members.manage', async () => {
            await expect(service.removeMember(1, 2, readOnlyAbility)).rejects.toThrow(ForbiddenException)
            expect(memberDestroy).not.toHaveBeenCalled()
        })
    })

    describe('grantFullAccess', () => {
        it('assigns the lowest role covering the whole catalog', async () => {
            await service.grantFullAccess(1, 5, transactionStub)

            expect(memberCreate).toHaveBeenCalledWith(
                { projectId: 1, userId: 5, roleId: 8 },
                { returning: true, transaction: transactionStub },
            )
            expect(memberPermissionBulkCreate).toHaveBeenCalledWith([], { transaction: transactionStub })
        })

        it('falls back to the largest role plus the missing permissions as extras', async () => {
            getProjectRoles.mockResolvedValue([viewer, maintainer])

            await service.grantFullAccess(1, 5, transactionStub)

            expect(memberCreate).toHaveBeenCalledWith(
                { projectId: 1, userId: 5, roleId: 7 },
                { returning: true, transaction: transactionStub },
            )
            expect(memberPermissionBulkCreate).toHaveBeenCalledWith([{ projectMemberId: 11, permission: 'delete' }], {
                transaction: transactionStub,
            })
        })

        it('fails loudly when no project role exists', async () => {
            getProjectRoles.mockResolvedValue([])

            await expect(service.grantFullAccess(1, 5, transactionStub)).rejects.toThrow(
                new BadRequestException('No project role is configured'),
            )
        })
    })

    describe('getMembershipsForUser', () => {
        it('lists memberships with project name, role and extras', async () => {
            memberFindAll.mockResolvedValue([
                memberRow({ project: { projectId: 1, name: 'Acme' }, permissions: [{ permission: 'delete' }] }),
                memberRow({
                    projectMemberId: 2,
                    projectId: 4,
                    roleId: 7,
                    role: { roleId: 7, name: 'Maintainer' },
                    project: { projectId: 4, name: 'Beta' },
                }),
            ])

            const memberships = await service.getMembershipsForUser(2)

            expect(memberFindAll).toHaveBeenCalledWith({
                where: { userId: 2 },
                include: [{ model: ProjectModel, required: true }, RoleModel, ProjectMemberPermissionModel],
                order: [['projectMemberId', 'ASC']],
            })
            expect(memberships).toEqual([
                { projectId: 1, projectName: 'Acme', role: { roleId: 5, name: 'Viewer' }, permissions: ['delete'] },
                { projectId: 4, projectName: 'Beta', role: { roleId: 7, name: 'Maintainer' }, permissions: [] },
            ])
        })
    })

    describe('countMembershipsPerUser', () => {
        it('counts non-deleted project memberships per user', async () => {
            memberFindAll.mockResolvedValue([
                memberRow({ projectId: 1, userId: 2 }),
                memberRow({ projectMemberId: 2, projectId: 4, userId: 2 }),
                memberRow({ projectMemberId: 3, projectId: 4, userId: 3 }),
            ])

            const counts = await service.countMembershipsPerUser()

            expect(memberFindAll).toHaveBeenCalledWith({
                attributes: ['userId'],
                include: [{ model: ProjectModel, attributes: [], required: true }],
            })
            expect(counts).toEqual(
                new Map([
                    [2, 2],
                    [3, 1],
                ]),
            )
        })
    })

    describe('getImplicitAccess', () => {
        it('rejects members without members.manage', async () => {
            await expect(service.getImplicitAccess(1, readOnlyAbility)).rejects.toThrow(ForbiddenException)
            expect(userCount).not.toHaveBeenCalled()
        })

        it('counts super admins and projects.all holders for member managers', async () => {
            userCount.mockResolvedValueOnce(2).mockResolvedValueOnce(0)

            await expect(service.getImplicitAccess(1, memberManagerAbility)).resolves.toEqual({
                superAdminCount: 2,
                allProjectsUserCount: 0,
            })
        })
    })
})
```

Keep the two detailed `getImplicitAccess` query-shape tests from the current spec (`counts super admins…` with `superAdminQuery` and `skips the all-projects count…`) by pasting them into the new `getImplicitAccess` block; they only need `projectEditorAbility` renamed to `memberManagerAbility`.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter backend exec vitest run src/modules/permission/services/project-member.service.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Rewrite the service**

```ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/sequelize'
import { Sequelize } from 'sequelize-typescript'
import { Op, type Transaction, type WhereOptions } from 'sequelize'
import { ProjectMemberModel } from '../models/project-member.model.js'
import { ProjectMemberPermissionModel } from '../models/project-member-permission.model.js'
import { ProjectModel } from '../../project/models/project.model.js'
import { UserModel } from '../../user/models/user.model.js'
import { RoleModel } from '../models/role.model.js'
import { RolePermissionModel } from '../models/role-permission.model.js'
import { UserPermissionModel } from '../models/user-permission.model.js'
import type { FullUser } from '../../user/interfaces/user.interface.js'
import type { ProjectImplicitAccess } from '../../project/interfaces/project.interface.js'
import { PermissionCacheService } from './permission-cache.service.js'
import { RoleService } from './role.service.js'
import { assertProjectPermission, canOnProject } from '../helpers/project-access.js'
import { assertPermissionChangesHeld, assertRoleGrantable } from '../helpers/permission-grants.js'
import { AppAbility } from '../interfaces/app-ability.js'
import { ProjectMemberGrant, ProjectMemberInfo, ProjectMembership } from '../interfaces/project-member.interface.js'
import { RoleWithPermissions } from '../interfaces/role.interface.js'
import { isProjectPermission, Permission, PROJECT_PERMISSIONS, ProjectPermission } from '../permission.constants.js'

const ALL_PROJECTS_PERMISSION: Permission = 'projects.all'

function projectPermissionsOf(role: RoleWithPermissions): ProjectPermission[] {
    return role.permissions.filter(isProjectPermission)
}

@Injectable()
export class ProjectMemberService {
    constructor(
        @InjectModel(ProjectMemberModel) private readonly memberModel: typeof ProjectMemberModel,
        @InjectModel(ProjectMemberPermissionModel)
        private readonly memberPermissionModel: typeof ProjectMemberPermissionModel,
        @InjectModel(ProjectModel) private readonly projectModel: typeof ProjectModel,
        @InjectModel(UserModel) private readonly userModel: typeof UserModel,
        @InjectModel(RolePermissionModel) private readonly rolePermissionModel: typeof RolePermissionModel,
        @InjectModel(UserPermissionModel) private readonly userPermissionModel: typeof UserPermissionModel,
        private readonly roleService: RoleService,
        private readonly permissionCacheService: PermissionCacheService,
        private readonly sequelize: Sequelize,
    ) {}

    async getMembers(projectId: number, ability: AppAbility): Promise<ProjectMemberInfo[]> {
        await this.assertCanManageMembers(projectId, ability)

        const rows = await this.memberModel.findAll({
            where: { projectId },
            include: [UserModel, RoleModel, ProjectMemberPermissionModel],
            order: [['projectMemberId', 'ASC']],
        })

        return rows.map((row) => ({
            userId: row.userId,
            firstName: row.user!.firstName,
            lastName: row.user!.lastName,
            email: row.user!.email,
            role: { roleId: row.role!.roleId, name: row.role!.name },
            permissions: row.permissions.map((entry) => entry.permission),
        }))
    }

    async getProjectRoles(projectId: number, ability: AppAbility): Promise<RoleWithPermissions[]> {
        await this.assertCanManageMembers(projectId, ability)

        return this.roleService.getProjectRoles()
    }

    async getImplicitAccess(projectId: number, ability: AppAbility): Promise<ProjectImplicitAccess> {
        await this.assertCanManageMembers(projectId, ability)

        const [superAdminCount, allProjectsUserCount] = await Promise.all([
            this.countUsersWithRole({ type: 'super_admin' }),
            this.countNonSuperAdminsWithAllProjects(),
        ])

        return { superAdminCount, allProjectsUserCount }
    }

    async setMember(projectId: number, userId: number, grant: ProjectMemberGrant, ability: AppAbility): Promise<void> {
        await this.assertCanManageMembers(projectId, ability)

        const user = await this.userModel.findByPk(userId)
        if (!user) {
            throw new NotFoundException('Unknown user')
        }

        const role = await this.roleService.findRole(grant.roleId)
        if (!role || role.scope !== 'project') {
            throw new BadRequestException('Unknown project role')
        }

        const isHeld = (permission: ProjectPermission) => canOnProject(ability, permission, projectId)
        const rolePermissions = projectPermissionsOf(role)
        assertRoleGrantable(rolePermissions, isHeld)

        const extras = [...new Set(grant.permissions)].filter((permission) => !rolePermissions.includes(permission))
        const existing = await this.memberModel.findOne({
            where: { projectId, userId },
            include: [ProjectMemberPermissionModel],
        })
        const currentExtras = existing?.permissions.map((entry) => entry.permission) ?? []
        assertPermissionChangesHeld(currentExtras, extras, isHeld)

        await this.sequelize.transaction(async (transaction) => {
            await this.memberModel.destroy({ where: { projectId, userId }, transaction })
            await this.createMembership(projectId, userId, role.roleId, extras, transaction)
        })

        await this.permissionCacheService.invalidateUser(userId)
    }

    async removeMember(projectId: number, userId: number, ability: AppAbility): Promise<void> {
        await this.assertCanManageMembers(projectId, ability)

        await this.memberModel.destroy({ where: { projectId, userId } })
        await this.permissionCacheService.invalidateUser(userId)
    }

    async grantFullAccess(projectId: number, userId: number, transaction: Transaction): Promise<void> {
        const roles = await this.roleService.getProjectRoles()
        if (roles.length === 0) {
            throw new BadRequestException('No project role is configured')
        }

        const covering = roles.find((role) =>
            PROJECT_PERMISSIONS.every((permission) => projectPermissionsOf(role).includes(permission)),
        )
        const role =
            covering ??
            roles.reduce((best, candidate) =>
                projectPermissionsOf(candidate).length > projectPermissionsOf(best).length ? candidate : best,
            )
        const extras = PROJECT_PERMISSIONS.filter((permission) => !projectPermissionsOf(role).includes(permission))

        await this.createMembership(projectId, userId, role.roleId, extras, transaction)
    }

    async getMembershipsForUser(userId: number): Promise<ProjectMembership[]> {
        const rows = await this.memberModel.findAll({
            where: { userId },
            include: [{ model: ProjectModel, required: true }, RoleModel, ProjectMemberPermissionModel],
            order: [['projectMemberId', 'ASC']],
        })

        return rows.map((row) => ({
            projectId: row.projectId,
            projectName: row.project!.name,
            role: { roleId: row.role!.roleId, name: row.role!.name },
            permissions: row.permissions.map((entry) => entry.permission),
        }))
    }

    async countMembershipsPerUser(): Promise<Map<number, number>> {
        const rows = await this.memberModel.findAll({
            attributes: ['userId'],
            include: [{ model: ProjectModel, attributes: [], required: true }],
        })

        const counts = new Map<number, number>()
        for (const row of rows) {
            counts.set(row.userId, (counts.get(row.userId) ?? 0) + 1)
        }

        return counts
    }

    private async createMembership(
        projectId: number,
        userId: number,
        roleId: number,
        extras: ProjectPermission[],
        transaction: Transaction,
    ): Promise<void> {
        const member = await this.memberModel.create({ projectId, userId, roleId }, { returning: true, transaction })
        await this.memberPermissionModel.bulkCreate(
            extras.map((permission) => ({ projectMemberId: member.projectMemberId, permission })),
            { transaction },
        )
    }

    private async countNonSuperAdminsWithAllProjects(): Promise<number> {
        // unchanged from the current implementation
    }

    private countUsersWithRole(
        roleWhere: WhereOptions<RoleModel>,
        userWhere?: WhereOptions<FullUser>,
    ): Promise<number> {
        // unchanged from the current implementation
    }

    private async assertCanManageMembers(projectId: number, ability: AppAbility): Promise<void> {
        const project = await this.projectModel.findByPk(projectId)
        if (!project) {
            throw new NotFoundException('Unknown project')
        }

        if (ability.can('update', 'User')) {
            return
        }

        assertProjectPermission(ability, 'members.manage', projectId)
    }
}
```

Copy the bodies of `countNonSuperAdminsWithAllProjects` and `countUsersWithRole` verbatim from the current file (the `// unchanged` markers above are placeholders for this plan only; the final file has no comments).

- [ ] **Step 4: Run the spec to verify it passes**

Run: `pnpm --filter backend exec vitest run src/modules/permission/services/project-member.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Let `ProjectService.createProject` grant full access through the member service**

In `project.service.ts`:

- Add `import { ProjectMemberService } from '../../permission/services/project-member.service.js'` and inject `private readonly projectMemberService: ProjectMemberService` in the constructor (keep the `ProjectMemberModel` injection for `countMembers`).
- Remove the `PROJECT_PERMISSIONS` import.
- Replace the `if (!hasAllProjects) { await this.projectMemberModel.bulkCreate(...) }` block inside the transaction with:

```ts
if (!hasAllProjects) {
    await this.projectMemberService.grantFullAccess(row.projectId, principal.userId, transaction)
}
```

In `project.service.spec.ts`:

- Add `let grantFullAccess: Mock<ProjectMemberService['grantFullAccess']>`, initialize with `vi.fn<typeof grantFullAccess>().mockResolvedValue(undefined)`, provide `{ provide: ProjectMemberService, useValue: { grantFullAccess } }` (import from `'../../permission/services/project-member.service.js'`).
- Drop `memberBulkCreate` and the `ProjectMember` import plus the `membership()` fixture if nothing else uses them; keep `memberFindAll` for `countMembers`. Update the `countMembers` fixtures to the new row shape `{ projectId, userId }` (one row per membership) — the service only reads those two attributes.
- Rewrite the `createProject` cases:

```ts
it('grants the creator full access when they lack all-projects access', async () => {
    projectCreate.mockResolvedValue(projectRow())

    const created = await service.createProject('Acme', principal)

    expect(projectCreate).toHaveBeenCalledWith({ name: 'Acme' }, { returning: true, transaction: transactionStub })
    expect(grantFullAccess).toHaveBeenCalledWith(1, 5, transactionStub)
    expect(invalidateUser).toHaveBeenCalledWith(5)
    expect(created).toEqual(project)
})

it('skips the membership for holders of all-projects access', async () => {
    hasAllProjectsAccess.mockResolvedValue(true)
    projectCreate.mockResolvedValue(projectRow())

    await service.createProject('Acme', principal)

    expect(grantFullAccess).not.toHaveBeenCalled()
    expect(invalidateUser).not.toHaveBeenCalled()
})

it('does not invalidate the permission cache when granting the membership fails', async () => {
    projectCreate.mockResolvedValue(projectRow())
    grantFullAccess.mockRejectedValue(new Error('constraint violated'))

    await expect(service.createProject('Acme', principal)).rejects.toThrow('constraint violated')
    expect(invalidateUser).not.toHaveBeenCalled()
})
```

and in `rethrows unexpected persistence errors…` replace `expect(memberBulkCreate).not.toHaveBeenCalled()` with `expect(grantFullAccess).not.toHaveBeenCalled()`.

Run: `pnpm --filter backend exec vitest run src/modules/project/services/project.service.spec.ts` → PASS.

- [ ] **Step 6: Verify instead of committing**

`pnpm --filter backend exec prettier --check src/modules/permission/services src/modules/project/services`.

---

### Task 7: Project member endpoints with roles

**Files:**

- Modify: `apps/backend/src/modules/project/dtos/project-member.dto.ts`
- Modify: `apps/backend/src/modules/project/controller/project.controller.ts`
- Modify: `apps/backend/src/modules/project/controller/project.controller.spec.ts`
- Modify: `apps/backend/src/modules/user/dtos/user.dto.ts`
- Modify: `apps/backend/src/route-access.spec.ts`

**Interfaces:**

- Consumes: `ProjectMemberService.getProjectRoles/setMember` (Task 6), `ProjectMemberRoleDto` (Task 5).
- Produces: `ProjectMemberPutDto { roleId: number; permissions?: ProjectPermission[] }`, `ProjectMemberDto.role`, `ProjectRoleDto { roleId, name, description, permissions }`, `GET /project/:projectId/roles` (`getProjectRoles`), `UserMembershipDto.role`.

- [ ] **Step 1: Update the DTOs**

`project-member.dto.ts` — replace `ProjectMemberPutDto` and `ProjectMemberDto`, add `ProjectRoleDto`:

```ts
import { Expose, Type } from 'class-transformer'
import { ApiProperty } from '@nestjs/swagger'
import { IsArray, IsIn, IsInt, IsOptional } from 'class-validator'
import { PROJECT_PERMISSIONS, ProjectPermission } from '../../permission/permission.constants.js'
import { ProjectMemberRoleDto } from '../../permission/dtos/project-member-role.dto.js'
import { ProjectImplicitAccess } from '../interfaces/project.interface.js'

export class ProjectMemberPutDto {
    @Expose()
    @IsInt()
    roleId!: number

    @Expose()
    @IsOptional()
    @IsArray()
    @IsIn(PROJECT_PERMISSIONS, { each: true })
    @ApiProperty({ enum: PROJECT_PERMISSIONS, enumName: 'ProjectPermission', isArray: true, required: false })
    permissions?: ProjectPermission[]
}

export class ProjectMemberDto {
    @Expose()
    userId!: number

    @Expose()
    firstName!: string

    @Expose()
    lastName!: string

    @Expose()
    email!: string

    @Expose()
    @Type(() => ProjectMemberRoleDto)
    role!: ProjectMemberRoleDto

    @Expose()
    @ApiProperty({ enum: PROJECT_PERMISSIONS, enumName: 'ProjectPermission', isArray: true })
    permissions!: ProjectPermission[]
}

export class ProjectRoleDto {
    @Expose()
    roleId!: number

    @Expose()
    name!: string

    @Expose()
    @ApiProperty({ type: String, nullable: true })
    description!: string | null

    @Expose()
    @ApiProperty({ enum: PROJECT_PERMISSIONS, enumName: 'ProjectPermission', isArray: true })
    permissions!: ProjectPermission[]
}
```

Keep `ProjectImplicitAccessDto` as is.

`user.dto.ts` — `UserMembershipDto` gains the role (import `ProjectMemberRoleDto` from `../../permission/dtos/project-member-role.dto.js`):

```ts
export class UserMembershipDto {
    @Expose()
    projectId!: number

    @Expose()
    projectName!: string

    @Expose()
    @Type(() => ProjectMemberRoleDto)
    role!: ProjectMemberRoleDto

    @Expose()
    @ApiProperty({ enum: PROJECT_PERMISSIONS, enumName: 'ProjectPermission', isArray: true })
    permissions!: ProjectPermission[]
}
```

- [ ] **Step 2: Write the failing controller spec additions**

Read `project.controller.spec.ts`. Add `getProjectRoles` and `setMember` to the `ProjectMemberService` mock (`Mock<ProjectMemberService['getProjectRoles']>`, `Mock<ProjectMemberService['setMember']>`; remove `setMemberPermissions`) and add:

```ts
it('serves the project roles for the member dialog', async () => {
    const viewer: RoleWithPermissions = {
        roleId: 5,
        name: 'Viewer',
        scope: 'project',
        type: 'custom',
        description: 'Sees the project',
        permissions: ['read'],
        createdAt: new Date(),
        updatedAt: new Date(),
    }
    getProjectRoles.mockResolvedValue([viewer])

    await expect(controller.getProjectRoles(1, ability)).resolves.toEqual([viewer])
    expect(getProjectRoles).toHaveBeenCalledWith(1, ability)
})

it('stores a member with its role and defaults extras to none', async () => {
    await controller.setProjectMember(1, 2, { roleId: 5 }, ability)
    expect(setMember).toHaveBeenCalledWith(1, 2, { roleId: 5, permissions: [] }, ability)

    await controller.setProjectMember(1, 2, { roleId: 5, permissions: ['delete'] }, ability)
    expect(setMember).toHaveBeenCalledWith(1, 2, { roleId: 5, permissions: ['delete'] }, ability)
})
```

(`RoleWithPermissions` from `'../../permission/interfaces/role.interface.js'`; `ability` is the existing manage-all ability in that spec.) Update the existing `setProjectMember` test to the new body shape if one exists.

- [ ] **Step 3: Update the controller**

In `project.controller.ts`:

- Import `ProjectRoleDto` with the other member DTOs.
- Add after `getProjectImplicitAccess`:

```ts
    @SerializeOptions({ type: ProjectRoleDto })
    @Get(':projectId/roles')
    async getProjectRoles(
        @Param('projectId', ParseIntPipe) projectId: number,
        @CurrentAbility() ability: AppAbility,
    ): Promise<ProjectRoleDto[]> {
        return await this.projectMemberService.getProjectRoles(projectId, ability)
    }
```

- Change `setProjectMember` to:

```ts
await this.projectMemberService.setMember(
    projectId,
    userId,
    { roleId: body.roleId, permissions: body.permissions ?? [] },
    ability,
)
```

- [ ] **Step 4: Run the controller spec**

Run: `pnpm --filter backend exec vitest run src/modules/project/controller/project.controller.spec.ts`
Expected: PASS.

- [ ] **Step 5: Add the route to the access matrix**

In `route-access.spec.ts` after `'GET /project/:projectId/implicit-access'`:

```ts
    'GET /project/:projectId/roles': { guards: jwt, abilities: [], scopedByPrincipal: true },
```

Run: `pnpm --filter backend exec vitest run src/route-access.spec.ts` → PASS.

- [ ] **Step 6: Verify instead of committing**

`pnpm --filter backend exec prettier --check src/modules/project src/modules/user/dtos src/route-access.spec.ts`.

---

### Task 8: User creation with role + extras, role-grantable rule

**Files:**

- Modify: `apps/backend/src/modules/user/interfaces/user.interface.ts`
- Modify: `apps/backend/src/modules/user/dtos/user-create.dto.ts`
- Modify: `apps/backend/src/modules/user/dtos/user-create.dto.spec.ts`
- Modify: `apps/backend/src/modules/user/services/user.service.ts`
- Modify: `apps/backend/src/modules/user/services/user.service.spec.ts`
- Modify: `apps/backend/src/modules/user/controller/user.controller.ts`
- Modify: `apps/backend/src/modules/user/controller/user.controller.spec.ts`

**Interfaces:**

- Consumes: `RoleService.findRole` (Task 4), `holdsPermission`, `assertRoleGrantable`, `assertPermissionChangesHeld`, `isGlobalPermission` (Task 1).
- Produces: `ManagedUserCreate = UserCreate & { permissions: Permission[] }`; `UserService.createManagedUser(user: ManagedUserCreate, principal: UserWithRole, ability: AppAbility): Promise<UserWithRole>`; `UserCreateDto.roleId` required, `UserCreateDto.permissions?: Permission[]`; `POST /user` takes `@CurrentAbility()`.

- [ ] **Step 1: Add the interface and DTO changes**

`user.interface.ts` — after `UserCreate`:

```ts
export type ManagedUserCreate = UserCreate & { permissions: Permission[] }
```

`user-create.dto.ts` — in `UserCreateDto` replace the `roleId` block and append `permissions`:

```ts
    @Expose()
    @IsInt()
    roleId!: number

    @Expose()
    @IsOptional()
    @IsArray()
    @IsIn(GLOBAL_PERMISSIONS, { each: true })
    @ApiProperty({ enum: GLOBAL_PERMISSIONS, enumName: 'Permission', isArray: true, required: false })
    permissions?: Permission[]
```

`user-create.dto.spec.ts` — replace the first two `UserCreateDto` tests:

```ts
const valid = {
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    password: 'correct-horse',
    roleId: 3,
}

it('accepts a user with and without extra permissions', async () => {
    await expect(violations(UserCreateDto, valid)).resolves.toEqual([])
    await expect(violations(UserCreateDto, { ...valid, permissions: ['domains.read'] })).resolves.toEqual([])
})

it('requires names, email, password and role', async () => {
    await expect(violations(UserCreateDto, {})).resolves.toEqual([
        'firstName',
        'lastName',
        'email',
        'password',
        'roleId',
    ])
})

it('rejects permissions outside the global catalog', async () => {
    await expect(violations(UserCreateDto, { ...valid, permissions: ['read'] })).resolves.toEqual(['permissions'])
})
```

Run: `pnpm --filter backend exec vitest run src/modules/user/dtos/user-create.dto.spec.ts` → PASS.

- [ ] **Step 2: Rewrite the `createManagedUser` tests and add the role-grantable cases**

In `user.service.spec.ts`:

- Role fixtures become `RoleWithPermissions` (import it instead of `Role` where permissions are needed):

```ts
const superAdminRole: RoleWithPermissions = {
    roleId: 1,
    name: 'Super Admin',
    scope: 'global',
    type: 'super_admin',
    description: null,
    permissions: [],
    createdAt: new Date(),
    updatedAt: new Date(),
}
const adminRole: RoleWithPermissions = {
    ...superAdminRole,
    roleId: 2,
    name: 'Admin',
    type: 'admin',
    permissions: ['users.read', 'users.create', 'users.update', 'users.delete', 'settings.update'],
}
const userRole: RoleWithPermissions = { ...superAdminRole, roleId: 3, name: 'User', type: 'user' }
const viewerRole: RoleWithPermissions = {
    ...superAdminRole,
    roleId: 5,
    name: 'Viewer',
    scope: 'project',
    type: 'custom',
    permissions: ['read'],
}
```

`UserWithRole.role` is typed `Role`; the fixtures above are assignable (extra `permissions` is fine on a wider object literal assigned through a variable).

- Replace the `getRoleById` mock with `let findRole: Mock<RoleService['findRole']>` initialized `vi.fn<typeof findRole>().mockResolvedValue(userRole)` and provide `{ provide: RoleService, useValue: { findRole, getRoleByType } }`.
- Add `adminAbility` rules for the permissions the admin role carries so the hold rule passes for `adminRole` (extend the existing `adminAbility` with `{ action: 'update', subject: 'Settings' }` and `{ action: 'create', subject: 'User' }` is already there).
- Replace the `createManagedUser` block:

```ts
describe('createManagedUser', () => {
    const input = {
        firstName: 'Grace',
        lastName: 'Hopper',
        email: 'grace@example.com',
        password: 'plain-password',
        roleId: 3,
        permissions: [] as Permission[],
    }

    it('creates the user with the requested role and extras in one transaction', async () => {
        await service.createManagedUser({ ...input, permissions: ['users.read'] }, adminPrincipal, adminAbility)

        expect(findRole).toHaveBeenCalledWith(3)
        expect(create).toHaveBeenCalledWith(expect.objectContaining({ roleId: 3 }), {
            returning: true,
            transaction: transactionStub,
        })
        expect(permissionBulkCreate).toHaveBeenCalledWith([{ userId: 7, permission: 'users.read' }], {
            transaction: transactionStub,
        })
    })

    it('rejects unknown and project-scoped roles', async () => {
        findRole.mockResolvedValueOnce(null).mockResolvedValueOnce(viewerRole)

        await expect(service.createManagedUser(input, adminPrincipal, adminAbility)).rejects.toThrow(
            new BadRequestException('Unknown role'),
        )
        await expect(service.createManagedUser(input, adminPrincipal, adminAbility)).rejects.toThrow(
            new BadRequestException('Unknown role'),
        )
        expect(create).not.toHaveBeenCalled()
    })

    it('blocks non-super-admins from assigning the super admin role', async () => {
        findRole.mockResolvedValue(superAdminRole)

        await expect(service.createManagedUser({ ...input, roleId: 1 }, adminPrincipal, adminAbility)).rejects.toThrow(
            new ForbiddenException('Only super admins can assign the super admin role'),
        )
        expect(create).not.toHaveBeenCalled()
    })

    it('lets super admins assign the super admin role', async () => {
        findRole.mockResolvedValue(superAdminRole)
        findByPk.mockResolvedValue(userRow({ roleId: 1, role: superAdminRole }))

        await expect(
            service.createManagedUser({ ...input, roleId: 1 }, superAdminPrincipal, superAdminAbility),
        ).resolves.toMatchObject({ role: expect.objectContaining({ type: 'super_admin' }) as Role })
    })

    it('blocks roles with permissions the caller does not hold', async () => {
        findRole.mockResolvedValue({ ...adminRole, permissions: ['roles.delete'] })

        await expect(service.createManagedUser({ ...input, roleId: 2 }, adminPrincipal, adminAbility)).rejects.toThrow(
            new ForbiddenException('You cannot assign a role with permissions you do not hold: roles.delete'),
        )
    })

    it('blocks extras the caller does not hold and creates nothing', async () => {
        await expect(
            service.createManagedUser({ ...input, permissions: ['domains.delete'] }, adminPrincipal, adminAbility),
        ).rejects.toThrow(ForbiddenException)
        expect(transaction).not.toHaveBeenCalled()
        expect(create).not.toHaveBeenCalled()
    })

    it('maps duplicate emails to a bad request', async () => {
        create.mockRejectedValue(new UniqueConstraintError({}))

        await expect(service.createManagedUser(input, adminPrincipal, adminAbility)).rejects.toThrow(
            new BadRequestException('Email is already in use'),
        )
    })
})
```

- In the `updateUser` block, every `getRoleById.mockResolvedValue(...)` becomes `findRole.mockResolvedValue(...)`. Add:

```ts
it('blocks a role change to a role with permissions the caller does not hold', async () => {
    findRole.mockResolvedValue({ ...adminRole, permissions: ['roles.delete'] })

    await expect(service.updateUser(7, { roleId: 2 }, adminPrincipal, adminAbility)).rejects.toThrow(ForbiddenException)
})

it('rejects a project role on a user', async () => {
    findRole.mockResolvedValue(viewerRole)

    await expect(service.updateUser(7, { roleId: 5 }, adminPrincipal, adminAbility)).rejects.toThrow(
        new BadRequestException('Unknown role'),
    )
})
```

- [ ] **Step 3: Run the spec to verify it fails**

Run: `pnpm --filter backend exec vitest run src/modules/user/services/user.service.spec.ts`
Expected: FAIL.

- [ ] **Step 4: Update the service**

In `user.service.ts`:

- Imports: add `ManagedUserCreate`, `RoleWithPermissions`, `assertPermissionChangesHeld`, `assertRoleGrantable` (from `../../permission/helpers/permission-grants.js`), `isGlobalPermission`; drop the `Role` import if unused.
- Replace `createManagedUser`:

```ts
    async createManagedUser(
        user: ManagedUserCreate,
        principal: UserWithRole,
        ability: AppAbility,
    ): Promise<UserWithRole> {
        const role = await this.loadGlobalRole(user.roleId)
        this.assertRoleGrantableBy(role, principal, ability)

        const permissions = [...new Set(user.permissions)]
        assertPermissionChangesHeld([], permissions, (permission) => holdsPermission(ability, permission))

        try {
            return await this.sequelize.transaction(async (transaction) => {
                const created = await this.createUser({ ...user, roleId: role.roleId }, transaction)
                await this.userPermissionModel.bulkCreate(
                    permissions.map((permission) => ({ userId: created.userId, permission })),
                    { transaction },
                )

                return created
            })
        } catch (error) {
            if (error instanceof UniqueConstraintError) {
                throw new BadRequestException('Email is already in use')
            }
            throw error
        }
    }
```

- In `updateUser`, replace the role-change block:

```ts
if (update.roleId !== undefined && update.roleId !== target.roleId) {
    const newRole = await this.loadGlobalRole(update.roleId)
    this.assertRoleGrantableBy(newRole, principal, ability)
    if (target.role.type === 'super_admin') {
        await this.assertNotLastSuperAdmin()
    }
    changes.roleId = newRole.roleId
}
```

- Replace `assertPermissionChangesHeld` (private) usages in `replaceUserPermissions` with the shared helper:

```ts
assertPermissionChangesHeld(
    current.map((entry) => entry.permission),
    uniquePermissions,
    (permission) => holdsPermission(ability, permission),
)
```

and delete the private `assertPermissionChangesHeld` and `assertRoleAssignable` methods.

- Add the two private helpers:

```ts
    private async loadGlobalRole(roleId: number): Promise<RoleWithPermissions> {
        const role = await this.roleService.findRole(roleId)
        if (!role || role.scope !== 'global') {
            throw new BadRequestException('Unknown role')
        }

        return role
    }

    private assertRoleGrantableBy(role: RoleWithPermissions, principal: UserWithRole, ability: AppAbility): void {
        if (role.type === 'super_admin' && principal.role.type !== 'super_admin') {
            throw new ForbiddenException('Only super admins can assign the super admin role')
        }

        assertRoleGrantable(role.permissions.filter(isGlobalPermission), (permission) =>
            holdsPermission(ability, permission),
        )
    }
```

`createUser` keeps its explicit field list, so the extra `permissions` key on the spread input never reaches the model.

- [ ] **Step 5: Update the controller and its spec**

`user.controller.ts` — `createUser`:

```ts
    @RequireAbility({ action: 'create', subject: 'User' })
    @ResponseDto(UserDto)
    @Post()
    async createUser(
        @Body() body: UserCreateDto,
        @Principal() principal: UserWithRole,
        @CurrentAbility() ability: AppAbility,
    ): Promise<UserDto> {
        return await this.userService.createManagedUser(
            { ...body, permissions: body.permissions ?? [] },
            principal,
            ability,
        )
    }
```

`user.controller.spec.ts` — the role fixture gains `scope: 'global'` and `description: null`; find the `createUser` test and assert `createManagedUser` was called with `{ ...body, permissions: [] }`, `principal`, `ability` (add `ability` as the third argument where the controller is invoked; add a second case with `permissions: ['domains.read']` passed through).

- [ ] **Step 6: Run the user specs**

Run: `pnpm --filter backend exec vitest run src/modules/user`
Expected: PASS (service, controller, DTO, mapper).

- [ ] **Step 7: Verify instead of committing**

`pnpm --filter backend exec prettier --check src/modules/user`.

---

### Task 9: `GET /auth/permissions`

**Files:**

- Create: `apps/backend/src/modules/auth/dtos/auth-permissions.dto.ts`
- Modify: `apps/backend/src/modules/auth/controller/auth.controller.ts`
- Modify: `apps/backend/src/modules/auth/controller/auth.controller.spec.ts`
- Modify: `apps/backend/src/route-access.spec.ts`

**Interfaces:**

- Consumes: `heldPermissions`, `heldProjectPermissionsEverywhere` (Task 1).
- Produces: `AuthPermissionsDto { permissions: Permission[]; projectPermissions: ProjectPermission[] }`, `AuthController.getHeldPermissions(ability)`, operationId `getHeldPermissions`.

- [ ] **Step 1: Write the failing controller test**

Append to `auth.controller.spec.ts` (inside the `describe`):

```ts
it('lists the permissions the caller holds unconditionally', () => {
    const superAdmin = createMongoAbility<AppAbility>([{ action: 'manage', subject: 'all' }])
    const member = createMongoAbility<AppAbility>([
        { action: 'read', subject: 'Domain' },
        { action: 'read', subject: 'Project', conditions: { projectId: { $in: [1] } } },
    ])

    expect(controller.getHeldPermissions(superAdmin).permissions).toContain('roles.delete')
    expect(controller.getHeldPermissions(superAdmin).projectPermissions).toEqual([
        'read',
        'update',
        'delete',
        'forms.manage',
        'api_keys.manage',
        'members.manage',
    ])
    expect(controller.getHeldPermissions(member)).toEqual({ permissions: ['domains.read'], projectPermissions: [] })
})
```

Run: `pnpm --filter backend exec vitest run src/modules/auth/controller/auth.controller.spec.ts` → FAIL.

- [ ] **Step 2: Add the DTO and the endpoint**

`auth-permissions.dto.ts`:

```ts
import { Expose } from 'class-transformer'
import { ApiProperty } from '@nestjs/swagger'
import { GLOBAL_PERMISSIONS, PROJECT_PERMISSIONS } from '../../permission/permission.constants.js'
import type { Permission, ProjectPermission } from '../../permission/permission.constants.js'
import { heldPermissions, heldProjectPermissionsEverywhere } from '../../permission/helpers/holds-permission.js'
import type { AppAbility } from '../../permission/interfaces/app-ability.js'

export class AuthPermissionsDto {
    @Expose()
    @ApiProperty({ enum: GLOBAL_PERMISSIONS, enumName: 'Permission', isArray: true })
    permissions!: Permission[]

    @Expose()
    @ApiProperty({ enum: PROJECT_PERMISSIONS, enumName: 'ProjectPermission', isArray: true })
    projectPermissions!: ProjectPermission[]

    static fromAbility(ability: AppAbility): AuthPermissionsDto {
        return {
            permissions: heldPermissions(ability),
            projectPermissions: heldProjectPermissionsEverywhere(ability),
        }
    }
}
```

`auth.controller.ts` — import `AuthPermissionsDto` and add after `getAbility`:

```ts
    @JwtAuth()
    @ResponseDto(AuthPermissionsDto)
    @Get('permissions')
    getHeldPermissions(@CurrentAbility() ability: AppAbility): AuthPermissionsDto {
        return AuthPermissionsDto.fromAbility(ability)
    }
```

Run the auth controller spec → PASS.

- [ ] **Step 3: Add the matrix entry**

In `route-access.spec.ts` after `'GET /auth/ability'`:

```ts
    'GET /auth/permissions': { guards: jwt, abilities: [], scopedByPrincipal: true },
```

Run: `pnpm --filter backend exec vitest run src/route-access.spec.ts` → PASS.

- [ ] **Step 4: Verify instead of committing**

`pnpm --filter backend exec prettier --check src/modules/auth src/route-access.spec.ts`.

---

### Task 10: Finer project permissions in the form and API-key services

**Files:**

- Modify: `apps/backend/src/modules/inbound-form/services/inbound-form.service.ts`
- Modify: `apps/backend/src/modules/inbound-form/services/inbound-form.service.spec.ts`
- Modify: `apps/backend/src/modules/inbound-form/controller/inbound-form.controller.ts`
- Modify: `apps/backend/src/modules/inbound-form/controller/inbound-form.controller.spec.ts`
- Modify: `apps/backend/src/modules/api-key/services/api-key.service.ts`
- Modify: `apps/backend/src/modules/api-key/services/api-key.service.spec.ts`

**Interfaces:**

- Consumes: `assertProjectPermission` (Task 1).
- Produces: form mutations gated by `forms.manage`, API-key create/revoke by `api_keys.manage`; `InboundFormService.getReceiver(inboundFormId, inboundFormReceiverId, ability, permission: 'read' | 'forms.manage' = 'read')`.

- [ ] **Step 1: Add failing cases to the form service spec**

In `inbound-form.service.spec.ts` add next to `readOnlyAbility`:

```ts
const formEditorAbility = createMongoAbility<AppAbility>([
    { action: 'read', subject: 'Project', conditions: { projectId: { $in: [5] } } },
    { action: 'forms.manage', subject: 'Project', conditions: { projectId: { $in: [5] } } },
])
const projectUpdaterAbility = createMongoAbility<AppAbility>([
    { action: 'read', subject: 'Project', conditions: { projectId: { $in: [5] } } },
    { action: 'update', subject: 'Project', conditions: { projectId: { $in: [5] } } },
])
```

and, in the `createForm` and `deleteForm` describes (read the file to match their fixtures and mocks), add:

```ts
it('lets form editors create forms and keeps project updaters out', async () => {
    await expect(service.createForm(createRequest, formEditorAbility)).resolves.toBeDefined()
    await expect(service.createForm(createRequest, projectUpdaterAbility)).rejects.toThrow(ForbiddenException)
})
```

```ts
it('requires forms.manage to delete a form', async () => {
    await expect(service.deleteForm(9, formEditorAbility)).resolves.toBeUndefined()
    await expect(service.deleteForm(9, projectUpdaterAbility)).rejects.toThrow(ForbiddenException)
})
```

(`createRequest` is whatever fixture the existing `createForm` tests pass; `9` is whatever form id their `loadForm` mock resolves — adapt to the file.)

Run: `pnpm --filter backend exec vitest run src/modules/inbound-form/services/inbound-form.service.spec.ts` → FAIL (editors are rejected, updaters pass).

- [ ] **Step 2: Switch the form service to `forms.manage`**

In `inbound-form.service.ts`:

- Replace the import of `assertProjectReadable, assertProjectUpdatable` with `assertProjectPermission, assertProjectReadable`.
- `createForm`: `assertProjectPermission(ability, 'forms.manage', create.projectId)`.
- `loadFormChecked(inboundFormId, ability, permission: 'read' | 'forms.manage')` body:

```ts
const form = await this.loadForm(inboundFormId)
if (permission === 'read') {
    assertProjectReadable(ability, form.projectId)
} else {
    assertProjectPermission(ability, 'forms.manage', form.projectId)
}

return form
```

- Every `loadFormChecked(…, 'update')` call becomes `loadFormChecked(…, 'forms.manage')` (updateForm, deleteForm, replaceFields, replaceSecurity, createReceiver, updateReceiver, deleteReceiver).
- `getReceiver(…, permission: 'read' | 'forms.manage' = 'read')`.

In `inbound-form.controller.ts` the two template routes call `getReceiver(inboundFormId, inboundFormReceiverId, ability, 'forms.manage')`; update the two `toHaveBeenCalledWith(1, 31, manageAll, 'update')` expectations in `inbound-form.controller.spec.ts` to `'forms.manage'`.

Run: `pnpm --filter backend exec vitest run src/modules/inbound-form` → PASS.

- [ ] **Step 3: Switch API keys to `api_keys.manage`**

`api-key.service.spec.ts` — rename `updater` to `keyManager` with `{ action: 'api_keys.manage', subject: 'Project', conditions: { projectId: { $in: [3] } } }` instead of `update`, and add a `projectUpdater` ability (read + update on 3) with a test:

```ts
it('does not let project updaters without api_keys.manage create keys', async () => {
    await expect(service.createKey(3, 'Newsletter', principal, projectUpdater)).rejects.toThrow(ForbiddenException)
})
```

`api-key.service.ts` — `createKey` and `revokeKey` call `assertProjectPermission(ability, 'api_keys.manage', projectId)` (import it instead of `assertProjectUpdatable`); `listKeys` keeps `assertProjectReadable`.

Run: `pnpm --filter backend exec vitest run src/modules/api-key` → PASS.

- [ ] **Step 4: Whole-backend unit gate**

Run: `pnpm --filter backend test` and `pnpm --filter backend typecheck` and `pnpm --filter backend lint`
Expected: all green. Fix any remaining fallout from the interface changes (e.g. `setup.service.spec.ts` role fixtures needing `scope`/`description`, `jwt.strategy.spec.ts`, `user.mapper.spec.ts`).

- [ ] **Step 5: Verify instead of committing**

`pnpm --filter backend exec prettier --check src`.

---

### Task 11: Backend e2e suite, `role.e2e-spec.ts`, client regeneration, README

**Files:**

- Modify: `apps/backend/test/support/session.ts`
- Modify: `apps/backend/test/permission.e2e-spec.ts`
- Modify: `apps/backend/test/user.e2e-spec.ts`
- Modify: `apps/backend/test/project.e2e-spec.ts`
- Modify: `apps/backend/test/inbound-form-management.e2e-spec.ts`
- Modify: `apps/backend/test/public-send.e2e-spec.ts`
- Create: `apps/backend/test/role.e2e-spec.ts`
- Modify: `README.md`
- Generated: `packages/api/assets/openapi.json`, `packages/api/dist/**`

**Interfaces:**

- Consumes: everything from Tasks 1–10.
- Produces: `seedUser`, `login` unchanged; new `globalRoleId(app, type)` and `projectRoleId(app, name)` helpers; regenerated `api` package exposing `RoleApi.getRole/createRole/updateRole/deleteRole`, `ProjectApi.getProjectRoles`, `AuthApi.getHeldPermissions`, types `RoleDto` (with `scope`, `description`, `assignmentCount`), `RoleCreateDto`, `RoleUpdateDto`, `ProjectRoleDto`, `ProjectMemberPutDto { roleId, permissions? }`, `ProjectMemberDto.role`, `UserMembershipDto.role`, `UserCreateDto.permissions?`, `AuthPermissionsDto`, `CatalogPermission`, `RoleScope`.

- [ ] **Step 1: Add role lookup helpers to `test/support/session.ts`**

```ts
export async function globalRoleId(app: INestApplication, type: RoleType): Promise<number> {
    return (await app.get(RoleService).getRoleByType(type)).roleId
}

export async function projectRoleId(app: INestApplication, name: string): Promise<number> {
    const role = (await app.get(RoleService).getProjectRoles()).find((candidate) => candidate.name === name)
    if (!role) {
        throw new Error(`No project role named "${name}"`)
    }
    return role.roleId
}
```

- [ ] **Step 2: Adapt `permission.e2e-spec.ts`**

Read the whole file. Changes:

- Declare `let userRoleId: number`, `let viewerRoleId: number`, `let maintainerRoleId: number`; in `beforeAll` after `superUserId` add `userRoleId = await globalRoleId(app, 'user')`, `viewerRoleId = await projectRoleId(app, 'Viewer')`, `maintainerRoleId = await projectRoleId(app, 'Maintainer')`.
- `exposes the seeded roles`: type the body as `{ roleId; type; scope: string; permissions: string[] }[]`; assert `roles.filter((role) => role.scope === 'global')` has length 3 and `roles.filter((role) => role.scope === 'project').map((role) => role.name).sort()` equals `['Editor', 'Maintainer', 'Owner', 'Viewer']`; keep the Admin/`projects.all` assertion and add `expect(adminRole.permissions).toContain('roles.update')`.
- Every `POST /api/user` body gains `roleId: userRoleId` (the three creations: member, other, manager).
- `grants read access through a membership`: body `{ roleId: viewerRoleId }`.
- `applies membership upgrades immediately`: body `{ roleId: maintainerRoleId }`.
- `lets project editors manage members`: member (now Maintainer) assigns `{ roleId: viewerRoleId }` to `otherUserId`; rename the test to `lets member managers add members`.
- Add after it:

```ts
it('caps member managers at the project permissions they hold', async () => {
    const ownerRoleId = await projectRoleId(app, 'Owner')

    await http()
        .put(`/api/project/${projectId}/members/${otherUserId}`)
        .set('Authorization', asMember())
        .send({ roleId: ownerRoleId })
        .expect(403)
    await http()
        .put(`/api/project/${projectId}/members/${otherUserId}`)
        .set('Authorization', asMember())
        .send({ roleId: viewerRoleId, permissions: ['delete'] })
        .expect(403)

    const members = await http().get(`/api/project/${projectId}/members`).set('Authorization', asMember()).expect(200)
    const other = (members.body as { userId: number; role: { name: string }; permissions: string[] }[]).find(
        (entry) => entry.userId === otherUserId,
    )!
    expect(other.role.name).toBe('Viewer')
    expect(other.permissions).toEqual([])
})
```

- `shields super admins from admins`: unchanged except the `POST /api/user` bodies already carry `roleId`.
- `serves the caller ability rules`: add `expect(rules.some((rule) => rule.subject === 'Project' && rule.action.includes('members.manage'))).toBe(true)`.

- [ ] **Step 3: Adapt `user.e2e-spec.ts`**

- `UserDetailBody.memberships` → `{ projectId: number; projectName: string; role: { roleId: number; name: string }; permissions: string[] }[]`; `RoleBody` gains `scope: string`.
- `GET /role` test: `expect(roles.filter((role) => role.scope === 'global').map((role) => role.type).sort()).toEqual(['admin', 'super_admin', 'user'])`; keep the rest.
- `POST /user` "creates a user" and "rejects a duplicate email" bodies add `roleId: userRoleId`; the `it.each` list gains `['a missing role', { firstName: 'A', lastName: 'B', email: 'user-e2e.norole2@example.com', password }]`.
- `counts the distinct…memberships`: `ownerRoleId = await projectRoleId(app, 'Owner')`, `viewerRoleId = await projectRoleId(app, 'Viewer')`; bodies `{ roleId: ownerRoleId }` and `{ roleId: viewerRoleId }`.
- `returns the user detail with permissions and memberships`: unchanged (`memberships: []`).
- Add to `POST /user` describe:

```ts
it('stores extra permissions atomically and rejects ones the caller does not hold', async () => {
    const response = await http()
        .post('/api/user')
        .set('Authorization', bearer(superToken))
        .send({
            firstName: 'Extra',
            lastName: 'Person',
            email: 'user-e2e.extra@example.com',
            password,
            roleId: userRoleId,
            permissions: ['domains.read'],
        })
        .expect(201)
    const detail = await http()
        .get(`/api/user/${(response.body as UserBody).userId}`)
        .set('Authorization', bearer(superToken))
        .expect(200)
    expect((detail.body as UserDetailBody).permissions).toEqual(['domains.read'])

    await http()
        .post('/api/user')
        .set('Authorization', bearer(memberToken))
        .send({
            firstName: 'Nope',
            lastName: 'Person',
            email: 'user-e2e.nope@example.com',
            password,
            roleId: userRoleId,
            permissions: ['domains.read'],
        })
        .expect(403)
})
```

(the member user has no `users.create`, so this 403 comes from the guard; to exercise the hold rule, grant the member `users.read` + `users.create` first via `PUT /api/user/:id/permissions` as super admin, re-login, and then expect 403 for `permissions: ['domains.read']` and 201 for `permissions: []`).

- [ ] **Step 4: Adapt `project.e2e-spec.ts`, `inbound-form-management.e2e-spec.ts`, `public-send.e2e-spec.ts`**

- `project.e2e-spec.ts` `adds, lists and removes project members`: `{ permissions: ['owner'] }` → `{ roleId: 999_999 }` (still 400); `{ permissions: ['read', 'update'] }` → `{ roleId: await projectRoleId(app, 'Maintainer') }`; expectation `expect.objectContaining({ userId: memberUserId, email: memberCredentials.email, role: expect.objectContaining({ name: 'Maintainer' }) as object, permissions: [] })`. The validation `it.each` rows that send member bodies (around lines 479–497) keep working because they test param parsing; if any sends `{ permissions: [...] }`, change it to `{ roleId: 1 }`.
- `inbound-form-management.e2e-spec.ts` line ~150: `.send({ roleId: await projectRoleId(app, 'Viewer') })`.
- `public-send.e2e-spec.ts` line ~101: same.
- Import `projectRoleId` from `./support/session.js` in each.

- [ ] **Step 5: Write `test/role.e2e-spec.ts`**

```ts
import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApp } from './support/app.js'
import { globalRoleId, login, projectRoleId, seedUser, type Credentials } from './support/session.js'

interface RoleBody {
    roleId: number
    name: string
    scope: string
    type: string
    description: string | null
    permissions: string[]
    assignmentCount: number
}

describe('Roles (e2e)', () => {
    let app: INestApplication<App>
    let superToken: string
    let managerToken: string
    let managerUserId: number
    let customRoleId: number
    let viewerRoleId: number

    const password = 'correct-horse-battery-staple'
    const superCredentials: Credentials = { email: 'role-e2e.super@example.com', password }
    const managerCredentials: Credentials = { email: 'role-e2e.manager@example.com', password }

    const http = () => request(app.getHttpServer())
    const bearer = (token: string) => `Bearer ${token}`

    beforeAll(async () => {
        app = await createTestApp()
        await seedUser(app, superCredentials)
        await seedUser(app, managerCredentials, 'user')
        superToken = await login(app, superCredentials)
        viewerRoleId = await projectRoleId(app, 'Viewer')

        const users = await http().get('/api/user').set('Authorization', bearer(superToken)).expect(200)
        managerUserId = (users.body as { userId: number; email: string }[]).find(
            (user) => user.email === managerCredentials.email,
        )!.userId
        await http()
            .put(`/api/user/${managerUserId}/permissions`)
            .set('Authorization', bearer(superToken))
            .send({ permissions: ['roles.read', 'roles.create', 'roles.update', 'roles.delete', 'users.read'] })
            .expect(200)
        managerToken = await login(app, managerCredentials)
    })

    afterAll(async () => {
        await app?.close()
    })

    it('lists roles of both scopes with assignment counts', async () => {
        const response = await http().get('/api/role').set('Authorization', bearer(managerToken)).expect(200)
        const roles = response.body as RoleBody[]

        expect(roles.find((role) => role.type === 'user')!.assignmentCount).toBeGreaterThanOrEqual(1)
        expect(roles.find((role) => role.name === 'Viewer')).toMatchObject({ scope: 'project', permissions: ['read'] })
    })

    it('creates a global role limited to the permissions the caller holds', async () => {
        await http()
            .post('/api/role')
            .set('Authorization', bearer(managerToken))
            .send({ name: 'Auditor', scope: 'global', permissions: ['users.read', 'users.delete'] })
            .expect(403)

        const created = await http()
            .post('/api/role')
            .set('Authorization', bearer(managerToken))
            .send({ name: 'Auditor', scope: 'global', description: 'Reads users', permissions: ['users.read'] })
            .expect(201)
        customRoleId = (created.body as RoleBody).roleId
        expect(created.body).toMatchObject({ name: 'Auditor', scope: 'global', type: 'custom', assignmentCount: 0 })

        await http()
            .post('/api/role')
            .set('Authorization', bearer(superToken))
            .send({ name: 'Auditor', scope: 'global', permissions: [] })
            .expect(400)
        await http()
            .post('/api/role')
            .set('Authorization', bearer(superToken))
            .send({ name: 'Auditor', scope: 'project', permissions: ['read'] })
            .expect(201)
    })

    it('requires read on project roles and rejects foreign permissions', async () => {
        await http()
            .post('/api/role')
            .set('Authorization', bearer(superToken))
            .send({ name: 'Broken', scope: 'project', permissions: ['delete'] })
            .expect(400)
        await http()
            .post('/api/role')
            .set('Authorization', bearer(superToken))
            .send({ name: 'Broken', scope: 'project', permissions: ['read', 'users.read'] })
            .expect(400)
    })

    it('keeps project role edits behind unconditional project permissions', async () => {
        await http()
            .patch(`/api/role/${viewerRoleId}`)
            .set('Authorization', bearer(managerToken))
            .send({ permissions: ['read', 'delete'] })
            .expect(403)
        await http()
            .patch(`/api/role/${viewerRoleId}`)
            .set('Authorization', bearer(managerToken))
            .send({ description: 'Looks around' })
            .expect(200)
    })

    it('applies role permission changes to existing sessions', async () => {
        await http()
            .patch(`/api/user/${managerUserId}`)
            .set('Authorization', bearer(superToken))
            .send({ roleId: customRoleId })
            .expect(200)
        await http().get('/api/domain').set('Authorization', bearer(managerToken)).expect(403)

        await http()
            .patch(`/api/role/${customRoleId}`)
            .set('Authorization', bearer(superToken))
            .send({ permissions: ['users.read', 'domains.read'] })
            .expect(200)

        await http().get('/api/domain').set('Authorization', bearer(managerToken)).expect(200)
    })

    it('refuses to delete an assigned role and the super admin role', async () => {
        const assigned = await http().delete(`/api/role/${customRoleId}`).set('Authorization', bearer(superToken))
        expect(assigned.status).toBe(400)
        expect((assigned.body as { message: string }).message).toContain('1 users')

        const superAdminRoleId = await globalRoleId(app, 'super_admin')
        await http().delete(`/api/role/${superAdminRoleId}`).set('Authorization', bearer(superToken)).expect(403)
        await http()
            .patch(`/api/role/${superAdminRoleId}`)
            .set('Authorization', bearer(superToken))
            .send({ name: 'Root' })
            .expect(403)
    })

    it('deletes an unassigned role and answers unknown roles with 404', async () => {
        const userRoleId = await globalRoleId(app, 'user')
        await http()
            .patch(`/api/user/${managerUserId}`)
            .set('Authorization', bearer(superToken))
            .send({ roleId: userRoleId })
            .expect(200)

        await http().delete(`/api/role/${customRoleId}`).set('Authorization', bearer(superToken)).expect(200)
        await http().get(`/api/role/${customRoleId}`).set('Authorization', bearer(superToken)).expect(404)
    })

    it('reports what the caller holds', async () => {
        const response = await http().get('/api/auth/permissions').set('Authorization', bearer(superToken)).expect(200)
        expect(response.body).toMatchObject({
            projectPermissions: ['read', 'update', 'delete', 'forms.manage', 'api_keys.manage', 'members.manage'],
        })
        expect((response.body as { permissions: string[] }).permissions).toContain('roles.create')
    })
})
```

Note the manager keeps `users.read` as a direct grant, so after the role switch to Auditor they still see `/api/user` where needed; the direct grants are untouched by role changes.

- [ ] **Step 6: Run the whole e2e suite**

Run: `pnpm --filter backend test:e2e`
Expected: PASS. The `openapi.e2e-spec.ts` snapshot (if it pins the document) will need regenerating per its own instructions.

- [ ] **Step 7: Regenerate the typed client**

Run: `pnpm --filter backend generate` then `pnpm --filter api build`
Expected: `packages/api/assets/openapi.json` contains `/api/role/{roleId}`, `/api/project/{projectId}/roles`, `/api/auth/permissions`; `packages/api/dist` exports `RoleApi.createRole`, `ProjectApi.getProjectRoles`, `AuthApi.getHeldPermissions`, types `CatalogPermission`, `RoleScope`, `AuthPermissionsDto`, `ProjectRoleDto`.

- [ ] **Step 8: README**

In `README.md` line 16 replace the "Users & permissions" bullet with:

```md
- **Users, roles & permissions.** Global roles (Super Admin, Admin, User and custom ones) carry global permissions; project roles (Viewer, Editor, Maintainer, Owner and custom ones) carry project permissions (`read`, `update`, `delete`, `forms.manage`, `api_keys.manage`, `members.manage`). Users get a global role plus optional extra permissions, project members get a project role plus optional extras, and nobody can grant more than they hold. Roles are managed under Administration → Roles. Access checks use CASL on both the backend and the frontend.
```

Remove the "Role editor" todo (line ~135).

- [ ] **Step 9: Verify instead of committing**

`pnpm --filter backend lint && pnpm --filter backend typecheck && pnpm --filter api build`.

---

### Task 12: Animated `DisclosureBox` and frontend fixtures

**Files:**

- Modify: `apps/frontend/src/components/DisclosureBox.vue`
- Create: `apps/frontend/src/components/__tests__/DisclosureBox.spec.ts`
- Modify: `apps/frontend/src/__tests__/fixtures.ts`
- Modify: `apps/frontend/src/modules/users/views/__tests__/userFixtures.ts`
- Create: `apps/frontend/src/modules/roles/__tests__/roleFixtures.ts`

**Interfaces:**

- Consumes: regenerated `api` types (Task 11).
- Produces: `DisclosureBox` props `{ summary: string; defaultOpen?: boolean }`, collapsed by default, `<button aria-expanded aria-controls>` + `VExpandTransition`; fixtures `member()` (with `role`), `projectRoles()`, `roles` (global `RoleDto[]` with `scope`/`description`/`assignmentCount`), `userDetail()` memberships with `role`, `roleFixtures.ts` exporting `globalRoles`, `projectRoleSummaries`, `heldAll()`, `heldNone()`.

- [ ] **Step 1: Write the failing `DisclosureBox` spec**

```ts
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import DisclosureBox from '../DisclosureBox.vue'
import { mountView } from '@/__tests__/support.ts'

function mountBox(props: { defaultOpen?: boolean } = {}) {
    return mountView(DisclosureBox, {
        props: { summary: 'Advanced', ...props },
        slots: { default: '<input name="inner" />' },
    })
}

describe('DisclosureBox', () => {
    it('starts collapsed and announces its state', () => {
        const wrapper = mountBox()
        const toggle = wrapper.get('button')

        expect(toggle.text()).toContain('Advanced')
        expect(toggle.attributes('aria-expanded')).toBe('false')
        expect(wrapper.find('input[name="inner"]').exists()).toBe(false)
    })

    it('expands on click and collapses again', async () => {
        const wrapper = mountBox()
        const toggle = wrapper.get('button')

        await toggle.trigger('click')
        await nextTick()
        expect(toggle.attributes('aria-expanded')).toBe('true')
        expect(toggle.attributes('aria-controls')).toBe(wrapper.get('.disclosure-box__content').attributes('id'))
        expect(wrapper.find('input[name="inner"]').exists()).toBe(true)

        await toggle.trigger('click')
        await nextTick()
        expect(toggle.attributes('aria-expanded')).toBe('false')
    })

    it('can start open', () => {
        const wrapper = mountBox({ defaultOpen: true })

        expect(wrapper.find('input[name="inner"]').exists()).toBe(true)
    })
})
```

Run: `pnpm --filter frontend exec vitest run src/components/__tests__/DisclosureBox.spec.ts` → FAIL (no button).

- [ ] **Step 2: Rebuild the component**

```vue
<template>
    <div class="disclosure-box">
        <button
            type="button"
            class="disclosure-box__summary"
            :aria-expanded="open"
            :aria-controls="contentId"
            @click="open = !open"
        >
            <VIcon
                :icon="mdiChevronRight"
                size="18"
                class="disclosure-box__chevron"
                :class="{ 'disclosure-box__chevron--open': open }"
                aria-hidden="true"
            />
            {{ summary }}
        </button>
        <VExpandTransition>
            <div v-if="open" :id="contentId" class="disclosure-box__content">
                <slot />
            </div>
        </VExpandTransition>
    </div>
</template>

<script setup lang="ts">
    import { ref, useId } from 'vue'
    import { mdiChevronRight } from '@mdi/js'

    const props = withDefaults(defineProps<{ summary: string; defaultOpen?: boolean }>(), { defaultOpen: false })

    const open = ref(props.defaultOpen)
    const contentId = useId()
</script>

<style scoped>
    .disclosure-box__summary {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 0;
        border: 0;
        background: none;
        color: rgb(var(--v-theme-ink));
        font: inherit;
        font-size: 0.8125rem;
        font-weight: 500;
        line-height: 1.25rem;
        cursor: pointer;
    }

    .disclosure-box__summary:focus-visible {
        outline: 2px solid rgb(var(--v-theme-focus));
        outline-offset: 2px;
        border-radius: 4px;
    }

    .disclosure-box__chevron {
        color: rgb(var(--v-theme-ink-muted));
        transition: transform 0.12s ease;
    }

    .disclosure-box__chevron--open {
        transform: rotate(90deg);
    }

    .disclosure-box__content {
        padding-top: 12px;
    }
</style>
```

The global `@media (prefers-reduced-motion: reduce)` rule in `src/styles/main.scss` already zeroes Vuetify transition durations, so nothing else is needed for reduced motion. Run the spec → PASS. Also run `pnpm --filter frontend exec vitest run src/components/__tests__/DnsRecord.spec.ts src/modules/inbound-forms` to confirm the two existing usages still pass.

- [ ] **Step 3: Update shared fixtures**

`src/__tests__/fixtures.ts`:

- Add `ProjectRoleDto` to the type import.
- `member()` becomes:

```ts
export function member(overrides: Partial<ProjectMemberDto> = {}): ProjectMemberDto {
    return {
        userId: 2,
        firstName: 'Lisa',
        lastName: 'Schneider',
        email: 'lisa@acme.com',
        role: { roleId: 7, name: 'Maintainer' },
        permissions: [],
        ...overrides,
    }
}

export function projectRoles(): ProjectRoleDto[] {
    return [
        { roleId: 5, name: 'Viewer', description: 'Sees the project, its forms and sent mail.', permissions: ['read'] },
        {
            roleId: 6,
            name: 'Editor',
            description: 'Builds forms and templates.',
            permissions: ['read', 'forms.manage'],
        },
        {
            roleId: 7,
            name: 'Maintainer',
            description: 'Runs the project day to day: forms, API keys, members and domains.',
            permissions: ['read', 'update', 'forms.manage', 'api_keys.manage', 'members.manage'],
        },
        {
            roleId: 8,
            name: 'Owner',
            description: 'Everything, including deleting the project.',
            permissions: ['read', 'update', 'delete', 'forms.manage', 'api_keys.manage', 'members.manage'],
        },
    ]
}
```

`src/modules/users/views/__tests__/userFixtures.ts`:

```ts
export const roles: RoleDto[] = [
    {
        roleId: 1,
        type: 'super_admin',
        scope: 'global',
        name: 'Super Admin',
        description: 'Every permission, including changing other Super admins',
        permissions: [],
        assignmentCount: 1,
    },
    {
        roleId: 2,
        type: 'admin',
        scope: 'global',
        name: 'Admin',
        description: "Every permission, but can't change Super admins",
        permissions: ['domains.read', 'projects.all'],
        assignmentCount: 1,
    },
    {
        roleId: 3,
        type: 'user',
        scope: 'global',
        name: 'User',
        description: 'No permissions of its own; add them per user or through project memberships',
        permissions: [],
        assignmentCount: 2,
    },
]
```

and in `userDetail()` the membership becomes `{ projectId: 1, projectName: 'Acme Website', role: { roleId: 7, name: 'Maintainer' }, permissions: ['delete'] }`.

`src/modules/roles/__tests__/roleFixtures.ts`:

```ts
import type { AuthPermissionsDto, Permission, ProjectPermission, RoleDto } from 'api'
import { roles as globalRoles } from '@/modules/users/views/__tests__/userFixtures.ts'
import { projectRoles } from '@/__tests__/fixtures.ts'

export { globalRoles }

export const ALL_PERMISSIONS: Permission[] = [
    'domains.read',
    'domains.create',
    'domains.update',
    'domains.delete',
    'projects.create',
    'projects.all',
    'bounces.read',
    'bounces.block',
    'bounces.unblock',
    'settings.read',
    'settings.update',
    'users.read',
    'users.create',
    'users.update',
    'users.delete',
    'roles.read',
    'roles.create',
    'roles.update',
    'roles.delete',
]

export const ALL_PROJECT_PERMISSIONS: ProjectPermission[] = [
    'read',
    'update',
    'delete',
    'forms.manage',
    'api_keys.manage',
    'members.manage',
]

export function projectRoleSummaries(): RoleDto[] {
    return projectRoles().map((role, index) => ({
        ...role,
        scope: 'project',
        type: 'custom',
        assignmentCount: index,
    }))
}

export function allRoles(): RoleDto[] {
    return [...globalRoles, ...projectRoleSummaries()]
}

export function heldAll(): AuthPermissionsDto {
    return { permissions: ALL_PERMISSIONS, projectPermissions: ALL_PROJECT_PERMISSIONS }
}

export function heldNone(): AuthPermissionsDto {
    return { permissions: [], projectPermissions: [] }
}

export function heldOnly(permissions: Permission[], projectPermissions: ProjectPermission[] = []): AuthPermissionsDto {
    return { permissions, projectPermissions }
}
```

- [ ] **Step 4: Typecheck the fixtures**

Run: `pnpm --filter frontend typecheck`
Expected: errors only in files later tasks rewrite (`ProjectMemberDialog`, `ProjectMembersCard`, `UserMembershipsCard`, their specs, `useProjectMemberSetMutation`). Note them; they must be gone after Task 15.

---

### Task 13: Held-permissions query, roles queries/mutations, catalog and `PermissionGrid`

**Files:**

- Create: `apps/frontend/src/modules/auth/queries/useAuthPermissionsQuery.ts`, `__tests__/useAuthPermissionsQuery.spec.ts`
- Modify: `apps/frontend/src/modules/auth/mutations/useLoginMutation.ts`
- Modify: `apps/frontend/src/modules/users/mutations/useUserUpdateMutation.ts`, `useUserPermissionsMutation.ts` (+ specs)
- Move: `apps/frontend/src/modules/users/queries/useRolesQuery.ts` → `apps/frontend/src/modules/roles/queries/useRolesQuery.ts` (+ spec); update every importer (`RoleSelect.vue`, `AddUserDialog.vue`, `UserPermissionsCard.vue`)
- Create: `apps/frontend/src/modules/roles/queries/useRoleQuery.ts` (+ spec)
- Create: `apps/frontend/src/modules/roles/mutations/useRoleCreateMutation.ts`, `useRoleUpdateMutation.ts`, `useRoleDeleteMutation.ts` (+ `__tests__/useRoleMutations.spec.ts`)
- Create: `apps/frontend/src/modules/roles/permissionCatalog.ts` (+ `__tests__/permissionCatalog.spec.ts`); delete `apps/frontend/src/modules/users/permissionGroups.ts` and `__tests__/permissionGroups.spec.ts`
- Create: `apps/frontend/src/modules/roles/components/PermissionGrid.vue` (+ `__tests__/PermissionGrid.spec.ts`)
- Modify: `apps/frontend/src/locales/en.json`

**Interfaces:**

- Produces: `useAuthPermissionsQuery()` (`['auth.permissions']`), `useRolesQuery()` (`['roles']`), `useRoleQuery(roleId)` (`['roles', roleId]`), `useRoleCreateMutation()` (`mutateAsync(body: RoleCreateDto): Promise<RoleDto>`), `useRoleUpdateMutation()` (`mutateAsync({ roleId, body: RoleUpdateDto })`), `useRoleDeleteMutation()` (`mutateAsync(roleId)`), `GLOBAL_PERMISSION_GROUPS`, `PROJECT_PERMISSION_GROUPS`, `permissionLabelKey(scope, permission)`, `isGlobalPermission`, `isProjectPermission`, `PermissionGrid` (generic `T extends string`; props `scope`, `groups: Record<string, T[]>`, `modelValue: T[]`, `locked?: T[]`, `lockedHint?: string`, `grantable?: T[]`, `required?: T[]`, `readonly?: boolean`; emits `update:modelValue`).

- [ ] **Step 1: Auth permissions query**

`useAuthPermissionsQuery.ts`:

```ts
import { queryOptions } from '@tanstack/vue-query'
import { AuthApi } from 'api'

export function useAuthPermissionsQuery() {
    return queryOptions({
        queryKey: ['auth.permissions'],
        staleTime: 60_000,
        queryFn: () => AuthApi.getHeldPermissions(),
    })
}
```

Spec `__tests__/useAuthPermissionsQuery.spec.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/vue-query'
import { AuthApi } from 'api'
import { useAuthPermissionsQuery } from '../useAuthPermissionsQuery.ts'
import { heldOnly } from '@/modules/roles/__tests__/roleFixtures.ts'

afterEach(() => {
    vi.restoreAllMocks()
})

describe('useAuthPermissionsQuery', () => {
    it('loads what the caller holds under the auth.permissions key', async () => {
        const held = heldOnly(['users.read'], ['read'])
        const spy = vi.spyOn(AuthApi, 'getHeldPermissions').mockResolvedValue(held)
        const options = useAuthPermissionsQuery()

        await expect(new QueryClient().fetchQuery(options)).resolves.toEqual(held)
        expect(options.queryKey).toEqual(['auth.permissions'])
        expect(spy).toHaveBeenCalledTimes(1)
    })
})
```

`useLoginMutation.ts` `onSuccess` adds `client.removeQueries({ queryKey: ['auth.permissions'] })`. In `useUserUpdateMutation.ts` and `useUserPermissionsMutation.ts`, next to the `['auth.ability']` invalidation add `void client.invalidateQueries({ queryKey: ['auth.permissions'] })`; extend their specs (read them) to assert the extra invalidation for the current user.

- [ ] **Step 2: Move `useRolesQuery`, add `useRoleQuery`**

Move the file and its spec to `modules/roles/queries/`; update the three imports to `@/modules/roles/queries/useRolesQuery.ts`. `useRoleQuery.ts`:

```ts
import { type MaybeRefOrGetter, toValue } from 'vue'
import { queryOptions } from '@tanstack/vue-query'
import { RoleApi } from 'api'

export function useRoleQuery(roleId: MaybeRefOrGetter<number>) {
    return queryOptions({
        queryKey: ['roles', roleId],
        queryFn: () => RoleApi.getRole({ path: { roleId: toValue(roleId) } }),
    })
}
```

Spec `__tests__/useRoleQuery.spec.ts` mirrors `useProjectQuery.spec.ts`: spy on `RoleApi.getRole`, mount with `withVueQuery(() => useQuery(useRoleQuery(() => 2)))`, assert the call `{ path: { roleId: 2 } }` and the cache under `['roles', 2]`, and that invalidating `['roles']` refetches.

- [ ] **Step 3: Role mutations**

`useRoleCreateMutation.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { RoleApi, type RoleCreateDto } from 'api'
import { waitAtleast } from '@/helper/waitAtleast.ts'

const AFFECTED_KEYS = [['roles'], ['users'], ['auth.ability'], ['auth.permissions']]

export function useRoleCreateMutation() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: (body: RoleCreateDto) => waitAtleast(RoleApi.createRole({ body })),
        onSuccess() {
            for (const queryKey of AFFECTED_KEYS) {
                void client.invalidateQueries({ queryKey })
            }
        },
    })
}
```

`useRoleUpdateMutation.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { RoleApi, type RoleUpdateDto } from 'api'
import { waitAtleast } from '@/helper/waitAtleast.ts'

export function useRoleUpdateMutation() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: ({ roleId, body }: { roleId: number; body: RoleUpdateDto }) =>
            waitAtleast(RoleApi.updateRole({ path: { roleId }, body })),
        onSuccess(role, { roleId }) {
            client.setQueryData(['roles', roleId], role)
            for (const queryKey of [['roles'], ['users'], ['auth.ability'], ['auth.permissions']]) {
                void client.invalidateQueries({ queryKey })
            }
        },
    })
}
```

`useRoleDeleteMutation.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { RoleApi } from 'api'
import { waitAtleast } from '@/helper/waitAtleast.ts'

export function useRoleDeleteMutation() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: (roleId: number) => waitAtleast(RoleApi.deleteRole({ path: { roleId } })),
        onSuccess(_, roleId) {
            client.removeQueries({ queryKey: ['roles', roleId] })
            void client.invalidateQueries({ queryKey: ['roles'] })
            void client.invalidateQueries({ queryKey: ['users'] })
        },
    })
}
```

Spec `__tests__/useRoleMutations.spec.ts` (pattern of `useProjectMemberMutations.spec.ts`, with `vi.mock('@/helper/waitAtleast.ts', …)`): for create assert `RoleApi.createRole` called with `{ body }` and the four invalidations; for update assert `setQueryData(['roles', 2], role)` plus invalidations; for delete assert `removeQueries` and the two invalidations; one failure case per mutation asserting nothing is invalidated.

- [ ] **Step 4: Permission catalog**

`modules/roles/permissionCatalog.ts`:

```ts
import type { Permission, ProjectPermission, RoleScope } from 'api'

export const GLOBAL_PERMISSION_GROUPS: Record<string, Permission[]> = {
    domains: ['domains.read', 'domains.create', 'domains.update', 'domains.delete'],
    projects: ['projects.create', 'projects.all'],
    bounces: ['bounces.read', 'bounces.block', 'bounces.unblock'],
    settings: ['settings.read', 'settings.update'],
    users: ['users.read', 'users.create', 'users.update', 'users.delete'],
    roles: ['roles.read', 'roles.create', 'roles.update', 'roles.delete'],
}

export const PROJECT_PERMISSION_GROUPS: Record<string, ProjectPermission[]> = {
    project: ['read', 'update', 'delete'],
    content: ['forms.manage', 'api_keys.manage'],
    members: ['members.manage'],
}

const GLOBAL_PERMISSION_SET = new Set<string>(Object.values(GLOBAL_PERMISSION_GROUPS).flat())
const PROJECT_PERMISSION_SET = new Set<string>(Object.values(PROJECT_PERMISSION_GROUPS).flat())

export function isGlobalPermission(value: string): value is Permission {
    return GLOBAL_PERMISSION_SET.has(value)
}

export function isProjectPermission(value: string): value is ProjectPermission {
    return PROJECT_PERMISSION_SET.has(value)
}

export function permissionLabelKey(scope: RoleScope, permission: string): string {
    return `permissions.${scope === 'global' ? 'labels' : 'project'}.${permission.replace('.', '_')}`
}
```

Spec `__tests__/permissionCatalog.spec.ts` (replaces the deleted `permissionGroups.spec.ts`; read it first and carry over its "every generated enum value is grouped exactly once" idea using the Zod enums exported by `api`, e.g. `zPermission.options` if the generated client exposes it, otherwise the fixture lists from `roleFixtures.ts`):

```ts
import { describe, expect, it } from 'vitest'
import {
    GLOBAL_PERMISSION_GROUPS,
    isGlobalPermission,
    isProjectPermission,
    permissionLabelKey,
    PROJECT_PERMISSION_GROUPS,
} from '../permissionCatalog.ts'
import { ALL_PERMISSIONS, ALL_PROJECT_PERMISSIONS } from './roleFixtures.ts'

describe('permission catalog', () => {
    it('groups every global and project permission exactly once', () => {
        expect(Object.values(GLOBAL_PERMISSION_GROUPS).flat().sort()).toEqual([...ALL_PERMISSIONS].sort())
        expect(Object.values(PROJECT_PERMISSION_GROUPS).flat().sort()).toEqual([...ALL_PROJECT_PERMISSIONS].sort())
    })

    it('tells global and project permissions apart', () => {
        expect(isGlobalPermission('roles.create')).toBe(true)
        expect(isGlobalPermission('forms.manage')).toBe(false)
        expect(isProjectPermission('forms.manage')).toBe(true)
        expect(isProjectPermission('users.read')).toBe(false)
    })

    it('builds i18n keys without dots inside the permission', () => {
        expect(permissionLabelKey('global', 'roles.create')).toBe('permissions.labels.roles_create')
        expect(permissionLabelKey('project', 'api_keys.manage')).toBe('permissions.project.api_keys_manage')
    })
})
```

- [ ] **Step 5: Write the failing `PermissionGrid` spec**

`modules/roles/components/__tests__/PermissionGrid.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import type { Permission } from 'api'
import PermissionGrid from '../PermissionGrid.vue'
import { mountView } from '@/__tests__/support.ts'
import { GLOBAL_PERMISSION_GROUPS } from '@/modules/roles/permissionCatalog.ts'

function mountGrid(options: {
    selected?: Permission[]
    locked?: Permission[]
    grantable?: Permission[]
    required?: Permission[]
    readonly?: boolean
}) {
    const selected = ref<Permission[]>(options.selected ?? [])
    const Host = defineComponent({
        setup: () => () =>
            h(PermissionGrid, {
                scope: 'global',
                groups: GLOBAL_PERMISSION_GROUPS,
                modelValue: selected.value,
                'onUpdate:modelValue': (value: Permission[]) => (selected.value = value),
                locked: options.locked,
                lockedHint: 'From role: Admin',
                grantable: options.grantable,
                required: options.required,
                readonly: options.readonly,
            }),
    })
    const wrapper = mountView(Host)
    const input = (permission: string) => wrapper.get(`input[value="${permission}"]`).element as HTMLInputElement
    return { wrapper, selected, input }
}

describe('PermissionGrid', () => {
    it('renders every group with its labels and the current selection', () => {
        const { wrapper, input } = mountGrid({ selected: ['users.read'] })

        expect(wrapper.text()).toContain('Roles')
        expect(wrapper.text()).toContain('Create roles')
        expect(input('users.read').checked).toBe(true)
        expect(input('users.create').checked).toBe(false)
    })

    it('shows locked permissions as checked, disabled and explained', () => {
        const { wrapper, input } = mountGrid({ locked: ['domains.read'] })

        expect(input('domains.read').checked).toBe(true)
        expect(input('domains.read').disabled).toBe(true)
        expect(wrapper.text()).toContain('From role: Admin')
    })

    it('disables permissions the caller does not hold', () => {
        const { wrapper, input } = mountGrid({ grantable: ['users.read'] })

        expect(input('users.read').disabled).toBe(false)
        expect(input('users.delete').disabled).toBe(true)
        expect(wrapper.text()).toContain("You don't hold this permission")
    })

    it('emits the selection without locked entries and with required ones', async () => {
        const { wrapper, selected } = mountGrid({ locked: ['domains.read'], required: ['users.read'] })

        await wrapper.get('input[value="users.create"]').setValue(true)

        expect(selected.value).toEqual(['users.read', 'users.create'])
    })

    it('disables everything when read-only', () => {
        const { input } = mountGrid({ readonly: true, grantable: ['users.read'] })

        expect(input('users.read').disabled).toBe(true)
    })
})
```

Run: `pnpm --filter frontend exec vitest run src/modules/roles/components/__tests__/PermissionGrid.spec.ts` → FAIL.

- [ ] **Step 6: Write `PermissionGrid.vue`**

```vue
<template>
    <div class="permission-grid">
        <fieldset v-for="(permissions, group) in groups" :key="group" class="permission-grid__group">
            <legend>{{ t(`permissions.groups.${group}`) }}</legend>
            <VCheckbox
                v-for="permission in permissions"
                :key="permission"
                :value="permission"
                :label="t(permissionLabelKey(scope, permission))"
                :model-value="checked"
                :disabled="isDisabled(permission)"
                :messages="hint(permission)"
                hide-details="auto"
                @update:model-value="onChange"
            />
        </fieldset>
    </div>
</template>

<script setup lang="ts" generic="T extends string">
    import { computed } from 'vue'
    import { useI18n } from 'vue-i18n'
    import type { RoleScope } from 'api'
    import { permissionLabelKey } from '@/modules/roles/permissionCatalog.ts'

    const props = withDefaults(
        defineProps<{
            scope: RoleScope
            groups: Record<string, T[]>
            modelValue: T[]
            locked?: T[]
            lockedHint?: string
            grantable?: T[]
            required?: T[]
            readonly?: boolean
        }>(),
        { locked: () => [], lockedHint: undefined, grantable: undefined, required: () => [], readonly: false },
    )

    const emit = defineEmits<{ 'update:modelValue': [value: T[]] }>()

    const { t } = useI18n()

    const checked = computed(() => [...new Set([...props.modelValue, ...props.locked, ...props.required])])

    function isLocked(permission: T) {
        return props.locked.includes(permission)
    }

    function isRequired(permission: T) {
        return props.required.includes(permission)
    }

    function isGrantable(permission: T) {
        return props.grantable === undefined || props.grantable.includes(permission)
    }

    function isDisabled(permission: T) {
        return props.readonly || isLocked(permission) || isRequired(permission) || !isGrantable(permission)
    }

    function hint(permission: T) {
        if (isLocked(permission)) {
            return props.lockedHint
        }
        if (!isRequired(permission) && !isGrantable(permission)) {
            return t('permissions.notHeld')
        }
        return undefined
    }

    function onChange(value: T[] | null) {
        const next = (value ?? []).filter((permission) => !isLocked(permission))
        emit('update:modelValue', [...new Set([...props.required, ...next])])
    }
</script>

<style scoped>
    .permission-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
        gap: 20px 24px;
    }

    .permission-grid__group {
        margin: 0;
        padding: 0;
        border: 0;
    }

    .permission-grid__group legend {
        margin-bottom: 4px;
        font-size: 0.875rem;
        font-weight: 600;
        line-height: 1.25rem;
    }
</style>
```

- [ ] **Step 7: i18n for the catalog**

In `en.json` under `permissions`:

- `groups`: add `"project": "Project"`, `"content": "Forms & API keys"`, `"members": "Members"` (keep the existing six).
- `labels`: add `"roles_create": "Create roles"`, `"roles_update": "Update roles"`, `"roles_delete": "Delete roles"`.
- `project`: replace with

```json
        "project": {
            "read": "View",
            "update": "Update project",
            "delete": "Delete project",
            "forms_manage": "Manage forms",
            "api_keys_manage": "Manage API keys",
            "members_manage": "Manage members"
        },
```

- add `"notHeld": "You don't hold this permission"` at the `permissions` level.

- [ ] **Step 8: Run the new specs**

Run: `pnpm --filter frontend exec vitest run src/modules/roles src/modules/auth/queries src/modules/users/mutations`
Expected: PASS.

- [ ] **Step 9: Verify instead of committing**

`pnpm --filter frontend exec prettier --check src/modules/roles src/modules/auth src/components/DisclosureBox.vue src/locales/en.json`.

---

### Task 14: Users module — role first, extras in "Advanced"

**Files:**

- Modify: `apps/frontend/src/modules/users/components/RoleSelect.vue`
- Modify: `apps/frontend/src/modules/users/composables/useRoleLabel.ts`
- Modify: `apps/frontend/src/modules/users/views/list/partials/AddUserDialog.vue` (+ spec)
- Modify: `apps/frontend/src/modules/users/views/details/partials/UserProfileCard.vue` (+ spec)
- Modify: `apps/frontend/src/modules/users/views/details/partials/UserPermissionsCard.vue` (+ spec)
- Modify: `apps/frontend/src/modules/users/views/details/partials/UserMembershipsCard.vue`
- Modify: `apps/frontend/src/modules/users/views/list/__tests__/UserListView.spec.ts`, `views/details/__tests__/UserDetailView.spec.ts`
- Modify: `apps/frontend/src/locales/en.json`
- Modify: `apps/frontend/e2e/07-users.spec.ts`

**Interfaces:**

- Consumes: `useRolesQuery`, `useAuthPermissionsQuery`, `PermissionGrid`, `GLOBAL_PERMISSION_GROUPS`, `isGlobalPermission` (Task 13), `DisclosureBox` (Task 12).
- Produces: `RoleSelect` props `{ locked?, lockedHint?, includeRoleId?: number }`; `AddUserDialog` sends `UserCreateDto` with `permissions`; `useRoleLabels()` returns `role.name`.

- [ ] **Step 1: Role labels come from the database**

`useRoleLabel.ts`:

```ts
import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import type { UserRoleDto } from 'api'

export function useRoleLabels() {
    return (role: Pick<UserRoleDto, 'name'>) => role.name
}

export function useRoleLabel(role: MaybeRefOrGetter<Pick<UserRoleDto, 'name'> | undefined>) {
    const label = useRoleLabels()

    return computed(() => {
        const value = toValue(role)
        return value ? label(value) : ''
    })
}
```

In `en.json` delete the top-level `roles` object and `module.users.roles`. Fixtures already use `'Super Admin'`; update `UserListView.spec.ts` (`'Super admin'` → `'Super Admin'`) and `AppLayout.spec.ts` if it asserts the label.

- [ ] **Step 2: `RoleSelect` lists only grantable global roles**

```vue
<template>
    <VSelect
        v-model="model"
        name="roleId"
        :label="requiredLabel(t('field.role'))"
        :items="options"
        item-title="name"
        item-value="roleId"
        :hint="hint"
        persistent-hint
        :loading="isLoading"
        :disabled="locked"
        aria-required="true"
    >
        <template #item="{ props: itemProps, item }">
            <VListItem v-bind="itemProps" :subtitle="item.raw.description" />
        </template>
    </VSelect>
</template>

<script setup lang="ts">
    import { computed } from 'vue'
    import { useQuery } from '@tanstack/vue-query'
    import { useI18n } from 'vue-i18n'
    import type { RoleDto } from 'api'
    import { useRequiredLabel } from '@/composables/useRequiredLabel.ts'
    import { useAuthQuery } from '@/modules/auth/queries/useAuthQuery.ts'
    import { useAuthPermissionsQuery } from '@/modules/auth/queries/useAuthPermissionsQuery.ts'
    import { useRolesQuery } from '@/modules/roles/queries/useRolesQuery.ts'

    const props = withDefaults(defineProps<{ locked?: boolean; lockedHint?: string; includeRoleId?: number }>(), {
        locked: false,
        lockedHint: undefined,
        includeRoleId: undefined,
    })
    const model = defineModel<number | undefined>()

    const { t } = useI18n()
    const requiredLabel = useRequiredLabel()
    const { data: roles, isLoading } = useQuery(useRolesQuery())
    const { data: currentUser } = useQuery(useAuthQuery())
    const { data: held } = useQuery(useAuthPermissionsQuery())

    const heldPermissions = computed(() => new Set<string>(held.value?.permissions ?? []))

    function isGrantable(role: RoleDto) {
        if (role.type === 'super_admin' && currentUser.value?.role.type !== 'super_admin') {
            return false
        }
        return role.permissions.every((permission) => heldPermissions.value.has(permission))
    }

    const options = computed(() =>
        (roles.value ?? [])
            .filter((role) => role.scope === 'global' && (isGrantable(role) || role.roleId === props.includeRoleId))
            .map((role) => ({ roleId: role.roleId, name: role.name, description: role.description ?? undefined })),
    )

    const hint = computed(() => {
        if (props.locked && props.lockedHint) {
            return props.lockedHint
        }
        return options.value.find((option) => option.roleId === model.value)?.description
    })
</script>
```

`UserProfileCard.vue`: replace `:keep-super-admin="user.role.type === 'super_admin'"` with `:include-role-id="user.role.roleId"`. In `UserProfileCard.spec.ts` `mountCard` additionally stubs `vi.spyOn(AuthApi, 'getHeldPermissions').mockResolvedValue(heldAll())`.

- [ ] **Step 3: Write the failing `AddUserDialog` spec changes**

In `AddUserDialog.spec.ts`:

- `openDialog(as, held = heldAll())` also stubs `vi.spyOn(AuthApi, 'getHeldPermissions').mockResolvedValue(held)` (import `heldAll`, `heldOnly` from `@/modules/roles/__tests__/roleFixtures.ts`).
- `hides the Super admin role from admins` expects `['Admin', 'User']`; `offers the Super admin role to Super admins` expects `['Super Admin', 'Admin', 'User']`.
- Add:

```ts
it('hides roles with permissions the caller does not hold', async () => {
    await openDialog('admin', heldOnly(['users.read', 'users.create']))

    expect(await roleOptions()).toEqual(['User'])
})

it('keeps the advanced permissions collapsed until opened', async () => {
    await openDialog()

    expect(document.body.querySelector('.v-overlay-container input[value="domains.read"]')).toBeNull()
    overlayButton('Advanced: additional permissions').click()

    await vi.waitFor(() =>
        expect(document.body.querySelector('.v-overlay-container input[value="domains.read"]')).not.toBeNull(),
    )
})

it('sends extra permissions on top of the role', async () => {
    push.mockResolvedValue(undefined)
    const create = vi.spyOn(UserApi, 'createUser').mockResolvedValue(signedIn('user', 9))
    await openDialog()
    await fillForm()
    overlayButton('Advanced: additional permissions').click()
    await vi.waitFor(() =>
        expect(document.body.querySelector('.v-overlay-container input[value="domains.read"]')).not.toBeNull(),
    )

    document.body.querySelector<HTMLInputElement>('.v-overlay-container input[value="domains.read"]')!.click()
    submitOverlayForm()

    await vi.waitFor(() =>
        expect(create).toHaveBeenCalledWith({
            body: {
                firstName: 'Nina',
                lastName: 'Roth',
                email: 'nina@acme.com',
                password: 'correct-horse',
                roleId: 3,
                permissions: ['domains.read'],
            },
        }),
    )
})
```

- The existing `creates the user…` expectation gains `permissions: []`.
- Import `overlayButton` from the support file.

Run: `pnpm --filter frontend exec vitest run src/modules/users/views/list/__tests__/AddUserDialog.spec.ts` → FAIL.

- [ ] **Step 4: Rewrite `AddUserDialog.vue`**

```vue
<template>
    <FormDialog
        v-model="model"
        width="lg"
        :title="t('module.users.add.title')"
        :submit-label="t('module.users.add.submit')"
        :pending="isPending"
        :error="errorMessage"
        :dirty="meta.dirty || extraPermissions.length > 0"
        @submit="onSubmit"
    >
        <div class="form-grid form-grid--2">
            <VTextField
                v-model="firstName"
                name="firstName"
                :label="requiredLabel(t('field.firstName'))"
                :error-messages="errors.firstName"
                aria-required="true"
            />
            <VTextField
                v-model="lastName"
                name="lastName"
                :label="requiredLabel(t('field.lastName'))"
                :error-messages="errors.lastName"
                aria-required="true"
            />
            <VTextField
                v-model="email"
                name="email"
                type="email"
                :label="requiredLabel(t('field.email'))"
                :error-messages="errors.email"
                aria-required="true"
            />
            <PasswordField
                v-model="password"
                name="password"
                :label="requiredLabel(t('field.password'))"
                :hint="t('module.users.add.passwordHint', { name: firstName || t('module.users.add.theUser') })"
                persistent-hint
                :error-messages="errors.password"
                autocomplete="new-password"
                aria-required="true"
            />
            <RoleSelect v-model="roleId" class="span-2" :error-messages="errors.roleId" />
            <DisclosureBox class="span-2" :summary="t('module.users.add.advanced')">
                <p class="advanced-hint">{{ t('module.users.add.advancedHint') }}</p>
                <PermissionGrid
                    v-model="extraPermissions"
                    scope="global"
                    :groups="GLOBAL_PERMISSION_GROUPS"
                    :locked="rolePermissions"
                    :locked-hint="t('module.users.details.permissions.fromRole', { role: selectedRole?.name ?? '' })"
                    :grantable="held?.permissions ?? []"
                />
            </DisclosureBox>
        </div>
    </FormDialog>
</template>

<script setup lang="ts">
    import { computed, ref, watch } from 'vue'
    import { useForm } from 'vee-validate'
    import { toTypedSchema } from '@vee-validate/zod'
    import { z } from 'zod'
    import { useI18n } from 'vue-i18n'
    import { useQuery } from '@tanstack/vue-query'
    import { useRouter } from 'vue-router'
    import type { Permission } from 'api'
    import DisclosureBox from '@/components/DisclosureBox.vue'
    import FormDialog from '@/components/FormDialog.vue'
    import PasswordField from '@/components/PasswordField.vue'
    import { useNotify } from '@/composables/useNotify.ts'
    import { useRequiredLabel } from '@/composables/useRequiredLabel.ts'
    import { useAuthPermissionsQuery } from '@/modules/auth/queries/useAuthPermissionsQuery.ts'
    import PermissionGrid from '@/modules/roles/components/PermissionGrid.vue'
    import { GLOBAL_PERMISSION_GROUPS, isGlobalPermission } from '@/modules/roles/permissionCatalog.ts'
    import { useRolesQuery } from '@/modules/roles/queries/useRolesQuery.ts'
    import RoleSelect from '@/modules/users/components/RoleSelect.vue'
    import { useUserCreateMutation } from '@/modules/users/mutations/useUserCreateMutation.ts'
    import { RouteNames } from '@/router/RouteNames.ts'
    import { apiErrorMessage } from '@/helper/apiErrorMessage.ts'

    const model = defineModel<boolean>({ required: true })
    const { t } = useI18n()
    const requiredLabel = useRequiredLabel()
    const notify = useNotify()
    const router = useRouter()
    const errorMessage = ref<string | null>(null)
    const extraPermissions = ref<Permission[]>([])
    const { mutateAsync, isPending } = useUserCreateMutation()
    const { data: roles } = useQuery(useRolesQuery())
    const { data: held } = useQuery(useAuthPermissionsQuery())
    const defaultRoleId = computed(() => roles.value?.find((role) => role.type === 'user')?.roleId)

    const { defineField, handleSubmit, errors, resetForm, meta } = useForm({
        validationSchema: toTypedSchema(
            z.object({
                firstName: z.string().trim().min(1),
                lastName: z.string().trim().min(1),
                email: z.email(),
                password: z.string().min(8),
                roleId: z.number(),
            }),
        ),
    })

    const [firstName] = defineField('firstName')
    const [lastName] = defineField('lastName')
    const [email] = defineField('email')
    const [password] = defineField('password')
    const [roleId] = defineField('roleId')

    const selectedRole = computed(() => roles.value?.find((role) => role.roleId === roleId.value))
    const rolePermissions = computed(() => (selectedRole.value?.permissions ?? []).filter(isGlobalPermission))

    watch(rolePermissions, (permissions) => {
        extraPermissions.value = extraPermissions.value.filter((permission) => !permissions.includes(permission))
    })

    watch(
        [model, defaultRoleId],
        ([open], previous) => {
            if (open && (!previous?.[0] || !meta.value.dirty)) {
                errorMessage.value = null
                extraPermissions.value = []
                resetForm({ values: { roleId: defaultRoleId.value } })
            }
        },
        { immediate: true },
    )

    const onSubmit = handleSubmit(async (values) => {
        errorMessage.value = null
        try {
            const { userId } = await mutateAsync({ ...values, permissions: extraPermissions.value })
            model.value = false
            await router.push({ name: RouteNames.USER_DETAILS, params: { userId } })
            notify.success(t('module.users.add.success'))
        } catch (error) {
            errorMessage.value = apiErrorMessage(error, t('module.users.add.error'))
        }
    })
</script>

<style scoped>
    .advanced-hint {
        margin: 0 0 12px;
        color: rgb(var(--v-theme-ink-muted));
        font-size: 0.8125rem;
        line-height: 1.25rem;
    }
</style>
```

i18n under `module.users.add`: `"advanced": "Advanced: additional permissions"`, `"advancedHint": "Granted on top of the role, everywhere. You can only grant permissions you hold yourself."`.

Run the AddUserDialog spec → PASS. Also update `useUserCreateMutation.spec.ts`'s `body` with `permissions: []`.

- [ ] **Step 5: `UserPermissionsCard` on the shared grid**

Replace the `<div class="user-permissions__grid">…</div>` block with:

```vue
<PermissionGrid
    v-model="selected"
    scope="global"
    :groups="GLOBAL_PERMISSION_GROUPS"
    :locked="rolePermissions"
    :locked-hint="t('module.users.details.permissions.fromRole', { role: user.role.name })"
    :grantable="held?.permissions ?? []"
    :readonly="!canUpdate"
/>
```

Script changes: import `PermissionGrid`, `GLOBAL_PERMISSION_GROUPS`, `isGlobalPermission` from the roles module and `useAuthPermissionsQuery`; `const { data: held } = useQuery({ ...useAuthPermissionsQuery(), enabled: computed(() => props.canUpdate) })`; `rolePermissions` becomes `(roles.value?.find(...)?.permissions ?? []).filter(isGlobalPermission)`; drop `effective`, `fromRole`, `onChange` and the removed styles (`.user-permissions__grid`, `.user-permissions__group`). `selected` keeps holding extras only, so `dirty`/`discard`/`onSave` stay as they are (the grid never emits locked entries).

Update `UserPermissionsCard.spec.ts`: every test stubs `AuthApi.getHeldPermissions` (import `AuthApi`), default `heldAll()`; add:

```ts
it('locks permissions the current user does not hold', async () => {
    vi.spyOn(RoleApi, 'getRoles').mockResolvedValue(roles)
    vi.spyOn(AuthApi, 'getHeldPermissions').mockResolvedValue(heldOnly(['bounces.read']))
    const wrapper = mountInApp(UserPermissionsCard, { user: userDetail(), canUpdate: true })

    await vi.waitFor(() => expect(wrapper.text()).toContain("You don't hold this permission"))
    expect((checkbox(wrapper, 'domains.read').element as HTMLInputElement).disabled).toBe(true)
    expect((checkbox(wrapper, 'bounces.read').element as HTMLInputElement).disabled).toBe(false)
})
```

Update `module.users.details.permissions.explainer.text` to: "Permissions add up: the role and these permissions apply everywhere; a project membership adds a project role and extras for that one project. Super admins and users with “Access all projects” reach every project without membership."

- [ ] **Step 6: `UserMembershipsCard` shows role and extras**

Replace the `#meta` slot content:

```vue
<template #meta>
    <TagLabel :label="membership.role.name" />
    <TagLabel
        v-for="permission in sortedPermissions(membership.permissions)"
        :key="permission"
        :label="t(permissionLabelKey('project', permission))"
    />
</template>
```

Import `permissionLabelKey` from `@/modules/roles/permissionCatalog.ts`. In `UserDetailView.spec.ts` add an assertion after the first test's titles: `expect(wrapper.text()).toContain('Maintainer')` and `expect(wrapper.text()).toContain('Delete project')` is wrong (that is the danger-zone title) — assert the tag instead: `expect(wrapper.findAll('.tag-label').map((tag) => tag.text())).toContain('Maintainer')`. Every `mockApis()` there also stubs `AuthApi.getHeldPermissions` with `heldAll()`.

- [ ] **Step 7: Playwright flow**

In `e2e/07-users.spec.ts`:

- The "No permissions of its own" expectation still holds (the hint now comes from `role.description`).
- In `an administrator grants the user read access to the project`, after `selectOption(memberDialog, 'User', memberName)` the dialog pre-selects Viewer; change the final expectation to `await expect(members.getByText('Viewer', { exact: true })).toBeVisible()`.
- In `the limited user only sees what their permissions allow` keep the hidden-nav loop and add `'Roles'` to the hidden labels.

- [ ] **Step 8: Run the users specs**

Run: `pnpm --filter frontend exec vitest run src/modules/users`
Expected: PASS.

- [ ] **Step 9: Verify instead of committing**

`pnpm --filter frontend exec prettier --check src/modules/users src/locales/en.json e2e/07-users.spec.ts`.

---

### Task 15: Projects module — project roles, finer gating

**Files:**

- Create: `apps/frontend/src/modules/projects/queries/useProjectRolesQuery.ts` (+ spec in `queries/__tests__/useProjectQuery.spec.ts`)
- Modify: `apps/frontend/src/modules/projects/helpers/projectPermissions.ts`
- Modify: `apps/frontend/src/modules/projects/mutations/useProjectMemberSetMutation.ts` (+ `__tests__/useProjectMemberMutations.spec.ts`)
- Modify: `apps/frontend/src/modules/projects/views/details/partials/ProjectMemberDialog.vue` (+ spec)
- Modify: `apps/frontend/src/modules/projects/views/details/partials/ProjectMembersCard.vue` (+ spec)
- Modify: `apps/frontend/src/modules/projects/views/details/ProjectDetailView.vue` (+ spec)
- Modify: `apps/frontend/src/modules/inbound-forms/views/details/InboundFormDetailView.vue`
- Modify: `apps/frontend/src/modules/dashboard/views/partials/FormsByProjectCard.vue`
- Modify: `apps/frontend/src/locales/en.json`

**Interfaces:**

- Consumes: `ProjectApi.getProjectRoles`, `ProjectMemberPutDto { roleId, permissions? }`, `ProjectMemberDto.role` (Task 11); `PermissionGrid`, `PROJECT_PERMISSION_GROUPS` (Task 13); `DisclosureBox` (Task 12).
- Produces: `useProjectRolesQuery(projectId)` (`['projects', projectId, 'roles']`), `useProjectMemberSetMutation().mutateAsync({ projectId, userId, roleId, permissions })`, `PROJECT_PERMISSIONS` with six values.

- [ ] **Step 1: Query, helper and mutation**

`useProjectRolesQuery.ts`:

```ts
import { type MaybeRefOrGetter, toValue } from 'vue'
import { queryOptions } from '@tanstack/vue-query'
import { ProjectApi } from 'api'

export function useProjectRolesQuery(projectId: MaybeRefOrGetter<number>) {
    return queryOptions({
        queryKey: ['projects', projectId, 'roles'],
        queryFn: () => ProjectApi.getProjectRoles({ path: { projectId: toValue(projectId) } }),
    })
}
```

Add a `describe('useProjectRolesQuery')` to `useProjectQuery.spec.ts` mirroring the members block (spy `ProjectApi.getProjectRoles` → `projectRoles()`, key `['projects', 1, 'roles']`); update that file's `members` fixture with `role: { roleId: 5, name: 'Viewer' }`.

`projectPermissions.ts`:

```ts
import type { ProjectPermission } from 'api'

export const PROJECT_PERMISSIONS: ProjectPermission[] = [
    'read',
    'update',
    'delete',
    'forms.manage',
    'api_keys.manage',
    'members.manage',
]

export function sortedPermissions(permissions: ProjectPermission[]): ProjectPermission[] {
    return PROJECT_PERMISSIONS.filter((permission) => permissions.includes(permission))
}
```

`useProjectMemberSetMutation.ts`:

```ts
        mutationFn: ({
            projectId,
            userId,
            roleId,
            permissions,
        }: {
            projectId: number
            userId: number
            roleId: number
            permissions: ProjectPermission[]
        }) =>
            waitAtleast(ProjectApi.setProjectMember({ path: { projectId, userId }, body: { roleId, permissions } })),
```

Update `useProjectMemberMutations.spec.ts`: calls pass `roleId: 7` and expect `body: { roleId: 7, permissions: ['delete'] }` (and `[]` in the failure case).

- [ ] **Step 2: Write the failing `ProjectMemberDialog` spec**

Replace the spec:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProjectApi, UserApi } from 'api'
import ProjectMemberDialog from '../partials/ProjectMemberDialog.vue'
import { mountDialog, overlayButton, overlayText } from '@/__tests__/support.ts'
import { member, projectDetail, projectRoles, userListItem } from '@/__tests__/fixtures.ts'

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

vi.stubGlobal('visualViewport', null)

const maintainerRules = [
    { action: 'read', subject: 'Project', conditions: { projectId: { $in: [1] } } },
    { action: 'update', subject: 'Project', conditions: { projectId: { $in: [1] } } },
    { action: 'forms.manage', subject: 'Project', conditions: { projectId: { $in: [1] } } },
    { action: 'api_keys.manage', subject: 'Project', conditions: { projectId: { $in: [1] } } },
    { action: 'members.manage', subject: 'Project', conditions: { projectId: { $in: [1] } } },
    { action: 'read', subject: 'User' },
]

afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
})

function mockRoles() {
    vi.spyOn(ProjectApi, 'getProjectRoles').mockResolvedValue(projectRoles())
}

async function roleOptions() {
    document.body
        .querySelector<HTMLElement>(
            '.v-overlay-container .v-select[name="roleId"] .v-field, .v-overlay-container [name="roleId"]',
        )
        ?.closest('.v-select')
        ?.querySelector<HTMLElement>('.v-field')!
        .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await vi.waitFor(() => expect(document.body.querySelectorAll('.v-list-item-title').length).toBeGreaterThan(0))
    return [...document.body.querySelectorAll('.v-list-item-title')].map((title) => title.textContent?.trim())
}

describe('ProjectMemberDialog', () => {
    it('pre-selects the smallest grantable role when adding and sends it', async () => {
        mockRoles()
        vi.spyOn(UserApi, 'getUsers').mockResolvedValue([userListItem()])
        const setSpy = vi.spyOn(ProjectApi, 'setProjectMember').mockResolvedValue(undefined)
        const { open } = mountDialog(ProjectMemberDialog, { project: projectDetail(), existing: [] })

        await vi.waitFor(() => expect(overlayText()).toContain('Sees the project, its forms and sent mail.'))
        document.body
            .querySelector<HTMLElement>('.v-overlay-container .v-autocomplete .v-field')!
            .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        await vi.waitFor(() => expect(overlayText()).toContain('Tom Becker'))
        ;[...document.body.querySelectorAll<HTMLElement>('.v-list-item')]
            .find((item) => item.textContent?.includes('Tom Becker'))!
            .click()
        overlayButton('Add member').click()

        await vi.waitFor(() =>
            expect(setSpy).toHaveBeenCalledWith({
                path: { projectId: 1, userId: 3 },
                body: { roleId: 5, permissions: [] },
            }),
        )
        await vi.waitFor(() => expect(open.value).toBe(false))
    })

    it('offers only roles the caller fully holds on this project, plus the current one', async () => {
        mockRoles()
        const existing = member({ role: { roleId: 8, name: 'Owner' } })
        mountDialog(
            ProjectMemberDialog,
            { project: projectDetail(), member: existing, existing: [existing] },
            maintainerRules,
        )

        await vi.waitFor(() => expect(overlayText()).toContain("Edit Lisa Schneider's access"))
        expect(await roleOptions()).toEqual(['Viewer', 'Editor', 'Maintainer', 'Owner'])
    })

    it('keeps extras collapsed, locks role permissions and sends the extras', async () => {
        mockRoles()
        const setSpy = vi.spyOn(ProjectApi, 'setProjectMember').mockResolvedValue(undefined)
        const existing = member({ role: { roleId: 5, name: 'Viewer' } })
        mountDialog(ProjectMemberDialog, { project: projectDetail(), member: existing, existing: [existing] })

        await vi.waitFor(() => expect(overlayText()).toContain("Edit Lisa Schneider's access"))
        expect(document.body.querySelector('.v-overlay-container input[value="delete"]')).toBeNull()
        overlayButton('Advanced: additional permissions').click()
        await vi.waitFor(() =>
            expect(document.body.querySelector('.v-overlay-container input[value="delete"]')).not.toBeNull(),
        )
        const read = document.body.querySelector<HTMLInputElement>('.v-overlay-container input[value="read"]')!
        expect(read.checked).toBe(true)
        expect(read.disabled).toBe(true)
        expect(overlayText()).toContain('From role: Viewer')

        document.body.querySelector<HTMLInputElement>('.v-overlay-container input[value="delete"]')!.click()
        overlayButton('Save').click()

        await vi.waitFor(() =>
            expect(setSpy).toHaveBeenCalledWith({
                path: { projectId: 1, userId: 2 },
                body: { roleId: 5, permissions: ['delete'] },
            }),
        )
    })

    it('disables extras the caller does not hold on the project', async () => {
        mockRoles()
        const existing = member({ role: { roleId: 5, name: 'Viewer' } })
        mountDialog(
            ProjectMemberDialog,
            { project: projectDetail(), member: existing, existing: [existing] },
            maintainerRules,
        )

        await vi.waitFor(() => expect(overlayText()).toContain("Edit Lisa Schneider's access"))
        overlayButton('Advanced: additional permissions').click()
        await vi.waitFor(() =>
            expect(document.body.querySelector('.v-overlay-container input[value="delete"]')).not.toBeNull(),
        )

        expect(
            document.body.querySelector<HTMLInputElement>('.v-overlay-container input[value="delete"]')!.disabled,
        ).toBe(true)
        expect(
            document.body.querySelector<HTMLInputElement>('.v-overlay-container input[value="forms.manage"]')!.disabled,
        ).toBe(false)
    })

    it('requires a user when adding', async () => {
        mockRoles()
        vi.spyOn(UserApi, 'getUsers').mockResolvedValue([userListItem()])
        const setSpy = vi.spyOn(ProjectApi, 'setProjectMember')
        mountDialog(ProjectMemberDialog, { project: projectDetail(), existing: [] })

        await vi.waitFor(() => expect(overlayText()).toContain('Access in Acme Website'))
        overlayButton('Add member').click()

        await vi.waitFor(() => expect(overlayText()).toContain('Choose a user.'))
        expect(setSpy).not.toHaveBeenCalled()
    })

    it('shows the error inside the dialog when saving fails', async () => {
        mockRoles()
        vi.spyOn(ProjectApi, 'setProjectMember').mockRejectedValue({ message: 'Cannot change your own access' })
        const existing = member()
        const { open } = mountDialog(ProjectMemberDialog, {
            project: projectDetail(),
            member: existing,
            existing: [existing],
        })

        await vi.waitFor(() => expect(overlayText()).toContain('Access in Acme Website'))
        overlayButton('Save').click()

        await vi.waitFor(() => expect(overlayText()).toContain('Cannot change your own access'))
        expect(open.value).toBe(true)
    })
})
```

If the `roleOptions` selector proves brittle, give the role `VSelect` a `data-testid="roleId"` and query `.v-overlay-container [data-testid="roleId"] .v-field`.

Run: `pnpm --filter frontend exec vitest run src/modules/projects/views/details/__tests__/ProjectMemberDialog.spec.ts` → FAIL.

- [ ] **Step 3: Rewrite `ProjectMemberDialog.vue`**

```vue
<template>
    <FormDialog
        v-model="model"
        width="lg"
        :title="
            member
                ? t('module.projects.members.dialog.editTitle', { name: memberName })
                : t('module.projects.members.dialog.addTitle')
        "
        :submit-label="member ? t('cta.save') : t('module.projects.members.dialog.submit')"
        :pending="isPending"
        :error="errorMessage"
        :dirty="dirty"
        @submit="onSubmit"
    >
        <ReadonlyValue v-if="member" :label="t('field.user')" :value="`${memberName} · ${member.email}`" />
        <VAutocomplete
            v-else
            v-model="selectedUserId"
            name="userId"
            :label="requiredLabel(t('field.user'))"
            :items="userOptions"
            item-title="name"
            item-value="userId"
            :loading="isLoading"
            :error-messages="userError"
            :hint="selectedHint"
            persistent-hint
            aria-required="true"
        >
            <template #item="{ props: itemProps, item }">
                <VListItem v-bind="itemProps" :subtitle="item.raw.hint" />
            </template>
        </VAutocomplete>
        <fieldset class="member-access">
            <legend>{{ t('module.projects.members.dialog.access', { project: project.name }) }}</legend>
            <VSelect
                v-model="selectedRoleId"
                name="roleId"
                data-testid="roleId"
                :label="requiredLabel(t('module.projects.members.dialog.role'))"
                :items="roleOptions"
                item-title="name"
                item-value="roleId"
                :loading="rolesLoading"
                :hint="selectedRole?.description ?? undefined"
                persistent-hint
                :error-messages="roleError"
                aria-required="true"
            >
                <template #item="{ props: itemProps, item }">
                    <VListItem v-bind="itemProps" :subtitle="item.raw.description" />
                </template>
            </VSelect>
            <DisclosureBox :summary="t('module.projects.members.dialog.advanced')">
                <p class="member-access__hint">{{ t('module.projects.members.dialog.advancedHint') }}</p>
                <PermissionGrid
                    v-model="extraPermissions"
                    scope="project"
                    :groups="PROJECT_PERMISSION_GROUPS"
                    :locked="rolePermissions"
                    :locked-hint="t('module.projects.members.dialog.fromRole', { role: selectedRole?.name ?? '' })"
                    :grantable="grantablePermissions"
                />
            </DisclosureBox>
        </fieldset>
    </FormDialog>
</template>

<script setup lang="ts">
    import { computed, ref, watch } from 'vue'
    import { useQuery } from '@tanstack/vue-query'
    import { useI18n } from 'vue-i18n'
    import { useAbility } from '@casl/vue'
    import { subject } from '@casl/ability'
    import type { ProjectDetailDto, ProjectMemberDto, ProjectPermission, ProjectRoleDto } from 'api'
    import DisclosureBox from '@/components/DisclosureBox.vue'
    import FormDialog from '@/components/FormDialog.vue'
    import ReadonlyValue from '@/components/ReadonlyValue.vue'
    import { useNotify } from '@/composables/useNotify.ts'
    import { useRequiredLabel } from '@/composables/useRequiredLabel.ts'
    import { apiErrorMessage } from '@/helper/apiErrorMessage.ts'
    import PermissionGrid from '@/modules/roles/components/PermissionGrid.vue'
    import { PROJECT_PERMISSION_GROUPS } from '@/modules/roles/permissionCatalog.ts'
    import { useUsersQuery } from '@/modules/users/queries/useUsersQuery.ts'
    import { useRoleLabels } from '@/modules/users/composables/useRoleLabel.ts'
    import { useProjectMemberSetMutation } from '@/modules/projects/mutations/useProjectMemberSetMutation.ts'
    import { useProjectRolesQuery } from '@/modules/projects/queries/useProjectRolesQuery.ts'
    import { PROJECT_PERMISSIONS } from '@/modules/projects/helpers/projectPermissions.ts'

    const props = defineProps<{ project: ProjectDetailDto; member?: ProjectMemberDto; existing: ProjectMemberDto[] }>()
    const model = defineModel<boolean>({ required: true })

    const { t } = useI18n()
    const requiredLabel = useRequiredLabel()
    const notify = useNotify()
    const roleLabel = useRoleLabels()
    const userAbility = useAbility()
    const errorMessage = ref<string | null>(null)
    const userError = ref<string | undefined>()
    const roleError = ref<string | undefined>()
    const selectedUserId = ref<number | null>(null)
    const selectedRoleId = ref<number | null>(null)
    const extraPermissions = ref<ProjectPermission[]>([])
    const { mutateAsync, isPending } = useProjectMemberSetMutation()

    const { queryKey, queryFn } = useUsersQuery()
    const { data: users, isLoading } = useQuery({
        queryKey,
        queryFn,
        enabled: computed(() => model.value && !props.member),
    })
    const rolesQuery = useProjectRolesQuery(() => props.project.projectId)
    const { data: roles, isLoading: rolesLoading } = useQuery({ ...rolesQuery, enabled: model })

    const memberName = computed(() => (props.member ? `${props.member.firstName} ${props.member.lastName}` : ''))

    const userOptions = computed(() =>
        (users.value ?? [])
            .filter((user) => !props.existing.some((member) => member.userId === user.userId))
            .map((user) => ({
                userId: user.userId,
                name: `${user.firstName} ${user.lastName}`,
                hint: t('module.projects.members.dialog.userHint', { email: user.email, role: roleLabel(user.role) }),
            })),
    )

    const selectedHint = computed(() => userOptions.value.find((user) => user.userId === selectedUserId.value)?.hint)

    function heldOnProject(permission: ProjectPermission) {
        return userAbility.can(permission, subject('Project', { projectId: props.project.projectId }))
    }

    const grantablePermissions = computed(() => PROJECT_PERMISSIONS.filter(heldOnProject))

    const grantableRoles = computed(() =>
        (roles.value ?? []).filter(
            (role) => role.permissions.every(heldOnProject) || role.roleId === props.member?.role.roleId,
        ),
    )

    const roleOptions = computed(() =>
        grantableRoles.value.map((role) => ({ roleId: role.roleId, name: role.name, description: role.description })),
    )

    const selectedRole = computed<ProjectRoleDto | undefined>(() =>
        roles.value?.find((role) => role.roleId === selectedRoleId.value),
    )
    const rolePermissions = computed(() => selectedRole.value?.permissions ?? [])

    function defaultRoleId() {
        if (props.member) {
            return props.member.role.roleId
        }
        const smallest = [...grantableRoles.value].sort(
            (a, b) => a.permissions.length - b.permissions.length || a.name.localeCompare(b.name),
        )[0]
        return smallest?.roleId ?? null
    }

    const initialExtras = computed(() => (props.member ? [...props.member.permissions] : []))
    const dirty = computed(
        () =>
            selectedUserId.value !== null ||
            selectedRoleId.value !== (props.member?.role.roleId ?? defaultRoleId()) ||
            [...extraPermissions.value].sort().join() !== [...initialExtras.value].sort().join(),
    )

    watch(rolePermissions, (permissions) => {
        extraPermissions.value = extraPermissions.value.filter((permission) => !permissions.includes(permission))
    })

    watch(
        [model, roles],
        ([open]) => {
            if (open) {
                errorMessage.value = null
                userError.value = undefined
                roleError.value = undefined
                selectedUserId.value = null
                selectedRoleId.value = defaultRoleId()
                extraPermissions.value = initialExtras.value
            }
        },
        { immediate: true },
    )

    async function onSubmit() {
        errorMessage.value = null
        userError.value = undefined
        roleError.value = undefined
        const userId = props.member?.userId ?? selectedUserId.value
        if (userId === null) {
            userError.value = t('module.projects.members.dialog.userRequired')
        }
        if (selectedRoleId.value === null) {
            roleError.value = t('module.projects.members.dialog.roleRequired')
        }
        if (userId === null || selectedRoleId.value === null) {
            return
        }
        const name = props.member ? memberName.value : userOptions.value.find((user) => user.userId === userId)?.name
        try {
            await mutateAsync({
                projectId: props.project.projectId,
                userId,
                roleId: selectedRoleId.value,
                permissions: extraPermissions.value,
            })
            model.value = false
            notify.success(
                props.member
                    ? t('module.projects.members.updated', { name })
                    : t('module.projects.members.added', { name }),
            )
        } catch (error) {
            errorMessage.value = apiErrorMessage(error, t('module.projects.members.error'))
        }
    }
</script>

<style scoped>
    .member-access {
        display: grid;
        gap: 16px;
        margin: 0;
        padding: 0;
        border: 0;
    }

    .member-access legend {
        margin-bottom: 4px;
        font-size: 0.875rem;
        font-weight: 600;
        line-height: 1.25rem;
    }

    .member-access__hint {
        margin: 0 0 12px;
        color: rgb(var(--v-theme-ink-muted));
        font-size: 0.8125rem;
        line-height: 1.25rem;
    }
</style>
```

The role watcher resets extras when the role changes (the `watch(rolePermissions)` fires after `selectedRoleId` is set in the open-watcher; since the open-watcher assigns `extraPermissions` after `selectedRoleId`, the filter runs on the right set).

i18n `module.projects.members.dialog`: add `"role": "Project role"`, `"roleRequired": "Choose a role."`, `"advanced": "Advanced: additional permissions"`, `"advancedHint": "Granted on top of the role, in this project only. You can only grant permissions you hold here yourself."`, `"fromRole": "From role: {role}"`; remove `permissionRequired` and `explain`.

Run the dialog spec → PASS.

- [ ] **Step 4: `ProjectMembersCard` shows role + extras**

Replace the `#meta` slot content:

```vue
<template #meta>
    <TagLabel :label="member.role.name" />
    <TagLabel
        v-for="permission in sortedPermissions(member.permissions)"
        :key="permission"
        :label="t(permissionLabelKey('project', permission))"
    />
</template>
```

Import `permissionLabelKey`. Update `ProjectMembersCard.spec.ts`: `mockMembers()` returns `member({ permissions: ['delete'] })`, the first test expects tags `['Maintainer', 'Delete project']`; add `vi.spyOn(ProjectApi, 'getProjectRoles').mockResolvedValue(projectRoles())` where the dialog could open. Update `module.projects.members.empty.text` to "Only admins, users with “Access all projects” and members you add here can open this project."

- [ ] **Step 5: Gate the project detail view by the finer catalog**

`ProjectDetailView.vue` script:

```ts
const projectSubject = computed(() => subject('Project', { projectId: projectId.value }))
const canUpdate = computed(() => userAbility.can('update', projectSubject.value))
const canDelete = computed(() => userAbility.can('delete', projectSubject.value))
const canManageForms = computed(() => userAbility.can('forms.manage', projectSubject.value))
const canManageApiKeys = computed(() => userAbility.can('api_keys.manage', projectSubject.value))
const canManageMembers = computed(
    () => userAbility.can('update', 'User') || userAbility.can('members.manage', projectSubject.value),
)
const canReadDomains = computed(() => userAbility.can('read', 'Domain'))
const readOnly = computed(
    () =>
        !canUpdate.value &&
        !canDelete.value &&
        !canManageForms.value &&
        !canManageApiKeys.value &&
        !userAbility.can('members.manage', projectSubject.value),
)
```

Template: `v-if="project && readOnly"` on the status tag, `v-if="readOnly"` on the alert, `<ProjectFormsCard :project="project" :can-update="canManageForms" />`, `<ProjectApiKeysCard :project="project" :can-update="canManageApiKeys" />`; domains and general cards keep `canUpdate`; members keeps `canManageMembers`; danger zone keeps `canDelete`.

i18n `module.projects.details.readOnlyAlert.text`: "Your project role only allows viewing. Ask a project maintainer or an admin for more access."

`ProjectDetailView.spec.ts`: add `vi.spyOn(ProjectApi, 'getProjectRoles').mockResolvedValue(projectRoles())` to `mockProjectApis`, and:

```ts
it('lets an editor add forms but not rename or delete the project', async () => {
    mockProjectApis()
    const wrapper = mountView(ProjectDetailView, {}, [
        { action: 'read', subject: 'Project', conditions: { projectId: { $in: [1] } } },
        { action: 'forms.manage', subject: 'Project', conditions: { projectId: { $in: [1] } } },
    ])

    await vi.waitFor(() => expect(wrapper.text()).toContain('Contact request'))
    expect(wrapper.text()).not.toContain('Read only')
    expect(findButton(wrapper, 'New form')).toBeDefined()
    expect(findButton(wrapper, 'New API key')).toBeUndefined()
    expect(findButton(wrapper, 'Save')).toBeUndefined()
    expect(wrapper.text()).not.toContain('Delete project')
    expect(wrapper.text()).not.toContain('Members')
})
```

- [ ] **Step 6: Forms use `forms.manage`**

`InboundFormDetailView.vue`: `canUpdate = userAbility.can('forms.manage', projectSubject.value)`; remove `canDelete` and render `<FormDangerZone v-if="canUpdate" :form="form" />`. `FormsByProjectCard.vue`: `canUpdate(projectId)` checks `'forms.manage'`. Run `pnpm --filter frontend exec vitest run src/modules/inbound-forms src/modules/dashboard` and fix any spec that granted `update` to expect `forms.manage` instead.

- [ ] **Step 7: Run the projects specs and typecheck**

Run: `pnpm --filter frontend exec vitest run src/modules/projects && pnpm --filter frontend typecheck`
Expected: PASS, no type errors left from Task 12.

- [ ] **Step 8: Verify instead of committing**

`pnpm --filter frontend exec prettier --check src/modules/projects src/modules/inbound-forms src/modules/dashboard src/locales/en.json`.

---

### Task 16: Roles area — router, navigation, list view, create dialog

**Files:**

- Modify: `apps/frontend/src/router/RouteNames.ts`, `apps/frontend/src/router/index.ts`
- Modify: `apps/frontend/src/modules/dashboard/layouts/partials/AppNavigation.vue` (+ `layouts/__tests__/AppLayout.spec.ts`)
- Create: `apps/frontend/src/modules/roles/views/list/RoleListView.vue` (+ `views/list/__tests__/RoleListView.spec.ts`)
- Create: `apps/frontend/src/modules/roles/views/list/partials/AddRoleDialog.vue` (+ `views/list/__tests__/AddRoleDialog.spec.ts`)
- Modify: `apps/frontend/src/locales/en.json`

**Interfaces:**

- Consumes: `useRolesQuery`, `useRoleCreateMutation` (Task 13), `allRoles()`/`globalRoles` fixtures (Task 12).
- Produces: `RouteNames.ROLE_LIST = 'roles::list'`, `RouteNames.ROLE_DETAILS = 'roles::details'`, routes `/roles` and `/roles/:roleId` (section `roles`, ability `read Role`), nav entry "Roles", `AddRoleDialog` (`v-model` boolean).

- [ ] **Step 1: Routes and navigation**

`RouteNames.ts` — add after `USER_DETAILS`:

```ts
    ROLE_LIST = 'roles::list',
    ROLE_DETAILS = 'roles::details',
```

`router/index.ts` — extend the `section` union with `'roles'`, import the two views, and add after the users routes:

```ts
                {
                    path: '/roles',
                    name: RouteNames.ROLE_LIST,
                    component: RoleListView,
                    meta: { section: 'roles', ability: { action: 'read', subject: 'Role' } },
                },
                {
                    path: '/roles/:roleId',
                    name: RouteNames.ROLE_DETAILS,
                    component: RoleDetailView,
                    meta: { section: 'roles', ability: { action: 'read', subject: 'Role' } },
                },
```

(`RoleDetailView` is created in Task 17; create it as an empty placeholder view in this task — `<template><PageHeader :title="t('module.roles.details.thing')" /></template>` — so the router compiles, then Task 17 fills it in.)

`AppNavigation.vue` — import `mdiShieldAccountOutline` and insert between the users and settings items:

```ts
        {
            group: 'admin',
            section: 'roles',
            title: t('nav.roles'),
            icon: mdiShieldAccountOutline,
            to: { name: RouteNames.ROLE_LIST },
            can: userAbility.can('read', 'Role'),
        },
```

i18n: `nav.roles: "Roles"`, `nav.permission.Role: "View roles"`.

`AppLayout.spec.ts`: add `{ path: '/roles', name: RouteNames.ROLE_LIST, component: Page }` to `layoutRouter`, include `'Roles'` in the "shows every item" labels and in the "leaves out items" hidden labels.

- [ ] **Step 2: Write the failing list-view spec**

`modules/roles/views/list/__tests__/RoleListView.spec.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthApi, RoleApi } from 'api'
import RoleListView from '../RoleListView.vue'
import { findButton, mountInApp } from '@/__tests__/support.ts'
import { allRoles, heldAll } from '@/modules/roles/__tests__/roleFixtures.ts'
import { signedIn } from '@/modules/users/views/__tests__/userFixtures.ts'

vi.stubGlobal('visualViewport', null)

afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
})

function mockApis() {
    vi.spyOn(RoleApi, 'getRoles').mockResolvedValue(allRoles())
    vi.spyOn(AuthApi, 'currentUser').mockResolvedValue(signedIn())
    vi.spyOn(AuthApi, 'getHeldPermissions').mockResolvedValue(heldAll())
}

describe('RoleListView', () => {
    it('lists global and project roles in two cards with counts', async () => {
        mockApis()
        const wrapper = mountInApp(RoleListView)

        await vi.waitFor(() => expect(wrapper.text()).toContain('Maintainer'))
        const titles = wrapper.findAll('h2').map((heading) => heading.text().replace(/\s*\d+$/, ''))
        expect(titles).toEqual(['Global roles', 'Project roles'])
        expect(wrapper.text()).toContain('System')
        expect(wrapper.text()).toContain('All permissions')
        expect(wrapper.text()).toContain('2 permissions')
        expect(wrapper.text()).toContain('2 users')
        expect(wrapper.text()).toContain('3 members')
        expect(wrapper.findAll('.list-row--link')).toHaveLength(7)
    })

    it('shows New role only with the create permission', async () => {
        mockApis()
        const wrapper = mountInApp(RoleListView, {}, [{ action: 'read', subject: 'Role' }])

        await vi.waitFor(() => expect(wrapper.text()).toContain('Maintainer'))
        expect(findButton(wrapper, 'New role')).toBeUndefined()
    })

    it('offers a retry when loading fails', async () => {
        vi.spyOn(RoleApi, 'getRoles').mockRejectedValue({ statusCode: 503, message: 'Unavailable' })
        const wrapper = mountInApp(RoleListView)

        await vi.waitFor(() => expect(wrapper.text()).toContain("Couldn't load roles"))
        expect(findButton(wrapper, 'Try again')).toBeDefined()
    })
})
```

Run: `pnpm --filter frontend exec vitest run src/modules/roles/views/list` → FAIL.

- [ ] **Step 3: Write `RoleListView.vue`**

```vue
<template>
    <PageHeader :title="t('module.roles.list.title')" :description="t('module.roles.list.description')">
        <template v-if="canCreate" #actions>
            <VBtn
                variant="flat"
                color="primary"
                :prepend-icon="mdiPlus"
                :text="t('module.roles.list.create')"
                @click="createOpen = true"
            />
        </template>
    </PageHeader>

    <ErrorState
        v-if="isError"
        size="page"
        :thing="t('module.roles.list.thing')"
        :error="error"
        :retrying="isFetching"
        @retry="refetch()"
    />
    <PageSkeleton v-else-if="isPending" :cards="2" :label="t('module.roles.list.loading')" />
    <div v-else-if="roles" class="page-stack">
        <SectionCard
            v-for="scope in SCOPES"
            :key="scope"
            :title="t(`module.roles.list.${scope}.title`)"
            :description="t(`module.roles.list.${scope}.description`)"
            :count="byScope(scope).length"
            :refetching="isFetching"
            flush
        >
            <ListRow
                v-for="role in byScope(scope)"
                :key="role.roleId"
                :icon="mdiShieldAccountOutline"
                :subtitle="role.description ?? undefined"
                :to="{ name: RouteNames.ROLE_DETAILS, params: { roleId: role.roleId } }"
            >
                <template #title>
                    {{ role.name }}
                    <TagLabel v-if="role.type === 'super_admin'" :label="t('module.roles.system')" />
                </template>
                <template #meta>
                    <span class="role-meta">{{ permissionSummary(role) }}</span>
                    <span class="role-meta">{{ assignmentSummary(role) }}</span>
                </template>
            </ListRow>
        </SectionCard>
    </div>

    <AddRoleDialog v-if="canCreate" v-model="createOpen" />
</template>

<script setup lang="ts">
    import { computed, ref } from 'vue'
    import { useQuery } from '@tanstack/vue-query'
    import { useI18n } from 'vue-i18n'
    import { useAbility } from '@casl/vue'
    import { mdiPlus, mdiShieldAccountOutline } from '@mdi/js'
    import type { RoleDto, RoleScope } from 'api'
    import ErrorState from '@/components/ErrorState.vue'
    import ListRow from '@/components/ListRow.vue'
    import PageHeader from '@/components/PageHeader.vue'
    import SectionCard from '@/components/SectionCard.vue'
    import TagLabel from '@/components/TagLabel.vue'
    import PageSkeleton from '@/components/skeletons/PageSkeleton.vue'
    import { useRolesQuery } from '@/modules/roles/queries/useRolesQuery.ts'
    import AddRoleDialog from '@/modules/roles/views/list/partials/AddRoleDialog.vue'
    import { RouteNames } from '@/router/RouteNames.ts'

    const SCOPES: RoleScope[] = ['global', 'project']

    const { t } = useI18n()
    const userAbility = useAbility()
    const { data: roles, isPending, isError, error, isFetching, refetch } = useQuery(useRolesQuery())
    const createOpen = ref(false)

    const canCreate = computed(() => userAbility.can('create', 'Role'))

    function byScope(scope: RoleScope) {
        return (roles.value ?? []).filter((role) => role.scope === scope)
    }

    function permissionSummary(role: RoleDto) {
        if (role.type === 'super_admin') {
            return t('module.roles.list.allPermissions')
        }
        return t('module.roles.list.permissionCount', { count: role.permissions.length }, role.permissions.length)
    }

    function assignmentSummary(role: RoleDto) {
        const key = role.scope === 'global' ? 'module.roles.list.userCount' : 'module.roles.list.memberCount'
        return t(key, { count: role.assignmentCount }, role.assignmentCount)
    }
</script>

<style scoped>
    .role-meta {
        color: rgb(var(--v-theme-ink-muted));
        font-size: 0.75rem;
        line-height: 1rem;
        font-variant-numeric: tabular-nums;
    }
</style>
```

- [ ] **Step 4: Write the failing `AddRoleDialog` spec**

`views/list/__tests__/AddRoleDialog.spec.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RoleApi } from 'api'
import type { Router } from 'vue-router'
import AddRoleDialog from '../partials/AddRoleDialog.vue'
import { mountDialog, overlayText, setOverlayInput, submitOverlayForm } from '@/__tests__/support.ts'
import { allRoles, projectRoleSummaries } from '@/modules/roles/__tests__/roleFixtures.ts'
import { RouteNames } from '@/router/RouteNames.ts'

const { push } = vi.hoisted(() => ({ push: vi.fn<Router['push']>() }))

vi.mock('vue-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('vue-router')>()
    return { ...actual, useRouter: () => ({ push }) }
})

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

vi.stubGlobal('visualViewport', null)

afterEach(() => {
    vi.restoreAllMocks()
    push.mockReset()
    document.body.innerHTML = ''
})

async function openDialog() {
    vi.spyOn(RoleApi, 'getRoles').mockResolvedValue(allRoles())
    const result = mountDialog(AddRoleDialog)
    await vi.waitFor(() => expect(document.body.querySelector('input[name="name"]')).not.toBeNull())
    return result
}

async function pickOption(testId: string, label: string) {
    document.body
        .querySelector<HTMLElement>(`.v-overlay-container [data-testid="${testId}"] .v-field`)!
        .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await vi.waitFor(() => expect(document.body.querySelectorAll('.v-list-item').length).toBeGreaterThan(0))
    ;[...document.body.querySelectorAll<HTMLElement>('.v-list-item')]
        .find((item) => item.textContent?.trim() === label)!
        .click()
}

describe('AddRoleDialog', () => {
    it('creates a global role without permissions and opens its page', async () => {
        push.mockResolvedValue(undefined)
        const create = vi.spyOn(RoleApi, 'createRole').mockResolvedValue({ ...allRoles()[2]!, roleId: 12, name: 'Ops' })
        const { open } = await openDialog()

        await setOverlayInput('name', 'Ops')
        submitOverlayForm()

        await vi.waitFor(() =>
            expect(push).toHaveBeenCalledWith({ name: RouteNames.ROLE_DETAILS, params: { roleId: 12 } }),
        )
        expect(create).toHaveBeenCalledWith({
            body: { name: 'Ops', scope: 'global', description: null, permissions: [] },
        })
        expect(open.value).toBe(false)
    })

    it('copies the permissions of a template role in the chosen scope', async () => {
        push.mockResolvedValue(undefined)
        const create = vi.spyOn(RoleApi, 'createRole').mockResolvedValue({ ...projectRoleSummaries()[1]!, roleId: 13 })
        await openDialog()

        await setOverlayInput('name', 'Reviewer')
        await pickOption('scope', 'Project')
        await pickOption('startFrom', 'Editor')
        submitOverlayForm()

        await vi.waitFor(() =>
            expect(create).toHaveBeenCalledWith({
                body: { name: 'Reviewer', scope: 'project', description: null, permissions: ['read', 'forms.manage'] },
            }),
        )
    })

    it('starts fresh project roles with read', async () => {
        push.mockResolvedValue(undefined)
        const create = vi.spyOn(RoleApi, 'createRole').mockResolvedValue({ ...projectRoleSummaries()[0]!, roleId: 14 })
        await openDialog()

        await setOverlayInput('name', 'Guest')
        await pickOption('scope', 'Project')
        submitOverlayForm()

        await vi.waitFor(() =>
            expect(create).toHaveBeenCalledWith({
                body: { name: 'Guest', scope: 'project', description: null, permissions: ['read'] },
            }),
        )
    })

    it('keeps the dialog open with the error when creating fails', async () => {
        vi.spyOn(RoleApi, 'createRole').mockRejectedValue({ message: 'Name is already in use' })
        const { open } = await openDialog()

        await setOverlayInput('name', 'Admin')
        submitOverlayForm()

        await vi.waitFor(() => expect(overlayText()).toContain('Name is already in use'))
        expect(open.value).toBe(true)
    })
})
```

- [ ] **Step 5: Write `AddRoleDialog.vue`**

```vue
<template>
    <FormDialog
        v-model="model"
        :title="t('module.roles.add.title')"
        :submit-label="t('module.roles.add.submit')"
        :pending="isPending"
        :error="errorMessage"
        :dirty="meta.dirty"
        @submit="onSubmit"
    >
        <VTextField
            v-model="name"
            name="name"
            :label="requiredLabel(t('field.name'))"
            :error-messages="errors.name"
            aria-required="true"
        />
        <VSelect
            v-model="scope"
            name="scope"
            data-testid="scope"
            :label="requiredLabel(t('module.roles.add.scope'))"
            :items="scopeOptions"
            item-title="title"
            item-value="value"
            :hint="t(`module.roles.add.scopeHint.${scope}`)"
            persistent-hint
            :error-messages="errors.scope"
        />
        <VTextField
            v-model="description"
            name="description"
            :label="t('module.roles.add.description')"
            :error-messages="errors.description"
        />
        <VSelect
            v-model="startFrom"
            name="startFrom"
            data-testid="startFrom"
            :label="t('module.roles.add.startFrom')"
            :items="templateOptions"
            item-title="name"
            item-value="roleId"
            :hint="t('module.roles.add.startFromHint')"
            persistent-hint
            clearable
        />
    </FormDialog>
</template>

<script setup lang="ts">
    import { computed, ref, watch } from 'vue'
    import { useForm } from 'vee-validate'
    import { toTypedSchema } from '@vee-validate/zod'
    import { z } from 'zod'
    import { useI18n } from 'vue-i18n'
    import { useQuery } from '@tanstack/vue-query'
    import { useRouter } from 'vue-router'
    import type { CatalogPermission, RoleScope } from 'api'
    import FormDialog from '@/components/FormDialog.vue'
    import { useNotify } from '@/composables/useNotify.ts'
    import { useRequiredLabel } from '@/composables/useRequiredLabel.ts'
    import { apiErrorMessage } from '@/helper/apiErrorMessage.ts'
    import { useRoleCreateMutation } from '@/modules/roles/mutations/useRoleCreateMutation.ts'
    import { useRolesQuery } from '@/modules/roles/queries/useRolesQuery.ts'
    import { RouteNames } from '@/router/RouteNames.ts'

    const SCOPES: RoleScope[] = ['global', 'project']
    const FRESH_PERMISSIONS: Record<RoleScope, CatalogPermission[]> = { global: [], project: ['read'] }

    const model = defineModel<boolean>({ required: true })
    const { t } = useI18n()
    const requiredLabel = useRequiredLabel()
    const notify = useNotify()
    const router = useRouter()
    const errorMessage = ref<string | null>(null)
    const { mutateAsync, isPending } = useRoleCreateMutation()
    const { data: roles } = useQuery(useRolesQuery())

    const { defineField, handleSubmit, errors, resetForm, meta } = useForm({
        validationSchema: toTypedSchema(
            z.object({
                name: z.string().trim().min(1).max(100),
                scope: z.enum(['global', 'project']),
                description: z.string().trim().max(255).optional().or(z.literal('')),
                startFrom: z.number().nullable().optional(),
            }),
        ),
        initialValues: { scope: 'global', description: '', startFrom: null },
    })

    const [name] = defineField('name')
    const [scope] = defineField('scope')
    const [description] = defineField('description')
    const [startFrom] = defineField('startFrom')

    const scopeOptions = computed(() => SCOPES.map((value) => ({ value, title: t(`module.roles.scope.${value}`) })))
    const templateOptions = computed(() =>
        (roles.value ?? []).filter((role) => role.scope === scope.value && role.type !== 'super_admin'),
    )

    watch(scope, () => {
        startFrom.value = null
    })

    watch(
        model,
        (open) => {
            if (open) {
                errorMessage.value = null
                resetForm({ values: { name: '', scope: 'global', description: '', startFrom: null } })
            }
        },
        { immediate: true },
    )

    const onSubmit = handleSubmit(async (values) => {
        errorMessage.value = null
        const template = roles.value?.find((role) => role.roleId === values.startFrom)
        try {
            const { roleId } = await mutateAsync({
                name: values.name,
                scope: values.scope,
                description: values.description ? values.description : null,
                permissions: template?.permissions ?? FRESH_PERMISSIONS[values.scope],
            })
            model.value = false
            await router.push({ name: RouteNames.ROLE_DETAILS, params: { roleId } })
            notify.success(t('module.roles.add.success'))
        } catch (error) {
            errorMessage.value = apiErrorMessage(error, t('module.roles.add.error'))
        }
    })
</script>
```

- [ ] **Step 6: i18n for the roles module**

Add under `module`:

```json
        "roles": {
            "system": "System",
            "scope": {
                "global": "Global",
                "project": "Project"
            },
            "list": {
                "title": "Roles",
                "description": "Permission sets you assign to users and project members.",
                "create": "New role",
                "thing": "roles",
                "loading": "Loading roles",
                "allPermissions": "All permissions",
                "permissionCount": "No permissions | 1 permission | {count} permissions",
                "userCount": "No users | 1 user | {count} users",
                "memberCount": "No members | 1 member | {count} members",
                "global": {
                    "title": "Global roles",
                    "description": "Apply everywhere. Every user has exactly one."
                },
                "project": {
                    "title": "Project roles",
                    "description": "Apply inside one project. Every member has exactly one per project."
                }
            },
            "add": {
                "title": "New role",
                "submit": "Create role",
                "scope": "Scope",
                "scopeHint": {
                    "global": "Global roles are assigned to users.",
                    "project": "Project roles are assigned to project members."
                },
                "description": "Description (optional)",
                "startFrom": "Start from (optional)",
                "startFromHint": "Copies that role's permissions. You can change them afterwards.",
                "success": "Role created",
                "error": "Couldn't create the role. Check your connection and try again."
            },
            "details": {
                "thing": "role",
                "loading": "Loading role",
                "backToList": "Back to roles",
                "assignedUsers": "Assigned to no users | Assigned to 1 user | Assigned to {count} users",
                "assignedMembers": "Assigned to no project members | Assigned to 1 project member | Assigned to {count} project members",
                "manageUsers": "Manage in Users",
                "system": {
                    "title": "System role with every permission",
                    "text": "Super admins can do everything. This role can't be changed or deleted."
                },
                "profile": {
                    "title": "Profile",
                    "description": "Description",
                    "saved": "Role saved",
                    "error": "Couldn't save the role"
                },
                "permissions": {
                    "title": "Permissions",
                    "description": "Everyone holding this role gets these. You can only add or remove permissions you hold yourself.",
                    "readRequired": "Every project role includes viewing.",
                    "saved": "Permissions saved",
                    "error": "Couldn't save the permissions"
                }
            },
            "delete": {
                "title": "Delete role",
                "description": "Removes {name}. This can't be undone.",
                "blocked": "{name} is still assigned. Move everyone to another role first.",
                "action": "Delete role…",
                "confirmTitle": "Delete role {name}?",
                "confirmBody": "The role is removed permanently. This can't be undone.",
                "confirm": "Delete role",
                "done": "{name} deleted",
                "error": "Couldn't delete the role"
            }
        },
```

- [ ] **Step 7: Run the list specs**

Run: `pnpm --filter frontend exec vitest run src/modules/roles/views/list src/modules/dashboard/layouts`
Expected: PASS.

- [ ] **Step 8: Verify instead of committing**

`pnpm --filter frontend exec prettier --check src/modules/roles src/router src/modules/dashboard src/locales/en.json`.

---

### Task 17: Role detail page

**Files:**

- Modify: `apps/frontend/src/modules/roles/views/details/RoleDetailView.vue` (placeholder from Task 16)
- Create: `apps/frontend/src/modules/roles/views/details/partials/RoleProfileCard.vue`
- Create: `apps/frontend/src/modules/roles/views/details/partials/RolePermissionsCard.vue`
- Create: `apps/frontend/src/modules/roles/views/details/__tests__/RoleDetailView.spec.ts`
- Create: `apps/frontend/src/modules/roles/views/details/__tests__/RolePermissionsCard.spec.ts`

**Interfaces:**

- Consumes: `useRoleQuery`, `useRoleUpdateMutation`, `useRoleDeleteMutation`, `useAuthPermissionsQuery`, `PermissionGrid`, catalog groups and type guards (Task 13), i18n from Task 16.
- Produces: `RoleProfileCard { role: RoleDto; canUpdate: boolean }`, `RolePermissionsCard { role: RoleDto; canUpdate: boolean }`.

- [ ] **Step 1: Write the failing view spec**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthApi, RoleApi } from 'api'
import RoleDetailView from '../RoleDetailView.vue'
import { findButton, mountInApp } from '@/__tests__/support.ts'
import { globalRoles, heldAll, projectRoleSummaries } from '@/modules/roles/__tests__/roleFixtures.ts'
import { signedIn } from '@/modules/users/views/__tests__/userFixtures.ts'

const { params } = vi.hoisted(() => ({ params: { roleId: '2' } }))

vi.mock('vue-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('vue-router')>()
    return {
        ...actual,
        useRoute: () => ({ params, meta: {} }),
        useRouter: () => ({ push: vi.fn().mockResolvedValue(undefined) }),
        onBeforeRouteLeave: vi.fn<typeof actual.onBeforeRouteLeave>(),
    }
})

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

vi.stubGlobal('visualViewport', null)

afterEach(() => {
    vi.restoreAllMocks()
    params.roleId = '2'
    document.body.innerHTML = ''
})

function mockApis(role = globalRoles[1]!) {
    params.roleId = String(role.roleId)
    vi.spyOn(RoleApi, 'getRole').mockResolvedValue(role)
    vi.spyOn(AuthApi, 'currentUser').mockResolvedValue(signedIn())
    vi.spyOn(AuthApi, 'getHeldPermissions').mockResolvedValue(heldAll())
}

describe('RoleDetailView', () => {
    it('shows profile, permissions and the danger zone of a custom role', async () => {
        mockApis({ ...globalRoles[1]!, assignmentCount: 0 })
        const wrapper = mountInApp(RoleDetailView)

        await vi.waitFor(() => expect(wrapper.get('h1').text()).toContain('Admin'))
        const titles = wrapper.findAll('h2').map((heading) => heading.text())
        expect(titles).toEqual(['Profile', 'Permissions', 'Delete role'])
        expect(wrapper.get('.page-header').text()).toContain('Global')
        expect(wrapper.text()).toContain('Assigned to no users')
        expect(findButton(wrapper, 'Delete role…')).toBeDefined()
    })

    it('blocks deletion while the role is assigned', async () => {
        mockApis(globalRoles[1]!)
        const wrapper = mountInApp(RoleDetailView)

        await vi.waitFor(() => expect(wrapper.text()).toContain('Assigned to 1 user'))
        expect(wrapper.text()).toContain('Admin is still assigned')
        expect(findButton(wrapper, 'Delete role…')).toBeUndefined()
    })

    it('shows the super admin role read-only', async () => {
        mockApis(globalRoles[0]!)
        const wrapper = mountInApp(RoleDetailView)

        await vi.waitFor(() => expect(wrapper.text()).toContain('System role with every permission'))
        expect(wrapper.findAll('h2').map((heading) => heading.text())).toEqual(['Profile'])
        expect(wrapper.find('input[name="name"]').exists()).toBe(false)
    })

    it('hides editing without roles.update', async () => {
        mockApis(projectRoleSummaries()[0]!)
        const wrapper = mountInApp(RoleDetailView, {}, [{ action: 'read', subject: 'Role' }])

        await vi.waitFor(() => expect(wrapper.get('h1').text()).toContain('Viewer'))
        expect(wrapper.find('input[name="name"]').exists()).toBe(false)
        expect(findButton(wrapper, 'Save')).toBeUndefined()
        expect(wrapper.text()).not.toContain('Delete role')
    })

    it('shows the not-found state', async () => {
        vi.spyOn(RoleApi, 'getRole').mockRejectedValue({ statusCode: 404 })
        vi.spyOn(AuthApi, 'currentUser').mockResolvedValue(signedIn())
        const wrapper = mountInApp(RoleDetailView)

        await vi.waitFor(() => expect(wrapper.text()).toContain("This role doesn't exist"))
        expect(findButton(wrapper, 'Back to roles')).toBeDefined()
    })
})
```

`RolePermissionsCard.spec.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthApi, RoleApi } from 'api'
import RolePermissionsCard from '../partials/RolePermissionsCard.vue'
import { findButton, mountInApp } from '@/__tests__/support.ts'
import { globalRoles, heldAll, heldOnly, projectRoleSummaries } from '@/modules/roles/__tests__/roleFixtures.ts'
import { useNotificationHost } from '@/composables/useNotify.ts'

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

vi.mock('vue-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('vue-router')>()
    return { ...actual, onBeforeRouteLeave: vi.fn<typeof actual.onBeforeRouteLeave>() }
})

vi.stubGlobal('visualViewport', null)

const notifications = useNotificationHost()

afterEach(() => {
    vi.restoreAllMocks()
    notifications.dismiss()
    document.body.innerHTML = ''
})

function checkbox(wrapper: ReturnType<typeof mountInApp>, permission: string) {
    return wrapper.get(`input[value="${permission}"]`).element as HTMLInputElement
}

describe('RolePermissionsCard', () => {
    it('saves the changed permission set of a global role', async () => {
        vi.spyOn(AuthApi, 'getHeldPermissions').mockResolvedValue(heldAll())
        const update = vi.spyOn(RoleApi, 'updateRole').mockResolvedValue(globalRoles[1]!)
        const wrapper = mountInApp(RolePermissionsCard, { role: globalRoles[1], canUpdate: true })

        expect(checkbox(wrapper, 'domains.read').checked).toBe(true)
        await wrapper.get('input[value="users.read"]').setValue(true)
        expect(wrapper.text()).toContain('Unsaved changes')
        await wrapper.get('form').trigger('submit')

        await vi.waitFor(() =>
            expect(update).toHaveBeenCalledWith({
                path: { roleId: 2 },
                body: { permissions: ['domains.read', 'projects.all', 'users.read'] },
            }),
        )
        await vi.waitFor(() => expect(notifications.current.value?.text).toBe('Permissions saved'))
    })

    it('keeps read required on project roles and uses project-wide held permissions', async () => {
        vi.spyOn(AuthApi, 'getHeldPermissions').mockResolvedValue(heldOnly([], ['read', 'forms.manage']))
        const wrapper = mountInApp(RolePermissionsCard, { role: projectRoleSummaries()[0], canUpdate: true })

        await vi.waitFor(() => expect(wrapper.text()).toContain("You don't hold this permission"))
        expect(checkbox(wrapper, 'read').checked).toBe(true)
        expect(checkbox(wrapper, 'read').disabled).toBe(true)
        expect(checkbox(wrapper, 'forms.manage').disabled).toBe(false)
        expect(checkbox(wrapper, 'delete').disabled).toBe(true)
    })

    it('is read-only without the update permission', () => {
        vi.spyOn(AuthApi, 'getHeldPermissions').mockResolvedValue(heldAll())
        const wrapper = mountInApp(RolePermissionsCard, { role: globalRoles[1], canUpdate: false })

        expect(checkbox(wrapper, 'users.read').disabled).toBe(true)
        expect(findButton(wrapper, 'Save')).toBeUndefined()
    })
})
```

Run both → FAIL.

- [ ] **Step 2: Write `RolePermissionsCard.vue`**

```vue
<template>
    <SectionCard
        :title="t('module.roles.details.permissions.title')"
        :description="t('module.roles.details.permissions.description')"
    >
        <form :id="formId" class="role-permissions" novalidate @submit.prevent="onSave">
            <InlineAlert
                v-if="errorMessage"
                tone="error"
                :title="t('module.roles.details.permissions.error')"
                :text="errorMessage"
            />
            <PermissionGrid
                v-if="role.scope === 'global'"
                scope="global"
                :groups="GLOBAL_PERMISSION_GROUPS"
                :model-value="globalSelected"
                :grantable="held?.permissions ?? []"
                :readonly="!canUpdate"
                @update:model-value="selected = $event"
            />
            <PermissionGrid
                v-else
                scope="project"
                :groups="PROJECT_PERMISSION_GROUPS"
                :model-value="projectSelected"
                :grantable="held?.projectPermissions ?? []"
                :required="REQUIRED_PROJECT_PERMISSIONS"
                :readonly="!canUpdate"
                @update:model-value="selected = $event"
            />
            <p v-if="role.scope === 'project'" class="role-permissions__note">
                {{ t('module.roles.details.permissions.readRequired') }}
            </p>
        </form>
        <template v-if="canUpdate" #footer>
            <SaveFooter :form="formId" :dirty="dirty" :pending="isPending" @discard="discard" />
        </template>
    </SectionCard>
</template>

<script setup lang="ts">
    import { computed, ref, useId, watch } from 'vue'
    import { useQuery } from '@tanstack/vue-query'
    import { useI18n } from 'vue-i18n'
    import type { CatalogPermission, ProjectPermission, RoleDto } from 'api'
    import InlineAlert from '@/components/InlineAlert.vue'
    import SaveFooter from '@/components/SaveFooter.vue'
    import SectionCard from '@/components/SectionCard.vue'
    import { useDirtyGuard } from '@/composables/useDirtyGuard.ts'
    import { useNotify } from '@/composables/useNotify.ts'
    import { apiErrorMessage } from '@/helper/apiErrorMessage.ts'
    import { useAuthPermissionsQuery } from '@/modules/auth/queries/useAuthPermissionsQuery.ts'
    import PermissionGrid from '@/modules/roles/components/PermissionGrid.vue'
    import { useRoleUpdateMutation } from '@/modules/roles/mutations/useRoleUpdateMutation.ts'
    import {
        GLOBAL_PERMISSION_GROUPS,
        isGlobalPermission,
        isProjectPermission,
        PROJECT_PERMISSION_GROUPS,
    } from '@/modules/roles/permissionCatalog.ts'

    const REQUIRED_PROJECT_PERMISSIONS: ProjectPermission[] = ['read']

    const props = defineProps<{ role: RoleDto; canUpdate: boolean }>()

    const { t } = useI18n()
    const notify = useNotify()
    const formId = useId()
    const errorMessage = ref<string | null>(null)
    const selected = ref<CatalogPermission[]>([...props.role.permissions])
    const { mutateAsync, isPending } = useRoleUpdateMutation()
    const { data: held } = useQuery({ ...useAuthPermissionsQuery(), enabled: computed(() => props.canUpdate) })

    const globalSelected = computed(() => selected.value.filter(isGlobalPermission))
    const projectSelected = computed(() => selected.value.filter(isProjectPermission))
    const sortedKey = (permissions: CatalogPermission[]) => [...permissions].sort().join()
    const dirty = computed(() => sortedKey(selected.value) !== sortedKey(props.role.permissions))

    useDirtyGuard(dirty)

    watch(
        () => props.role.permissions,
        (permissions) => {
            if (!dirty.value) {
                selected.value = [...permissions]
            }
        },
    )

    function discard() {
        errorMessage.value = null
        selected.value = [...props.role.permissions]
    }

    async function onSave() {
        errorMessage.value = null
        try {
            await mutateAsync({ roleId: props.role.roleId, body: { permissions: selected.value } })
            notify.success(t('module.roles.details.permissions.saved'))
        } catch (error) {
            errorMessage.value = apiErrorMessage(error, t('dialog.tryAgain'))
        }
    }
</script>

<style scoped>
    .role-permissions {
        display: grid;
        gap: 20px;
    }

    .role-permissions__note {
        margin: 0;
        color: rgb(var(--v-theme-ink-muted));
        font-size: 0.75rem;
        line-height: 1rem;
    }
</style>
```

- [ ] **Step 3: Write `RoleProfileCard.vue`**

```vue
<template>
    <SectionCard :title="t('module.roles.details.profile.title')">
        <form v-if="canUpdate" :id="formId" class="form-grid form-grid--2" novalidate @submit.prevent="onSubmit">
            <InlineAlert
                v-if="errorMessage"
                class="span-2"
                tone="error"
                :title="t('module.roles.details.profile.error')"
                :text="errorMessage"
            />
            <VTextField
                v-model="name"
                name="name"
                :label="requiredLabel(t('field.name'))"
                :error-messages="errors.name"
                aria-required="true"
            />
            <VTextField
                v-model="description"
                name="description"
                :label="t('module.roles.details.profile.description')"
                :error-messages="errors.description"
            />
        </form>
        <div v-else class="form-grid form-grid--2">
            <ReadonlyValue :label="t('field.name')" :value="role.name" />
            <ReadonlyValue :label="t('module.roles.details.profile.description')" :value="role.description" />
        </div>
        <template v-if="canUpdate" #footer>
            <SaveFooter :form="formId" :dirty="meta.dirty" :pending="isPending" @discard="discard" />
        </template>
    </SectionCard>
</template>

<script setup lang="ts">
    import { ref, useId, watch } from 'vue'
    import { useForm } from 'vee-validate'
    import { toTypedSchema } from '@vee-validate/zod'
    import { z } from 'zod'
    import { useI18n } from 'vue-i18n'
    import type { RoleDto } from 'api'
    import InlineAlert from '@/components/InlineAlert.vue'
    import ReadonlyValue from '@/components/ReadonlyValue.vue'
    import SaveFooter from '@/components/SaveFooter.vue'
    import SectionCard from '@/components/SectionCard.vue'
    import { useDirtyGuard } from '@/composables/useDirtyGuard.ts'
    import { useNotify } from '@/composables/useNotify.ts'
    import { useRequiredLabel } from '@/composables/useRequiredLabel.ts'
    import { apiErrorMessage } from '@/helper/apiErrorMessage.ts'
    import { useRoleUpdateMutation } from '@/modules/roles/mutations/useRoleUpdateMutation.ts'

    const props = defineProps<{ role: RoleDto; canUpdate: boolean }>()

    const { t } = useI18n()
    const requiredLabel = useRequiredLabel()
    const notify = useNotify()
    const formId = useId()
    const errorMessage = ref<string | null>(null)
    const { mutateAsync, isPending } = useRoleUpdateMutation()

    function initialValues(role: RoleDto) {
        return { name: role.name, description: role.description ?? '' }
    }

    const { defineField, handleSubmit, errors, meta, resetForm } = useForm({
        validationSchema: toTypedSchema(
            z.object({
                name: z.string().trim().min(1).max(100),
                description: z.string().trim().max(255).optional().or(z.literal('')),
            }),
        ),
        initialValues: initialValues(props.role),
    })

    const [name] = defineField('name')
    const [description] = defineField('description')

    useDirtyGuard(() => meta.value.dirty)

    watch(
        () => props.role,
        (role) => {
            if (!meta.value.dirty) {
                resetForm({ values: initialValues(role) })
            }
        },
    )

    function discard() {
        errorMessage.value = null
        resetForm({ values: initialValues(props.role) })
    }

    const onSubmit = handleSubmit(async (values) => {
        errorMessage.value = null
        try {
            await mutateAsync({
                roleId: props.role.roleId,
                body: { name: values.name, description: values.description ? values.description : null },
            })
            resetForm({ values })
            notify.success(t('module.roles.details.profile.saved'))
        } catch (error) {
            errorMessage.value = apiErrorMessage(error, t('dialog.tryAgain'))
        }
    })
</script>
```

- [ ] **Step 4: Write `RoleDetailView.vue`**

```vue
<template>
    <PageHeader :title="role?.name" :loading="isPending" :breadcrumbs="breadcrumbs">
        <template v-if="role" #status>
            <TagLabel :label="t(`module.roles.scope.${role.scope}`)" />
            <TagLabel v-if="isSystem" :label="t('module.roles.system')" />
        </template>
        <template v-if="role" #meta>
            <span>{{ assignmentSummary }}</span>
            <RouterLink
                v-if="role.scope === 'global' && canReadUsers"
                :to="{ name: RouteNames.USER_LIST }"
                class="row-link"
            >
                {{ t('module.roles.details.manageUsers') }}
            </RouterLink>
        </template>
    </PageHeader>

    <ErrorState
        v-if="isError"
        :kind="apiErrorStatus(error) === 404 ? 'notFound' : 'load'"
        size="page"
        :thing="t('module.roles.details.thing')"
        :error="error"
        :retrying="isFetching"
        @retry="refetch()"
    >
        <template #actions>
            <VBtn variant="text" :to="{ name: RouteNames.ROLE_LIST }" :text="t('module.roles.details.backToList')" />
        </template>
    </ErrorState>
    <PageSkeleton v-else-if="isPending" :cards="2" :label="t('module.roles.details.loading')" />
    <div v-else-if="role" class="page-stack">
        <InlineAlert
            v-if="isSystem"
            tone="info"
            :title="t('module.roles.details.system.title')"
            :text="t('module.roles.details.system.text')"
        />
        <RoleProfileCard :role="role" :can-update="canUpdate" />
        <RolePermissionsCard v-if="!isSystem" :role="role" :can-update="canUpdate" />
        <SectionCard
            v-if="canDelete"
            danger
            :title="t('module.roles.delete.title')"
            :description="
                role.assignmentCount > 0
                    ? t('module.roles.delete.blocked', { name: role.name })
                    : t('module.roles.delete.description', { name: role.name })
            "
        >
            <template v-if="role.assignmentCount === 0" #actions>
                <VBtn color="error" :text="t('module.roles.delete.action')" @click="confirmDelete" />
            </template>
        </SectionCard>
    </div>
</template>

<script setup lang="ts">
    import { computed } from 'vue'
    import { useQuery } from '@tanstack/vue-query'
    import { useRoute, useRouter } from 'vue-router'
    import { useI18n } from 'vue-i18n'
    import { useAbility } from '@casl/vue'
    import ErrorState from '@/components/ErrorState.vue'
    import InlineAlert from '@/components/InlineAlert.vue'
    import PageHeader from '@/components/PageHeader.vue'
    import SectionCard from '@/components/SectionCard.vue'
    import TagLabel from '@/components/TagLabel.vue'
    import PageSkeleton from '@/components/skeletons/PageSkeleton.vue'
    import { useConfirm } from '@/composables/useConfirm.ts'
    import { useNotify } from '@/composables/useNotify.ts'
    import { apiErrorStatus } from '@/helper/apiErrorStatus.ts'
    import { useRoleDeleteMutation } from '@/modules/roles/mutations/useRoleDeleteMutation.ts'
    import { useRoleQuery } from '@/modules/roles/queries/useRoleQuery.ts'
    import RolePermissionsCard from '@/modules/roles/views/details/partials/RolePermissionsCard.vue'
    import RoleProfileCard from '@/modules/roles/views/details/partials/RoleProfileCard.vue'
    import { RouteNames } from '@/router/RouteNames.ts'

    const { t } = useI18n()
    const route = useRoute()
    const router = useRouter()
    const userAbility = useAbility()
    const confirm = useConfirm()
    const notify = useNotify()
    const { mutateAsync: deleteRole } = useRoleDeleteMutation()
    const {
        data: role,
        isPending,
        isError,
        error,
        isFetching,
        refetch,
    } = useQuery(useRoleQuery(() => Number(route.params.roleId)))

    const isSystem = computed(() => role.value?.type === 'super_admin')
    const canUpdate = computed(() => !isSystem.value && userAbility.can('update', 'Role'))
    const canDelete = computed(() => !isSystem.value && userAbility.can('delete', 'Role'))
    const canReadUsers = computed(() => userAbility.can('read', 'User'))

    const breadcrumbs = computed(() => [{ title: t('nav.roles'), to: { name: RouteNames.ROLE_LIST } }])

    const assignmentSummary = computed(() => {
        if (!role.value) {
            return ''
        }
        const key =
            role.value.scope === 'global'
                ? 'module.roles.details.assignedUsers'
                : 'module.roles.details.assignedMembers'
        return t(key, { count: role.value.assignmentCount }, role.value.assignmentCount)
    })

    async function confirmDelete() {
        if (!role.value) {
            return
        }
        const name = role.value.name
        const confirmed = await confirm({
            title: t('module.roles.delete.confirmTitle', { name }),
            body: t('module.roles.delete.confirmBody'),
            confirmLabel: t('module.roles.delete.confirm'),
            destructive: true,
            errorText: t('module.roles.delete.error'),
            action: () => deleteRole(role.value!.roleId),
        })
        if (!confirmed) {
            return
        }
        await router.push({ name: RouteNames.ROLE_LIST })
        notify.success(t('module.roles.delete.done', { name }))
    }
</script>
```

- [ ] **Step 5: Run the detail specs**

Run: `pnpm --filter frontend exec vitest run src/modules/roles/views/details`
Expected: PASS.

- [ ] **Step 6: Verify instead of committing**

`pnpm --filter frontend exec prettier --check src/modules/roles`.

---

### Task 18: Full gate

**Files:** none new.

- [ ] **Step 1: Repository gate**

Run: `pnpm check`
Expected: lint, typecheck, unit tests and prettier all green across `backend`, `frontend` and `api`.

- [ ] **Step 2: Backend e2e**

Run: `pnpm --filter backend test:e2e`
Expected: PASS (needs Docker).

- [ ] **Step 3: Frontend Playwright (if the environment can run it)**

Run: `pnpm --filter frontend exec playwright test`
Expected: PASS, in particular `07-users.spec.ts`. If Playwright cannot start browsers here, say so in the final report instead of skipping silently.

- [ ] **Step 4: Spec coverage check**

Walk the spec (`docs/superpowers/specs/2026-10-16-role-management-design.md`) section by section and confirm each requirement maps to shipped code and a test: catalog (Task 1), data model + migration (Task 2), ability (Task 3), role service rules (Task 4), role API (Task 5), member service + creator grant (Task 6), member API (Task 7), user create/update rules (Task 8), `/auth/permissions` (Task 9), finer enforcement (Task 10), e2e + client (Task 11), `DisclosureBox` (Task 12), held query/grid/catalog (Task 13), users UI (Task 14), projects UI + gating (Task 15), roles list/create (Task 16), role detail (Task 17). Report anything missing instead of patching it silently.
