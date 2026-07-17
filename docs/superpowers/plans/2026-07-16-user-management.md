# User Management & Permissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Role/permission system (CASL) with three seeded roles, per-user direct grants, project memberships, scoped backend endpoints, and a frontend users module with ability-gated UI.

**Architecture:** Normalized permission tables (`roles`, `role_permissions`, `user_permissions`, `project_members`) feed a backend `AbilityFactory` that builds CASL abilities (Redis-cached inputs). A `PoliciesGuard` + `@RequireAbility` decorator enforce static route checks; services enforce per-project checks. The frontend hydrates a CASL ability from `GET /auth/ability` and gates routes, nav, and buttons.

**Tech Stack:** NestJS 11, sequelize-typescript, umzug migrations, `@casl/ability` (backend + frontend), `@casl/vue`, Vue 3, TanStack Query, vee-validate + Zod, Vitest, Testcontainers e2e.

**Spec:** `docs/superpowers/specs/2026-07-16-user-management-design.md` — read it first; it defines the permission catalog, role semantics, and error rules (404 = not readable, 403 = readable but insufficient).

## Global Constraints

- **NEVER run git commands.** No `git add`/`commit`/`push` — the repository owner handles all git operations. Where this plan says "task complete", stop and report; do not commit.
- **No code comments.** Self-explanatory names only (repo rule).
- **Prettier style:** 4-space indent, single quotes, no semicolons, trailing commas. Run `pnpm format:fix` if unsure; never hand-format against these rules.
- **Every task must end green:** `pnpm --filter backend typecheck && pnpm --filter backend lint` (or `--filter frontend` for frontend tasks) plus the task's test commands.
- **Backend unit tests** run with `pnpm --filter backend exec vitest run <path>`. Frontend: `pnpm --filter frontend exec vitest run <path>`.
- **Type-safe test doubles** (repo rule): type every `vi.fn` with the collaborator's method signature (`vi.fn<UserService['createUser']>()`), model Sequelize rows as `Interface & { get(options: { plain: true }): Interface }`, no `as` casts for domain fixtures.
- **Permission catalog** (exact strings, defined once in `permission.constants.ts`): `domains.read`, `domains.create`, `domains.update`, `domains.delete`, `projects.create`, `projects.all`, `bounces.read`, `bounces.block`, `bounces.unblock`, `settings.read`, `settings.update`, `users.read`, `users.create`, `users.update`, `users.delete`, `roles.read`. Project-scoped levels: `read`, `update`, `delete`.
- **Role types:** `super_admin`, `admin`, `user`, `custom`. Code keys on `type`, never on display names (`Super Admin`, `Admin`, `User`).
- **Cache keys:** `auth:user:<userId>` (JWT principal), `auth:permissions:<userId>` (permission inputs). Both invalidated together on any permission-affecting change.
- The backend dev commands that boot Nest (`pnpm --filter backend generate`) need the dev infrastructure: `docker compose -f dev/docker-compose.yml up -d` and a migrated database (`pnpm --filter backend migrate up`).

## File Structure (new/modified)

```
apps/backend/src/modules/permission/            NEW module (@Global)
    permission.constants.ts                     catalog, role types, cache prefixes, ability mapping
    permission.module.ts
    interfaces/app-ability.ts                   AppAbility/AbilityAction/AbilitySubject types
    interfaces/role.interface.ts                Role, RoleWithPermissions, RolePermission, UserPermission
    interfaces/project-member.interface.ts      ProjectMember, ProjectMembership, ProjectMemberInfo
    models/role.model.ts
    models/role-permission.model.ts
    models/user-permission.model.ts
    models/project-member.model.ts
    services/ability-factory.service.ts         + PermissionInputs
    services/permission-cache.service.ts
    services/role.service.ts
    services/project-member.service.ts
    guards/policies.guard.ts
    decorators/RequireAbility.ts
    decorators/CurrentAbility.ts
    helpers/project-access.ts                   assertProjectReadable/Updatable/Deletable
    dtos/role.dto.ts
    controller/role.controller.ts
apps/backend/src/migrations/010-create-permissions.ts
apps/backend/src/modules/user/                  roleId wiring + management endpoints
apps/backend/src/modules/auth/                  role in principal, GET /auth/ability
apps/backend/src/modules/project/               scoping + member endpoints
apps/backend/src/modules/inbound-form/          project-scoped checks
apps/frontend/src/plugins/casl.ts               NEW ability singleton
apps/frontend/src/modules/auth/queries/useAbilityQuery.ts
apps/frontend/src/modules/users/                NEW feature module
apps/frontend/src/modules/projects/…/ProjectMembersCard.vue
```

---

### Task 1: Permission catalog, models, and migration

**Files:**

- Create: `apps/backend/src/modules/permission/permission.constants.ts`
- Create: `apps/backend/src/modules/permission/interfaces/app-ability.ts`
- Create: `apps/backend/src/modules/permission/interfaces/role.interface.ts`
- Create: `apps/backend/src/modules/permission/interfaces/project-member.interface.ts`
- Create: `apps/backend/src/modules/permission/models/role.model.ts`
- Create: `apps/backend/src/modules/permission/models/role-permission.model.ts`
- Create: `apps/backend/src/modules/permission/models/user-permission.model.ts`
- Create: `apps/backend/src/modules/permission/models/project-member.model.ts`
- Create: `apps/backend/src/modules/permission/permission.module.ts`
- Create: `apps/backend/src/migrations/010-create-permissions.ts`
- Modify: `apps/backend/src/app.module.ts` (register `PermissionModule`)

**Interfaces:**

- Consumes: nothing new (models reference existing `UserModel`, `ProjectModel`).
- Produces: `Permission`, `ProjectPermission`, `RoleType`, `GLOBAL_PERMISSIONS`, `PROJECT_PERMISSIONS`, `ROLE_TYPES`, `GLOBAL_PERMISSION_ABILITIES`, `AUTH_USER_CACHE_PREFIX`, `AUTH_PERMISSIONS_CACHE_PREFIX`, `AppAbility`, `AbilityAction`, `AbilitySubjectName`, `Role`, `RoleWithPermissions`, `ProjectMember`, `ProjectMembership`, `ProjectMemberInfo`, the four Sequelize models, and the seeded database schema. Later tasks import all of these by these exact names.

- [ ] **Step 1: Install the backend CASL dependency**

Run: `pnpm --filter backend add @casl/ability`
Expected: `@casl/ability` (v6.x) appears in `apps/backend/package.json` dependencies.

- [ ] **Step 2: Write the constants file**

`apps/backend/src/modules/permission/permission.constants.ts`:

```ts
import { AbilityAction, AbilitySubjectName } from './interfaces/app-ability'

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
] as const

export type Permission = (typeof GLOBAL_PERMISSIONS)[number]

export const PROJECT_PERMISSIONS = ['read', 'update', 'delete'] as const

export type ProjectPermission = (typeof PROJECT_PERMISSIONS)[number]

export const ROLE_TYPES = ['super_admin', 'admin', 'user', 'custom'] as const

export type RoleType = (typeof ROLE_TYPES)[number]

export const GLOBAL_PERMISSION_ABILITIES: Record<
    Permission,
    readonly (readonly [AbilityAction, AbilitySubjectName])[]
> = {
    'domains.read': [['read', 'Domain']],
    'domains.create': [['create', 'Domain']],
    'domains.update': [['update', 'Domain']],
    'domains.delete': [['delete', 'Domain']],
    'projects.create': [['create', 'Project']],
    'projects.all': [
        ['read', 'Project'],
        ['update', 'Project'],
        ['delete', 'Project'],
    ],
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
}

export const AUTH_USER_CACHE_PREFIX = 'auth:user:'

export const AUTH_PERMISSIONS_CACHE_PREFIX = 'auth:permissions:'
```

- [ ] **Step 3: Write the ability type definitions**

`apps/backend/src/modules/permission/interfaces/app-ability.ts`:

```ts
import { ForcedSubject, MongoAbility } from '@casl/ability'

export type AbilityAction = 'manage' | 'read' | 'create' | 'update' | 'delete' | 'block' | 'unblock'

export type AbilitySubjectName = 'Domain' | 'Project' | 'Bounce' | 'Settings' | 'User' | 'Role' | 'all'

export type AbilitySubject = AbilitySubjectName | (Record<string, unknown> & ForcedSubject<AbilitySubjectName>)

export type AppAbility = MongoAbility<[AbilityAction, AbilitySubject]>
```

- [ ] **Step 4: Write the domain interfaces**

`apps/backend/src/modules/permission/interfaces/role.interface.ts`:

```ts
import { Permission, RoleType } from '../permission.constants'

export interface Role {
    roleId: number
    name: string
    type: RoleType
    createdAt: Date
    updatedAt: Date
}

export interface RoleWithPermissions extends Role {
    permissions: Permission[]
}

export interface RolePermission {
    rolePermissionId: number
    roleId: number
    permission: Permission
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

`apps/backend/src/modules/permission/interfaces/project-member.interface.ts`:

```ts
import { ProjectPermission } from '../permission.constants'

export interface ProjectMember {
    projectMemberId: number
    projectId: number
    userId: number
    permission: ProjectPermission
    createdAt: Date
    updatedAt: Date
}

export type ProjectMemberCreate = Omit<ProjectMember, 'projectMemberId' | 'createdAt' | 'updatedAt'>

export interface ProjectMembership {
    projectId: number
    projectName: string
    permissions: ProjectPermission[]
}

export interface ProjectMemberInfo {
    userId: number
    firstName: string
    lastName: string
    email: string
    permissions: ProjectPermission[]
}
```

- [ ] **Step 5: Write the four models**

`apps/backend/src/modules/permission/models/role.model.ts`:

```ts
import {
    AllowNull,
    AutoIncrement,
    Column,
    CreatedAt,
    DataType,
    HasMany,
    Model,
    PrimaryKey,
    Table,
    Unique,
    UpdatedAt,
} from 'sequelize-typescript'
import { Role } from '../interfaces/role.interface'
import { RoleType } from '../permission.constants'
import { RolePermissionModel } from './role-permission.model'

export type RoleCreate = Omit<Role, 'roleId' | 'createdAt' | 'updatedAt'>

@Table({
    timestamps: true,
    tableName: 'roles',
})
export class RoleModel extends Model<Role, RoleCreate> implements Role {
    @PrimaryKey
    @AutoIncrement
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare roleId: number

    @Unique
    @AllowNull(false)
    @Column(DataType.STRING(255))
    declare name: string

    @AllowNull(false)
    @Column(DataType.STRING(32))
    declare type: RoleType

    @HasMany(() => RolePermissionModel)
    declare permissions: RolePermissionModel[]

    @CreatedAt
    declare createdAt: Date

    @UpdatedAt
    declare updatedAt: Date
}
```

`apps/backend/src/modules/permission/models/role-permission.model.ts`:

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
import { RolePermission, RolePermissionCreate } from '../interfaces/role.interface'
import { Permission } from '../permission.constants'
import { RoleModel } from './role.model'

@Table({
    timestamps: true,
    tableName: 'role_permissions',
})
export class RolePermissionModel extends Model<RolePermission, RolePermissionCreate> implements RolePermission {
    @PrimaryKey
    @AutoIncrement
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare rolePermissionId: number

    @ForeignKey(() => RoleModel)
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare roleId: number

    @AllowNull(false)
    @Column(DataType.STRING(64))
    declare permission: Permission

    @CreatedAt
    declare createdAt: Date

    @UpdatedAt
    declare updatedAt: Date
}
```

`apps/backend/src/modules/permission/models/user-permission.model.ts`:

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
import { UserPermission, UserPermissionCreate } from '../interfaces/role.interface'
import { Permission } from '../permission.constants'
import { UserModel } from '../../user/models/user.model'

@Table({
    timestamps: true,
    tableName: 'user_permissions',
})
export class UserPermissionModel extends Model<UserPermission, UserPermissionCreate> implements UserPermission {
    @PrimaryKey
    @AutoIncrement
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare userPermissionId: number

    @ForeignKey(() => UserModel)
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare userId: number

    @AllowNull(false)
    @Column(DataType.STRING(64))
    declare permission: Permission

    @CreatedAt
    declare createdAt: Date

    @UpdatedAt
    declare updatedAt: Date
}
```

`apps/backend/src/modules/permission/models/project-member.model.ts`:

```ts
import {
    AllowNull,
    AutoIncrement,
    BelongsTo,
    Column,
    CreatedAt,
    DataType,
    ForeignKey,
    Model,
    PrimaryKey,
    Table,
    UpdatedAt,
} from 'sequelize-typescript'
import { ProjectMember, ProjectMemberCreate } from '../interfaces/project-member.interface'
import { ProjectPermission } from '../permission.constants'
import { ProjectModel } from '../../project/models/project.model'
import { UserModel } from '../../user/models/user.model'

@Table({
    timestamps: true,
    tableName: 'project_members',
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

    @AllowNull(false)
    @Column(DataType.STRING(16))
    declare permission: ProjectPermission

    @BelongsTo(() => ProjectModel)
    declare project?: ProjectModel

    @BelongsTo(() => UserModel)
    declare user?: UserModel

    @CreatedAt
    declare createdAt: Date

    @UpdatedAt
    declare updatedAt: Date
}
```

- [ ] **Step 6: Write the module and register it**

`apps/backend/src/modules/permission/permission.module.ts`:

```ts
import { Global, Module } from '@nestjs/common'
import { SequelizeModule } from '@nestjs/sequelize'
import { RoleModel } from './models/role.model'
import { RolePermissionModel } from './models/role-permission.model'
import { UserPermissionModel } from './models/user-permission.model'
import { ProjectMemberModel } from './models/project-member.model'
import { ProjectModel } from '../project/models/project.model'
import { UserModel } from '../user/models/user.model'

@Global()
@Module({
    imports: [
        SequelizeModule.forFeature([
            RoleModel,
            RolePermissionModel,
            UserPermissionModel,
            ProjectMemberModel,
            ProjectModel,
            UserModel,
        ]),
    ],
    exports: [SequelizeModule],
})
export class PermissionModule {}
```

In `apps/backend/src/app.module.ts`, add the import line and register the module in the `imports` array (after `SetupModule`):

```ts
import { PermissionModule } from './modules/permission/permission.module'
```

```ts
        SetupModule,
        PermissionModule,
```

- [ ] **Step 7: Write the migration**

`apps/backend/src/migrations/010-create-permissions.ts`:

```ts
import type { MigrationFn } from 'umzug'
import { DataTypes, type QueryInterface } from 'sequelize'

const GLOBAL_PERMISSIONS = [
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
]

export const up: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
    await queryInterface.createTable('roles', {
        roleId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true,
        },
        name: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        type: {
            type: DataTypes.STRING(32),
            allowNull: false,
        },
        createdAt: {
            type: DataTypes.DATE,
            allowNull: false,
        },
        updatedAt: {
            type: DataTypes.DATE,
            allowNull: false,
        },
    })

    await queryInterface.addIndex('roles', ['name'], {
        name: 'roles_name_unique',
        unique: true,
    })

    await queryInterface.createTable('role_permissions', {
        rolePermissionId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true,
        },
        roleId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'roles',
                key: 'roleId',
            },
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE',
        },
        permission: {
            type: DataTypes.STRING(64),
            allowNull: false,
        },
        createdAt: {
            type: DataTypes.DATE,
            allowNull: false,
        },
        updatedAt: {
            type: DataTypes.DATE,
            allowNull: false,
        },
    })

    await queryInterface.addIndex('role_permissions', ['roleId', 'permission'], {
        name: 'role_permissions_unique',
        unique: true,
    })

    await queryInterface.createTable('user_permissions', {
        userPermissionId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true,
        },
        userId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'users',
                key: 'userId',
            },
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE',
        },
        permission: {
            type: DataTypes.STRING(64),
            allowNull: false,
        },
        createdAt: {
            type: DataTypes.DATE,
            allowNull: false,
        },
        updatedAt: {
            type: DataTypes.DATE,
            allowNull: false,
        },
    })

    await queryInterface.addIndex('user_permissions', ['userId', 'permission'], {
        name: 'user_permissions_unique',
        unique: true,
    })

    await queryInterface.createTable('project_members', {
        projectMemberId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true,
        },
        projectId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'projects',
                key: 'projectId',
            },
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE',
        },
        userId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'users',
                key: 'userId',
            },
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE',
        },
        permission: {
            type: DataTypes.STRING(16),
            allowNull: false,
        },
        createdAt: {
            type: DataTypes.DATE,
            allowNull: false,
        },
        updatedAt: {
            type: DataTypes.DATE,
            allowNull: false,
        },
    })

    await queryInterface.addIndex('project_members', ['projectId', 'userId', 'permission'], {
        name: 'project_members_unique',
        unique: true,
    })

    await queryInterface.addIndex('project_members', ['userId'], {
        name: 'project_members_user',
    })

    const [roleRows] = (await queryInterface.sequelize.query(
        `INSERT INTO "roles" ("name", "type", "createdAt", "updatedAt") VALUES
         ('Super Admin', 'super_admin', NOW(), NOW()),
         ('Admin', 'admin', NOW(), NOW()),
         ('User', 'user', NOW(), NOW())
         RETURNING "roleId", "type"`,
    )) as [{ roleId: number; type: string }[], unknown]

    const superAdminRoleId = roleRows.find((row) => row.type === 'super_admin')!.roleId
    const adminRoleId = roleRows.find((row) => row.type === 'admin')!.roleId

    await queryInterface.bulkInsert(
        'role_permissions',
        GLOBAL_PERMISSIONS.map((permission) => ({
            roleId: adminRoleId,
            permission,
            createdAt: new Date(),
            updatedAt: new Date(),
        })),
    )

    await queryInterface.addColumn('users', 'roleId', {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
            model: 'roles',
            key: 'roleId',
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
    })

    await queryInterface.sequelize.query('UPDATE "users" SET "roleId" = :roleId', {
        replacements: { roleId: superAdminRoleId },
    })

    await queryInterface.sequelize.query('ALTER TABLE "users" ALTER COLUMN "roleId" SET NOT NULL')
}

export const down: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
    await queryInterface.removeColumn('users', 'roleId')
    await queryInterface.dropTable('project_members')
    await queryInterface.dropTable('user_permissions')
    await queryInterface.dropTable('role_permissions')
    await queryInterface.dropTable('roles')
}
```

- [ ] **Step 8: Verify**

Run: `pnpm --filter backend typecheck && pnpm --filter backend lint`
Expected: both pass with no new errors.

Run: `pnpm --filter backend exec vitest run`
Expected: all existing unit tests still pass (nothing imports the new files yet).

Note: do NOT run the e2e suite yet — after this migration new users require a `roleId`, and the e2e seed helper is only updated in Task 2.

---

### Task 2: Wire roles through user creation and authentication

**Files:**

- Modify: `apps/backend/src/modules/user/interfaces/user.interface.ts`
- Modify: `apps/backend/src/modules/user/models/user.model.ts`
- Modify: `apps/backend/src/modules/user/services/user.service.ts`
- Create: `apps/backend/src/modules/permission/services/role.service.ts`
- Create: `apps/backend/src/modules/permission/services/role.service.spec.ts`
- Modify: `apps/backend/src/modules/permission/permission.module.ts`
- Modify: `apps/backend/src/modules/setup/services/setup.service.ts`
- Modify: `apps/backend/src/modules/auth/strategies/jwt.strategy.ts`
- Modify: `apps/backend/src/modules/auth/services/credentials.service.ts`
- Modify: `apps/backend/src/modules/auth/decorators/Principal.ts`
- Modify: `apps/backend/test/support/session.ts`
- Modify (tests): `apps/backend/src/modules/user/services/user.service.spec.ts`, `apps/backend/src/modules/setup/services/setup.service.spec.ts`, `apps/backend/src/modules/auth/strategies/jwt.strategy.spec.ts`, `apps/backend/src/modules/auth/services/credentials.service.spec.ts`

**Interfaces:**

- Consumes: `RoleModel`, `Role`, `RoleType`, cache prefixes from Task 1.
- Produces:
    - `User` gains `roleId: number`; new `UserWithRole extends User { role: Role }`; `UserCreate` now includes `roleId` (via `FullUser`).
    - `UserService.createUser(user: UserCreate, transaction?: Transaction): Promise<UserWithRole>`
    - `RoleService.getRoles(): Promise<RoleWithPermissions[]>`, `RoleService.getRoleById(roleId: number): Promise<Role>` (throws `BadRequestException('Unknown role')`), `RoleService.getRoleByType(type: RoleType): Promise<Role>`
    - `JwtStrategy.validate` returns `UserWithRole` (role eagerly loaded); `request.user` is a `UserWithRole` everywhere behind `@JwtAuth()`.
    - e2e helper: `seedUser(app, credentials, roleType?: RoleType)` defaulting to `'super_admin'`.

- [ ] **Step 1: Update the user interfaces**

`apps/backend/src/modules/user/interfaces/user.interface.ts` becomes:

```ts
import { Role } from '../../permission/interfaces/role.interface'

export interface User {
    userId: number
    firstName: string
    lastName: string
    email: string
    roleId: number
    createdAt: Date
    updatedAt: Date
}

export interface FullUser extends User {
    password: string
}

export interface UserWithRole extends User {
    role: Role
}

export type UserCreate = Omit<FullUser, 'userId' | 'createdAt' | 'updatedAt'>
```

- [ ] **Step 2: Add `roleId` to the user model**

In `apps/backend/src/modules/user/models/user.model.ts`, add imports for `BelongsTo` and `ForeignKey` from `sequelize-typescript`, plus:

```ts
import { RoleModel } from '../../permission/models/role.model'
```

and after the `password` column:

```ts
    @ForeignKey(() => RoleModel)
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare roleId: number

    @BelongsTo(() => RoleModel)
    declare role?: RoleModel
```

- [ ] **Step 3: Write the failing RoleService spec**

`apps/backend/src/modules/permission/services/role.service.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common'
import { getModelToken } from '@nestjs/sequelize'
import { Test, TestingModule } from '@nestjs/testing'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { RoleService } from './role.service'
import { RoleModel } from '../models/role.model'
import { RolePermissionModel } from '../models/role-permission.model'
import { Role } from '../interfaces/role.interface'
import { Permission } from '../permission.constants'

const role: Role = {
    roleId: 2,
    name: 'Admin',
    type: 'admin',
    createdAt: new Date(),
    updatedAt: new Date(),
}

type RoleRow = Role & { permissions?: { permission: Permission }[] } & {
    get: (options: { plain: true }) => Role & { permissions?: { permission: Permission }[] }
}

function roleRow(partial: Partial<Role> = {}, permissions: Permission[] = []): RoleRow {
    const plain = { ...role, ...partial, permissions: permissions.map((permission) => ({ permission })) }
    return { ...plain, get: () => plain }
}

describe('RoleService', () => {
    let service: RoleService
    let findAll: Mock<(options?: object) => Promise<RoleRow[]>>
    let findByPk: Mock<(roleId: number) => Promise<RoleRow | null>>
    let findOne: Mock<(options: object) => Promise<RoleRow | null>>

    beforeEach(async () => {
        findAll = vi.fn<typeof findAll>().mockResolvedValue([])
        findByPk = vi.fn<typeof findByPk>()
        findOne = vi.fn<typeof findOne>()

        const module: TestingModule = await Test.createTestingModule({
            providers: [RoleService, { provide: getModelToken(RoleModel), useValue: { findAll, findByPk, findOne } }],
        }).compile()

        service = module.get(RoleService)
    })

    it('lists roles with their permissions', async () => {
        findAll.mockResolvedValue([roleRow({}, ['users.read'])])

        const roles = await service.getRoles()

        expect(findAll).toHaveBeenCalledWith({ include: [RolePermissionModel] })
        expect(roles).toEqual([expect.objectContaining({ roleId: 2, name: 'Admin', permissions: ['users.read'] })])
    })

    it('returns a role by id', async () => {
        findByPk.mockResolvedValue(roleRow())

        await expect(service.getRoleById(2)).resolves.toEqual(expect.objectContaining({ roleId: 2 }))
    })

    it('rejects unknown role ids', async () => {
        findByPk.mockResolvedValue(null)

        await expect(service.getRoleById(99)).rejects.toThrow(new BadRequestException('Unknown role'))
    })

    it('resolves a role by type', async () => {
        findOne.mockResolvedValue(roleRow({ roleId: 1, name: 'Super Admin', type: 'super_admin' }))

        const found = await service.getRoleByType('super_admin')

        expect(findOne).toHaveBeenCalledWith({ where: { type: 'super_admin' }, rejectOnEmpty: true })
        expect(found.type).toBe('super_admin')
    })
})
```

- [ ] **Step 4: Run the spec to verify it fails**

Run: `pnpm --filter backend exec vitest run src/modules/permission/services/role.service.spec.ts`
Expected: FAIL — `Cannot find module './role.service'`.

- [ ] **Step 5: Implement RoleService**

`apps/backend/src/modules/permission/services/role.service.ts`:

```ts
import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/sequelize'
import { RoleModel } from '../models/role.model'
import { RolePermissionModel } from '../models/role-permission.model'
import { Role, RoleWithPermissions } from '../interfaces/role.interface'
import { RoleType } from '../permission.constants'

@Injectable()
export class RoleService {
    constructor(@InjectModel(RoleModel) private readonly roleModel: typeof RoleModel) {}

    async getRoles(): Promise<RoleWithPermissions[]> {
        const rows = await this.roleModel.findAll({ include: [RolePermissionModel] })

        return rows.map((row) => {
            const plain = row.get({ plain: true }) as Role & { permissions: { permission: string }[] }
            const { permissions, ...roleFields } = plain

            return {
                ...roleFields,
                permissions: permissions.map((entry) => entry.permission),
            } as RoleWithPermissions
        })
    }

    async getRoleById(roleId: number): Promise<Role> {
        const row = await this.roleModel.findByPk(roleId)
        if (!row) {
            throw new BadRequestException('Unknown role')
        }

        return row.get({ plain: true })
    }

    async getRoleByType(type: RoleType): Promise<Role> {
        const row = await this.roleModel.findOne({ where: { type }, rejectOnEmpty: true })

        return row.get({ plain: true })
    }
}
```

Register it in `permission.module.ts`: add `providers: [RoleService]` and extend `exports` to `[SequelizeModule, RoleService]`, with

```ts
import { RoleService } from './services/role.service'
```

- [ ] **Step 6: Run the spec to verify it passes**

Run: `pnpm --filter backend exec vitest run src/modules/permission/services/role.service.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Update UserService.createUser to persist roleId and return the role**

`apps/backend/src/modules/user/services/user.service.ts` becomes:

```ts
import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/sequelize'
import type { Transaction } from 'sequelize'
import { UserModel } from '../models/user.model'
import { UserCreate, UserWithRole } from '../interfaces/user.interface'
import { RoleModel } from '../../permission/models/role.model'
import bcrypt from 'bcryptjs'

@Injectable()
export class UserService {
    constructor(@InjectModel(UserModel) private readonly userModel: typeof UserModel) {}

    async createUser(user: UserCreate, transaction?: Transaction): Promise<UserWithRole> {
        const hashedPassword = await bcrypt.hash(user.password, 10)

        const created = await this.userModel.create(
            {
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                password: hashedPassword,
                roleId: user.roleId,
            },
            { returning: true, transaction },
        )

        const withRole = await this.userModel.findByPk(created.userId, {
            include: [RoleModel],
            rejectOnEmpty: true,
            transaction,
        })

        return withRole.get({ plain: true }) as UserWithRole
    }
}
```

- [ ] **Step 8: Update SetupService to assign the Super Admin role**

In `apps/backend/src/modules/setup/services/setup.service.ts`, inject `RoleService` and resolve the role inside the transaction:

```ts
import { RoleService } from '../../permission/services/role.service'
```

Constructor gains `private readonly roleService: RoleService,`. The `registerFirstUser` body becomes:

```ts
    registerFirstUser(user: Omit<UserCreate, 'roleId'>): Promise<UserWithRole> {
        return this.sequelize.transaction(async (transaction) => {
            await this.sequelize.query('SELECT pg_advisory_xact_lock(:key)', {
                replacements: { key: SETUP_LOCK_KEY },
                transaction,
            })

            const userCount = await this.userModel.count({ transaction })
            if (userCount > 0) {
                throw new ForbiddenException('Setup is already completed.')
            }

            const role = await this.roleService.getRoleByType('super_admin')

            return this.userService.createUser({ ...user, roleId: role.roleId }, transaction)
        })
    }
```

Update the imports in that file: `User` becomes unused — import `UserCreate, UserWithRole` from the user interface instead. `SetupModule` needs no import changes (`PermissionModule` is global).

- [ ] **Step 9: Load the role into the authenticated principal**

`apps/backend/src/modules/auth/strategies/jwt.strategy.ts` — replace the private cache-key constant with the shared prefix and eager-load the role. The class becomes:

```ts
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtPayload } from '../interfaces/jwt-payload.interface'
import { UserWithRole } from '../../user/interfaces/user.interface'
import { Cache, CACHE_MANAGER } from '@nestjs/cache-manager'
import { InjectModel } from '@nestjs/sequelize'
import { UserModel } from '../../user/models/user.model'
import { RoleModel } from '../../permission/models/role.model'
import { AUTH_USER_CACHE_PREFIX } from '../../permission/permission.constants'

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
    constructor(
        readonly configService: ConfigService,
        @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
        @InjectModel(UserModel) private readonly userModel: typeof UserModel,
    ) {
        super({
            secretOrKey: configService.get<string>('BACKEND_JWT_SECRET', 'no-secret'),
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
        })
    }

    async validate(payload: JwtPayload): Promise<UserWithRole> {
        const cacheKey = AUTH_USER_CACHE_PREFIX + payload.sub
        const cachedUser = await this.cacheManager.get<UserWithRole>(cacheKey)
        if (cachedUser) {
            return cachedUser
        }

        const user = await this.userModel.findByPk(payload.sub, { include: [RoleModel] })
        if (!user) {
            throw new UnauthorizedException('Invalid token')
        }

        const principal = user.get({ plain: true }) as UserWithRole
        void this.cacheManager.set(cacheKey, principal)

        return principal
    }
}
```

In `apps/backend/src/modules/auth/services/credentials.service.ts`, add the role include and return type:

```ts
import { UserWithRole } from '../../user/interfaces/user.interface'
import { RoleModel } from '../../permission/models/role.model'
```

```ts
    async validateCredentials(credentials: Credentials): Promise<UserWithRole> {
        const user = await this.userModel.findOne({
            where: { email: credentials.email },
            attributes: { include: ['password'] },
            include: [RoleModel],
            rejectOnEmpty: true,
        })
        const isValidPassword = await bcrypt.compare(credentials.password, user.password)

        if (!isValidPassword) {
            throw new UnauthorizedException('Invalid credentials.')
        }

        const { password, ...principal } = user.get({ plain: true }) as UserWithRole & { password: string }
        void password

        return principal
    }
}
```

In `apps/backend/src/modules/auth/decorators/Principal.ts`, change the type to the principal that is actually on the request now:

```ts
import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { UserWithRole } from '../../user/interfaces/user.interface'

export const Principal = createParamDecorator((_, ctx: ExecutionContext): UserWithRole => {
    const request = ctx.switchToHttp().getRequest<{ user?: UserWithRole }>()
    if (!request.user) {
        throw new UnauthorizedException()
    }
    return request.user
})
```

- [ ] **Step 10: Update the e2e seed helper**

`apps/backend/test/support/session.ts` — `seedUser` becomes:

```ts
import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import type { App } from 'supertest/types'
import { UserService } from '../../src/modules/user/services/user.service'
import { RoleService } from '../../src/modules/permission/services/role.service'
import type { RoleType } from '../../src/modules/permission/permission.constants'

export interface Credentials {
    email: string
    password: string
}

// Persists a user with known credentials so a test can authenticate as them.
// Files sharing the database must use distinct emails to avoid collisions.
export async function seedUser(
    app: INestApplication,
    credentials: Credentials,
    roleType: RoleType = 'super_admin',
): Promise<void> {
    const role = await app.get(RoleService).getRoleByType(roleType)
    await app.get(UserService).createUser({
        firstName: 'Test',
        lastName: 'User',
        email: credentials.email,
        password: credentials.password,
        roleId: role.roleId,
    })
}

// Logs in through the real endpoint and returns the bearer token.
export async function login(app: INestApplication<App>, credentials: Credentials): Promise<string> {
    const response = await request(app.getHttpServer()).post('/api/auth/login').send(credentials).expect(200)
    return (response.body as { token: string }).token
}
```

- [ ] **Step 11: Update the affected unit specs**

`apps/backend/src/modules/user/services/user.service.spec.ts` — the mocked model now also needs `findByPk` (returning the created row with its role), and fixtures need `roleId`. Replace the file content with:

```ts
import { Test, TestingModule } from '@nestjs/testing'
import { getModelToken } from '@nestjs/sequelize'
import bcrypt from 'bcryptjs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserService } from './user.service'
import { UserModel } from '../models/user.model'
import { Role } from '../../permission/interfaces/role.interface'

interface CreateAttrs {
    firstName: string
    lastName: string
    email: string
    password: string
    roleId: number
}

const role: Role = {
    roleId: 3,
    name: 'User',
    type: 'user',
    createdAt: new Date(),
    updatedAt: new Date(),
}

describe('UserService', () => {
    let service: UserService
    let create: ReturnType<typeof vi.fn>
    let findByPk: ReturnType<typeof vi.fn>
    // The password value handed to the model, captured so we can prove it was hashed.
    let storedPassword: string | undefined

    const newUser = {
        firstName: 'Alan',
        lastName: 'Turing',
        email: 'alan@example.com',
        password: 'enigma-1912',
        roleId: 3,
    }

    beforeEach(async () => {
        storedPassword = undefined
        // Mirror Sequelize's create({ returning: true }): resolve a model instance whose
        // get({ plain: true }) returns the persisted row.
        create = vi.fn((attrs: CreateAttrs) => {
            storedPassword = attrs.password
            const row = { userId: 7, createdAt: new Date(), updatedAt: new Date(), ...attrs }
            return { ...row, get: () => row }
        })
        findByPk = vi.fn((userId: number) => {
            const row = {
                userId,
                firstName: newUser.firstName,
                lastName: newUser.lastName,
                email: newUser.email,
                roleId: newUser.roleId,
                role,
                createdAt: new Date(),
                updatedAt: new Date(),
            }
            return { ...row, get: () => row }
        })

        const module: TestingModule = await Test.createTestingModule({
            providers: [UserService, { provide: getModelToken(UserModel), useValue: { create, findByPk } }],
        }).compile()

        service = module.get(UserService)
    })

    it('persists the supplied profile fields', async () => {
        await service.createUser(newUser)

        expect(create).toHaveBeenCalledWith(
            expect.objectContaining({
                firstName: 'Alan',
                lastName: 'Turing',
                email: 'alan@example.com',
                roleId: 3,
            }),
            { returning: true, transaction: undefined },
        )
    })

    it('hashes the password instead of storing it in plain text', async () => {
        await service.createUser(newUser)

        expect(storedPassword).toBeDefined()
        expect(storedPassword).not.toBe(newUser.password)
        // The stored value is a real bcrypt hash of the original password.
        await expect(bcrypt.compare(newUser.password, storedPassword!)).resolves.toBe(true)
    })

    it('returns the persisted user with its role', async () => {
        const result = await service.createUser(newUser)

        expect(result).toMatchObject({
            userId: 7,
            firstName: 'Alan',
            email: 'alan@example.com',
            role: expect.objectContaining({ type: 'user' }) as Role,
        })
    })
})
```

`apps/backend/src/modules/setup/services/setup.service.spec.ts` — add a `RoleService` provider and `roleId` expectations. Apply these changes:

1. Add imports:

```ts
import { RoleService } from '../../permission/services/role.service'
import { Role } from '../../permission/interfaces/role.interface'
import { UserWithRole } from '../../user/interfaces/user.interface'
```

2. Replace the `userCreate`/`user` fixtures with:

```ts
const userCreate = {
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    password: 'correct-horse-battery-staple',
}

const superAdminRole: Role = {
    roleId: 1,
    name: 'Super Admin',
    type: 'super_admin',
    createdAt: new Date(),
    updatedAt: new Date(),
}

const user: UserWithRole = {
    userId: 1,
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    roleId: 1,
    role: superAdminRole,
    createdAt: new Date(),
    updatedAt: new Date(),
}
```

(Delete the old `UserCreate` import usage; keep `UserCreate` out of the imports if unused.)

3. Declare and wire the role mock in `beforeEach`:

```ts
let getRoleByType: Mock<RoleService['getRoleByType']>
```

```ts
getRoleByType = vi.fn<typeof getRoleByType>().mockResolvedValue(superAdminRole)
```

and add `{ provide: RoleService, useValue: { getRoleByType } }` to the providers array.

4. Update the assertion in `creates the user inside a locked transaction`:

```ts
expect(getRoleByType).toHaveBeenCalledWith('super_admin')
expect(createUser).toHaveBeenCalledWith({ ...userCreate, roleId: 1 }, transactionStub)
```

`apps/backend/src/modules/auth/strategies/jwt.strategy.spec.ts` — the `dbRow` fixture gains `roleId: 1` and a `role` object, and the `findByPk` assertion changes:

```ts
const dbRow = {
    userId: 99,
    firstName: 'Lin',
    lastName: 'Clark',
    email: 'lin@example.com',
    password: 'hashed',
    roleId: 1,
    role: { roleId: 1, name: 'Super Admin', type: 'super_admin' },
    createdAt: new Date(),
    updatedAt: new Date(),
}
```

```ts
expect(findByPk).toHaveBeenCalledWith(99, { include: [RoleModel] })
```

with the import `import { RoleModel } from '../../permission/models/role.model'`. The cache assertion changes because the strategy now caches the plain principal instead of the model instance:

```ts
expect(cacheSet).toHaveBeenCalledWith('auth:user:99', dbRow)
```

`apps/backend/src/modules/auth/services/credentials.service.spec.ts` — open the file; its mocked `findOne` result fixture needs `roleId`/`role` fields added the same way, and the `findOne` call assertion (if present) gains `include: [RoleModel]`. Follow the existing fixture style in that file.

- [ ] **Step 12: Run the affected suites**

Run: `pnpm --filter backend exec vitest run src/modules/user src/modules/setup src/modules/auth src/modules/permission`
Expected: PASS.

- [ ] **Step 13: Verify the whole backend**

Run: `pnpm --filter backend typecheck && pnpm --filter backend lint && pnpm --filter backend exec vitest run`
Expected: all green. (`RegisterUserDto implements UserCreate` in the setup module now fails to compile — fix it by changing the declaration to `implements Omit<UserCreate, 'roleId'>` in `apps/backend/src/modules/setup/dtos/register-user.dto.ts`.)

Run the e2e suite (Docker required): `pnpm --filter backend test:e2e`
Expected: PASS — migrations create/seed the new tables, `seedUser` assigns the Super Admin role.

---

### Task 3: AbilityFactory and permission cache

**Files:**

- Create: `apps/backend/src/modules/permission/services/ability-factory.service.ts`
- Create: `apps/backend/src/modules/permission/services/ability-factory.service.spec.ts`
- Create: `apps/backend/src/modules/permission/services/permission-cache.service.ts`
- Create: `apps/backend/src/modules/permission/services/permission-cache.service.spec.ts`
- Modify: `apps/backend/src/modules/permission/permission.module.ts` (provide + export both services)

**Interfaces:**

- Consumes: constants/models from Task 1, `User` (with `roleId`) from Task 2.
- Produces:
    - `PermissionInputs { roleType: RoleType; permissions: Permission[]; memberships: { projectId: number; permission: ProjectPermission }[] }`
    - `AbilityFactory.createForUser(user: User): Promise<AppAbility>`
    - `AbilityFactory.getPermissionInputs(user: User): Promise<PermissionInputs>`
    - `AbilityFactory.hasAllProjectsAccess(user: User): Promise<boolean>`
    - `AbilityFactory.getProjectIdsFor(user: User, permission: ProjectPermission): Promise<number[] | 'all'>`
    - `PermissionCacheService.invalidateUser(userId: number): Promise<void>`

- [ ] **Step 1: Write the failing AbilityFactory spec**

`apps/backend/src/modules/permission/services/ability-factory.service.spec.ts`:

```ts
import { getModelToken } from '@nestjs/sequelize'
import { Test, TestingModule } from '@nestjs/testing'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { subject } from '@casl/ability'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { AbilityFactory, PermissionInputs } from './ability-factory.service'
import { RoleModel } from '../models/role.model'
import { RolePermissionModel } from '../models/role-permission.model'
import { UserPermissionModel } from '../models/user-permission.model'
import { ProjectMemberModel } from '../models/project-member.model'
import { User } from '../../user/interfaces/user.interface'
import { Permission, ProjectPermission, RoleType } from '../permission.constants'

const user: User = {
    userId: 5,
    firstName: 'Grace',
    lastName: 'Hopper',
    email: 'grace@example.com',
    roleId: 3,
    createdAt: new Date(),
    updatedAt: new Date(),
}

describe('AbilityFactory', () => {
    let factory: AbilityFactory
    let cacheGet: Mock<(key: string) => Promise<PermissionInputs | undefined>>
    let cacheSet: Mock<(key: string, value: PermissionInputs) => Promise<void>>
    let roleFindByPk: Mock<(roleId: number, options: object) => Promise<{ type: RoleType }>>
    let rolePermissionFindAll: Mock<(options: object) => Promise<{ permission: Permission }[]>>
    let userPermissionFindAll: Mock<(options: object) => Promise<{ permission: Permission }[]>>
    let memberFindAll: Mock<(options: object) => Promise<{ projectId: number; permission: ProjectPermission }[]>>

    function stubInputs(roleType: RoleType, permissions: Permission[], memberships: PermissionInputs['memberships']) {
        roleFindByPk.mockResolvedValue({ type: roleType })
        rolePermissionFindAll.mockResolvedValue(permissions.map((permission) => ({ permission })))
        userPermissionFindAll.mockResolvedValue([])
        memberFindAll.mockResolvedValue(memberships)
    }

    beforeEach(async () => {
        cacheGet = vi.fn<typeof cacheGet>().mockResolvedValue(undefined)
        cacheSet = vi.fn<typeof cacheSet>().mockResolvedValue(undefined)
        roleFindByPk = vi.fn<typeof roleFindByPk>()
        rolePermissionFindAll = vi.fn<typeof rolePermissionFindAll>().mockResolvedValue([])
        userPermissionFindAll = vi.fn<typeof userPermissionFindAll>().mockResolvedValue([])
        memberFindAll = vi.fn<typeof memberFindAll>().mockResolvedValue([])

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AbilityFactory,
                { provide: CACHE_MANAGER, useValue: { get: cacheGet, set: cacheSet } },
                { provide: getModelToken(RoleModel), useValue: { findByPk: roleFindByPk } },
                { provide: getModelToken(RolePermissionModel), useValue: { findAll: rolePermissionFindAll } },
                { provide: getModelToken(UserPermissionModel), useValue: { findAll: userPermissionFindAll } },
                { provide: getModelToken(ProjectMemberModel), useValue: { findAll: memberFindAll } },
            ],
        }).compile()

        factory = module.get(AbilityFactory)
    })

    it('grants super admins everything', async () => {
        stubInputs('super_admin', [], [])

        const ability = await factory.createForUser(user)

        expect(ability.can('manage', 'all')).toBe(true)
        expect(ability.can('delete', subject('User', { userId: 1, role: { type: 'super_admin' } }))).toBe(true)
    })

    it('maps stored global permissions to abilities', async () => {
        stubInputs('user', ['domains.read', 'projects.all'], [])

        const ability = await factory.createForUser(user)

        expect(ability.can('read', 'Domain')).toBe(true)
        expect(ability.can('create', 'Domain')).toBe(false)
        expect(ability.can('update', subject('Project', { projectId: 42 }))).toBe(true)
    })

    it('merges direct user permissions with role permissions', async () => {
        stubInputs('user', ['domains.read'], [])
        userPermissionFindAll.mockResolvedValue([{ permission: 'settings.read' }])

        const ability = await factory.createForUser(user)

        expect(ability.can('read', 'Domain')).toBe(true)
        expect(ability.can('read', 'Settings')).toBe(true)
    })

    it('scopes project permissions to membership rows', async () => {
        stubInputs(
            'user',
            [],
            [
                { projectId: 1, permission: 'read' },
                { projectId: 1, permission: 'update' },
                { projectId: 2, permission: 'read' },
            ],
        )

        const ability = await factory.createForUser(user)

        expect(ability.can('read', subject('Project', { projectId: 1 }))).toBe(true)
        expect(ability.can('update', subject('Project', { projectId: 1 }))).toBe(true)
        expect(ability.can('update', subject('Project', { projectId: 2 }))).toBe(false)
        expect(ability.can('read', subject('Project', { projectId: 3 }))).toBe(false)
    })

    it('forbids admins from touching super admin users', async () => {
        stubInputs('admin', ['users.update', 'users.delete', 'users.read'], [])

        const ability = await factory.createForUser(user)

        expect(ability.can('update', subject('User', { userId: 9, role: { type: 'admin' } }))).toBe(true)
        expect(ability.can('update', subject('User', { userId: 1, role: { type: 'super_admin' } }))).toBe(false)
        expect(ability.can('delete', subject('User', { userId: 1, role: { type: 'super_admin' } }))).toBe(false)
        expect(ability.can('update', 'User')).toBe(true)
    })

    it('serves permission inputs from the cache when present', async () => {
        const cached: PermissionInputs = { roleType: 'user', permissions: ['bounces.read'], memberships: [] }
        cacheGet.mockResolvedValue(cached)

        const ability = await factory.createForUser(user)

        expect(ability.can('read', 'Bounce')).toBe(true)
        expect(roleFindByPk).not.toHaveBeenCalled()
        expect(cacheGet).toHaveBeenCalledWith('auth:permissions:5')
    })

    it('caches freshly loaded inputs', async () => {
        stubInputs('user', ['bounces.read'], [])

        await factory.createForUser(user)

        expect(cacheSet).toHaveBeenCalledWith('auth:permissions:5', {
            roleType: 'user',
            permissions: ['bounces.read'],
            memberships: [],
        })
    })

    it('reports all-projects access for super admins and projects.all holders', async () => {
        stubInputs('super_admin', [], [])
        await expect(factory.hasAllProjectsAccess(user)).resolves.toBe(true)

        cacheGet.mockResolvedValue({ roleType: 'user', permissions: ['projects.all'], memberships: [] })
        await expect(factory.hasAllProjectsAccess(user)).resolves.toBe(true)

        cacheGet.mockResolvedValue({ roleType: 'user', permissions: [], memberships: [] })
        await expect(factory.hasAllProjectsAccess(user)).resolves.toBe(false)
    })

    it('lists project ids for a membership level', async () => {
        cacheGet.mockResolvedValue({
            roleType: 'user',
            permissions: [],
            memberships: [
                { projectId: 1, permission: 'read' },
                { projectId: 2, permission: 'update' },
            ],
        })

        await expect(factory.getProjectIdsFor(user, 'read')).resolves.toEqual([1])

        cacheGet.mockResolvedValue({ roleType: 'user', permissions: ['projects.all'], memberships: [] })
        await expect(factory.getProjectIdsFor(user, 'read')).resolves.toBe('all')
    })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter backend exec vitest run src/modules/permission/services/ability-factory.service.spec.ts`
Expected: FAIL — `Cannot find module './ability-factory.service'`.

- [ ] **Step 3: Implement AbilityFactory**

`apps/backend/src/modules/permission/services/ability-factory.service.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/sequelize'
import { Cache, CACHE_MANAGER } from '@nestjs/cache-manager'
import { AbilityBuilder, createMongoAbility } from '@casl/ability'
import { RoleModel } from '../models/role.model'
import { RolePermissionModel } from '../models/role-permission.model'
import { UserPermissionModel } from '../models/user-permission.model'
import { ProjectMemberModel } from '../models/project-member.model'
import { User } from '../../user/interfaces/user.interface'
import {
    AUTH_PERMISSIONS_CACHE_PREFIX,
    GLOBAL_PERMISSION_ABILITIES,
    Permission,
    PROJECT_PERMISSIONS,
    ProjectPermission,
    RoleType,
} from '../permission.constants'
import { AppAbility } from '../interfaces/app-ability'

export interface PermissionInputs {
    roleType: RoleType
    permissions: Permission[]
    memberships: { projectId: number; permission: ProjectPermission }[]
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
                .filter((membership) => membership.permission === projectPermission)
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
            .filter((membership) => membership.permission === permission)
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
            this.projectMemberModel.findAll({ where: { userId: user.userId } }),
        ])

        const permissions = [
            ...new Set([
                ...rolePermissions.map((row) => row.permission),
                ...userPermissions.map((row) => row.permission),
            ]),
        ]

        const inputs: PermissionInputs = {
            roleType: role.type,
            permissions,
            memberships: memberships.map((row) => ({ projectId: row.projectId, permission: row.permission })),
        }

        void this.cacheManager.set(cacheKey, inputs)

        return inputs
    }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter backend exec vitest run src/modules/permission/services/ability-factory.service.spec.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Write the failing PermissionCacheService spec**

`apps/backend/src/modules/permission/services/permission-cache.service.spec.ts`:

```ts
import { Test, TestingModule } from '@nestjs/testing'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { PermissionCacheService } from './permission-cache.service'

describe('PermissionCacheService', () => {
    let service: PermissionCacheService
    let del: Mock<(key: string) => Promise<boolean>>

    beforeEach(async () => {
        del = vi.fn<typeof del>().mockResolvedValue(true)

        const module: TestingModule = await Test.createTestingModule({
            providers: [PermissionCacheService, { provide: CACHE_MANAGER, useValue: { del } }],
        }).compile()

        service = module.get(PermissionCacheService)
    })

    it('drops both cache entries of the user', async () => {
        await service.invalidateUser(7)

        expect(del).toHaveBeenCalledWith('auth:user:7')
        expect(del).toHaveBeenCalledWith('auth:permissions:7')
    })
})
```

- [ ] **Step 6: Implement PermissionCacheService and register providers**

`apps/backend/src/modules/permission/services/permission-cache.service.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common'
import { Cache, CACHE_MANAGER } from '@nestjs/cache-manager'
import { AUTH_PERMISSIONS_CACHE_PREFIX, AUTH_USER_CACHE_PREFIX } from '../permission.constants'

@Injectable()
export class PermissionCacheService {
    constructor(@Inject(CACHE_MANAGER) private readonly cacheManager: Cache) {}

    async invalidateUser(userId: number): Promise<void> {
        await Promise.all([
            this.cacheManager.del(AUTH_USER_CACHE_PREFIX + userId),
            this.cacheManager.del(AUTH_PERMISSIONS_CACHE_PREFIX + userId),
        ])
    }
}
```

Update `permission.module.ts` providers/exports:

```ts
    providers: [RoleService, AbilityFactory, PermissionCacheService],
    exports: [SequelizeModule, RoleService, AbilityFactory, PermissionCacheService],
```

with matching imports.

- [ ] **Step 7: Verify**

Run: `pnpm --filter backend exec vitest run src/modules/permission && pnpm --filter backend typecheck && pnpm --filter backend lint`
Expected: all green.

---

### Task 4: PoliciesGuard, decorators, and project-access helpers

**Files:**

- Create: `apps/backend/src/modules/permission/decorators/RequireAbility.ts`
- Create: `apps/backend/src/modules/permission/decorators/CurrentAbility.ts`
- Create: `apps/backend/src/modules/permission/guards/policies.guard.ts`
- Create: `apps/backend/src/modules/permission/guards/policies.guard.spec.ts`
- Create: `apps/backend/src/modules/permission/helpers/project-access.ts`
- Create: `apps/backend/src/modules/permission/helpers/project-access.spec.ts`
- Modify: `apps/backend/src/modules/auth/decorators/JwtAuth.ts`

**Interfaces:**

- Consumes: `AbilityFactory`, `AppAbility`, `PUBLIC_KEY`.
- Produces:
    - `AbilityRequirement { action: AbilityAction; subject: AbilitySubjectName }`, `ABILITY_KEY`
    - `@RequireAbility(...requirements: AbilityRequirement[])` route/class decorator
    - `@CurrentAbility()` param decorator returning `AppAbility` (the guard attaches it to `request.ability`)
    - `canOnProject(ability, permission, projectId): boolean`, `assertProjectReadable(ability, projectId): void` (throws `NotFoundException('Unknown project')`), `assertProjectUpdatable(...)` and `assertProjectDeletable(...)` (throw `ForbiddenException('Missing project permission')`)
    - `@JwtAuth()` now applies `UseGuards(JwtAuthGuard, PoliciesGuard)` — every authenticated route gets `request.ability` for free.

- [ ] **Step 1: Write the decorators**

`apps/backend/src/modules/permission/decorators/RequireAbility.ts`:

```ts
import { SetMetadata } from '@nestjs/common'
import { AbilityAction, AbilitySubjectName } from '../interfaces/app-ability'

export interface AbilityRequirement {
    action: AbilityAction
    subject: AbilitySubjectName
}

export const ABILITY_KEY = Symbol('ABILITY_KEY')

export const RequireAbility = (...requirements: AbilityRequirement[]) => SetMetadata(ABILITY_KEY, requirements)
```

`apps/backend/src/modules/permission/decorators/CurrentAbility.ts`:

```ts
import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { AppAbility } from '../interfaces/app-ability'

export const CurrentAbility = createParamDecorator((_, ctx: ExecutionContext): AppAbility => {
    const request = ctx.switchToHttp().getRequest<{ ability?: AppAbility }>()
    if (!request.ability) {
        throw new UnauthorizedException()
    }
    return request.ability
})
```

- [ ] **Step 2: Write the failing guard spec**

`apps/backend/src/modules/permission/guards/policies.guard.spec.ts`:

```ts
import { ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { createMongoAbility } from '@casl/ability'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { PoliciesGuard } from './policies.guard'
import { AbilityFactory } from '../services/ability-factory.service'
import { AppAbility } from '../interfaces/app-ability'
import { User } from '../../user/interfaces/user.interface'

const user: User = {
    userId: 5,
    firstName: 'Grace',
    lastName: 'Hopper',
    email: 'grace@example.com',
    roleId: 2,
    createdAt: new Date(),
    updatedAt: new Date(),
}

function contextFor(request: { user?: User; ability?: AppAbility }): ExecutionContext {
    return {
        getHandler: () => vi.fn(),
        getClass: () => vi.fn(),
        switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext
}

describe('PoliciesGuard', () => {
    let guard: PoliciesGuard
    let getAllAndOverride: Mock<Reflector['getAllAndOverride']>
    let createForUser: Mock<AbilityFactory['createForUser']>

    const ability = createMongoAbility<AppAbility>([{ action: 'read', subject: 'Domain' }])

    beforeEach(() => {
        getAllAndOverride = vi.fn<typeof getAllAndOverride>()
        createForUser = vi.fn<typeof createForUser>().mockResolvedValue(ability)

        const reflector = { getAllAndOverride } as unknown as Reflector
        const factory = { createForUser } as unknown as AbilityFactory

        guard = new PoliciesGuard(reflector, factory)
    })

    it('passes public routes without building an ability', async () => {
        getAllAndOverride.mockReturnValueOnce(true)

        await expect(guard.canActivate(contextFor({}))).resolves.toBe(true)
        expect(createForUser).not.toHaveBeenCalled()
    })

    it('attaches the ability and passes when no requirement is set', async () => {
        getAllAndOverride.mockReturnValueOnce(undefined).mockReturnValueOnce(undefined)
        const request: { user?: User; ability?: AppAbility } = { user }

        await expect(guard.canActivate(contextFor(request))).resolves.toBe(true)
        expect(request.ability).toBe(ability)
    })

    it('passes when every requirement is satisfied', async () => {
        getAllAndOverride.mockReturnValueOnce(undefined).mockReturnValueOnce([{ action: 'read', subject: 'Domain' }])

        await expect(guard.canActivate(contextFor({ user }))).resolves.toBe(true)
    })

    it('rejects when a requirement is not satisfied', async () => {
        getAllAndOverride.mockReturnValueOnce(undefined).mockReturnValueOnce([{ action: 'create', subject: 'Domain' }])

        await expect(guard.canActivate(contextFor({ user }))).resolves.toBe(false)
    })

    it('rejects requests without a user', async () => {
        getAllAndOverride.mockReturnValueOnce(undefined)

        await expect(guard.canActivate(contextFor({}))).resolves.toBe(false)
    })
})
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm --filter backend exec vitest run src/modules/permission/guards/policies.guard.spec.ts`
Expected: FAIL — `Cannot find module './policies.guard'`.

- [ ] **Step 4: Implement the guard**

`apps/backend/src/modules/permission/guards/policies.guard.ts`:

```ts
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { PUBLIC_KEY } from '../../auth/decorators/Public'
import { AbilityFactory } from '../services/ability-factory.service'
import { ABILITY_KEY, AbilityRequirement } from '../decorators/RequireAbility'
import { AppAbility } from '../interfaces/app-ability'
import { User } from '../../user/interfaces/user.interface'

@Injectable()
export class PoliciesGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly abilityFactory: AbilityFactory,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const shouldSkip = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
            context.getHandler(),
            context.getClass(),
        ])
        if (shouldSkip) {
            return true
        }

        const request = context.switchToHttp().getRequest<{ user?: User; ability?: AppAbility }>()
        if (!request.user) {
            return false
        }

        const ability = await this.abilityFactory.createForUser(request.user)
        request.ability = ability

        const requirements =
            this.reflector.getAllAndOverride<AbilityRequirement[]>(ABILITY_KEY, [
                context.getHandler(),
                context.getClass(),
            ]) ?? []

        return requirements.every((requirement) => ability.can(requirement.action, requirement.subject))
    }
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm --filter backend exec vitest run src/modules/permission/guards/policies.guard.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Write the failing project-access helper spec**

`apps/backend/src/modules/permission/helpers/project-access.spec.ts`:

```ts
import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { createMongoAbility } from '@casl/ability'
import { describe, expect, it } from 'vitest'
import { assertProjectDeletable, assertProjectReadable, assertProjectUpdatable, canOnProject } from './project-access'
import { AppAbility } from '../interfaces/app-ability'

const memberAbility = createMongoAbility<AppAbility>([
    { action: 'read', subject: 'Project', conditions: { projectId: { $in: [1, 2] } } },
    { action: 'update', subject: 'Project', conditions: { projectId: { $in: [1] } } },
])

describe('project access helpers', () => {
    it('evaluates membership-scoped project abilities', () => {
        expect(canOnProject(memberAbility, 'read', 1)).toBe(true)
        expect(canOnProject(memberAbility, 'read', 3)).toBe(false)
        expect(canOnProject(memberAbility, 'update', 2)).toBe(false)
    })

    it('hides unreadable projects behind a 404', () => {
        expect(() => assertProjectReadable(memberAbility, 1)).not.toThrow()
        expect(() => assertProjectReadable(memberAbility, 3)).toThrow(NotFoundException)
    })

    it('rejects updates without the update level', () => {
        expect(() => assertProjectUpdatable(memberAbility, 1)).not.toThrow()
        expect(() => assertProjectUpdatable(memberAbility, 2)).toThrow(ForbiddenException)
        expect(() => assertProjectUpdatable(memberAbility, 3)).toThrow(NotFoundException)
    })

    it('rejects deletes without the delete level', () => {
        expect(() => assertProjectDeletable(memberAbility, 1)).toThrow(ForbiddenException)
        expect(() => assertProjectDeletable(memberAbility, 3)).toThrow(NotFoundException)
    })
})
```

- [ ] **Step 7: Implement the helpers**

`apps/backend/src/modules/permission/helpers/project-access.ts`:

```ts
import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { subject } from '@casl/ability'
import { AppAbility } from '../interfaces/app-ability'
import { ProjectPermission } from '../permission.constants'

export function canOnProject(ability: AppAbility, permission: ProjectPermission, projectId: number): boolean {
    return ability.can(permission, subject('Project', { projectId }))
}

export function assertProjectReadable(ability: AppAbility, projectId: number): void {
    if (!canOnProject(ability, 'read', projectId)) {
        throw new NotFoundException('Unknown project')
    }
}

export function assertProjectUpdatable(ability: AppAbility, projectId: number): void {
    assertProjectReadable(ability, projectId)
    if (!canOnProject(ability, 'update', projectId)) {
        throw new ForbiddenException('Missing project permission')
    }
}

export function assertProjectDeletable(ability: AppAbility, projectId: number): void {
    assertProjectReadable(ability, projectId)
    if (!canOnProject(ability, 'delete', projectId)) {
        throw new ForbiddenException('Missing project permission')
    }
}
```

- [ ] **Step 8: Compose PoliciesGuard into @JwtAuth()**

`apps/backend/src/modules/auth/decorators/JwtAuth.ts` becomes:

```ts
import { applyDecorators, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../guards/jwt-auth.guard'
import { PoliciesGuard } from '../../permission/guards/policies.guard'
import { ApiBearerAuth } from '@nestjs/swagger'

export const JwtAuth = () => applyDecorators(UseGuards(JwtAuthGuard, PoliciesGuard), ApiBearerAuth())
```

- [ ] **Step 9: Verify**

Run: `pnpm --filter backend exec vitest run src/modules/permission && pnpm --filter backend typecheck && pnpm --filter backend lint`
Expected: all green.

Run the e2e suite: `pnpm --filter backend test:e2e`
Expected: PASS — every seeded e2e user is a Super Admin, so the new guard changes nothing for existing flows. This proves the guard chain (JWT → Policies) works end to end before any route is annotated.

---

### Task 5: Annotate Domain, Bounce, and Settings controllers

**Files:**

- Modify: `apps/backend/src/modules/domain/controller/domain.controller.ts`
- Modify: `apps/backend/src/modules/bounce/controller/bounce.controller.ts`
- Modify: `apps/backend/src/modules/settings/controller/settings.controller.ts`

**Interfaces:**

- Consumes: `@RequireAbility` from Task 4.
- Produces: annotated routes — the static permission map for global areas.

- [ ] **Step 1: Annotate DomainController**

Add the import to `domain.controller.ts`:

```ts
import { RequireAbility } from '../../permission/decorators/RequireAbility'
```

Add one decorator line directly above each route decorator:

| Route                                             | Decorator                                                  |
| ------------------------------------------------- | ---------------------------------------------------------- |
| `@Post()` createDomain                            | `@RequireAbility({ action: 'create', subject: 'Domain' })` |
| `@Get()` getDomains                               | `@RequireAbility({ action: 'read', subject: 'Domain' })`   |
| `@Get(':domainId')` getDomain                     | `@RequireAbility({ action: 'read', subject: 'Domain' })`   |
| `@Post(':domainId/refresh')` refreshDomainRecords | `@RequireAbility({ action: 'update', subject: 'Domain' })` |

- [ ] **Step 2: Annotate BounceController**

Same import. Decorators:

| Route                                      | Decorator                                                   |
| ------------------------------------------ | ----------------------------------------------------------- |
| `@Get()` getBounces                        | `@RequireAbility({ action: 'read', subject: 'Bounce' })`    |
| `@Get('blocked')` getBlockedAddresses      | `@RequireAbility({ action: 'read', subject: 'Bounce' })`    |
| `@Delete('blocked/:emailBlockId')` unblock | `@RequireAbility({ action: 'unblock', subject: 'Bounce' })` |

- [ ] **Step 3: Annotate SettingsController**

Same import. Decorators:

| Route                                                  | Decorator                                                    |
| ------------------------------------------------------ | ------------------------------------------------------------ |
| `@Get()` getSettings                                   | `@RequireAbility({ action: 'read', subject: 'Settings' })`   |
| `@Put('sending-domain')` configureSendingDomain        | `@RequireAbility({ action: 'update', subject: 'Settings' })` |
| `@Post('sending-domain/refresh')` refreshSendingDomain | `@RequireAbility({ action: 'update', subject: 'Settings' })` |

- [ ] **Step 4: Verify**

Run: `pnpm --filter backend typecheck && pnpm --filter backend lint && pnpm --filter backend exec vitest run`
Expected: all green (controller unit specs construct controllers directly; decorators don't affect them). Authorization behavior is asserted end-to-end in Task 12.

---

### Task 6: ProjectMemberService

**Files:**

- Create: `apps/backend/src/modules/permission/services/project-member.service.ts`
- Create: `apps/backend/src/modules/permission/services/project-member.service.spec.ts`
- Modify: `apps/backend/src/modules/permission/permission.module.ts` (provide + export)

**Interfaces:**

- Consumes: `ProjectMemberModel`, `ProjectModel`, `UserModel`, `PermissionCacheService`, `assertProjectUpdatable`.
- Produces:
    - `ProjectMemberService.getMembers(projectId: number, ability: AppAbility): Promise<ProjectMemberInfo[]>`
    - `ProjectMemberService.setMemberPermissions(projectId: number, userId: number, permissions: ProjectPermission[], ability: AppAbility): Promise<void>`
    - `ProjectMemberService.removeMember(projectId: number, userId: number, ability: AppAbility): Promise<void>`
    - `ProjectMemberService.getMembershipsForUser(userId: number): Promise<ProjectMembership[]>`
    - Manage rule: allowed when `ability.can('update', 'User')` **or** project-scoped `update`; unknown project → 404; readable-but-not-manageable → 403.

- [ ] **Step 1: Write the failing spec**

`apps/backend/src/modules/permission/services/project-member.service.spec.ts`:

```ts
import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { getModelToken } from '@nestjs/sequelize'
import { Test, TestingModule } from '@nestjs/testing'
import { Sequelize } from 'sequelize-typescript'
import type { Transaction } from 'sequelize'
import { createMongoAbility } from '@casl/ability'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { ProjectMemberService } from './project-member.service'
import { ProjectMemberModel } from '../models/project-member.model'
import { ProjectModel } from '../../project/models/project.model'
import { UserModel } from '../../user/models/user.model'
import { PermissionCacheService } from './permission-cache.service'
import { AppAbility } from '../interfaces/app-ability'
import { ProjectMember } from '../interfaces/project-member.interface'

const userManagerAbility = createMongoAbility<AppAbility>([{ action: 'update', subject: 'User' }])

const projectEditorAbility = createMongoAbility<AppAbility>([
    { action: 'read', subject: 'Project', conditions: { projectId: { $in: [1] } } },
    { action: 'update', subject: 'Project', conditions: { projectId: { $in: [1] } } },
])

const readOnlyAbility = createMongoAbility<AppAbility>([
    { action: 'read', subject: 'Project', conditions: { projectId: { $in: [1] } } },
])

type MemberRow = ProjectMember & {
    user?: { userId: number; firstName: string; lastName: string; email: string }
    project?: { projectId: number; name: string }
} & { get: (options: { plain: true }) => object }

function memberRow(partial: Partial<MemberRow>): MemberRow {
    const plain = {
        projectMemberId: 1,
        projectId: 1,
        userId: 2,
        permission: 'read',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...partial,
    }
    return { ...plain, get: () => plain } as MemberRow
}

describe('ProjectMemberService', () => {
    let service: ProjectMemberService
    let memberFindAll: Mock<(options: object) => Promise<MemberRow[]>>
    let memberDestroy: Mock<(options: object) => Promise<number>>
    let memberBulkCreate: Mock<(rows: object[], options?: object) => Promise<object[]>>
    let projectFindByPk: Mock<(projectId: number) => Promise<object | null>>
    let userFindByPk: Mock<(userId: number) => Promise<object | null>>
    let invalidateUser: Mock<PermissionCacheService['invalidateUser']>
    let transaction: Mock<Sequelize['transaction']>

    const transactionStub = {} as Transaction

    beforeEach(async () => {
        memberFindAll = vi.fn<typeof memberFindAll>().mockResolvedValue([])
        memberDestroy = vi.fn<typeof memberDestroy>().mockResolvedValue(0)
        memberBulkCreate = vi.fn<typeof memberBulkCreate>().mockResolvedValue([])
        projectFindByPk = vi.fn<typeof projectFindByPk>().mockResolvedValue({ projectId: 1 })
        userFindByPk = vi.fn<typeof userFindByPk>().mockResolvedValue({ userId: 2 })
        invalidateUser = vi.fn<typeof invalidateUser>().mockResolvedValue(undefined)
        transaction = vi
            .fn<typeof transaction>()
            .mockImplementation((callback) => (callback as (t: Transaction) => Promise<unknown>)(transactionStub))

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ProjectMemberService,
                {
                    provide: getModelToken(ProjectMemberModel),
                    useValue: { findAll: memberFindAll, destroy: memberDestroy, bulkCreate: memberBulkCreate },
                },
                { provide: getModelToken(ProjectModel), useValue: { findByPk: projectFindByPk } },
                { provide: getModelToken(UserModel), useValue: { findByPk: userFindByPk } },
                { provide: PermissionCacheService, useValue: { invalidateUser } },
                { provide: Sequelize, useValue: { transaction } },
            ],
        }).compile()

        service = module.get(ProjectMemberService)
    })

    describe('getMembers', () => {
        it('groups member rows per user', async () => {
            const user = { userId: 2, firstName: 'Grace', lastName: 'Hopper', email: 'grace@example.com' }
            memberFindAll.mockResolvedValue([
                memberRow({ user, permission: 'read' }),
                memberRow({ projectMemberId: 2, user, permission: 'update' }),
            ])

            const members = await service.getMembers(1, userManagerAbility)

            expect(members).toEqual([
                {
                    userId: 2,
                    firstName: 'Grace',
                    lastName: 'Hopper',
                    email: 'grace@example.com',
                    permissions: ['read', 'update'],
                },
            ])
        })

        it('allows project editors without user management rights', async () => {
            await expect(service.getMembers(1, projectEditorAbility)).resolves.toEqual([])
        })

        it('rejects members with read-only project access', async () => {
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

    describe('setMemberPermissions', () => {
        it('replaces the member rows in a transaction and invalidates the cache', async () => {
            await service.setMemberPermissions(1, 2, ['read', 'update', 'read'], userManagerAbility)

            expect(memberDestroy).toHaveBeenCalledWith({
                where: { projectId: 1, userId: 2 },
                transaction: transactionStub,
            })
            expect(memberBulkCreate).toHaveBeenCalledWith(
                [
                    { projectId: 1, userId: 2, permission: 'read' },
                    { projectId: 1, userId: 2, permission: 'update' },
                ],
                { transaction: transactionStub },
            )
            expect(invalidateUser).toHaveBeenCalledWith(2)
        })

        it('rejects unknown target users', async () => {
            userFindByPk.mockResolvedValue(null)

            await expect(service.setMemberPermissions(1, 2, ['read'], userManagerAbility)).rejects.toThrow(
                new NotFoundException('Unknown user'),
            )
        })
    })

    describe('removeMember', () => {
        it('destroys the rows and invalidates the cache', async () => {
            await service.removeMember(1, 2, projectEditorAbility)

            expect(memberDestroy).toHaveBeenCalledWith({ where: { projectId: 1, userId: 2 } })
            expect(invalidateUser).toHaveBeenCalledWith(2)
        })
    })

    describe('getMembershipsForUser', () => {
        it('groups memberships per project with the project name', async () => {
            memberFindAll.mockResolvedValue([
                memberRow({ project: { projectId: 1, name: 'Acme' }, permission: 'read' }),
                memberRow({ projectMemberId: 2, project: { projectId: 1, name: 'Acme' }, permission: 'update' }),
                memberRow({
                    projectMemberId: 3,
                    projectId: 4,
                    project: { projectId: 4, name: 'Beta' },
                    permission: 'read',
                }),
            ])

            const memberships = await service.getMembershipsForUser(2)

            expect(memberships).toEqual([
                { projectId: 1, projectName: 'Acme', permissions: ['read', 'update'] },
                { projectId: 4, projectName: 'Beta', permissions: ['read'] },
            ])
        })
    })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter backend exec vitest run src/modules/permission/services/project-member.service.spec.ts`
Expected: FAIL — `Cannot find module './project-member.service'`.

- [ ] **Step 3: Implement the service**

`apps/backend/src/modules/permission/services/project-member.service.ts`:

```ts
import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/sequelize'
import { Sequelize } from 'sequelize-typescript'
import { ProjectMemberModel } from '../models/project-member.model'
import { ProjectModel } from '../../project/models/project.model'
import { UserModel } from '../../user/models/user.model'
import { PermissionCacheService } from './permission-cache.service'
import { assertProjectUpdatable } from '../helpers/project-access'
import { AppAbility } from '../interfaces/app-ability'
import { ProjectMemberInfo, ProjectMembership } from '../interfaces/project-member.interface'
import { ProjectPermission } from '../permission.constants'

@Injectable()
export class ProjectMemberService {
    constructor(
        @InjectModel(ProjectMemberModel) private readonly memberModel: typeof ProjectMemberModel,
        @InjectModel(ProjectModel) private readonly projectModel: typeof ProjectModel,
        @InjectModel(UserModel) private readonly userModel: typeof UserModel,
        private readonly permissionCacheService: PermissionCacheService,
        private readonly sequelize: Sequelize,
    ) {}

    async getMembers(projectId: number, ability: AppAbility): Promise<ProjectMemberInfo[]> {
        await this.assertCanManageMembers(projectId, ability)

        const rows = await this.memberModel.findAll({ where: { projectId }, include: [UserModel] })

        const byUser = new Map<number, ProjectMemberInfo>()
        for (const row of rows) {
            const user = row.user!
            const entry = byUser.get(row.userId) ?? {
                userId: row.userId,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                permissions: [],
            }
            entry.permissions.push(row.permission)
            byUser.set(row.userId, entry)
        }

        return [...byUser.values()]
    }

    async setMemberPermissions(
        projectId: number,
        userId: number,
        permissions: ProjectPermission[],
        ability: AppAbility,
    ): Promise<void> {
        await this.assertCanManageMembers(projectId, ability)

        const user = await this.userModel.findByPk(userId)
        if (!user) {
            throw new NotFoundException('Unknown user')
        }

        const uniquePermissions = [...new Set(permissions)]

        await this.sequelize.transaction(async (transaction) => {
            await this.memberModel.destroy({ where: { projectId, userId }, transaction })
            await this.memberModel.bulkCreate(
                uniquePermissions.map((permission) => ({ projectId, userId, permission })),
                { transaction },
            )
        })

        await this.permissionCacheService.invalidateUser(userId)
    }

    async removeMember(projectId: number, userId: number, ability: AppAbility): Promise<void> {
        await this.assertCanManageMembers(projectId, ability)

        await this.memberModel.destroy({ where: { projectId, userId } })
        await this.permissionCacheService.invalidateUser(userId)
    }

    async getMembershipsForUser(userId: number): Promise<ProjectMembership[]> {
        const rows = await this.memberModel.findAll({
            where: { userId },
            include: [{ model: ProjectModel, required: true }],
        })

        const byProject = new Map<number, ProjectMembership>()
        for (const row of rows) {
            const entry = byProject.get(row.projectId) ?? {
                projectId: row.projectId,
                projectName: row.project!.name,
                permissions: [],
            }
            entry.permissions.push(row.permission)
            byProject.set(row.projectId, entry)
        }

        return [...byProject.values()]
    }

    private async assertCanManageMembers(projectId: number, ability: AppAbility): Promise<void> {
        const project = await this.projectModel.findByPk(projectId)
        if (!project) {
            throw new NotFoundException('Unknown project')
        }

        if (ability.can('update', 'User')) {
            return
        }

        assertProjectUpdatable(ability, projectId)
    }
}
```

Register in `permission.module.ts`: add `ProjectMemberService` to `providers` and `exports`.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter backend exec vitest run src/modules/permission/services/project-member.service.spec.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Verify**

Run: `pnpm --filter backend typecheck && pnpm --filter backend lint`
Expected: green.

---

### Task 7: User management service layer

**Files:**

- Modify: `apps/backend/src/modules/user/interfaces/user.interface.ts` (add `UserUpdate`, `UserDetail`)
- Modify: `apps/backend/src/modules/user/services/user.service.ts`
- Modify: `apps/backend/src/modules/user/services/user.service.spec.ts`

**Interfaces:**

- Consumes: `RoleService`, `ProjectMemberService`, `PermissionCacheService`, `UserPermissionModel`, `AppAbility`, `subject` from `@casl/ability`.
- Produces:
    - `UserUpdate { firstName?; lastName?; email?; password?; roleId? }`, `UserDetail extends UserWithRole { permissions: Permission[]; memberships: ProjectMembership[] }`
    - `UserService.createManagedUser(user: Omit<UserCreate, 'roleId'> & { roleId?: number }, principal: UserWithRole): Promise<UserWithRole>` — defaults to the `user` role; only Super Admins may assign the `super_admin` role; duplicate email → `BadRequestException('Email is already in use')`.
    - `UserService.getUsers(): Promise<UserWithRole[]>`
    - `UserService.getUserById(userId: number): Promise<UserDetail>` — 404 `'Unknown user'`.
    - `UserService.updateUser(userId: number, update: UserUpdate, principal: UserWithRole, ability: AppAbility): Promise<UserWithRole>`
    - `UserService.deleteUser(userId: number, principal: UserWithRole, ability: AppAbility): Promise<void>`
    - `UserService.replaceUserPermissions(userId: number, permissions: Permission[], ability: AppAbility): Promise<Permission[]>`
    - Error rules: self-delete → `BadRequestException('You cannot delete yourself')`; last Super Admin demote/delete → `BadRequestException('The last super admin cannot be removed')`; CASL-forbidden target → `ForbiddenException('Insufficient permissions for this user')`; non-Super-Admin assigning `super_admin` → `ForbiddenException('Only super admins can assign the super admin role')`.

- [ ] **Step 1: Extend the user interfaces**

Append to `apps/backend/src/modules/user/interfaces/user.interface.ts`:

```ts
import { Permission } from '../../permission/permission.constants'
import { ProjectMembership } from '../../permission/interfaces/project-member.interface'
```

(merge with the existing `Role` import at the top) and:

```ts
export interface UserUpdate {
    firstName?: string
    lastName?: string
    email?: string
    password?: string
    roleId?: number
}

export interface UserDetail extends UserWithRole {
    permissions: Permission[]
    memberships: ProjectMembership[]
}
```

- [ ] **Step 2: Replace the UserService spec with the full management suite**

Replace `apps/backend/src/modules/user/services/user.service.spec.ts` entirely:

```ts
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { getModelToken } from '@nestjs/sequelize'
import { Sequelize } from 'sequelize-typescript'
import type { Transaction } from 'sequelize'
import { UniqueConstraintError } from 'sequelize'
import { createMongoAbility } from '@casl/ability'
import bcrypt from 'bcryptjs'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { UserService } from './user.service'
import { UserModel } from '../models/user.model'
import { UserPermissionModel } from '../../permission/models/user-permission.model'
import { RoleService } from '../../permission/services/role.service'
import { ProjectMemberService } from '../../permission/services/project-member.service'
import { PermissionCacheService } from '../../permission/services/permission-cache.service'
import { Role } from '../../permission/interfaces/role.interface'
import { AppAbility } from '../../permission/interfaces/app-ability'
import { FullUser, UserWithRole } from '../interfaces/user.interface'

const superAdminRole: Role = {
    roleId: 1,
    name: 'Super Admin',
    type: 'super_admin',
    createdAt: new Date(),
    updatedAt: new Date(),
}
const adminRole: Role = { ...superAdminRole, roleId: 2, name: 'Admin', type: 'admin' }
const userRole: Role = { ...superAdminRole, roleId: 3, name: 'User', type: 'user' }

const superAdminPrincipal: UserWithRole = {
    userId: 1,
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    roleId: 1,
    role: superAdminRole,
    createdAt: new Date(),
    updatedAt: new Date(),
}
const adminPrincipal: UserWithRole = {
    ...superAdminPrincipal,
    userId: 2,
    email: 'admin@example.com',
    roleId: 2,
    role: adminRole,
}

const superAdminAbility = createMongoAbility<AppAbility>([{ action: 'manage', subject: 'all' }])
const adminAbility = createMongoAbility<AppAbility>([
    { action: 'read', subject: 'User' },
    { action: 'create', subject: 'User' },
    { action: 'update', subject: 'User' },
    { action: 'delete', subject: 'User' },
    { action: 'update', subject: 'User', conditions: { 'role.type': 'super_admin' }, inverted: true },
    { action: 'delete', subject: 'User', conditions: { 'role.type': 'super_admin' }, inverted: true },
])

type UserRow = UserWithRole & {
    get: (options: { plain: true }) => UserWithRole
    update: Mock<(values: Partial<FullUser>) => Promise<unknown>>
    destroy: Mock<() => Promise<void>>
}

function userRow(partial: Partial<UserWithRole> = {}): UserRow {
    const plain: UserWithRole = {
        userId: 7,
        firstName: 'Grace',
        lastName: 'Hopper',
        email: 'grace@example.com',
        roleId: 3,
        role: userRole,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...partial,
    }
    const row = {
        ...plain,
        get: () => plain,
        update: vi.fn<UserRow['update']>().mockResolvedValue(undefined),
        destroy: vi.fn<UserRow['destroy']>().mockResolvedValue(undefined),
    }
    return row
}

describe('UserService', () => {
    let service: UserService
    let create: Mock<(attrs: object, options: object) => Promise<{ userId: number }>>
    let findByPk: Mock<(userId: number, options?: object) => Promise<UserRow | null>>
    let findAll: Mock<(options?: object) => Promise<UserRow[]>>
    let count: Mock<(options?: object) => Promise<number>>
    let permissionFindAll: Mock<(options: object) => Promise<{ permission: string }[]>>
    let permissionDestroy: Mock<(options: object) => Promise<number>>
    let permissionBulkCreate: Mock<(rows: object[], options?: object) => Promise<object[]>>
    let getRoleById: Mock<RoleService['getRoleById']>
    let getRoleByType: Mock<RoleService['getRoleByType']>
    let getMembershipsForUser: Mock<ProjectMemberService['getMembershipsForUser']>
    let invalidateUser: Mock<PermissionCacheService['invalidateUser']>
    let transaction: Mock<Sequelize['transaction']>

    const transactionStub = {} as Transaction

    beforeEach(async () => {
        create = vi.fn<typeof create>().mockResolvedValue({ userId: 7 })
        findByPk = vi.fn<typeof findByPk>().mockResolvedValue(userRow())
        findAll = vi.fn<typeof findAll>().mockResolvedValue([])
        count = vi.fn<typeof count>().mockResolvedValue(2)
        permissionFindAll = vi.fn<typeof permissionFindAll>().mockResolvedValue([])
        permissionDestroy = vi.fn<typeof permissionDestroy>().mockResolvedValue(0)
        permissionBulkCreate = vi.fn<typeof permissionBulkCreate>().mockResolvedValue([])
        getRoleById = vi.fn<typeof getRoleById>().mockResolvedValue(userRole)
        getRoleByType = vi.fn<typeof getRoleByType>().mockResolvedValue(userRole)
        getMembershipsForUser = vi.fn<typeof getMembershipsForUser>().mockResolvedValue([])
        invalidateUser = vi.fn<typeof invalidateUser>().mockResolvedValue(undefined)
        transaction = vi
            .fn<typeof transaction>()
            .mockImplementation((callback) => (callback as (t: Transaction) => Promise<unknown>)(transactionStub))

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                UserService,
                { provide: getModelToken(UserModel), useValue: { create, findByPk, findAll, count } },
                {
                    provide: getModelToken(UserPermissionModel),
                    useValue: {
                        findAll: permissionFindAll,
                        destroy: permissionDestroy,
                        bulkCreate: permissionBulkCreate,
                    },
                },
                { provide: RoleService, useValue: { getRoleById, getRoleByType } },
                { provide: ProjectMemberService, useValue: { getMembershipsForUser } },
                { provide: PermissionCacheService, useValue: { invalidateUser } },
                { provide: Sequelize, useValue: { transaction } },
            ],
        }).compile()

        service = module.get(UserService)
    })

    describe('createUser', () => {
        it('hashes the password and returns the user with its role', async () => {
            let storedPassword: string | undefined
            create.mockImplementation((attrs: object) => {
                storedPassword = (attrs as { password: string }).password
                return Promise.resolve({ userId: 7 })
            })

            const result = await service.createUser({
                firstName: 'Grace',
                lastName: 'Hopper',
                email: 'grace@example.com',
                password: 'plain-password',
                roleId: 3,
            })

            expect(storedPassword).toBeDefined()
            expect(storedPassword).not.toBe('plain-password')
            await expect(bcrypt.compare('plain-password', storedPassword!)).resolves.toBe(true)
            expect(result.role.type).toBe('user')
        })
    })

    describe('createManagedUser', () => {
        const input = {
            firstName: 'Grace',
            lastName: 'Hopper',
            email: 'grace@example.com',
            password: 'plain-password',
        }

        it('defaults to the user role', async () => {
            await service.createManagedUser(input, adminPrincipal)

            expect(getRoleByType).toHaveBeenCalledWith('user')
            expect(create).toHaveBeenCalledWith(expect.objectContaining({ roleId: 3 }), expect.anything())
        })

        it('uses the requested role', async () => {
            getRoleById.mockResolvedValue(adminRole)

            await service.createManagedUser({ ...input, roleId: 2 }, adminPrincipal)

            expect(getRoleById).toHaveBeenCalledWith(2)
            expect(create).toHaveBeenCalledWith(expect.objectContaining({ roleId: 2 }), expect.anything())
        })

        it('blocks non-super-admins from assigning the super admin role', async () => {
            getRoleById.mockResolvedValue(superAdminRole)

            await expect(service.createManagedUser({ ...input, roleId: 1 }, adminPrincipal)).rejects.toThrow(
                ForbiddenException,
            )
            expect(create).not.toHaveBeenCalled()
        })

        it('lets super admins assign the super admin role', async () => {
            getRoleById.mockResolvedValue(superAdminRole)
            findByPk.mockResolvedValue(userRow({ roleId: 1, role: superAdminRole }))

            await expect(
                service.createManagedUser({ ...input, roleId: 1 }, superAdminPrincipal),
            ).resolves.toMatchObject({
                role: expect.objectContaining({ type: 'super_admin' }) as Role,
            })
        })

        it('maps duplicate emails to a bad request', async () => {
            create.mockRejectedValue(new UniqueConstraintError({}))

            await expect(service.createManagedUser(input, adminPrincipal)).rejects.toThrow(
                new BadRequestException('Email is already in use'),
            )
        })
    })

    describe('getUsers', () => {
        it('lists users with their roles', async () => {
            findAll.mockResolvedValue([userRow()])

            const users = await service.getUsers()

            expect(users).toEqual([
                expect.objectContaining({ userId: 7, role: expect.objectContaining({ type: 'user' }) }),
            ])
        })
    })

    describe('getUserById', () => {
        it('returns the detail with permissions and memberships', async () => {
            permissionFindAll.mockResolvedValue([{ permission: 'domains.read' }])
            getMembershipsForUser.mockResolvedValue([{ projectId: 1, projectName: 'Acme', permissions: ['read'] }])

            const detail = await service.getUserById(7)

            expect(detail).toMatchObject({
                userId: 7,
                permissions: ['domains.read'],
                memberships: [{ projectId: 1, projectName: 'Acme', permissions: ['read'] }],
            })
        })

        it('throws not found for unknown users', async () => {
            findByPk.mockResolvedValue(null)

            await expect(service.getUserById(99)).rejects.toThrow(new NotFoundException('Unknown user'))
        })
    })

    describe('updateUser', () => {
        it('updates profile fields and invalidates the caches', async () => {
            const row = userRow()
            findByPk.mockResolvedValue(row)

            await service.updateUser(7, { firstName: 'Ida' }, adminPrincipal, adminAbility)

            expect(row.update).toHaveBeenCalledWith({ firstName: 'Ida' })
            expect(invalidateUser).toHaveBeenCalledWith(7)
        })

        it('hashes a new password before persisting it', async () => {
            const row = userRow()
            findByPk.mockResolvedValue(row)

            await service.updateUser(7, { password: 'new-password-123' }, adminPrincipal, adminAbility)

            const changes = row.update.mock.calls[0]![0]
            expect(changes.password).toBeDefined()
            expect(changes.password).not.toBe('new-password-123')
            await expect(bcrypt.compare('new-password-123', changes.password!)).resolves.toBe(true)
        })

        it('forbids admins from updating super admins', async () => {
            findByPk.mockResolvedValue(userRow({ roleId: 1, role: superAdminRole }))

            await expect(service.updateUser(7, { firstName: 'X' }, adminPrincipal, adminAbility)).rejects.toThrow(
                ForbiddenException,
            )
        })

        it('forbids non-super-admins from promoting to super admin', async () => {
            getRoleById.mockResolvedValue(superAdminRole)

            await expect(service.updateUser(7, { roleId: 1 }, adminPrincipal, adminAbility)).rejects.toThrow(
                new ForbiddenException('Only super admins can assign the super admin role'),
            )
        })

        it('blocks demoting the last super admin', async () => {
            findByPk.mockResolvedValue(userRow({ userId: 1, roleId: 1, role: superAdminRole }))
            getRoleById.mockResolvedValue(adminRole)
            getRoleByType.mockResolvedValue(superAdminRole)
            count.mockResolvedValue(1)

            await expect(service.updateUser(1, { roleId: 2 }, superAdminPrincipal, superAdminAbility)).rejects.toThrow(
                new BadRequestException('The last super admin cannot be removed'),
            )
        })

        it('allows demoting a super admin while another remains', async () => {
            const row = userRow({ userId: 5, roleId: 1, role: superAdminRole })
            findByPk.mockResolvedValue(row)
            getRoleById.mockResolvedValue(adminRole)
            getRoleByType.mockResolvedValue(superAdminRole)
            count.mockResolvedValue(2)

            await service.updateUser(5, { roleId: 2 }, superAdminPrincipal, superAdminAbility)

            expect(row.update).toHaveBeenCalledWith({ roleId: 2 })
        })
    })

    describe('deleteUser', () => {
        it('deletes the user and invalidates the caches', async () => {
            const row = userRow()
            findByPk.mockResolvedValue(row)

            await service.deleteUser(7, adminPrincipal, adminAbility)

            expect(row.destroy).toHaveBeenCalledOnce()
            expect(invalidateUser).toHaveBeenCalledWith(7)
        })

        it('blocks self-deletion', async () => {
            await expect(service.deleteUser(2, adminPrincipal, adminAbility)).rejects.toThrow(
                new BadRequestException('You cannot delete yourself'),
            )
        })

        it('forbids admins from deleting super admins', async () => {
            findByPk.mockResolvedValue(userRow({ roleId: 1, role: superAdminRole }))

            await expect(service.deleteUser(7, adminPrincipal, adminAbility)).rejects.toThrow(ForbiddenException)
        })

        it('blocks deleting the last super admin', async () => {
            findByPk.mockResolvedValue(userRow({ userId: 5, roleId: 1, role: superAdminRole }))
            getRoleByType.mockResolvedValue(superAdminRole)
            count.mockResolvedValue(1)

            await expect(service.deleteUser(5, superAdminPrincipal, superAdminAbility)).rejects.toThrow(
                new BadRequestException('The last super admin cannot be removed'),
            )
        })
    })

    describe('replaceUserPermissions', () => {
        it('replaces the rows deduplicated inside a transaction', async () => {
            const result = await service.replaceUserPermissions(
                7,
                ['domains.read', 'domains.read', 'bounces.read'],
                adminAbility,
            )

            expect(permissionDestroy).toHaveBeenCalledWith({ where: { userId: 7 }, transaction: transactionStub })
            expect(permissionBulkCreate).toHaveBeenCalledWith(
                [
                    { userId: 7, permission: 'domains.read' },
                    { userId: 7, permission: 'bounces.read' },
                ],
                { transaction: transactionStub },
            )
            expect(invalidateUser).toHaveBeenCalledWith(7)
            expect(result).toEqual(['domains.read', 'bounces.read'])
        })

        it('forbids editing super admin grants for non-super-admins', async () => {
            findByPk.mockResolvedValue(userRow({ roleId: 1, role: superAdminRole }))

            await expect(service.replaceUserPermissions(7, ['domains.read'], adminAbility)).rejects.toThrow(
                ForbiddenException,
            )
        })
    })
})
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm --filter backend exec vitest run src/modules/user/services/user.service.spec.ts`
Expected: FAIL — the new methods don't exist yet.

- [ ] **Step 4: Implement the service**

`apps/backend/src/modules/user/services/user.service.ts` becomes:

```ts
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/sequelize'
import { Sequelize } from 'sequelize-typescript'
import type { Transaction } from 'sequelize'
import { UniqueConstraintError } from 'sequelize'
import { subject } from '@casl/ability'
import bcrypt from 'bcryptjs'
import { UserModel } from '../models/user.model'
import { FullUser, UserCreate, UserDetail, UserUpdate, UserWithRole } from '../interfaces/user.interface'
import { RoleModel } from '../../permission/models/role.model'
import { UserPermissionModel } from '../../permission/models/user-permission.model'
import { RoleService } from '../../permission/services/role.service'
import { ProjectMemberService } from '../../permission/services/project-member.service'
import { PermissionCacheService } from '../../permission/services/permission-cache.service'
import { Role } from '../../permission/interfaces/role.interface'
import { AppAbility } from '../../permission/interfaces/app-ability'
import { Permission } from '../../permission/permission.constants'

@Injectable()
export class UserService {
    constructor(
        @InjectModel(UserModel) private readonly userModel: typeof UserModel,
        @InjectModel(UserPermissionModel) private readonly userPermissionModel: typeof UserPermissionModel,
        private readonly roleService: RoleService,
        private readonly projectMemberService: ProjectMemberService,
        private readonly permissionCacheService: PermissionCacheService,
        private readonly sequelize: Sequelize,
    ) {}

    async createUser(user: UserCreate, transaction?: Transaction): Promise<UserWithRole> {
        const hashedPassword = await bcrypt.hash(user.password, 10)

        const created = await this.userModel.create(
            {
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                password: hashedPassword,
                roleId: user.roleId,
            },
            { returning: true, transaction },
        )

        const withRole = await this.userModel.findByPk(created.userId, {
            include: [RoleModel],
            rejectOnEmpty: true,
            transaction,
        })

        return withRole.get({ plain: true }) as UserWithRole
    }

    async createManagedUser(
        user: Omit<UserCreate, 'roleId'> & { roleId?: number },
        principal: UserWithRole,
    ): Promise<UserWithRole> {
        const role =
            user.roleId === undefined
                ? await this.roleService.getRoleByType('user')
                : await this.roleService.getRoleById(user.roleId)

        this.assertRoleAssignable(role, principal)

        try {
            return await this.createUser({ ...user, roleId: role.roleId })
        } catch (error) {
            if (error instanceof UniqueConstraintError) {
                throw new BadRequestException('Email is already in use')
            }
            throw error
        }
    }

    async getUsers(): Promise<UserWithRole[]> {
        const rows = await this.userModel.findAll({ include: [RoleModel] })

        return rows.map((row) => row.get({ plain: true }) as UserWithRole)
    }

    async getUserById(userId: number): Promise<UserDetail> {
        const row = await this.loadUser(userId)

        const [permissions, memberships] = await Promise.all([
            this.userPermissionModel.findAll({ where: { userId } }),
            this.projectMemberService.getMembershipsForUser(userId),
        ])

        return {
            ...(row.get({ plain: true }) as UserWithRole),
            permissions: permissions.map((entry) => entry.permission),
            memberships,
        }
    }

    async updateUser(
        userId: number,
        update: UserUpdate,
        principal: UserWithRole,
        ability: AppAbility,
    ): Promise<UserWithRole> {
        const row = await this.loadUser(userId)
        const target = row.get({ plain: true }) as UserWithRole

        this.assertCanManage(ability, 'update', target)

        const changes: Partial<FullUser> = {}
        if (update.firstName !== undefined) {
            changes.firstName = update.firstName
        }
        if (update.lastName !== undefined) {
            changes.lastName = update.lastName
        }
        if (update.email !== undefined) {
            changes.email = update.email
        }
        if (update.password !== undefined) {
            changes.password = await bcrypt.hash(update.password, 10)
        }
        if (update.roleId !== undefined && update.roleId !== target.roleId) {
            const newRole = await this.roleService.getRoleById(update.roleId)
            this.assertRoleAssignable(newRole, principal)
            if (target.role.type === 'super_admin') {
                await this.assertNotLastSuperAdmin()
            }
            changes.roleId = newRole.roleId
        }

        try {
            await row.update(changes)
        } catch (error) {
            if (error instanceof UniqueConstraintError) {
                throw new BadRequestException('Email is already in use')
            }
            throw error
        }

        await this.permissionCacheService.invalidateUser(userId)

        const reloaded = await this.userModel.findByPk(userId, { include: [RoleModel], rejectOnEmpty: true })

        return reloaded.get({ plain: true }) as UserWithRole
    }

    async deleteUser(userId: number, principal: UserWithRole, ability: AppAbility): Promise<void> {
        if (userId === principal.userId) {
            throw new BadRequestException('You cannot delete yourself')
        }

        const row = await this.loadUser(userId)
        const target = row.get({ plain: true }) as UserWithRole

        this.assertCanManage(ability, 'delete', target)

        if (target.role.type === 'super_admin') {
            await this.assertNotLastSuperAdmin()
        }

        await row.destroy()
        await this.permissionCacheService.invalidateUser(userId)
    }

    async replaceUserPermissions(
        userId: number,
        permissions: Permission[],
        ability: AppAbility,
    ): Promise<Permission[]> {
        const row = await this.loadUser(userId)
        const target = row.get({ plain: true }) as UserWithRole

        this.assertCanManage(ability, 'update', target)

        const uniquePermissions = [...new Set(permissions)]

        await this.sequelize.transaction(async (transaction) => {
            await this.userPermissionModel.destroy({ where: { userId }, transaction })
            await this.userPermissionModel.bulkCreate(
                uniquePermissions.map((permission) => ({ userId, permission })),
                { transaction },
            )
        })

        await this.permissionCacheService.invalidateUser(userId)

        return uniquePermissions
    }

    private assertCanManage(ability: AppAbility, action: 'update' | 'delete', target: UserWithRole): void {
        if (!ability.can(action, subject('User', { ...target }))) {
            throw new ForbiddenException('Insufficient permissions for this user')
        }
    }

    private assertRoleAssignable(role: Role, principal: UserWithRole): void {
        if (role.type === 'super_admin' && principal.role.type !== 'super_admin') {
            throw new ForbiddenException('Only super admins can assign the super admin role')
        }
    }

    private async assertNotLastSuperAdmin(): Promise<void> {
        const superAdminRole = await this.roleService.getRoleByType('super_admin')
        const superAdminCount = await this.userModel.count({ where: { roleId: superAdminRole.roleId } })

        if (superAdminCount <= 1) {
            throw new BadRequestException('The last super admin cannot be removed')
        }
    }

    private async loadUser(userId: number): Promise<UserModel> {
        const row = await this.userModel.findByPk(userId, { include: [RoleModel] })
        if (!row) {
            throw new NotFoundException('Unknown user')
        }

        return row
    }
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm --filter backend exec vitest run src/modules/user/services/user.service.spec.ts`
Expected: PASS (all describes).

- [ ] **Step 6: Verify**

Run: `pnpm --filter backend typecheck && pnpm --filter backend lint && pnpm --filter backend exec vitest run`
Expected: all green.

---

### Task 8: User and Role controllers with DTOs

**Files:**

- Modify: `apps/backend/src/modules/user/dtos/user.dto.ts` (add `UserRoleDto`, `role` field, `UserDetailDto`, `UserMembershipDto`)
- Create: `apps/backend/src/modules/user/dtos/user-create.dto.ts` (also holds `UserUpdateDto`, `UserPermissionsPutDto`)
- Modify: `apps/backend/src/modules/user/controller/user.controller.ts`
- Modify: `apps/backend/src/modules/user/controller/user.controller.spec.ts`
- Create: `apps/backend/src/modules/permission/dtos/role.dto.ts`
- Create: `apps/backend/src/modules/permission/controller/role.controller.ts`
- Modify: `apps/backend/src/modules/permission/permission.module.ts` (register `RoleController`)
- Modify: `apps/backend/src/modules/user/dtos/user.dto.spec.ts` (fixtures gain `role`)

**Interfaces:**

- Consumes: `UserService` methods from Task 7, `RoleService`, `@RequireAbility`, `@CurrentAbility`, `@Principal`, `ResponseDto`.
- Produces (HTTP contract consumed by the generated client in Task 13):
    - `GET /user` → `UserDto[]`; `POST /user` (`UserCreateDto`) → `UserDto`; `GET /user/:userId` → `UserDetailDto`; `PATCH /user/:userId` (`UserUpdateDto`) → `UserDto`; `DELETE /user/:userId` → void; `PUT /user/:userId/permissions` (`UserPermissionsPutDto`) → `UserPermissionsPutDto`.
    - `GET /role` → `RoleDto[]` (tag `role` → SDK `RoleApi.getRoles`).
    - OpenAPI enums: `Permission` (via `enumName: 'Permission'`), `ProjectPermission`, `RoleType` — the frontend derives its permission grids from these generated types.

- [ ] **Step 1: Extend the response DTOs**

`apps/backend/src/modules/user/dtos/user.dto.ts` becomes:

```ts
import { User } from '../interfaces/user.interface'
import { Expose, Type } from 'class-transformer'
import { ApiProperty } from '@nestjs/swagger'
import {
    GLOBAL_PERMISSIONS,
    Permission,
    PROJECT_PERMISSIONS,
    ProjectPermission,
    ROLE_TYPES,
    RoleType,
} from '../../permission/permission.constants'

export class UserRoleDto {
    @Expose()
    roleId!: number

    @Expose()
    name!: string

    @Expose()
    @ApiProperty({ enum: ROLE_TYPES, enumName: 'RoleType' })
    type!: RoleType
}

export class UserDto implements Omit<User, 'roleId'> {
    @Expose()
    userId!: number

    @Expose()
    firstName!: string

    @Expose()
    lastName!: string

    @Expose()
    email!: string

    @Expose()
    @Type(() => UserRoleDto)
    role!: UserRoleDto

    @Expose()
    createdAt!: Date

    @Expose()
    updatedAt!: Date
}

export class UserMembershipDto {
    @Expose()
    projectId!: number

    @Expose()
    projectName!: string

    @Expose()
    @ApiProperty({ enum: PROJECT_PERMISSIONS, enumName: 'ProjectPermission', isArray: true })
    permissions!: ProjectPermission[]
}

export class UserDetailDto extends UserDto {
    @Expose()
    @ApiProperty({ enum: GLOBAL_PERMISSIONS, enumName: 'Permission', isArray: true })
    permissions!: Permission[]

    @Expose()
    @Type(() => UserMembershipDto)
    memberships!: UserMembershipDto[]
}
```

Note `implements Omit<User, 'roleId'>` — the raw FK is not exposed; clients read `role.roleId`.

- [ ] **Step 2: Write the request DTOs**

`apps/backend/src/modules/user/dtos/user-create.dto.ts`:

```ts
import { Expose } from 'class-transformer'
import { ApiProperty } from '@nestjs/swagger'
import { IsArray, IsEmail, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator'
import { GLOBAL_PERMISSIONS, Permission } from '../../permission/permission.constants'

export class UserCreateDto {
    @Expose()
    @IsString()
    @IsNotEmpty()
    firstName!: string

    @Expose()
    @IsString()
    @IsNotEmpty()
    lastName!: string

    @Expose()
    @IsEmail()
    email!: string

    @Expose()
    @IsString()
    @MinLength(8)
    password!: string

    @Expose()
    @IsOptional()
    @IsInt()
    roleId?: number
}

export class UserUpdateDto {
    @Expose()
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    firstName?: string

    @Expose()
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    lastName?: string

    @Expose()
    @IsOptional()
    @IsEmail()
    email?: string

    @Expose()
    @IsOptional()
    @IsString()
    @MinLength(8)
    password?: string

    @Expose()
    @IsOptional()
    @IsInt()
    roleId?: number
}

export class UserPermissionsPutDto {
    @Expose()
    @IsArray()
    @IsIn(GLOBAL_PERMISSIONS, { each: true })
    @ApiProperty({ enum: GLOBAL_PERMISSIONS, enumName: 'Permission', isArray: true })
    permissions!: Permission[]
}
```

- [ ] **Step 3: Write the failing controller spec**

Replace `apps/backend/src/modules/user/controller/user.controller.spec.ts`:

```ts
import { Test, TestingModule } from '@nestjs/testing'
import { createMongoAbility } from '@casl/ability'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { UserController } from './user.controller'
import { UserService } from '../services/user.service'
import { Role } from '../../permission/interfaces/role.interface'
import { AppAbility } from '../../permission/interfaces/app-ability'
import { UserDetail, UserWithRole } from '../interfaces/user.interface'

const role: Role = {
    roleId: 3,
    name: 'User',
    type: 'user',
    createdAt: new Date(),
    updatedAt: new Date(),
}

const user: UserWithRole = {
    userId: 7,
    firstName: 'Grace',
    lastName: 'Hopper',
    email: 'grace@example.com',
    roleId: 3,
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
}

const detail: UserDetail = { ...user, permissions: ['domains.read'], memberships: [] }

const principal: UserWithRole = { ...user, userId: 1 }
const ability = createMongoAbility<AppAbility>([{ action: 'manage', subject: 'all' }])

describe('UserController', () => {
    let controller: UserController
    let getUsers: Mock<UserService['getUsers']>
    let createManagedUser: Mock<UserService['createManagedUser']>
    let getUserById: Mock<UserService['getUserById']>
    let updateUser: Mock<UserService['updateUser']>
    let deleteUser: Mock<UserService['deleteUser']>
    let replaceUserPermissions: Mock<UserService['replaceUserPermissions']>

    beforeEach(async () => {
        getUsers = vi.fn<typeof getUsers>().mockResolvedValue([user])
        createManagedUser = vi.fn<typeof createManagedUser>().mockResolvedValue(user)
        getUserById = vi.fn<typeof getUserById>().mockResolvedValue(detail)
        updateUser = vi.fn<typeof updateUser>().mockResolvedValue(user)
        deleteUser = vi.fn<typeof deleteUser>().mockResolvedValue(undefined)
        replaceUserPermissions = vi.fn<typeof replaceUserPermissions>().mockResolvedValue(['domains.read'])

        const module: TestingModule = await Test.createTestingModule({
            controllers: [UserController],
            providers: [
                {
                    provide: UserService,
                    useValue: {
                        getUsers,
                        createManagedUser,
                        getUserById,
                        updateUser,
                        deleteUser,
                        replaceUserPermissions,
                    },
                },
            ],
        }).compile()

        controller = module.get(UserController)
    })

    it('lists users', async () => {
        await expect(controller.getUsers()).resolves.toEqual([user])
    })

    it('creates a user through the managed flow', async () => {
        const body = { firstName: 'Grace', lastName: 'Hopper', email: 'grace@example.com', password: 'password-123' }

        await expect(controller.createUser(body, principal)).resolves.toEqual(user)
        expect(createManagedUser).toHaveBeenCalledWith(body, principal)
    })

    it('returns the user detail', async () => {
        await expect(controller.getUser(7)).resolves.toEqual(detail)
        expect(getUserById).toHaveBeenCalledWith(7)
    })

    it('updates a user', async () => {
        await expect(controller.updateUser(7, { firstName: 'Ida' }, principal, ability)).resolves.toEqual(user)
        expect(updateUser).toHaveBeenCalledWith(7, { firstName: 'Ida' }, principal, ability)
    })

    it('deletes a user', async () => {
        await controller.deleteUser(7, principal, ability)

        expect(deleteUser).toHaveBeenCalledWith(7, principal, ability)
    })

    it('replaces direct permissions', async () => {
        await expect(controller.replaceUserPermissions(7, { permissions: ['domains.read'] }, ability)).resolves.toEqual(
            {
                permissions: ['domains.read'],
            },
        )
        expect(replaceUserPermissions).toHaveBeenCalledWith(7, ['domains.read'], ability)
    })
})
```

- [ ] **Step 4: Run to verify failure**

Run: `pnpm --filter backend exec vitest run src/modules/user/controller/user.controller.spec.ts`
Expected: FAIL — the controller has no methods yet.

- [ ] **Step 5: Implement the controllers**

`apps/backend/src/modules/user/controller/user.controller.ts`:

```ts
import { Body, Controller, Delete, Get, Param, Patch, Post, Put, SerializeOptions } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { JwtAuth } from '../../auth/decorators/JwtAuth'
import { Principal } from '../../auth/decorators/Principal'
import { RequireAbility } from '../../permission/decorators/RequireAbility'
import { CurrentAbility } from '../../permission/decorators/CurrentAbility'
import { ResponseDto } from '../../../decorators/ResponseDto'
import { UserService } from '../services/user.service'
import { UserDetailDto, UserDto } from '../dtos/user.dto'
import { UserCreateDto, UserPermissionsPutDto, UserUpdateDto } from '../dtos/user-create.dto'
import type { UserWithRole } from '../interfaces/user.interface'
import type { AppAbility } from '../../permission/interfaces/app-ability'

@JwtAuth()
@ApiTags('user')
@Controller('user')
export class UserController {
    constructor(private readonly userService: UserService) {}

    @RequireAbility({ action: 'read', subject: 'User' })
    @SerializeOptions({ type: UserDto })
    @Get()
    async getUsers(): Promise<UserDto[]> {
        return await this.userService.getUsers()
    }

    @RequireAbility({ action: 'create', subject: 'User' })
    @ResponseDto(UserDto)
    @Post()
    async createUser(@Body() body: UserCreateDto, @Principal() principal: UserWithRole): Promise<UserDto> {
        return await this.userService.createManagedUser(body, principal)
    }

    @RequireAbility({ action: 'read', subject: 'User' })
    @ResponseDto(UserDetailDto)
    @Get(':userId')
    async getUser(@Param('userId') userId: number): Promise<UserDetailDto> {
        return await this.userService.getUserById(userId)
    }

    @RequireAbility({ action: 'update', subject: 'User' })
    @ResponseDto(UserDto)
    @Patch(':userId')
    async updateUser(
        @Param('userId') userId: number,
        @Body() body: UserUpdateDto,
        @Principal() principal: UserWithRole,
        @CurrentAbility() ability: AppAbility,
    ): Promise<UserDto> {
        return await this.userService.updateUser(userId, body, principal, ability)
    }

    @RequireAbility({ action: 'delete', subject: 'User' })
    @Delete(':userId')
    async deleteUser(
        @Param('userId') userId: number,
        @Principal() principal: UserWithRole,
        @CurrentAbility() ability: AppAbility,
    ): Promise<void> {
        await this.userService.deleteUser(userId, principal, ability)
    }

    @RequireAbility({ action: 'update', subject: 'User' })
    @ResponseDto(UserPermissionsPutDto)
    @Put(':userId/permissions')
    async replaceUserPermissions(
        @Param('userId') userId: number,
        @Body() body: UserPermissionsPutDto,
        @CurrentAbility() ability: AppAbility,
    ): Promise<UserPermissionsPutDto> {
        return { permissions: await this.userService.replaceUserPermissions(userId, body.permissions, ability) }
    }
}
```

`apps/backend/src/modules/permission/dtos/role.dto.ts`:

```ts
import { Expose } from 'class-transformer'
import { ApiProperty } from '@nestjs/swagger'
import { GLOBAL_PERMISSIONS, Permission, ROLE_TYPES, RoleType } from '../permission.constants'

export class RoleDto {
    @Expose()
    roleId!: number

    @Expose()
    name!: string

    @Expose()
    @ApiProperty({ enum: ROLE_TYPES, enumName: 'RoleType' })
    type!: RoleType

    @Expose()
    @ApiProperty({ enum: GLOBAL_PERMISSIONS, enumName: 'Permission', isArray: true })
    permissions!: Permission[]
}
```

`apps/backend/src/modules/permission/controller/role.controller.ts`:

```ts
import { Controller, Get, SerializeOptions } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { JwtAuth } from '../../auth/decorators/JwtAuth'
import { RequireAbility } from '../decorators/RequireAbility'
import { RoleService } from '../services/role.service'
import { RoleDto } from '../dtos/role.dto'

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
}
```

Register in `permission.module.ts`: `controllers: [RoleController]`.

- [ ] **Step 6: Fix the UserDto spec fixtures**

`apps/backend/src/modules/user/dtos/user.dto.spec.ts` asserts serialization; its user fixtures need a `role: { roleId: 3, name: 'User', type: 'user' }` field (and must no longer expect a bare `roleId` in the output). Open the file and extend the fixture plus expected object accordingly, keeping its existing structure.

- [ ] **Step 7: Run to verify it passes**

Run: `pnpm --filter backend exec vitest run src/modules/user`
Expected: PASS.

- [ ] **Step 8: Verify**

Run: `pnpm --filter backend typecheck && pnpm --filter backend lint && pnpm --filter backend exec vitest run`
Expected: all green.

---

### Task 9: Auth ability endpoint

**Files:**

- Create: `apps/backend/src/modules/auth/dtos/ability-rule.dto.ts`
- Modify: `apps/backend/src/modules/auth/controller/auth.controller.ts`
- Modify: `apps/backend/src/modules/auth/controller/auth.controller.spec.ts`

**Interfaces:**

- Consumes: `@CurrentAbility`, `AppAbility`.
- Produces: `GET /auth/ability` → `AbilityRuleDto[]` (`{ action: string[]; subject: string; conditions?: object; inverted?: boolean }`) — SDK method `AuthApi.getAbility` after regeneration. The frontend feeds these rules verbatim into `createMongoAbility`.

- [ ] **Step 1: Write the DTO**

`apps/backend/src/modules/auth/dtos/ability-rule.dto.ts`:

```ts
import { Expose } from 'class-transformer'
import { ApiProperty } from '@nestjs/swagger'
import { AppAbility } from '../../permission/interfaces/app-ability'

type AppRule = AppAbility['rules'][number]

export class AbilityRuleDto {
    @Expose()
    @ApiProperty({ type: String, isArray: true })
    action!: string[]

    @Expose()
    subject!: string

    @Expose()
    @ApiProperty({ required: false, type: 'object', additionalProperties: true })
    conditions?: Record<string, unknown>

    @Expose()
    @ApiProperty({ required: false })
    inverted?: boolean

    static fromRule(rule: AppRule): AbilityRuleDto {
        return {
            action: Array.isArray(rule.action) ? [...rule.action] : [rule.action],
            subject: String(rule.subject),
            conditions: rule.conditions as Record<string, unknown> | undefined,
            inverted: rule.inverted || undefined,
        }
    }
}
```

- [ ] **Step 2: Add the failing controller test**

In `apps/backend/src/modules/auth/controller/auth.controller.spec.ts`, add imports:

```ts
import { createMongoAbility } from '@casl/ability'
import { AppAbility } from '../../permission/interfaces/app-ability'
```

and a new test at the end of the describe block:

```ts
it('serializes the caller ability rules', () => {
    const ability = createMongoAbility<AppAbility>([
        { action: 'read', subject: 'Domain' },
        { action: ['update', 'delete'], subject: 'User', conditions: { 'role.type': 'super_admin' }, inverted: true },
    ])

    const rules = controller.getAbility(ability)

    expect(rules).toEqual([
        { action: ['read'], subject: 'Domain', conditions: undefined, inverted: undefined },
        {
            action: ['update', 'delete'],
            subject: 'User',
            conditions: { 'role.type': 'super_admin' },
            inverted: true,
        },
    ])
})
```

Run: `pnpm --filter backend exec vitest run src/modules/auth/controller/auth.controller.spec.ts`
Expected: FAIL — `getAbility` does not exist.

- [ ] **Step 3: Implement the endpoint**

In `apps/backend/src/modules/auth/controller/auth.controller.ts`, add imports:

```ts
import { SerializeOptions } from '@nestjs/common'
import { CurrentAbility } from '../../permission/decorators/CurrentAbility'
import type { AppAbility } from '../../permission/interfaces/app-ability'
import { AbilityRuleDto } from '../dtos/ability-rule.dto'
```

(merge `SerializeOptions` into the existing `@nestjs/common` import) and the route after `currentUser`:

```ts
    @JwtAuth()
    @SerializeOptions({ type: AbilityRuleDto })
    @Get('ability')
    getAbility(@CurrentAbility() ability: AppAbility): AbilityRuleDto[] {
        return ability.rules.map((rule) => AbilityRuleDto.fromRule(rule))
    }
```

- [ ] **Step 4: Verify**

Run: `pnpm --filter backend exec vitest run src/modules/auth && pnpm --filter backend typecheck && pnpm --filter backend lint`
Expected: all green.

---

### Task 10: Project scoping and member endpoints

**Files:**

- Modify: `apps/backend/src/modules/project/services/project.service.ts`
- Modify: `apps/backend/src/modules/project/services/project.service.spec.ts`
- Create: `apps/backend/src/modules/project/dtos/project-member.dto.ts`
- Modify: `apps/backend/src/modules/project/controller/project.controller.ts`
- Modify: `apps/backend/src/modules/project/controller/project.controller.spec.ts`

**Interfaces:**

- Consumes: `AbilityFactory`, `PermissionCacheService`, `ProjectMemberModel`, `ProjectMemberService`, project-access helpers, `PROJECT_PERMISSIONS`.
- Produces (signatures every caller must use from now on):
    - `ProjectService.createProject(name: string, principal: User): Promise<Project>` — creator without all-projects access gets read+update+delete membership rows in the same transaction.
    - `ProjectService.getProjects(principal: User): Promise<ProjectWithCounts[]>` / `getDeletedProjects(principal: User)` — scoped by `read` / `delete` level.
    - `ProjectService.getProjectById(projectId, ability)`, `updateProject(projectId, update, ability)`, `deleteProject(projectId, ability)`, `restoreProject(projectId, ability)`, `assignDomain(projectId, domainId, ability)`, `unassignDomain(projectId, domainId, ability)`.
    - Domain assignment additionally requires `ability.can('read', 'Domain')` → else `ForbiddenException('Missing domain permission')`.
    - HTTP: `GET /project/:projectId/members` → `ProjectMemberDto[]`; `PUT /project/:projectId/members/:userId` (`ProjectMemberPutDto`, non-empty) → void; `DELETE /project/:projectId/members/:userId` → void.

- [ ] **Step 1: Write the member DTOs**

`apps/backend/src/modules/project/dtos/project-member.dto.ts`:

```ts
import { Expose } from 'class-transformer'
import { ApiProperty } from '@nestjs/swagger'
import { ArrayNotEmpty, IsArray, IsIn } from 'class-validator'
import { PROJECT_PERMISSIONS, ProjectPermission } from '../../permission/permission.constants'

export class ProjectMemberPutDto {
    @Expose()
    @IsArray()
    @ArrayNotEmpty()
    @IsIn(PROJECT_PERMISSIONS, { each: true })
    @ApiProperty({ enum: PROJECT_PERMISSIONS, enumName: 'ProjectPermission', isArray: true })
    permissions!: ProjectPermission[]
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
    @ApiProperty({ enum: PROJECT_PERMISSIONS, enumName: 'ProjectPermission', isArray: true })
    permissions!: ProjectPermission[]
}
```

- [ ] **Step 2: Rewrite the ProjectService spec for the scoped signatures**

Replace `apps/backend/src/modules/project/services/project.service.spec.ts` entirely:

```ts
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { getModelToken } from '@nestjs/sequelize'
import { Test, TestingModule } from '@nestjs/testing'
import { Sequelize } from 'sequelize-typescript'
import type { Transaction } from 'sequelize'
import { Op, UniqueConstraintError } from 'sequelize'
import { createMongoAbility } from '@casl/ability'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { ProjectService } from './project.service'
import { ProjectModel } from '../models/project.model'
import { ProjectDomainModel } from '../models/project-domain.model'
import { DomainModel } from '../../domain/models/domain.model'
import { InboundFormModel } from '../../inbound-form/models/inbound-form.model'
import { DomainService } from '../../domain/services/domain.service'
import { AbilityFactory } from '../../permission/services/ability-factory.service'
import { PermissionCacheService } from '../../permission/services/permission-cache.service'
import { ProjectMemberModel } from '../../permission/models/project-member.model'
import { AppAbility } from '../../permission/interfaces/app-ability'
import { Domain } from '../../domain/interfaces/domain.interface'
import { InboundForm } from '../../inbound-form/interfaces/inbound-form.interface'
import { Project } from '../interfaces/project.interface'
import { User } from '../../user/interfaces/user.interface'

const domain: Domain = {
    domainId: 3,
    fqdn: 'mail.example.com',
    rootDomain: 'example.com',
    activeDkimId: 7,
    dnsRecords: [],
    lastCheckedAt: null,
}

const inboundForm: InboundForm = {
    inboundFormId: 11,
    projectId: 1,
    domainId: 3,
    name: 'Contact',
    slug: 'contact',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
}

const project: Project = {
    projectId: 1,
    name: 'Acme',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
}

const principal: User = {
    userId: 5,
    firstName: 'Grace',
    lastName: 'Hopper',
    email: 'grace@example.com',
    roleId: 3,
    createdAt: new Date(),
    updatedAt: new Date(),
}

const manageAll = createMongoAbility<AppAbility>([{ action: 'manage', subject: 'all' }])
const memberAbility = createMongoAbility<AppAbility>([
    { action: 'read', subject: 'Project', conditions: { projectId: { $in: [1] } } },
    { action: 'update', subject: 'Project', conditions: { projectId: { $in: [1] } } },
    { action: 'read', subject: 'Domain' },
])
const readOnlyAbility = createMongoAbility<AppAbility>([
    { action: 'read', subject: 'Project', conditions: { projectId: { $in: [1] } } },
])
const noDomainEditorAbility = createMongoAbility<AppAbility>([
    { action: 'read', subject: 'Project', conditions: { projectId: { $in: [1] } } },
    { action: 'update', subject: 'Project', conditions: { projectId: { $in: [1] } } },
])

type ProjectPlain = Project & { domains?: Domain[]; inboundForms?: InboundForm[] }

type ProjectRow = ProjectPlain & {
    get: (options: { plain: true }) => ProjectPlain
    update: Mock<(values: Partial<Project>) => Promise<ProjectRow>>
    destroy: Mock<() => Promise<void>>
    restore: Mock<() => Promise<void>>
}

function projectRow(partial: Partial<ProjectPlain> = {}): ProjectRow {
    const plain: ProjectPlain = { ...project, ...partial }
    const row = {
        ...plain,
        get: () => plain,
        update: vi.fn<ProjectRow['update']>(),
        destroy: vi.fn<ProjectRow['destroy']>().mockResolvedValue(undefined),
        restore: vi.fn<ProjectRow['restore']>().mockResolvedValue(undefined),
    }
    row.update.mockResolvedValue(row)
    return row
}

describe('ProjectService', () => {
    let service: ProjectService
    let projectFindAll: Mock<(options?: object) => Promise<ProjectRow[]>>
    let projectFindByPk: Mock<
        (projectId: number, options?: { include?: unknown[]; paranoid?: boolean }) => Promise<ProjectRow | null>
    >
    let projectCreate: Mock<(values: { name: string }, options: object) => Promise<ProjectRow>>
    let projectDomainFindOne: Mock<
        (options: { where: { projectId: number; domainId: number } }) => Promise<object | null>
    >
    let projectDomainFindOrCreate: Mock<
        (options: { where: { projectId: number; domainId: number } }) => Promise<[object, boolean]>
    >
    let projectDomainDestroy: Mock<(options: { where: { projectId: number; domainId: number } }) => Promise<number>>
    let formCount: Mock<(options: { where: { projectId: number; domainId: number } }) => Promise<number>>
    let getDomainById: Mock<DomainService['getDomainById']>
    let memberBulkCreate: Mock<(rows: object[], options?: object) => Promise<object[]>>
    let hasAllProjectsAccess: Mock<AbilityFactory['hasAllProjectsAccess']>
    let getProjectIdsFor: Mock<AbilityFactory['getProjectIdsFor']>
    let invalidateUser: Mock<PermissionCacheService['invalidateUser']>
    let transaction: Mock<Sequelize['transaction']>

    const transactionStub = {} as Transaction

    beforeEach(async () => {
        projectFindAll = vi.fn<typeof projectFindAll>().mockResolvedValue([])
        projectFindByPk = vi.fn<typeof projectFindByPk>()
        projectCreate = vi.fn<typeof projectCreate>()
        projectDomainFindOne = vi.fn<typeof projectDomainFindOne>()
        projectDomainFindOrCreate = vi.fn<typeof projectDomainFindOrCreate>().mockResolvedValue([{}, true])
        projectDomainDestroy = vi.fn<typeof projectDomainDestroy>().mockResolvedValue(0)
        formCount = vi.fn<typeof formCount>().mockResolvedValue(0)
        getDomainById = vi.fn<typeof getDomainById>().mockResolvedValue(domain)
        memberBulkCreate = vi.fn<typeof memberBulkCreate>().mockResolvedValue([])
        hasAllProjectsAccess = vi.fn<typeof hasAllProjectsAccess>().mockResolvedValue(false)
        getProjectIdsFor = vi.fn<typeof getProjectIdsFor>().mockResolvedValue([1])
        invalidateUser = vi.fn<typeof invalidateUser>().mockResolvedValue(undefined)
        transaction = vi
            .fn<typeof transaction>()
            .mockImplementation((callback) => (callback as (t: Transaction) => Promise<unknown>)(transactionStub))

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ProjectService,
                {
                    provide: getModelToken(ProjectModel),
                    useValue: { findAll: projectFindAll, findByPk: projectFindByPk, create: projectCreate },
                },
                {
                    provide: getModelToken(ProjectDomainModel),
                    useValue: {
                        findOne: projectDomainFindOne,
                        findOrCreate: projectDomainFindOrCreate,
                        destroy: projectDomainDestroy,
                    },
                },
                { provide: getModelToken(InboundFormModel), useValue: { count: formCount } },
                { provide: getModelToken(ProjectMemberModel), useValue: { bulkCreate: memberBulkCreate } },
                { provide: DomainService, useValue: { getDomainById } },
                { provide: AbilityFactory, useValue: { hasAllProjectsAccess, getProjectIdsFor } },
                { provide: PermissionCacheService, useValue: { invalidateUser } },
                { provide: Sequelize, useValue: { transaction } },
            ],
        }).compile()

        service = module.get(ProjectService)
    })

    describe('createProject', () => {
        it('grants the creator a full membership when they lack all-projects access', async () => {
            projectCreate.mockResolvedValue(projectRow())

            const created = await service.createProject('Acme', principal)

            expect(projectCreate).toHaveBeenCalledWith(
                { name: 'Acme' },
                { returning: true, transaction: transactionStub },
            )
            expect(memberBulkCreate).toHaveBeenCalledWith(
                [
                    { projectId: 1, userId: 5, permission: 'read' },
                    { projectId: 1, userId: 5, permission: 'update' },
                    { projectId: 1, userId: 5, permission: 'delete' },
                ],
                { transaction: transactionStub },
            )
            expect(invalidateUser).toHaveBeenCalledWith(5)
            expect(created).toEqual(project)
        })

        it('skips the membership for holders of all-projects access', async () => {
            hasAllProjectsAccess.mockResolvedValue(true)
            projectCreate.mockResolvedValue(projectRow())

            await service.createProject('Acme', principal)

            expect(memberBulkCreate).not.toHaveBeenCalled()
            expect(invalidateUser).not.toHaveBeenCalled()
        })

        it('maps unique name violations to a bad request', async () => {
            projectCreate.mockRejectedValue(new UniqueConstraintError({}))

            await expect(service.createProject('Acme', principal)).rejects.toThrow(
                new BadRequestException('Name is already in use'),
            )
        })
    })

    describe('getProjects', () => {
        it('applies no filter for all-projects access', async () => {
            getProjectIdsFor.mockResolvedValue('all')
            projectFindAll.mockResolvedValue([projectRow({ domains: [domain], inboundForms: [inboundForm] })])

            const projects = await service.getProjects(principal)

            expect(getProjectIdsFor).toHaveBeenCalledWith(principal, 'read')
            expect(projectFindAll).toHaveBeenCalledWith({ where: undefined, include: [DomainModel, InboundFormModel] })
            expect(projects).toEqual([{ ...project, domainCount: 1, inboundFormCount: 1 }])
        })

        it('filters by readable membership ids otherwise', async () => {
            getProjectIdsFor.mockResolvedValue([1, 4])

            await service.getProjects(principal)

            expect(projectFindAll).toHaveBeenCalledWith({
                where: { projectId: { [Op.in]: [1, 4] } },
                include: [DomainModel, InboundFormModel],
            })
        })
    })

    describe('getDeletedProjects', () => {
        it('scopes trashed rows by the delete level', async () => {
            getProjectIdsFor.mockResolvedValue([1])
            const deletedAt = new Date()
            projectFindAll.mockResolvedValue([projectRow({ deletedAt })])

            const projects = await service.getDeletedProjects(principal)

            expect(getProjectIdsFor).toHaveBeenCalledWith(principal, 'delete')
            expect(projectFindAll).toHaveBeenCalledWith({
                paranoid: false,
                where: { deletedAt: { [Op.not]: null }, projectId: { [Op.in]: [1] } },
            })
            expect(projects).toEqual([{ ...project, deletedAt }])
        })

        it('lists all trashed rows for all-projects access', async () => {
            getProjectIdsFor.mockResolvedValue('all')

            await service.getDeletedProjects(principal)

            expect(projectFindAll).toHaveBeenCalledWith({
                paranoid: false,
                where: { deletedAt: { [Op.not]: null } },
            })
        })
    })

    describe('getProjectById', () => {
        it('returns readable projects with their domains', async () => {
            projectFindByPk.mockResolvedValue(projectRow({ domains: [domain] }))

            const loaded = await service.getProjectById(1, memberAbility)

            expect(projectFindByPk).toHaveBeenCalledWith(1, { include: [DomainModel] })
            expect(loaded).toEqual({ ...project, domains: [domain] })
        })

        it('hides unreadable projects behind a 404', async () => {
            projectFindByPk.mockResolvedValue(projectRow({ projectId: 2, domains: [] }))

            await expect(service.getProjectById(2, memberAbility)).rejects.toThrow(
                new NotFoundException('Unknown project'),
            )
        })

        it('throws not found for unknown projects', async () => {
            projectFindByPk.mockResolvedValue(null)

            await expect(service.getProjectById(1, manageAll)).rejects.toThrow(new NotFoundException('Unknown project'))
        })
    })

    describe('updateProject', () => {
        it('renames updatable projects', async () => {
            const row = projectRow()
            projectFindByPk.mockResolvedValue(row)

            await service.updateProject(1, { name: 'Beta' }, memberAbility)

            expect(row.update).toHaveBeenCalledWith({ name: 'Beta' })
        })

        it('rejects read-only members with a 403', async () => {
            projectFindByPk.mockResolvedValue(projectRow())

            await expect(service.updateProject(1, { name: 'Beta' }, readOnlyAbility)).rejects.toThrow(
                ForbiddenException,
            )
        })

        it('maps unique name violations to a bad request', async () => {
            const row = projectRow()
            row.update.mockRejectedValue(new UniqueConstraintError({}))
            projectFindByPk.mockResolvedValue(row)

            await expect(service.updateProject(1, { name: 'Beta' }, manageAll)).rejects.toThrow(
                new BadRequestException('Name is already in use'),
            )
        })
    })

    describe('deleteProject', () => {
        it('soft deletes with the delete level', async () => {
            const row = projectRow()
            projectFindByPk.mockResolvedValue(row)

            await service.deleteProject(1, manageAll)

            expect(row.destroy).toHaveBeenCalledOnce()
        })

        it('rejects members without the delete level', async () => {
            projectFindByPk.mockResolvedValue(projectRow())

            await expect(service.deleteProject(1, memberAbility)).rejects.toThrow(ForbiddenException)
        })
    })

    describe('restoreProject', () => {
        it('restores a trashed project with the delete level', async () => {
            const row = projectRow({ deletedAt: new Date() })
            projectFindByPk.mockResolvedValue(row)

            await service.restoreProject(1, manageAll)

            expect(projectFindByPk).toHaveBeenCalledWith(1, { paranoid: false })
            expect(row.restore).toHaveBeenCalledOnce()
        })

        it('throws not found when the project is not trashed', async () => {
            projectFindByPk.mockResolvedValue(projectRow())

            await expect(service.restoreProject(1, manageAll)).rejects.toThrow(new NotFoundException('Unknown project'))
        })
    })

    describe('assignDomain', () => {
        it('assigns for editors with domain read access', async () => {
            projectFindByPk.mockResolvedValue(projectRow())

            await service.assignDomain(1, 3, memberAbility)

            expect(getDomainById).toHaveBeenCalledWith(3)
            expect(projectDomainFindOrCreate).toHaveBeenCalledWith({ where: { projectId: 1, domainId: 3 } })
        })

        it('rejects editors without domain read access', async () => {
            projectFindByPk.mockResolvedValue(projectRow())

            await expect(service.assignDomain(1, 3, noDomainEditorAbility)).rejects.toThrow(
                new ForbiddenException('Missing domain permission'),
            )
            expect(projectDomainFindOrCreate).not.toHaveBeenCalled()
        })

        it('rejects unknown domains', async () => {
            projectFindByPk.mockResolvedValue(projectRow())
            getDomainById.mockRejectedValue(new Error('empty result'))

            await expect(service.assignDomain(1, 3, manageAll)).rejects.toThrow(
                new BadRequestException('Unknown domain'),
            )
        })
    })

    describe('unassignDomain', () => {
        it('removes the assignment when no form uses the domain', async () => {
            projectFindByPk.mockResolvedValue(projectRow())

            await service.unassignDomain(1, 3, memberAbility)

            expect(formCount).toHaveBeenCalledWith({ where: { projectId: 1, domainId: 3 } })
            expect(projectDomainDestroy).toHaveBeenCalledWith({ where: { projectId: 1, domainId: 3 } })
        })

        it('blocks removal while forms in the project use the domain', async () => {
            projectFindByPk.mockResolvedValue(projectRow())
            formCount.mockResolvedValue(2)

            await expect(service.unassignDomain(1, 3, manageAll)).rejects.toThrow(
                new BadRequestException('The domain is used by 2 forms in this project'),
            )
        })
    })

    describe('assertDomainInProject', () => {
        it('resolves when the assignment exists', async () => {
            projectDomainFindOne.mockResolvedValue({})

            await expect(service.assertDomainInProject(1, 3)).resolves.toBeUndefined()
        })

        it('rejects when the domain is not assigned', async () => {
            projectDomainFindOne.mockResolvedValue(null)

            await expect(service.assertDomainInProject(1, 3)).rejects.toThrow(
                new BadRequestException('Domain does not belong to the project'),
            )
        })
    })
})
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm --filter backend exec vitest run src/modules/project/services/project.service.spec.ts`
Expected: FAIL — signatures don't match yet.

- [ ] **Step 4: Implement the scoped ProjectService**

Rewrite `apps/backend/src/modules/project/services/project.service.ts` keeping the untouched private helpers (`assertDomainExists`, `loadProject`) and `assertDomainInProject` as they are:

```ts
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/sequelize'
import { Sequelize } from 'sequelize-typescript'
import { Op, UniqueConstraintError } from 'sequelize'
import { ProjectModel } from '../models/project.model'
import { ProjectDomainModel } from '../models/project-domain.model'
import { DomainModel } from '../../domain/models/domain.model'
import { InboundFormModel } from '../../inbound-form/models/inbound-form.model'
import { DomainService } from '../../domain/services/domain.service'
import { AbilityFactory } from '../../permission/services/ability-factory.service'
import { PermissionCacheService } from '../../permission/services/permission-cache.service'
import { ProjectMemberModel } from '../../permission/models/project-member.model'
import {
    assertProjectDeletable,
    assertProjectReadable,
    assertProjectUpdatable,
} from '../../permission/helpers/project-access'
import { PROJECT_PERMISSIONS } from '../../permission/permission.constants'
import { AppAbility } from '../../permission/interfaces/app-ability'
import { User } from '../../user/interfaces/user.interface'
import { Domain } from '../../domain/interfaces/domain.interface'
import { InboundForm } from '../../inbound-form/interfaces/inbound-form.interface'
import { DeletedProject, Project, ProjectWithCounts, ProjectWithDomains } from '../interfaces/project.interface'

@Injectable()
export class ProjectService {
    constructor(
        @InjectModel(ProjectModel) private readonly projectModel: typeof ProjectModel,
        @InjectModel(ProjectDomainModel) private readonly projectDomainModel: typeof ProjectDomainModel,
        @InjectModel(InboundFormModel) private readonly inboundFormModel: typeof InboundFormModel,
        @InjectModel(ProjectMemberModel) private readonly projectMemberModel: typeof ProjectMemberModel,
        private readonly domainService: DomainService,
        private readonly abilityFactory: AbilityFactory,
        private readonly permissionCacheService: PermissionCacheService,
        private readonly sequelize: Sequelize,
    ) {}

    async createProject(name: string, principal: User): Promise<Project> {
        const hasAllProjects = await this.abilityFactory.hasAllProjectsAccess(principal)

        const created = await this.sequelize.transaction(async (transaction) => {
            let row: ProjectModel
            try {
                row = await this.projectModel.create({ name }, { returning: true, transaction })
            } catch (error) {
                if (error instanceof UniqueConstraintError) {
                    throw new BadRequestException('Name is already in use')
                }
                throw error
            }

            if (!hasAllProjects) {
                await this.projectMemberModel.bulkCreate(
                    PROJECT_PERMISSIONS.map((permission) => ({
                        projectId: row.projectId,
                        userId: principal.userId,
                        permission,
                    })),
                    { transaction },
                )
            }

            return row.get({ plain: true })
        })

        if (!hasAllProjects) {
            await this.permissionCacheService.invalidateUser(principal.userId)
        }

        return created
    }

    async getProjects(principal: User): Promise<ProjectWithCounts[]> {
        const scope = await this.abilityFactory.getProjectIdsFor(principal, 'read')
        const where = scope === 'all' ? undefined : { projectId: { [Op.in]: scope } }

        const rows = await this.projectModel.findAll({ where, include: [DomainModel, InboundFormModel] })

        return rows.map((row) => {
            const plain = row.get({ plain: true }) as Project & { domains: Domain[]; inboundForms: InboundForm[] }
            const { domains, inboundForms, ...projectFields } = plain

            return {
                ...projectFields,
                inboundFormCount: inboundForms.length,
                domainCount: domains.length,
            }
        })
    }

    async getDeletedProjects(principal: User): Promise<DeletedProject[]> {
        const scope = await this.abilityFactory.getProjectIdsFor(principal, 'delete')
        const where =
            scope === 'all'
                ? { deletedAt: { [Op.not]: null } }
                : { deletedAt: { [Op.not]: null }, projectId: { [Op.in]: scope } }

        const rows = await this.projectModel.findAll({ paranoid: false, where })

        return rows.map((row) => row.get({ plain: true }) as DeletedProject)
    }

    async getProjectById(projectId: number, ability: AppAbility): Promise<ProjectWithDomains> {
        const row = await this.projectModel.findByPk(projectId, { include: [DomainModel] })
        if (!row) {
            throw new NotFoundException('Unknown project')
        }

        assertProjectReadable(ability, projectId)

        return row.get({ plain: true }) as ProjectWithDomains
    }

    async updateProject(projectId: number, update: { name: string }, ability: AppAbility): Promise<Project> {
        const row = await this.loadProject(projectId)
        assertProjectUpdatable(ability, projectId)

        try {
            await row.update(update)
        } catch (error) {
            if (error instanceof UniqueConstraintError) {
                throw new BadRequestException('Name is already in use')
            }
            throw error
        }

        return row.get({ plain: true })
    }

    async deleteProject(projectId: number, ability: AppAbility): Promise<void> {
        const row = await this.loadProject(projectId)
        assertProjectDeletable(ability, projectId)

        await row.destroy()
    }

    async restoreProject(projectId: number, ability: AppAbility): Promise<Project> {
        const row = await this.projectModel.findByPk(projectId, { paranoid: false })
        if (!row || row.deletedAt === null) {
            throw new NotFoundException('Unknown project')
        }

        assertProjectDeletable(ability, projectId)

        await row.restore()

        return row.get({ plain: true })
    }

    async assignDomain(projectId: number, domainId: number, ability: AppAbility): Promise<void> {
        await this.loadProject(projectId)
        assertProjectUpdatable(ability, projectId)
        this.assertCanReadDomains(ability)
        await this.assertDomainExists(domainId)
        await this.projectDomainModel.findOrCreate({ where: { projectId, domainId } })
    }

    async unassignDomain(projectId: number, domainId: number, ability: AppAbility): Promise<void> {
        await this.loadProject(projectId)
        assertProjectUpdatable(ability, projectId)
        this.assertCanReadDomains(ability)

        const count = await this.inboundFormModel.count({ where: { projectId, domainId } })
        if (count > 0) {
            throw new BadRequestException(`The domain is used by ${count} forms in this project`)
        }

        await this.projectDomainModel.destroy({ where: { projectId, domainId } })
    }

    async assertDomainInProject(projectId: number, domainId: number): Promise<void> {
        const assignment = await this.projectDomainModel.findOne({ where: { projectId, domainId } })
        if (!assignment) {
            throw new BadRequestException('Domain does not belong to the project')
        }
    }

    async assertProjectExists(projectId: number): Promise<void> {
        await this.loadProject(projectId)
    }

    private assertCanReadDomains(ability: AppAbility): void {
        if (!ability.can('read', 'Domain')) {
            throw new ForbiddenException('Missing domain permission')
        }
    }

    private async assertDomainExists(domainId: number): Promise<void> {
        try {
            await this.domainService.getDomainById(domainId)
        } catch {
            throw new BadRequestException('Unknown domain')
        }
    }

    private async loadProject(projectId: number): Promise<ProjectModel> {
        const row = await this.projectModel.findByPk(projectId)
        if (!row) {
            throw new NotFoundException('Unknown project')
        }

        return row
    }
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm --filter backend exec vitest run src/modules/project/services/project.service.spec.ts`
Expected: PASS.

- [ ] **Step 6: Wire the controller**

Rewrite `apps/backend/src/modules/project/controller/project.controller.ts`:

```ts
import { Body, Controller, Delete, Get, Param, Patch, Post, Put, SerializeOptions } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { JwtAuth } from '../../auth/decorators/JwtAuth'
import { Principal } from '../../auth/decorators/Principal'
import { RequireAbility } from '../../permission/decorators/RequireAbility'
import { CurrentAbility } from '../../permission/decorators/CurrentAbility'
import { ResponseDto } from '../../../decorators/ResponseDto'
import { ProjectService } from '../services/project.service'
import { ProjectMemberService } from '../../permission/services/project-member.service'
import { ProjectCreateDto, ProjectUpdateDto } from '../dtos/project-create.dto'
import { ProjectDomainAssignDto } from '../dtos/project-domain-assign.dto'
import { ProjectMemberDto, ProjectMemberPutDto } from '../dtos/project-member.dto'
import { DeletedProjectDto, ProjectDetailDto, ProjectDto, ProjectListDto } from '../dtos/project.dto'
import type { UserWithRole } from '../../user/interfaces/user.interface'
import type { AppAbility } from '../../permission/interfaces/app-ability'

@JwtAuth()
@ApiTags('project')
@Controller('project')
export class ProjectController {
    constructor(
        private readonly projectService: ProjectService,
        private readonly projectMemberService: ProjectMemberService,
    ) {}

    @RequireAbility({ action: 'create', subject: 'Project' })
    @ResponseDto(ProjectDto)
    @Post()
    async createProject(@Body() body: ProjectCreateDto, @Principal() principal: UserWithRole): Promise<ProjectDto> {
        const project = await this.projectService.createProject(body.name, principal)

        return ProjectDto.fromProject(project)
    }

    @SerializeOptions({ type: ProjectListDto })
    @Get()
    async getProjects(@Principal() principal: UserWithRole): Promise<ProjectListDto[]> {
        const projects = await this.projectService.getProjects(principal)

        return projects.map((project) => ProjectListDto.fromProjectWithCounts(project))
    }

    @SerializeOptions({ type: DeletedProjectDto })
    @Get('deleted')
    async getDeletedProjects(@Principal() principal: UserWithRole): Promise<DeletedProjectDto[]> {
        const projects = await this.projectService.getDeletedProjects(principal)

        return projects.map((project) => DeletedProjectDto.fromDeletedProject(project))
    }

    @ResponseDto(ProjectDetailDto)
    @Get(':projectId')
    async getProject(
        @Param('projectId') projectId: number,
        @CurrentAbility() ability: AppAbility,
    ): Promise<ProjectDetailDto> {
        const project = await this.projectService.getProjectById(projectId, ability)

        return ProjectDetailDto.fromProjectWithDomains(project)
    }

    @ResponseDto(ProjectDto)
    @Patch(':projectId')
    async updateProject(
        @Param('projectId') projectId: number,
        @Body() body: ProjectUpdateDto,
        @CurrentAbility() ability: AppAbility,
    ): Promise<ProjectDto> {
        const project = await this.projectService.updateProject(projectId, { name: body.name }, ability)

        return ProjectDto.fromProject(project)
    }

    @Delete(':projectId')
    async deleteProject(@Param('projectId') projectId: number, @CurrentAbility() ability: AppAbility): Promise<void> {
        await this.projectService.deleteProject(projectId, ability)
    }

    @ResponseDto(ProjectDto)
    @Post(':projectId/restore')
    async restoreProject(
        @Param('projectId') projectId: number,
        @CurrentAbility() ability: AppAbility,
    ): Promise<ProjectDto> {
        const project = await this.projectService.restoreProject(projectId, ability)

        return ProjectDto.fromProject(project)
    }

    @Post(':projectId/domains')
    async assignProjectDomain(
        @Param('projectId') projectId: number,
        @Body() body: ProjectDomainAssignDto,
        @CurrentAbility() ability: AppAbility,
    ): Promise<void> {
        await this.projectService.assignDomain(projectId, body.domainId, ability)
    }

    @Delete(':projectId/domains/:domainId')
    async unassignProjectDomain(
        @Param('projectId') projectId: number,
        @Param('domainId') domainId: number,
        @CurrentAbility() ability: AppAbility,
    ): Promise<void> {
        await this.projectService.unassignDomain(projectId, domainId, ability)
    }

    @SerializeOptions({ type: ProjectMemberDto })
    @Get(':projectId/members')
    async getProjectMembers(
        @Param('projectId') projectId: number,
        @CurrentAbility() ability: AppAbility,
    ): Promise<ProjectMemberDto[]> {
        return await this.projectMemberService.getMembers(projectId, ability)
    }

    @Put(':projectId/members/:userId')
    async setProjectMember(
        @Param('projectId') projectId: number,
        @Param('userId') userId: number,
        @Body() body: ProjectMemberPutDto,
        @CurrentAbility() ability: AppAbility,
    ): Promise<void> {
        await this.projectMemberService.setMemberPermissions(projectId, userId, body.permissions, ability)
    }

    @Delete(':projectId/members/:userId')
    async removeProjectMember(
        @Param('projectId') projectId: number,
        @Param('userId') userId: number,
        @CurrentAbility() ability: AppAbility,
    ): Promise<void> {
        await this.projectMemberService.removeMember(projectId, userId, ability)
    }
}
```

`InboundFormService.assertProjectExists` (private, in `apps/backend/src/modules/inbound-form/services/inbound-form.service.ts`) resolves the project through `ProjectService`, whose method signatures just changed. To keep this task's typecheck gate green before Task 11 lands, change that private method to delegate to the new existence check:

```ts
    private async assertProjectExists(projectId: number): Promise<void> {
        try {
            await this.projectService.assertProjectExists(projectId)
        } catch {
            throw new BadRequestException('Unknown project')
        }
    }
```

(Inspect the method's current body first and preserve its existing error message if it differs. Update the `ProjectService` mock in `inbound-form.service.spec.ts` from the old lookup method to `assertProjectExists` accordingly.)

- [ ] **Step 7: Update the controller spec**

`apps/backend/src/modules/project/controller/project.controller.spec.ts`: the controller constructor now takes a second `ProjectMemberService` mock, and every delegation expectation gains the new trailing argument. Use these fixtures at the top:

```ts
const manageAll = createMongoAbility<AppAbility>([{ action: 'manage', subject: 'all' }])
```

plus a `principal: UserWithRole` fixture (same shape as in the user controller spec). Exact expected delegations:

| Controller call                                      | Expected service call                                             |
| ---------------------------------------------------- | ----------------------------------------------------------------- |
| `createProject(body, principal)`                     | `projectService.createProject(body.name, principal)`              |
| `getProjects(principal)`                             | `projectService.getProjects(principal)`                           |
| `getDeletedProjects(principal)`                      | `projectService.getDeletedProjects(principal)`                    |
| `getProject(1, manageAll)`                           | `projectService.getProjectById(1, manageAll)`                     |
| `updateProject(1, body, manageAll)`                  | `projectService.updateProject(1, { name: body.name }, manageAll)` |
| `deleteProject(1, manageAll)`                        | `projectService.deleteProject(1, manageAll)`                      |
| `restoreProject(1, manageAll)`                       | `projectService.restoreProject(1, manageAll)`                     |
| `assignProjectDomain(1, { domainId: 3 }, manageAll)` | `projectService.assignDomain(1, 3, manageAll)`                    |
| `unassignProjectDomain(1, 3, manageAll)`             | `projectService.unassignDomain(1, 3, manageAll)`                  |

Add three new tests for the member routes:

```ts
it('lists project members', async () => {
    getMembers.mockResolvedValue([
        { userId: 2, firstName: 'Grace', lastName: 'Hopper', email: 'grace@example.com', permissions: ['read'] },
    ])

    await expect(controller.getProjectMembers(1, manageAll)).resolves.toEqual([
        expect.objectContaining({ userId: 2, permissions: ['read'] }),
    ])
    expect(getMembers).toHaveBeenCalledWith(1, manageAll)
})

it('sets member permissions', async () => {
    await controller.setProjectMember(1, 2, { permissions: ['read', 'update'] }, manageAll)

    expect(setMemberPermissions).toHaveBeenCalledWith(1, 2, ['read', 'update'], manageAll)
})

it('removes a member', async () => {
    await controller.removeProjectMember(1, 2, manageAll)

    expect(removeMember).toHaveBeenCalledWith(1, 2, manageAll)
})
```

with typed mocks `getMembers: Mock<ProjectMemberService['getMembers']>` etc. provided as `{ provide: ProjectMemberService, useValue: { getMembers, setMemberPermissions, removeMember } }`.

- [ ] **Step 8: Verify**

Run: `pnpm --filter backend exec vitest run src/modules/project && pnpm --filter backend typecheck && pnpm --filter backend lint`
Expected: all green.

---

### Task 11: Inbound-form project scoping

**Files:**

- Modify: `apps/backend/src/modules/inbound-form/services/inbound-form.service.ts`
- Modify: `apps/backend/src/modules/inbound-form/controller/inbound-form.controller.ts`
- Modify: `apps/backend/src/modules/inbound-form/services/inbound-form.service.spec.ts`
- Modify: `apps/backend/src/modules/inbound-form/controller/inbound-form.controller.spec.ts`

**Interfaces:**

- Consumes: `AbilityFactory`, `assertProjectReadable`, `assertProjectUpdatable`, `AppAbility`.
- Produces — new `InboundFormService` signatures (all existing behavior unchanged beyond the checks):
    - `createForm(create: InboundFormCreateRequest, ability: AppAbility)`
    - `getForms(principal: User, ability: AppAbility, projectId?: number)`
    - `getFormById(inboundFormId, ability)` — `read` level
    - `updateForm(inboundFormId, update, ability)`, `deleteForm(inboundFormId, ability)`, `replaceFields(inboundFormId, fields, ability)`, `replaceSecurity(inboundFormId, security, ability)`, `createReceiver(inboundFormId, receiver, ability)`, `updateReceiver(inboundFormId, receiverId, update, ability)`, `deleteReceiver(inboundFormId, receiverId, ability)` — `update` level
    - `getReceiver(inboundFormId, receiverId, ability, permission?: 'read' | 'update')` — defaults to `'read'`; template draft/publish routes pass `'update'`.

- [ ] **Step 1: Add the checked loader to the service**

In `inbound-form.service.ts`, add imports:

```ts
import { AbilityFactory } from '../../permission/services/ability-factory.service'
import { assertProjectReadable, assertProjectUpdatable } from '../../permission/helpers/project-access'
import { AppAbility } from '../../permission/interfaces/app-ability'
import { User } from '../../user/interfaces/user.interface'
```

Inject `private readonly abilityFactory: AbilityFactory,` in the constructor. Add a private helper next to the existing `loadForm`:

```ts
    private async loadFormChecked(
        inboundFormId: number,
        ability: AppAbility,
        permission: 'read' | 'update',
    ): Promise<InboundFormModel> {
        const form = await this.loadForm(inboundFormId)
        if (permission === 'read') {
            assertProjectReadable(ability, form.projectId)
        } else {
            assertProjectUpdatable(ability, form.projectId)
        }

        return form
    }
```

- [ ] **Step 2: Thread the ability through every public method**

Apply mechanically; existing bodies stay untouched apart from these lines:

| Method            | New signature                                                                   | Change in body                                                                                                                                                                                                                                                             |
| ----------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createForm`      | `createForm(create: InboundFormCreateRequest, ability: AppAbility)`             | after `assertProjectExists(create.projectId)`, add `assertProjectUpdatable(ability, create.projectId)`                                                                                                                                                                     |
| `getForms`        | `getForms(principal: User, ability: AppAbility, projectId?: number)`            | if `projectId !== undefined`: `assertProjectReadable(ability, projectId)` then filter as before; else `const scope = await this.abilityFactory.getProjectIdsFor(principal, 'read')` and query `scope === 'all' ? undefined : { where: { projectId: { [Op.in]: scope } } }` |
| `getFormById`     | `(inboundFormId, ability)`                                                      | replace `this.loadForm(inboundFormId)` with `this.loadFormChecked(inboundFormId, ability, 'read')`                                                                                                                                                                         |
| `updateForm`      | `(inboundFormId, update, ability)`                                              | `loadFormChecked(..., 'update')`                                                                                                                                                                                                                                           |
| `deleteForm`      | `(inboundFormId, ability)`                                                      | `loadFormChecked(..., 'update')`                                                                                                                                                                                                                                           |
| `replaceFields`   | `(inboundFormId, fields, ability)`                                              | `loadFormChecked(..., 'update')`                                                                                                                                                                                                                                           |
| `replaceSecurity` | `(inboundFormId, security, ability)`                                            | `loadFormChecked(..., 'update')`                                                                                                                                                                                                                                           |
| `createReceiver`  | `(inboundFormId, receiver, ability)`                                            | `loadFormChecked(..., 'update')`                                                                                                                                                                                                                                           |
| `updateReceiver`  | `(inboundFormId, receiverId, update, ability)`                                  | `loadFormChecked(..., 'update')`                                                                                                                                                                                                                                           |
| `deleteReceiver`  | `(inboundFormId, receiverId, ability)`                                          | `loadFormChecked(..., 'update')`                                                                                                                                                                                                                                           |
| `getReceiver`     | `(inboundFormId, receiverId, ability, permission: 'read' \| 'update' = 'read')` | `loadFormChecked(inboundFormId, ability, permission)` (keep the receiver lookup as is)                                                                                                                                                                                     |

`updateForm` internally calls `this.getFormById(inboundFormId)` for its return value — change that call to `this.getFormById(inboundFormId, ability)`.

- [ ] **Step 3: Thread the ability through the controller**

In `inbound-form.controller.ts`, add imports for `Principal`, `CurrentAbility`, `UserWithRole`, `AppAbility` (same paths as in `ProjectController`). Every handler gains `@CurrentAbility() ability: AppAbility` as its last parameter (plus `@Principal() principal: UserWithRole` for `getInboundForms`) and forwards it:

| Handler                                                | Service call                                                |
| ------------------------------------------------------ | ----------------------------------------------------------- |
| `createInboundForm(body, ability)`                     | `createForm({ ... }, ability)`                              |
| `getInboundForms(projectId, principal, ability)`       | `getForms(principal, ability, projectId)`                   |
| `getInboundForm(id, ability)`                          | `getFormById(id, ability)`                                  |
| `updateInboundForm(id, body, ability)`                 | `updateForm(id, body, ability)`                             |
| `deleteInboundForm(id, ability)`                       | `deleteForm(id, ability)`                                   |
| `updateInboundFormFields(id, body, ability)`           | `replaceFields(id, body.fields, ability)`                   |
| `updateInboundFormSecurity(id, body, ability)`         | `replaceSecurity(id, body.security, ability)`               |
| `createInboundFormReceiver(id, body, ability)`         | `createReceiver(id, { ... }, ability)`                      |
| `updateInboundFormReceiver(id, rid, body, ability)`    | `updateReceiver(id, rid, body, ability)`                    |
| `deleteInboundFormReceiver(id, rid, ability)`          | `deleteReceiver(id, rid, ability)`                          |
| `getInboundFormTemplates(id, rid, ability)`            | `getReceiver(id, rid, ability)` before listing versions     |
| `saveInboundFormTemplateDraft(id, rid, body, ability)` | `getReceiver(id, rid, ability, 'update')` before saving     |
| `publishInboundFormTemplate(id, rid, ability)`         | `getReceiver(id, rid, ability, 'update')` before publishing |

- [ ] **Step 4: Update the specs**

In `inbound-form.service.spec.ts` and `inbound-form.controller.spec.ts`, add the shared fixtures:

```ts
import { createMongoAbility } from '@casl/ability'
import { AppAbility } from '../../permission/interfaces/app-ability'

const manageAll = createMongoAbility<AppAbility>([{ action: 'manage', subject: 'all' }])
```

Pass `manageAll` (and, where required, a `principal` fixture with `roleId`) as the new argument in every existing service/controller call and delegation expectation, mirroring the file's current structure. The service spec additionally needs `{ provide: AbilityFactory, useValue: { getProjectIdsFor } }` with `getProjectIdsFor` mocked to resolve `'all'`. Then add two scoping tests to the service spec:

```ts
it('hides forms of unreadable projects behind a 404', async () => {
    const readAbility = createMongoAbility<AppAbility>([
        { action: 'read', subject: 'Project', conditions: { projectId: { $in: [99] } } },
    ])

    await expect(service.getFormById(11, readAbility)).rejects.toThrow(NotFoundException)
})

it('rejects mutations with read-only project access', async () => {
    const readAbility = createMongoAbility<AppAbility>([
        { action: 'read', subject: 'Project', conditions: { projectId: { $in: [1] } } },
    ])

    await expect(service.deleteForm(11, readAbility)).rejects.toThrow(ForbiddenException)
})
```

(These assume the spec's existing form fixture has `projectId: 1` and `loadForm` resolves it — align the ids with the file's fixtures.)

- [ ] **Step 5: Verify**

Run: `pnpm --filter backend exec vitest run src/modules/inbound-form && pnpm --filter backend typecheck && pnpm --filter backend lint`
Expected: all green.

---

### Task 12: Permission e2e suite

**Files:**

- Create: `apps/backend/test/permission.e2e-spec.ts`

**Interfaces:**

- Consumes: everything above via HTTP; `seedUser(app, credentials, roleType)` from Task 2.
- Produces: end-to-end proof of the authorization matrix, including cache invalidation on grant changes.

- [ ] **Step 1: Write the e2e spec**

`apps/backend/test/permission.e2e-spec.ts`:

```ts
import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import type { App } from 'supertest/types'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApp } from './support/app'
import { login, seedUser, type Credentials } from './support/session'
import { configureSendingDomain } from './support/sending-domain'

describe('Permissions (e2e)', () => {
    let app: INestApplication<App>
    let superToken: string
    let memberToken: string
    let adminToken: string
    let superUserId: number
    let memberUserId: number
    let otherUserId: number
    let projectId: number
    let domainId: number
    let adminRoleId: number
    let superAdminRoleId: number

    const superCredentials: Credentials = {
        email: 'perm.super@example.com',
        password: 'correct-horse-battery-staple',
    }
    const memberCredentials: Credentials = {
        email: 'perm.member@example.com',
        password: 'correct-horse-battery-staple',
    }
    const adminCredentials: Credentials = {
        email: 'perm.admin@example.com',
        password: 'correct-horse-battery-staple',
    }

    const http = () => request(app.getHttpServer())
    const asSuper = () => `Bearer ${superToken}`
    const asMember = () => `Bearer ${memberToken}`
    const asAdmin = () => `Bearer ${adminToken}`

    beforeAll(async () => {
        app = await createTestApp()
        await seedUser(app, superCredentials)
        superToken = await login(app, superCredentials)
        await configureSendingDomain(app, superToken, 'mail.perm-example.org')

        const me = await http().get('/api/auth/user').set('Authorization', asSuper()).expect(200)
        superUserId = (me.body as { userId: number }).userId
    })

    afterAll(async () => {
        await app?.close()
    })

    it('exposes the seeded roles', async () => {
        const response = await http().get('/api/role').set('Authorization', asSuper()).expect(200)
        const roles = response.body as { roleId: number; type: string; permissions: string[] }[]

        expect(roles).toHaveLength(3)
        superAdminRoleId = roles.find((role) => role.type === 'super_admin')!.roleId
        adminRoleId = roles.find((role) => role.type === 'admin')!.roleId
        const adminRole = roles.find((role) => role.type === 'admin')!
        expect(adminRole.permissions).toContain('projects.all')
        expect(roles.find((role) => role.type === 'user')!.permissions).toEqual([])
    })

    it('creates a member user with the default role', async () => {
        const response = await http()
            .post('/api/user')
            .set('Authorization', asSuper())
            .send({
                firstName: 'Member',
                lastName: 'User',
                email: memberCredentials.email,
                password: memberCredentials.password,
            })
            .expect(201)

        const body = response.body as { userId: number; role: { type: string } }
        memberUserId = body.userId
        expect(body.role.type).toBe('user')

        memberToken = await login(app, memberCredentials)
    })

    it('denies the member everything by default', async () => {
        await http().get('/api/domain').set('Authorization', asMember()).expect(403)
        await http().get('/api/user').set('Authorization', asMember()).expect(403)
        await http().get('/api/settings').set('Authorization', asMember()).expect(403)
        await http().get('/api/bounce').set('Authorization', asMember()).expect(403)

        const projects = await http().get('/api/project').set('Authorization', asMember()).expect(200)
        expect(projects.body).toEqual([])
    })

    it('hides unshared projects from the member', async () => {
        const created = await http()
            .post('/api/project')
            .set('Authorization', asSuper())
            .send({ name: 'Perm Project' })
            .expect(201)
        projectId = (created.body as { projectId: number }).projectId

        await http().get(`/api/project/${projectId}`).set('Authorization', asMember()).expect(404)
    })

    it('grants read access through a membership', async () => {
        await http()
            .put(`/api/project/${projectId}/members/${memberUserId}`)
            .set('Authorization', asSuper())
            .send({ permissions: ['read'] })
            .expect(200)

        const list = await http().get('/api/project').set('Authorization', asMember()).expect(200)
        expect((list.body as { projectId: number }[]).map((entry) => entry.projectId)).toContain(projectId)

        await http().get(`/api/project/${projectId}`).set('Authorization', asMember()).expect(200)
        await http()
            .patch(`/api/project/${projectId}`)
            .set('Authorization', asMember())
            .send({ name: 'Renamed' })
            .expect(403)
    })

    it('applies membership upgrades immediately', async () => {
        await http()
            .put(`/api/project/${projectId}/members/${memberUserId}`)
            .set('Authorization', asSuper())
            .send({ permissions: ['read', 'update'] })
            .expect(200)

        await http()
            .patch(`/api/project/${projectId}`)
            .set('Authorization', asMember())
            .send({ name: 'Perm Project Renamed' })
            .expect(200)
    })

    it('requires the domains.read grant for domain assignment', async () => {
        const domainResponse = await http()
            .post('/api/domain')
            .set('Authorization', asSuper())
            .send({ fqdn: 'forms.perm-example.org' })
            .expect(201)
        domainId = (domainResponse.body as { domainId: number }).domainId

        await http()
            .post(`/api/project/${projectId}/domains`)
            .set('Authorization', asMember())
            .send({ domainId })
            .expect(403)

        await http()
            .put(`/api/user/${memberUserId}/permissions`)
            .set('Authorization', asSuper())
            .send({ permissions: ['domains.read'] })
            .expect(200)

        await http()
            .post(`/api/project/${projectId}/domains`)
            .set('Authorization', asMember())
            .send({ domainId })
            .expect(201)
    })

    it('lets project editors manage members', async () => {
        const otherResponse = await http()
            .post('/api/user')
            .set('Authorization', asSuper())
            .send({
                firstName: 'Other',
                lastName: 'User',
                email: 'perm.other@example.com',
                password: 'correct-horse-battery-staple',
            })
            .expect(201)
        otherUserId = (otherResponse.body as { userId: number }).userId

        await http()
            .put(`/api/project/${projectId}/members/${otherUserId}`)
            .set('Authorization', asMember())
            .send({ permissions: ['read'] })
            .expect(200)

        const members = await http()
            .get(`/api/project/${projectId}/members`)
            .set('Authorization', asMember())
            .expect(200)
        expect((members.body as { userId: number }[]).map((entry) => entry.userId)).toContain(otherUserId)
    })

    it('shields super admins from admins', async () => {
        await http()
            .post('/api/user')
            .set('Authorization', asSuper())
            .send({
                firstName: 'Admin',
                lastName: 'User',
                email: adminCredentials.email,
                password: adminCredentials.password,
                roleId: adminRoleId,
            })
            .expect(201)
        adminToken = await login(app, adminCredentials)

        await http().get('/api/user').set('Authorization', asAdmin()).expect(200)

        await http()
            .patch(`/api/user/${superUserId}`)
            .set('Authorization', asAdmin())
            .send({ firstName: 'Hacked' })
            .expect(403)

        await http().delete(`/api/user/${superUserId}`).set('Authorization', asAdmin()).expect(403)

        await http()
            .post('/api/user')
            .set('Authorization', asAdmin())
            .send({
                firstName: 'Sneaky',
                lastName: 'Admin',
                email: 'perm.sneaky@example.com',
                password: 'correct-horse-battery-staple',
                roleId: superAdminRoleId,
            })
            .expect(403)
    })

    it('protects the last super admin', async () => {
        await http()
            .patch(`/api/user/${superUserId}`)
            .set('Authorization', asSuper())
            .send({ roleId: adminRoleId })
            .expect(400)

        await http().delete(`/api/user/${superUserId}`).set('Authorization', asSuper()).expect(400)
    })

    it('serves the caller ability rules', async () => {
        const response = await http().get('/api/auth/ability').set('Authorization', asMember()).expect(200)
        const rules = response.body as { action: string[]; subject: string }[]

        expect(rules.some((rule) => rule.subject === 'Project')).toBe(true)
        expect(rules.some((rule) => rule.subject === 'Domain' && rule.action.includes('read'))).toBe(true)
    })
})
```

- [ ] **Step 2: Run the new spec**

Run: `pnpm --filter backend test:e2e -- permission.e2e-spec.ts` (or the project's e2e invocation for a single file; if unsupported, run the full suite)
Expected: PASS.

- [ ] **Step 3: Run the whole backend gate**

Run: `pnpm --filter backend test:e2e && pnpm --filter backend exec vitest run && pnpm --filter backend typecheck && pnpm --filter backend lint`
Expected: all green — including all pre-existing e2e specs (their seeded users are Super Admins).

---

### Task 13: Regenerate the API client

**Files:**

- Generated: `packages/api/assets/openapi.json`, `packages/api/dist/**`

**Interfaces:**

- Produces (consumed by all frontend tasks): `UserApi` (`getUsers`, `createUser`, `getUser`, `updateUser`, `deleteUser`, `replaceUserPermissions`), `RoleApi.getRoles`, `AuthApi.getAbility`, `ProjectApi.getProjectMembers` / `setProjectMember` / `removeProjectMember`, types `UserDto`, `UserDetailDto`, `RoleDto`, `AbilityRuleDto`, `ProjectMemberDto`, and enum types `Permission`, `ProjectPermission`, `RoleType`.

- [ ] **Step 1: Start the dev infrastructure (if not running)**

Run: `docker compose -f dev/docker-compose.yml up -d`
Then: `pnpm --filter backend migrate up`
Expected: migration `010-create-permissions` applies (or is already applied).

- [ ] **Step 2: Regenerate**

Run: `pnpm --filter backend generate`
Expected: log line `OpenAPI spec saved.`; `packages/api/assets/openapi.json` now contains `/api/user`, `/api/role`, `/api/auth/ability`, `/api/project/{projectId}/members/{userId}` paths and the `Permission` enum schema.

Run: `pnpm --filter api build`
Expected: build succeeds; `packages/api/dist` exports `UserApi`, `RoleApi`, and the new types.

- [ ] **Step 3: Verify the monorepo still typechecks**

Run: `pnpm typecheck`
Expected: backend, api, and frontend all pass (the new `UserDto.role` field is additive for existing frontend code).

---

### Task 14: Frontend ability plumbing

**Files:**

- Create: `apps/frontend/src/plugins/casl.ts`
- Create: `apps/frontend/src/modules/auth/queries/useAbilityQuery.ts`
- Create: `apps/frontend/src/modules/auth/queries/__tests__/useAbilityQuery.spec.ts`
- Modify: `apps/frontend/src/main.ts`
- Modify: `apps/frontend/src/modules/auth/mutations/useLoginMutation.ts`
- Modify: `apps/frontend/src/router/index.ts`
- Modify: `apps/frontend/src/modules/dashboard/layouts/AppLayout.vue`
- Create: `apps/frontend/src/modules/dashboard/layouts/__tests__/AppLayout.spec.ts`
- Modify: `apps/frontend/src/__tests__/support.ts`
- Modify: `apps/frontend/src/locales/en.json` (only `module.users.nav` for the tab; the rest comes in Task 15)

**Interfaces:**

- Consumes: `AuthApi.getAbility` from Task 13.
- Produces:
    - `ability` singleton + `AppAbility` type in `@/plugins/casl.ts`; components read the _provided_ ability via `useAbility()` from `@casl/vue` (main.ts provides the singleton).
    - `useAbilityQuery()` — query key `['auth.ability']`, `staleTime: 60_000`, hydrates the singleton via `ability.update(rules)`.
    - Route meta contract: `meta.ability?: { action: string; subject: string }` — guard redirects failures to the dashboard.
    - `mountView(component, options?, rules?)` — third parameter defaults to `[{ action: 'manage', subject: 'all' }]` so existing specs keep passing.

- [ ] **Step 1: Install dependencies**

Run: `pnpm --filter frontend add @casl/ability @casl/vue`
Expected: both added to `apps/frontend/package.json`.

- [ ] **Step 2: Create the ability singleton and provide it**

`apps/frontend/src/plugins/casl.ts`:

```ts
import { createMongoAbility, type MongoAbility } from '@casl/ability'

export type AppAbility = MongoAbility

export const ability: AppAbility = createMongoAbility()
```

In `apps/frontend/src/main.ts`, add:

```ts
import { abilitiesPlugin } from '@casl/vue'
import { ability } from '@/plugins/casl.ts'
```

and extend the app chain with `.use(abilitiesPlugin, ability)` (before `.mount('#app')`).

- [ ] **Step 3: Write the failing useAbilityQuery spec**

`apps/frontend/src/modules/auth/queries/__tests__/useAbilityQuery.spec.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthApi } from 'api'
import { useQuery } from '@tanstack/vue-query'
import { useAbilityQuery } from '../useAbilityQuery.ts'
import { ability } from '@/plugins/casl.ts'
import { withVueQuery } from '@/__tests__/support.ts'

afterEach(() => {
    ability.update([])
    vi.restoreAllMocks()
})

describe('useAbilityQuery', () => {
    it('hydrates the ability singleton from the api rules', async () => {
        const rulesSpy = vi.spyOn(AuthApi, 'getAbility').mockResolvedValue([{ action: ['read'], subject: 'Domain' }])
        const { result, unmount } = withVueQuery(() => useQuery(useAbilityQuery()))

        await vi.waitFor(() => expect(result.isSuccess.value).toBe(true))

        expect(rulesSpy).toHaveBeenCalledOnce()
        expect(ability.can('read', 'Domain')).toBe(true)
        expect(ability.can('create', 'Domain')).toBe(false)
        unmount()
    })
})
```

Run: `pnpm --filter frontend exec vitest run src/modules/auth/queries/__tests__/useAbilityQuery.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the query**

`apps/frontend/src/modules/auth/queries/useAbilityQuery.ts`:

```ts
import { queryOptions } from '@tanstack/vue-query'
import { AuthApi } from 'api'
import type { RawRuleOf } from '@casl/ability'
import { ability, type AppAbility } from '@/plugins/casl.ts'

export function useAbilityQuery() {
    return queryOptions({
        queryKey: ['auth.ability'],
        staleTime: 60_000,
        async queryFn() {
            const rules = await AuthApi.getAbility()
            ability.update(rules as RawRuleOf<AppAbility>[])
            return rules
        },
    })
}
```

Run the spec again — expected: PASS.

- [ ] **Step 5: Reset/refresh the ability on login and logout**

`useLoginMutation.ts` `onSuccess` gains one line:

```ts
        onSuccess({ user, token }) {
            jwt.value = token
            client.setQueryData(['auth.user'], user)
            client.removeQueries({ queryKey: ['auth.ability'] })
        },
```

(If `useLoginMutation.spec.ts` asserts cache interactions, extend its expectations accordingly.)

In `AppLayout.vue` `logout()`:

```ts
function logout() {
    jwt.value = null
    client.removeQueries()
    ability.update([])
    void router.push({ name: RouteNames.LOGIN })
}
```

with `import { ability } from '@/plugins/casl.ts'`.

- [ ] **Step 6: Extend the router**

In `apps/frontend/src/router/index.ts`, add imports:

```ts
import { useAbilityQuery } from '@/modules/auth/queries/useAbilityQuery.ts'
import { ability } from '@/plugins/casl.ts'
```

Add the meta augmentation above `createRouter`:

```ts
declare module 'vue-router' {
    interface RouteMeta {
        requiresAuth?: boolean
        ability?: { action: string; subject: string }
    }
}
```

Add `meta` to the gated routes (children of `/`):

- `/domains` and `/domains/:domainId`: `meta: { ability: { action: 'read', subject: 'Domain' } }`
- `/bounces`: `meta: { ability: { action: 'read', subject: 'Bounce' } }`
- `/settings`: `meta: { ability: { action: 'read', subject: 'Settings' } }`

Replace the tail of the `beforeEach` (everything from `if (!to.meta.requiresAuth)`) with:

```ts
if (!to.meta.requiresAuth) {
    return true
}

try {
    await queryClient.fetchQuery(useAuthQuery())
} catch (err) {
    console.error(err)
    return { name: RouteNames.LOGIN }
}

try {
    await queryClient.fetchQuery(useAbilityQuery())
} catch (err) {
    console.error(err)
}

if (to.meta.ability && !ability.can(to.meta.ability.action, to.meta.ability.subject)) {
    return { name: RouteNames.DASHBOARD }
}

return true
```

- [ ] **Step 7: Provide abilities in the test harness**

In `apps/frontend/src/__tests__/support.ts`, add imports:

```ts
import { abilitiesPlugin } from '@casl/vue'
import { createMongoAbility, type RawRuleOf } from '@casl/ability'
import type { AppAbility } from '@/plugins/casl.ts'
```

and change `mountView`:

```ts
export function mountView(
    component: MountArgs[0],
    options: MountArgs[1] = {},
    rules: RawRuleOf<AppAbility>[] = [{ action: 'manage', subject: 'all' }],
) {
    const i18n = createTestI18n()
    const queryClient = createTestQueryClient()

    return mount(component, {
        ...options,
        global: {
            ...options?.global,
            plugins: [
                vuetify,
                i18n,
                [VueQueryPlugin, { queryClient }],
                [abilitiesPlugin, createMongoAbility(rules)],
                ...(options?.global?.plugins ?? []),
            ],
        },
    })
}
```

- [ ] **Step 8: Gate the navigation tabs**

In `AppLayout.vue`:

Script setup additions:

```ts
import { useAbility } from '@casl/vue'
```

```ts
const { can } = useAbility()
```

Gate the settings health query so users without `settings.read` don't trigger 403s:

```ts
const { data: settings } = useQuery({
    ...useSettingsQuery(),
    refetchInterval: 60_000,
    enabled: computed(() => can('read', 'Settings')),
})
```

Template tabs become:

```html
<VTabs>
    <VTab :to="{ name: RouteNames.DASHBOARD }" exact :text="t('module.dashboard.nav')" />
    <VTab :to="{ name: RouteNames.PROJECT_LIST }" :text="t('module.projects.nav')" />
    <VTab v-if="can('read', 'Domain')" :to="{ name: RouteNames.DOMAIN_LIST }" :text="t('module.domains.nav')" />
    <VTab v-if="can('read', 'Bounce')" :to="{ name: RouteNames.BOUNCE_LIST }" :text="t('module.bounces.nav')" />
    <VTab v-if="can('read', 'User')" :to="{ name: RouteNames.USER_LIST }" :text="t('module.users.nav')" />
    <VTab v-if="can('read', 'Settings')" :to="{ name: RouteNames.SETTINGS }">
        {{ t('module.settings.nav') }}
        <VIcon :icon="healthIcon" :color="healthColor" size="small" class="ms-1" />
    </VTab>
</VTabs>
```

`RouteNames.USER_LIST` doesn't exist until Task 15 — add both enum entries now in `apps/frontend/src/router/RouteNames.ts`:

```ts
    USER_LIST = 'users::list',
    USER_DETAILS = 'users::details',
```

and add `"users": { "nav": "Users" }` under `module` in `apps/frontend/src/locales/en.json` (Task 15 extends this block).

- [ ] **Step 9: Write the AppLayout visibility spec**

`apps/frontend/src/modules/dashboard/layouts/__tests__/AppLayout.spec.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { SettingsApi } from 'api'
import AppLayout from '../AppLayout.vue'
import { RouteNames } from '@/router/RouteNames.ts'
import { mountView } from '@/__tests__/support.ts'

function createTestRouter(): Router {
    return createRouter({
        history: createMemoryHistory(),
        routes: Object.values(RouteNames).map((name, index) => ({
            path: index === 0 ? '/' : `/${index}`,
            name,
            component: { template: '<div />' },
        })),
    })
}

afterEach(() => {
    vi.restoreAllMocks()
})

describe('AppLayout', () => {
    it('shows every tab for manage-all abilities', async () => {
        vi.spyOn(SettingsApi, 'getSettings').mockResolvedValue({ sendingDomain: null })
        const wrapper = mountView(AppLayout, { global: { plugins: [createTestRouter()] } })

        await vi.waitFor(() => expect(wrapper.text()).toContain('Users'))
        expect(wrapper.text()).toContain('Domains')
        expect(wrapper.text()).toContain('Bounces')
        expect(wrapper.text()).toContain('Settings')
    })

    it('hides gated tabs without the read permissions', async () => {
        const wrapper = mountView(AppLayout, { global: { plugins: [createTestRouter()] } }, [])

        await vi.waitFor(() => expect(wrapper.text()).toContain('Projects'))
        expect(wrapper.text()).not.toContain('Domains')
        expect(wrapper.text()).not.toContain('Bounces')
        expect(wrapper.text()).not.toContain('Users')
        expect(wrapper.text()).not.toContain('Settings')
    })
})
```

If `SettingsApi.getSettings` requires a non-null `sendingDomain` type, use `{ sendingDomain: null }` as typed by the generated `SettingsDto` (it is nullable in the backend DTO).

- [ ] **Step 10: Verify**

Run: `pnpm --filter frontend exec vitest run && pnpm --filter frontend typecheck && pnpm --filter frontend lint`
Expected: all green — existing view specs keep passing because `mountView` defaults to manage-all rules.

---

### Task 15: Users module — list, create, delete

**Files:**

- Create: `apps/frontend/src/modules/users/permissionGroups.ts`
- Create: `apps/frontend/src/modules/users/queries/useUsersQuery.ts`
- Create: `apps/frontend/src/modules/users/queries/useUserQuery.ts`
- Create: `apps/frontend/src/modules/users/queries/useRolesQuery.ts`
- Create: `apps/frontend/src/modules/users/mutations/useUserCreateMutation.ts`
- Create: `apps/frontend/src/modules/users/mutations/useUserDeleteMutation.ts`
- Create: `apps/frontend/src/modules/users/views/list/UserListView.vue`
- Create: `apps/frontend/src/modules/users/views/list/partials/UserListEntry.vue`
- Create: `apps/frontend/src/modules/users/views/list/partials/AddUserDialog.vue`
- Create: `apps/frontend/src/modules/users/views/list/partials/DeleteUserDialog.vue`
- Create: `apps/frontend/src/modules/users/views/list/__tests__/UserListView.spec.ts`
- Modify: `apps/frontend/src/router/index.ts` (register the two user routes)
- Modify: `apps/frontend/src/locales/en.json`

**Interfaces:**

- Consumes: `UserApi`, `RoleApi`, generated `Permission` type, `useAbilityQuery` conventions.
- Produces:
    - Query keys: `['users']`, `['users', userId]`, `['roles']`.
    - `PERMISSION_GROUPS: Record<string, Permission[]>` — typed against the generated union so catalog drift breaks the build (used by Task 16).
    - Routes `USER_LIST` (`/users`) and `USER_DETAILS` (`/users/:userId`), both `meta: { ability: { action: 'read', subject: 'User' } }`.

- [ ] **Step 1: Queries, mutations, and the permission grouping**

`apps/frontend/src/modules/users/permissionGroups.ts`:

```ts
import type { Permission } from 'api'

export const PERMISSION_GROUPS: Record<string, Permission[]> = {
    domains: ['domains.read', 'domains.create', 'domains.update', 'domains.delete'],
    projects: ['projects.create', 'projects.all'],
    bounces: ['bounces.read', 'bounces.block', 'bounces.unblock'],
    settings: ['settings.read', 'settings.update'],
    users: ['users.read', 'users.create', 'users.update', 'users.delete'],
    roles: ['roles.read'],
}
```

(If the generated enum type is not exported as `Permission`, check `packages/api/dist` for the actual export name produced by `enumName: 'Permission'` and import that.)

`apps/frontend/src/modules/users/queries/useUsersQuery.ts`:

```ts
import { queryOptions } from '@tanstack/vue-query'
import { UserApi } from 'api'

export function useUsersQuery() {
    return queryOptions({
        queryKey: ['users'],
        queryFn: () => UserApi.getUsers(),
    })
}
```

`apps/frontend/src/modules/users/queries/useUserQuery.ts`:

```ts
import { type MaybeRefOrGetter, toValue } from 'vue'
import { queryOptions } from '@tanstack/vue-query'
import { UserApi } from 'api'

export function useUserQuery(userId: MaybeRefOrGetter<number>) {
    return queryOptions({
        queryKey: ['users', userId],
        queryFn: () =>
            UserApi.getUser({
                path: {
                    userId: toValue(userId),
                },
            }),
    })
}
```

`apps/frontend/src/modules/users/queries/useRolesQuery.ts`:

```ts
import { queryOptions } from '@tanstack/vue-query'
import { RoleApi } from 'api'

export function useRolesQuery() {
    return queryOptions({
        queryKey: ['roles'],
        queryFn: () => RoleApi.getRoles(),
    })
}
```

`apps/frontend/src/modules/users/mutations/useUserCreateMutation.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { UserApi, type UserCreateDto } from 'api'
import { waitAtleast } from '@/helper/waitAtleast.ts'

export function useUserCreateMutation() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: (body: UserCreateDto) => waitAtleast(UserApi.createUser({ body })),
        onSuccess() {
            void client.invalidateQueries({ queryKey: ['users'] })
        },
    })
}
```

`apps/frontend/src/modules/users/mutations/useUserDeleteMutation.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { UserApi } from 'api'
import { waitAtleast } from '@/helper/waitAtleast.ts'

export function useUserDeleteMutation() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: (userId: number) => waitAtleast(UserApi.deleteUser({ path: { userId } })),
        onSuccess() {
            void client.invalidateQueries({ queryKey: ['users'] })
        },
    })
}
```

- [ ] **Step 2: Write the failing view spec**

`apps/frontend/src/modules/users/views/list/__tests__/UserListView.spec.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { UserApi, type UserDto } from 'api'
import UserListView from '../UserListView.vue'
import { mountView } from '@/__tests__/support.ts'

const users: UserDto[] = [
    {
        userId: 7,
        firstName: 'Grace',
        lastName: 'Hopper',
        email: 'grace@example.com',
        role: { roleId: 3, name: 'User', type: 'user' },
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    },
]

afterEach(() => {
    vi.restoreAllMocks()
})

describe('UserListView', () => {
    it('renders one entry per user with the role chip', async () => {
        vi.spyOn(UserApi, 'getUsers').mockResolvedValue(users)
        const wrapper = mountView(UserListView)

        await vi.waitFor(() => {
            expect(wrapper.text()).toContain('Grace Hopper')
        })
        expect(wrapper.text()).toContain('grace@example.com')
        expect(wrapper.text()).toContain('User')
        expect(wrapper.get('h1').text()).toBe('Users')
    })

    it('hides the add button without the create permission', async () => {
        vi.spyOn(UserApi, 'getUsers').mockResolvedValue(users)
        const wrapper = mountView(UserListView, {}, [{ action: 'read', subject: 'User' }])

        await vi.waitFor(() => {
            expect(wrapper.text()).toContain('Grace Hopper')
        })
        expect(wrapper.text()).not.toContain('Add')
    })
})
```

Note: `UserListEntry` renders a `VCard :to` router link and `DeleteUserDialog` — if mounting fails on the missing router, add the same `createTestRouter()` helper pattern used in the AppLayout spec via `{ global: { plugins: [createTestRouter()] } }`.

Run: `pnpm --filter frontend exec vitest run src/modules/users/views/list/__tests__/UserListView.spec.ts`
Expected: FAIL — component missing.

- [ ] **Step 3: Implement the views**

`apps/frontend/src/modules/users/views/list/UserListView.vue`:

```vue
<template>
    <VContainer>
        <div class="d-flex justify-space-between align-center">
            <h1>{{ t('module.users.list.title') }}</h1>
            <AddUserDialog v-if="can('create', 'User')" v-slot="{ props }">
                <VBtn v-bind="props">{{ t('cta.add') }}</VBtn>
            </AddUserDialog>
        </div>
        <VDivider />
        <VFadeTransition leave-absolute>
            <div class="d-flex flex-column gr-3 pt-6" v-if="isPending">
                <VSkeletonLoader v-for="i in 3" :key="i" type="table-heading" />
            </div>
            <div class="d-flex flex-column gr-3 pt-6" v-else>
                <UserListEntry v-for="user in users" :key="user.userId" :user="user" />
            </div>
        </VFadeTransition>
    </VContainer>
</template>

<script setup lang="ts">
    import { useQuery } from '@tanstack/vue-query'
    import { useI18n } from 'vue-i18n'
    import { useAbility } from '@casl/vue'
    import { useUsersQuery } from '@/modules/users/queries/useUsersQuery.ts'
    import AddUserDialog from '@/modules/users/views/list/partials/AddUserDialog.vue'
    import UserListEntry from '@/modules/users/views/list/partials/UserListEntry.vue'

    const { t } = useI18n()
    const { can } = useAbility()
    const { data: users, isPending } = useQuery(useUsersQuery())
</script>
```

`apps/frontend/src/modules/users/views/list/partials/UserListEntry.vue`:

```vue
<template>
    <VCard :to="{ name: RouteNames.USER_DETAILS, params: { userId: user.userId } }">
        <VCardItem>
            <VCardTitle>{{ user.firstName }} {{ user.lastName }}</VCardTitle>
            <VCardSubtitle>{{ user.email }}</VCardSubtitle>
            <template #append>
                <VChip size="small" :text="user.role.name" class="me-2" />
                <DeleteUserDialog v-if="canDelete" :user="user" v-slot="{ props }">
                    <VIconBtn icon="mdi-delete" v-bind="props" @click.prevent />
                </DeleteUserDialog>
            </template>
        </VCardItem>
    </VCard>
</template>

<script setup lang="ts">
    import { computed } from 'vue'
    import type { UserDto } from 'api'
    import { useAbility } from '@casl/vue'
    import { subject } from '@casl/ability'
    import { RouteNames } from '@/router/RouteNames.ts'
    import DeleteUserDialog from '@/modules/users/views/list/partials/DeleteUserDialog.vue'

    const props = defineProps<{ user: UserDto }>()
    const { can } = useAbility()

    const canDelete = computed(() => can('delete', subject('User', { ...props.user })))
</script>
```

`apps/frontend/src/modules/users/views/list/partials/AddUserDialog.vue` (mirrors `AddProjectDialog.vue`):

```vue
<template>
    <VDialog max-width="600" v-model="model" @after-leave="onAfterLeave" :persistent="isPending">
        <template #activator="props">
            <slot v-bind="props" />
        </template>
        <VCard :title="t('module.users.add.title')">
            <template #append>
                <VIconBtn icon="mdi-close" @click="model = false" :disabled="isPending" />
            </template>
            <form @submit.prevent="onSubmit">
                <VCardItem>
                    <VAlert v-if="errorMessage" type="error" class="mb-4" :text="errorMessage" />
                    <p class="mb-4">{{ t('module.users.add.intro') }}</p>
                    <VTextField
                        name="firstName"
                        :label="t('field.firstName')"
                        v-model="firstName"
                        :error-messages="errors.firstName"
                    />
                    <VTextField
                        name="lastName"
                        :label="t('field.lastName')"
                        v-model="lastName"
                        :error-messages="errors.lastName"
                    />
                    <VTextField name="email" :label="t('field.email')" v-model="email" :error-messages="errors.email" />
                    <VTextField
                        name="password"
                        type="password"
                        :label="t('field.password')"
                        v-model="password"
                        :error-messages="errors.password"
                    />
                    <VSelect
                        name="roleId"
                        :label="t('field.role')"
                        :items="roleOptions"
                        item-title="name"
                        item-value="roleId"
                        v-model="roleId"
                        :error-messages="errors.roleId"
                    />
                </VCardItem>
                <VCardActions>
                    <VSpacer />
                    <VBtn color="error" :text="t('cta.abort')" :disabled="isPending" @click="model = false" />
                    <VBtn color="primary" variant="elevated" :text="t('cta.save')" :loading="isPending" type="submit" />
                </VCardActions>
            </form>
        </VCard>
    </VDialog>
</template>

<script setup lang="ts">
    import { computed, ref } from 'vue'
    import { useForm } from 'vee-validate'
    import { toTypedSchema } from '@vee-validate/zod'
    import { z } from 'zod'
    import { useI18n } from 'vue-i18n'
    import { useRouter } from 'vue-router'
    import { useQuery } from '@tanstack/vue-query'
    import { useRolesQuery } from '@/modules/users/queries/useRolesQuery.ts'
    import { useAuthQuery } from '@/modules/auth/queries/useAuthQuery.ts'
    import { useUserCreateMutation } from '@/modules/users/mutations/useUserCreateMutation.ts'
    import { RouteNames } from '@/router/RouteNames.ts'
    import { apiErrorMessage } from '@/helper/apiErrorMessage.ts'

    const model = ref<undefined | boolean>()
    const { t } = useI18n()
    const router = useRouter()
    const errorMessage = ref<string | null>(null)
    const { mutateAsync, isPending } = useUserCreateMutation()
    const { data: roles } = useQuery(useRolesQuery())
    const { data: currentUser } = useQuery(useAuthQuery())

    const roleOptions = computed(() =>
        (roles.value ?? []).filter(
            (role) => role.type !== 'super_admin' || currentUser.value?.role.type === 'super_admin',
        ),
    )

    const { defineField, handleSubmit, errors, resetForm } = useForm({
        validationSchema: toTypedSchema(
            z.object({
                firstName: z.string().min(1),
                lastName: z.string().min(1),
                email: z.email(),
                password: z.string().min(8),
                roleId: z.number().optional(),
            }),
        ),
    })

    const [firstName] = defineField('firstName')
    const [lastName] = defineField('lastName')
    const [email] = defineField('email')
    const [password] = defineField('password')
    const [roleId] = defineField('roleId')

    const onSubmit = handleSubmit(async (values) => {
        errorMessage.value = null
        try {
            const { userId } = await mutateAsync(values)
            void router.push({ name: RouteNames.USER_DETAILS, params: { userId } })
        } catch (error) {
            errorMessage.value = apiErrorMessage(error, t('module.users.add.error'))
        }
    })

    function onAfterLeave() {
        errorMessage.value = null
        resetForm()
    }
</script>
```

`apps/frontend/src/modules/users/views/list/partials/DeleteUserDialog.vue`:

```vue
<template>
    <VDialog max-width="500" v-model="model" :persistent="isPending">
        <template #activator="props">
            <slot v-bind="props" />
        </template>
        <VCard :title="t('module.users.delete.title')">
            <VCardItem>
                <VAlert v-if="errorMessage" type="error" class="mb-4" :text="errorMessage" />
                <p>{{ t('module.users.delete.confirm', { name: `${user.firstName} ${user.lastName}` }) }}</p>
            </VCardItem>
            <VCardActions>
                <VSpacer />
                <VBtn :text="t('cta.abort')" :disabled="isPending" @click="model = false" />
                <VBtn color="error" variant="elevated" :text="t('cta.delete')" :loading="isPending" @click="onDelete" />
            </VCardActions>
        </VCard>
    </VDialog>
</template>

<script setup lang="ts">
    import { ref } from 'vue'
    import type { UserDto } from 'api'
    import { useI18n } from 'vue-i18n'
    import { useUserDeleteMutation } from '@/modules/users/mutations/useUserDeleteMutation.ts'
    import { apiErrorMessage } from '@/helper/apiErrorMessage.ts'

    const props = defineProps<{ user: UserDto }>()
    const model = ref<undefined | boolean>()
    const { t } = useI18n()
    const errorMessage = ref<string | null>(null)
    const { mutateAsync, isPending } = useUserDeleteMutation()

    async function onDelete() {
        errorMessage.value = null
        try {
            await mutateAsync(props.user.userId)
            model.value = false
        } catch (error) {
            errorMessage.value = apiErrorMessage(error, t('module.users.delete.error'))
        }
    }
</script>
```

- [ ] **Step 4: Register the routes**

In `apps/frontend/src/router/index.ts`, import the views:

```ts
import UserListView from '@/modules/users/views/list/UserListView.vue'
import UserDetailView from '@/modules/users/views/details/UserDetailView.vue'
```

(The detail view is created in Task 16 — if executing tasks strictly in order, add a placeholder route only for `USER_LIST` now and the `USER_DETAILS` route in Task 16; when executing 15+16 together, add both.) Children of `/`:

```ts
                {
                    path: '/users',
                    name: RouteNames.USER_LIST,
                    component: UserListView,
                    meta: { ability: { action: 'read', subject: 'User' } },
                },
                {
                    path: '/users/:userId',
                    name: RouteNames.USER_DETAILS,
                    component: UserDetailView,
                    meta: { ability: { action: 'read', subject: 'User' } },
                },
```

- [ ] **Step 5: Add the i18n copy**

Extend the `module.users` block in `apps/frontend/src/locales/en.json` (created in Task 14) to:

```json
"users": {
    "nav": "Users",
    "list": {
        "title": "Users"
    },
    "add": {
        "title": "New User",
        "intro": "Create the account and share the initial password with the user yourself.",
        "error": "The user could not be created"
    },
    "delete": {
        "title": "Delete User",
        "confirm": "Do you really want to delete {name}? This cannot be undone.",
        "error": "The user could not be deleted"
    }
}
```

Add to the root-level `field` block: `"role": "Role"`.

- [ ] **Step 6: Verify**

Run: `pnpm --filter frontend exec vitest run src/modules/users && pnpm --filter frontend typecheck && pnpm --filter frontend lint`
Expected: all green.

---

### Task 16: User detail view

**Files:**

- Create: `apps/frontend/src/modules/users/mutations/useUserUpdateMutation.ts`
- Create: `apps/frontend/src/modules/users/mutations/useUserPermissionsMutation.ts`
- Create: `apps/frontend/src/modules/users/views/details/UserDetailView.vue`
- Create: `apps/frontend/src/modules/users/views/details/partials/UserProfileCard.vue`
- Create: `apps/frontend/src/modules/users/views/details/partials/UserPermissionsCard.vue`
- Create: `apps/frontend/src/modules/users/views/details/partials/UserMembershipsCard.vue`
- Create: `apps/frontend/src/modules/users/views/details/__tests__/UserDetailView.spec.ts`
- Modify: `apps/frontend/src/locales/en.json`

**Interfaces:**

- Consumes: `useUserQuery`, `useRolesQuery`, `PERMISSION_GROUPS`, generated `UserDetailDto`/`Permission`.
- Produces: mutations invalidating `['users']` (and `['auth.user']` + `['auth.ability']` when the edited user is the current one).

- [ ] **Step 1: Mutations**

`apps/frontend/src/modules/users/mutations/useUserUpdateMutation.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { UserApi, type UserDto, type UserUpdateDto } from 'api'
import { waitAtleast } from '@/helper/waitAtleast.ts'

export function useUserUpdateMutation() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: ({ userId, body }: { userId: number; body: UserUpdateDto }) =>
            waitAtleast(UserApi.updateUser({ path: { userId }, body })),
        onSuccess(_, { userId }) {
            void client.invalidateQueries({ queryKey: ['users'] })
            const currentUser = client.getQueryData<UserDto>(['auth.user'])
            if (currentUser?.userId === userId) {
                void client.invalidateQueries({ queryKey: ['auth.user'] })
                void client.invalidateQueries({ queryKey: ['auth.ability'] })
            }
        },
    })
}
```

`apps/frontend/src/modules/users/mutations/useUserPermissionsMutation.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { UserApi, type Permission, type UserDto } from 'api'
import { waitAtleast } from '@/helper/waitAtleast.ts'

export function useUserPermissionsMutation() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: ({ userId, permissions }: { userId: number; permissions: Permission[] }) =>
            waitAtleast(UserApi.replaceUserPermissions({ path: { userId }, body: { permissions } })),
        onSuccess(_, { userId }) {
            void client.invalidateQueries({ queryKey: ['users'] })
            const currentUser = client.getQueryData<UserDto>(['auth.user'])
            if (currentUser?.userId === userId) {
                void client.invalidateQueries({ queryKey: ['auth.ability'] })
            }
        },
    })
}
```

(If the generated permissions-call name differs, check `packages/api/dist` — it matches the backend controller method name `replaceUserPermissions`.)

- [ ] **Step 2: Write the failing detail spec**

`apps/frontend/src/modules/users/views/details/__tests__/UserDetailView.spec.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { UserApi, RoleApi, type RoleDto, type UserDetailDto } from 'api'
import UserDetailView from '../UserDetailView.vue'
import { mountView } from '@/__tests__/support.ts'

vi.mock('vue-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('vue-router')>()
    return { ...actual, useRoute: () => ({ params: { userId: '7' } }), useRouter: () => ({ push: vi.fn() }) }
})

const detail: UserDetailDto = {
    userId: 7,
    firstName: 'Grace',
    lastName: 'Hopper',
    email: 'grace@example.com',
    role: { roleId: 3, name: 'User', type: 'user' },
    permissions: ['domains.read'],
    memberships: [{ projectId: 1, projectName: 'Acme', permissions: ['read'] }],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
}

const roles: RoleDto[] = [
    { roleId: 1, name: 'Super Admin', type: 'super_admin', permissions: [] },
    { roleId: 2, name: 'Admin', type: 'admin', permissions: [] },
    { roleId: 3, name: 'User', type: 'user', permissions: [] },
]

afterEach(() => {
    vi.restoreAllMocks()
})

describe('UserDetailView', () => {
    it('renders profile, permissions, and memberships', async () => {
        vi.spyOn(UserApi, 'getUser').mockResolvedValue(detail)
        vi.spyOn(RoleApi, 'getRoles').mockResolvedValue(roles)
        const wrapper = mountView(UserDetailView)

        await vi.waitFor(() => {
            expect(wrapper.text()).toContain('Grace Hopper')
        })
        expect(wrapper.text()).toContain('Profile')
        expect(wrapper.text()).toContain('Direct permissions')
        expect(wrapper.text()).toContain('Acme')
    })

    it('saves toggled permissions', async () => {
        vi.spyOn(UserApi, 'getUser').mockResolvedValue(detail)
        vi.spyOn(RoleApi, 'getRoles').mockResolvedValue(roles)
        const replaceSpy = vi.spyOn(UserApi, 'replaceUserPermissions').mockResolvedValue({ permissions: [] })
        const wrapper = mountView(UserDetailView)

        await vi.waitFor(() => {
            expect(wrapper.text()).toContain('Direct permissions')
        })

        const checkbox = wrapper.find('input[value="domains.create"]')
        await checkbox.setValue(true)
        const saveButton = wrapper
            .findAll('button')
            .find((button) => button.text() === 'Save' && button.element.closest('.permissions-card'))
        await saveButton!.trigger('click')

        await vi.waitFor(() => {
            expect(replaceSpy).toHaveBeenCalledWith({
                path: { userId: 7 },
                body: { permissions: ['domains.read', 'domains.create'] },
            })
        })
    })
})
```

Run: `pnpm --filter frontend exec vitest run src/modules/users/views/details/__tests__/UserDetailView.spec.ts`
Expected: FAIL — component missing.

- [ ] **Step 3: Implement the view and cards**

`apps/frontend/src/modules/users/views/details/UserDetailView.vue`:

```vue
<template>
    <VContainer>
        <VFadeTransition leave-absolute>
            <div v-if="isPending">
                <VSkeletonLoader type="card" />
            </div>
            <div v-else-if="user" class="d-flex flex-column gr-6">
                <div class="d-flex justify-space-between align-center">
                    <h1>{{ user.firstName }} {{ user.lastName }}</h1>
                    <VChip :text="user.role.name" />
                </div>
                <VDivider />
                <UserProfileCard :user="user" />
                <UserPermissionsCard :user="user" />
                <UserMembershipsCard :user="user" />
            </div>
        </VFadeTransition>
    </VContainer>
</template>

<script setup lang="ts">
    import { useQuery } from '@tanstack/vue-query'
    import { useRoute } from 'vue-router'
    import { useUserQuery } from '@/modules/users/queries/useUserQuery.ts'
    import UserProfileCard from '@/modules/users/views/details/partials/UserProfileCard.vue'
    import UserPermissionsCard from '@/modules/users/views/details/partials/UserPermissionsCard.vue'
    import UserMembershipsCard from '@/modules/users/views/details/partials/UserMembershipsCard.vue'

    const route = useRoute()
    const { data: user, isPending } = useQuery(useUserQuery(() => Number(route.params.userId)))
</script>
```

`apps/frontend/src/modules/users/views/details/partials/UserProfileCard.vue`:

```vue
<template>
    <VCard :title="t('module.users.details.profile.title')">
        <form @submit.prevent="onSubmit">
            <VCardItem>
                <VAlert v-if="errorMessage" type="error" class="mb-4" :text="errorMessage" />
                <VTextField
                    name="firstName"
                    :label="t('field.firstName')"
                    v-model="firstName"
                    :error-messages="errors.firstName"
                    :disabled="!canEdit"
                />
                <VTextField
                    name="lastName"
                    :label="t('field.lastName')"
                    v-model="lastName"
                    :error-messages="errors.lastName"
                    :disabled="!canEdit"
                />
                <VTextField
                    name="email"
                    :label="t('field.email')"
                    v-model="email"
                    :error-messages="errors.email"
                    :disabled="!canEdit"
                />
                <VTextField
                    name="password"
                    type="password"
                    :label="t('module.users.details.profile.newPassword')"
                    v-model="password"
                    :error-messages="errors.password"
                    :disabled="!canEdit"
                />
                <VSelect
                    name="roleId"
                    :label="t('field.role')"
                    :items="roleOptions"
                    item-title="name"
                    item-value="roleId"
                    v-model="roleId"
                    :error-messages="errors.roleId"
                    :disabled="!canEdit"
                />
            </VCardItem>
            <VCardActions v-if="canEdit">
                <VSpacer />
                <VBtn color="primary" variant="elevated" :text="t('cta.save')" :loading="isPending" type="submit" />
            </VCardActions>
        </form>
    </VCard>
</template>

<script setup lang="ts">
    import { computed, ref } from 'vue'
    import { useForm } from 'vee-validate'
    import { toTypedSchema } from '@vee-validate/zod'
    import { z } from 'zod'
    import { useI18n } from 'vue-i18n'
    import { useQuery } from '@tanstack/vue-query'
    import { useAbility } from '@casl/vue'
    import { subject } from '@casl/ability'
    import type { UserDetailDto } from 'api'
    import { useRolesQuery } from '@/modules/users/queries/useRolesQuery.ts'
    import { useAuthQuery } from '@/modules/auth/queries/useAuthQuery.ts'
    import { useUserUpdateMutation } from '@/modules/users/mutations/useUserUpdateMutation.ts'
    import { apiErrorMessage } from '@/helper/apiErrorMessage.ts'

    const props = defineProps<{ user: UserDetailDto }>()
    const { t } = useI18n()
    const { can } = useAbility()
    const errorMessage = ref<string | null>(null)
    const { mutateAsync, isPending } = useUserUpdateMutation()
    const { data: roles } = useQuery(useRolesQuery())
    const { data: currentUser } = useQuery(useAuthQuery())

    const canEdit = computed(() => can('update', subject('User', { ...props.user })))
    const roleOptions = computed(() =>
        (roles.value ?? []).filter(
            (role) =>
                role.type !== 'super_admin' ||
                currentUser.value?.role.type === 'super_admin' ||
                props.user.role.type === 'super_admin',
        ),
    )

    const { defineField, handleSubmit, errors } = useForm({
        validationSchema: toTypedSchema(
            z.object({
                firstName: z.string().min(1),
                lastName: z.string().min(1),
                email: z.email(),
                password: z.string().min(8).optional().or(z.literal('')),
                roleId: z.number(),
            }),
        ),
        initialValues: {
            firstName: props.user.firstName,
            lastName: props.user.lastName,
            email: props.user.email,
            password: '',
            roleId: props.user.role.roleId,
        },
    })

    const [firstName] = defineField('firstName')
    const [lastName] = defineField('lastName')
    const [email] = defineField('email')
    const [password] = defineField('password')
    const [roleId] = defineField('roleId')

    const onSubmit = handleSubmit(async (values) => {
        errorMessage.value = null
        try {
            await mutateAsync({
                userId: props.user.userId,
                body: {
                    firstName: values.firstName,
                    lastName: values.lastName,
                    email: values.email,
                    roleId: values.roleId,
                    ...(values.password ? { password: values.password } : {}),
                },
            })
        } catch (error) {
            errorMessage.value = apiErrorMessage(error, t('module.users.details.profile.error'))
        }
    })
</script>
```

`apps/frontend/src/modules/users/views/details/partials/UserPermissionsCard.vue`:

```vue
<template>
    <VCard :title="t('module.users.details.permissions.title')" class="permissions-card">
        <VCardItem>
            <VAlert v-if="errorMessage" type="error" class="mb-4" :text="errorMessage" />
            <p class="mb-4">{{ t('module.users.details.permissions.intro') }}</p>
            <div class="d-flex flex-wrap ga-6">
                <div v-for="(groupPermissions, group) in PERMISSION_GROUPS" :key="group">
                    <div class="text-subtitle-2">{{ t(`permissions.groups.${group}`) }}</div>
                    <VCheckbox
                        v-for="permission in groupPermissions"
                        :key="permission"
                        v-model="selected"
                        :value="permission"
                        :label="t(`permissions.labels.${permission.replace('.', '_')}`)"
                        :disabled="!canEdit"
                        density="compact"
                        hide-details
                    />
                </div>
            </div>
        </VCardItem>
        <VCardActions v-if="canEdit">
            <VSpacer />
            <VBtn color="primary" variant="elevated" :text="t('cta.save')" :loading="isPending" @click="onSave" />
        </VCardActions>
    </VCard>
</template>

<script setup lang="ts">
    import { computed, ref } from 'vue'
    import { useI18n } from 'vue-i18n'
    import { useAbility } from '@casl/vue'
    import { subject } from '@casl/ability'
    import type { Permission, UserDetailDto } from 'api'
    import { PERMISSION_GROUPS } from '@/modules/users/permissionGroups.ts'
    import { useUserPermissionsMutation } from '@/modules/users/mutations/useUserPermissionsMutation.ts'
    import { apiErrorMessage } from '@/helper/apiErrorMessage.ts'

    const props = defineProps<{ user: UserDetailDto }>()
    const { t } = useI18n()
    const { can } = useAbility()
    const errorMessage = ref<string | null>(null)
    const selected = ref<Permission[]>([...props.user.permissions])
    const { mutateAsync, isPending } = useUserPermissionsMutation()

    const canEdit = computed(() => can('update', subject('User', { ...props.user })))

    async function onSave() {
        errorMessage.value = null
        try {
            await mutateAsync({ userId: props.user.userId, permissions: selected.value })
        } catch (error) {
            errorMessage.value = apiErrorMessage(error, t('module.users.details.permissions.error'))
        }
    }
</script>
```

`apps/frontend/src/modules/users/views/details/partials/UserMembershipsCard.vue`:

```vue
<template>
    <VCard :title="t('module.users.details.memberships.title')">
        <VCardItem>
            <p v-if="user.memberships.length === 0">{{ t('module.users.details.memberships.empty') }}</p>
            <VList v-else>
                <VListItem
                    v-for="membership in user.memberships"
                    :key="membership.projectId"
                    :title="membership.projectName"
                    :to="{ name: RouteNames.PROJECT_DETAILS, params: { projectId: membership.projectId } }"
                >
                    <template #append>
                        <VChip
                            v-for="permission in membership.permissions"
                            :key="permission"
                            size="small"
                            class="ms-1"
                            :text="t(`permissions.project.${permission}`)"
                        />
                    </template>
                </VListItem>
            </VList>
        </VCardItem>
    </VCard>
</template>

<script setup lang="ts">
    import { useI18n } from 'vue-i18n'
    import type { UserDetailDto } from 'api'
    import { RouteNames } from '@/router/RouteNames.ts'

    defineProps<{ user: UserDetailDto }>()
</script>
```

- [ ] **Step 4: Add the i18n copy**

Extend `module.users` with:

```json
"details": {
    "profile": {
        "title": "Profile",
        "newPassword": "New password (optional)",
        "error": "The user could not be updated"
    },
    "permissions": {
        "title": "Direct permissions",
        "intro": "Permissions granted in addition to the role.",
        "error": "The permissions could not be saved"
    },
    "memberships": {
        "title": "Project memberships",
        "empty": "No project access granted."
    }
}
```

Add a new root-level block (shared copy, not module-scoped):

```json
"permissions": {
    "groups": {
        "domains": "Domains",
        "projects": "Projects",
        "bounces": "Bounces",
        "settings": "Settings",
        "users": "Users",
        "roles": "Roles"
    },
    "labels": {
        "domains_read": "View domains",
        "domains_create": "Create domains",
        "domains_update": "Update domains",
        "domains_delete": "Delete domains",
        "projects_create": "Create projects",
        "projects_all": "Access all projects",
        "bounces_read": "View bounces",
        "bounces_block": "Block addresses",
        "bounces_unblock": "Unblock addresses",
        "settings_read": "View settings",
        "settings_update": "Update settings",
        "users_read": "View users",
        "users_create": "Create users",
        "users_update": "Update users",
        "users_delete": "Delete users",
        "roles_read": "View roles"
    },
    "project": {
        "read": "Read",
        "update": "Update",
        "delete": "Delete"
    }
}
```

The label keys use `_` instead of `.` because vue-i18n treats dots as path separators.

- [ ] **Step 5: Verify**

Run: `pnpm --filter frontend exec vitest run src/modules/users && pnpm --filter frontend typecheck && pnpm --filter frontend lint`
Expected: all green.

---

### Task 17: Project members card and project UI gating

**Files:**

- Create: `apps/frontend/src/modules/projects/queries/useProjectMembersQuery.ts`
- Create: `apps/frontend/src/modules/projects/mutations/useProjectMemberSetMutation.ts`
- Create: `apps/frontend/src/modules/projects/mutations/useProjectMemberRemoveMutation.ts`
- Create: `apps/frontend/src/modules/projects/views/details/partials/ProjectMembersCard.vue`
- Create: `apps/frontend/src/modules/projects/views/details/partials/ProjectMemberDialog.vue`
- Create: `apps/frontend/src/modules/projects/views/details/__tests__/ProjectMembersCard.spec.ts`
- Modify: `apps/frontend/src/modules/projects/views/details/ProjectDetailView.vue` (mount the card)
- Modify: `apps/frontend/src/modules/projects/views/details/partials/ProjectGeneralCard.vue`, `ProjectDomainsCard.vue` (+ wherever `DeleteProjectDialog` is triggered) — ability gating
- Modify: `apps/frontend/src/locales/en.json`

**Interfaces:**

- Consumes: `ProjectApi.getProjectMembers` / `setProjectMember` / `removeProjectMember`, `useUsersQuery`, `ProjectPermission` type.
- Produces: query key `['projects', projectId, 'members']`.

- [ ] **Step 1: Queries and mutations**

`useProjectMembersQuery.ts`:

```ts
import { type MaybeRefOrGetter, toValue } from 'vue'
import { queryOptions } from '@tanstack/vue-query'
import { ProjectApi } from 'api'

export function useProjectMembersQuery(projectId: MaybeRefOrGetter<number>) {
    return queryOptions({
        queryKey: ['projects', projectId, 'members'],
        queryFn: () =>
            ProjectApi.getProjectMembers({
                path: {
                    projectId: toValue(projectId),
                },
            }),
    })
}
```

`useProjectMemberSetMutation.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { ProjectApi, type ProjectPermission } from 'api'
import { waitAtleast } from '@/helper/waitAtleast.ts'

export function useProjectMemberSetMutation() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: ({
            projectId,
            userId,
            permissions,
        }: {
            projectId: number
            userId: number
            permissions: ProjectPermission[]
        }) => waitAtleast(ProjectApi.setProjectMember({ path: { projectId, userId }, body: { permissions } })),
        onSuccess(_, { projectId }) {
            void client.invalidateQueries({ queryKey: ['projects', projectId, 'members'] })
            void client.invalidateQueries({ queryKey: ['users'] })
        },
    })
}
```

`useProjectMemberRemoveMutation.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { ProjectApi } from 'api'
import { waitAtleast } from '@/helper/waitAtleast.ts'

export function useProjectMemberRemoveMutation() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: ({ projectId, userId }: { projectId: number; userId: number }) =>
            waitAtleast(ProjectApi.removeProjectMember({ path: { projectId, userId } })),
        onSuccess(_, { projectId }) {
            void client.invalidateQueries({ queryKey: ['projects', projectId, 'members'] })
            void client.invalidateQueries({ queryKey: ['users'] })
        },
    })
}
```

- [ ] **Step 2: Write the failing card spec**

`apps/frontend/src/modules/projects/views/details/__tests__/ProjectMembersCard.spec.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProjectApi, UserApi, type ProjectMemberDto } from 'api'
import ProjectMembersCard from '../partials/ProjectMembersCard.vue'
import { mountView } from '@/__tests__/support.ts'

const members: ProjectMemberDto[] = [
    { userId: 2, firstName: 'Grace', lastName: 'Hopper', email: 'grace@example.com', permissions: ['read', 'update'] },
]

afterEach(() => {
    vi.restoreAllMocks()
})

describe('ProjectMembersCard', () => {
    it('lists members with their levels for managers', async () => {
        vi.spyOn(ProjectApi, 'getProjectMembers').mockResolvedValue(members)
        vi.spyOn(UserApi, 'getUsers').mockResolvedValue([])
        const wrapper = mountView(ProjectMembersCard, { props: { projectId: 1 } })

        await vi.waitFor(() => {
            expect(wrapper.text()).toContain('Grace Hopper')
        })
        expect(wrapper.text()).toContain('Members')
    })

    it('renders nothing without manage rights', async () => {
        const membersSpy = vi.spyOn(ProjectApi, 'getProjectMembers').mockResolvedValue(members)
        const wrapper = mountView(ProjectMembersCard, { props: { projectId: 1 } }, [
            { action: 'read', subject: 'Project', conditions: { projectId: { $in: [1] } } },
        ])

        expect(wrapper.text()).toBe('')
        expect(membersSpy).not.toHaveBeenCalled()
    })
})
```

Run: `pnpm --filter frontend exec vitest run src/modules/projects/views/details/__tests__/ProjectMembersCard.spec.ts`
Expected: FAIL — component missing.

- [ ] **Step 3: Implement the members card and dialog**

`ProjectMembersCard.vue`:

```vue
<template>
    <VCard v-if="canManage" :title="t('module.projects.members.title')">
        <VCardItem>
            <p v-if="members?.length === 0">{{ t('module.projects.members.empty') }}</p>
            <VList v-else>
                <VListItem
                    v-for="member in members"
                    :key="member.userId"
                    :title="`${member.firstName} ${member.lastName}`"
                    :subtitle="member.email"
                >
                    <template #append>
                        <VChip
                            v-for="permission in member.permissions"
                            :key="permission"
                            size="small"
                            class="ms-1"
                            :text="t(`permissions.project.${permission}`)"
                        />
                        <ProjectMemberDialog :project-id="projectId" :member="member" v-slot="{ props: dialogProps }">
                            <VIconBtn icon="mdi-pencil" class="ms-2" v-bind="dialogProps" />
                        </ProjectMemberDialog>
                        <VIconBtn icon="mdi-delete" class="ms-1" @click="onRemove(member.userId)" />
                    </template>
                </VListItem>
            </VList>
        </VCardItem>
        <VCardActions v-if="canPickUsers">
            <VSpacer />
            <ProjectMemberDialog :project-id="projectId" v-slot="{ props: dialogProps }">
                <VBtn color="primary" v-bind="dialogProps" :text="t('module.projects.members.add')" />
            </ProjectMemberDialog>
        </VCardActions>
    </VCard>
</template>

<script setup lang="ts">
    import { computed } from 'vue'
    import { useQuery } from '@tanstack/vue-query'
    import { useI18n } from 'vue-i18n'
    import { useAbility } from '@casl/vue'
    import { subject } from '@casl/ability'
    import { useProjectMembersQuery } from '@/modules/projects/queries/useProjectMembersQuery.ts'
    import { useProjectMemberRemoveMutation } from '@/modules/projects/mutations/useProjectMemberRemoveMutation.ts'
    import ProjectMemberDialog from '@/modules/projects/views/details/partials/ProjectMemberDialog.vue'

    const props = defineProps<{ projectId: number }>()
    const { t } = useI18n()
    const { can } = useAbility()

    const canManage = computed(
        () => can('update', 'User') || can('update', subject('Project', { projectId: props.projectId })),
    )
    const canPickUsers = computed(() => can('read', 'User'))

    const { data: members } = useQuery({
        ...useProjectMembersQuery(() => props.projectId),
        enabled: canManage,
    })
    const { mutate: removeMember } = useProjectMemberRemoveMutation()

    function onRemove(userId: number) {
        removeMember({ projectId: props.projectId, userId })
    }
</script>
```

`ProjectMemberDialog.vue` (add when no `member` prop, edit otherwise):

```vue
<template>
    <VDialog max-width="500" v-model="model" :persistent="isPending" @after-leave="onAfterLeave">
        <template #activator="props">
            <slot v-bind="props" />
        </template>
        <VCard :title="member ? t('module.projects.members.edit') : t('module.projects.members.add')">
            <VCardItem>
                <VAlert v-if="errorMessage" type="error" class="mb-4" :text="errorMessage" />
                <VSelect
                    v-if="!member"
                    :label="t('field.user')"
                    :items="userOptions"
                    item-title="name"
                    item-value="userId"
                    v-model="selectedUserId"
                />
                <VCheckbox
                    v-for="level in PROJECT_LEVELS"
                    :key="level"
                    v-model="selectedPermissions"
                    :value="level"
                    :label="t(`permissions.project.${level}`)"
                    density="compact"
                    hide-details
                />
            </VCardItem>
            <VCardActions>
                <VSpacer />
                <VBtn :text="t('cta.abort')" :disabled="isPending" @click="model = false" />
                <VBtn
                    color="primary"
                    variant="elevated"
                    :text="t('cta.save')"
                    :loading="isPending"
                    :disabled="targetUserId === undefined || selectedPermissions.length === 0"
                    @click="onSave"
                />
            </VCardActions>
        </VCard>
    </VDialog>
</template>

<script setup lang="ts">
    import { computed, ref } from 'vue'
    import { useQuery } from '@tanstack/vue-query'
    import { useI18n } from 'vue-i18n'
    import { useAbility } from '@casl/vue'
    import type { ProjectMemberDto, ProjectPermission } from 'api'
    import { useUsersQuery } from '@/modules/users/queries/useUsersQuery.ts'
    import { useProjectMemberSetMutation } from '@/modules/projects/mutations/useProjectMemberSetMutation.ts'
    import { apiErrorMessage } from '@/helper/apiErrorMessage.ts'

    const PROJECT_LEVELS: ProjectPermission[] = ['read', 'update', 'delete']

    const props = defineProps<{ projectId: number; member?: ProjectMemberDto }>()
    const { t } = useI18n()
    const { can } = useAbility()
    const model = ref<undefined | boolean>()
    const errorMessage = ref<string | null>(null)
    const selectedUserId = ref<number | undefined>()
    const selectedPermissions = ref<ProjectPermission[]>(props.member ? [...props.member.permissions] : ['read'])
    const { mutateAsync, isPending } = useProjectMemberSetMutation()

    const { data: users } = useQuery({
        ...useUsersQuery(),
        enabled: computed(() => !props.member && can('read', 'User')),
    })

    const userOptions = computed(() =>
        (users.value ?? []).map((user) => ({ userId: user.userId, name: `${user.firstName} ${user.lastName}` })),
    )
    const targetUserId = computed(() => props.member?.userId ?? selectedUserId.value)

    async function onSave() {
        if (targetUserId.value === undefined) {
            return
        }
        errorMessage.value = null
        try {
            await mutateAsync({
                projectId: props.projectId,
                userId: targetUserId.value,
                permissions: selectedPermissions.value,
            })
            model.value = false
        } catch (error) {
            errorMessage.value = apiErrorMessage(error, t('module.projects.members.error'))
        }
    }

    function onAfterLeave() {
        errorMessage.value = null
        selectedUserId.value = undefined
        selectedPermissions.value = props.member ? [...props.member.permissions] : ['read']
    }
</script>
```

- [ ] **Step 4: Mount the card and gate the existing project UI**

In `ProjectDetailView.vue`, render `<ProjectMembersCard :project-id="project.projectId" />` alongside the existing cards (same container as `ProjectDomainsCard`), importing it from the partials folder.

Gate the existing controls (each partial receives the project or its id already — reuse that prop):

| Component                     | Gate                                                                                                                                          |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `ProjectGeneralCard.vue`      | rename/save controls only when `can('update', subject('Project', { projectId }))`; keep the card visible read-only otherwise                  |
| `DeleteProjectDialog` trigger | render only when `can('delete', subject('Project', { projectId }))`                                                                           |
| `ProjectDomainsCard.vue`      | assign/unassign controls only when `can('update', subject('Project', { projectId })) && can('read', 'Domain')`; the list itself stays visible |

Use the established pattern in each component's script setup:

```ts
import { useAbility } from '@casl/vue'
import { subject } from '@casl/ability'

const { can } = useAbility()
const canUpdate = computed(() => can('update', subject('Project', { projectId: props.project.projectId })))
```

(adapt the prop path to each component's actual props).

- [ ] **Step 5: i18n**

Add under `module.projects`:

```json
"members": {
    "title": "Members",
    "add": "Add member",
    "edit": "Edit member",
    "empty": "No members yet.",
    "error": "The member could not be saved"
}
```

Add `"user": "User"` to the root `field` block.

- [ ] **Step 6: Verify**

Run: `pnpm --filter frontend exec vitest run src/modules/projects && pnpm --filter frontend typecheck && pnpm --filter frontend lint`
Expected: all green (existing project view specs keep passing thanks to the manage-all default in `mountView`).

---

### Task 18: Full gate and smoke test

**Files:** none (verification only)

- [ ] **Step 1: Run the full monorepo gate**

Run: `pnpm check`
Expected: lint, typecheck, tests, and format all pass across backend, frontend, and api.

- [ ] **Step 2: Run the backend e2e suite once more**

Run: `pnpm --filter backend test:e2e`
Expected: PASS.

- [ ] **Step 3: Manual smoke test**

With `docker compose -f dev/docker-compose.yml up -d`, migrations applied, and `pnpm dev` running:

1. Log in as the onboarded user → all tabs visible (Super Admin).
2. Users tab → create a user with the default role and a password.
3. Open a private window, log in as that user → only Dashboard and Projects tabs; project list empty.
4. As the super admin, open a project → Members card → add the new user with `read`.
5. New user: project appears (within ~60s or after reload); detail is read-only (no rename/delete/domain buttons).
6. Grant `update` → rename works; domain assignment still hidden until `domains.read` is granted on the user detail page.
7. Create a second user with the Admin role → verify they can manage users but editing the super admin account is rejected.

Report results to the repository owner — do not commit anything; git is handled by the owner.

---

## Execution notes

- Tasks 1–12 are backend and strictly ordered (each builds on the previous). Task 13 is the contract regeneration gate. Tasks 14–17 are frontend and depend on 13; 15 → 16 → 17 build on each other (14 first).
- The dev database uses `autoLoadModels` sync in watch mode, which can drift from migrations; if the local Postgres volume predates this feature, reset it and run `pnpm --filter backend migrate up` (see the repo memory note about model-sync drift).
- Where a step says "adapt to the file's existing structure" (existing spec updates), the change is mechanical: add the new argument/fixture, keep the file's established mock style.
