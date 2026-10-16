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

        await sequelize.query(
            `INSERT INTO "user_permissions" ("userId", "permission", "createdAt", "updatedAt")
             VALUES (:owner, 'roles.create', NOW(), NOW())`,
            { replacements: { owner } },
        )
        await sequelize.query(
            `UPDATE "project_members" SET "roleId" = (SELECT "roleId" FROM "roles" WHERE "name" = 'Editor')
             WHERE "userId" = :viewer`,
            { replacements: { viewer } },
        )

        await run('down')

        const roleGrants = await sequelize.query<{ count: string }>(
            `SELECT COUNT(*) AS "count" FROM "user_permissions" WHERE "permission" LIKE 'roles.%'`,
            { type: QueryTypes.SELECT },
        )
        expect(Number(roleGrants[0]!.count)).toBe(0)
        const adminRead = await sequelize.query<{ count: string }>(
            `SELECT COUNT(*) AS "count" FROM "role_permissions" rp JOIN "roles" r ON r."roleId" = rp."roleId"
             WHERE r."type" = 'admin' AND rp."permission" = 'roles.read'`,
            { type: QueryTypes.SELECT },
        )
        expect(Number(adminRead[0]!.count)).toBe(1)
        expect(await legacyRows()).toEqual([
            { projectId, userId: owner, permission: 'delete' },
            { projectId, userId: owner, permission: 'read' },
            { projectId, userId: owner, permission: 'update' },
            { projectId, userId: maintainer, permission: 'read' },
            { projectId, userId: maintainer, permission: 'update' },
            { projectId, userId: viewer, permission: 'read' },
            { projectId, userId: viewer, permission: 'update' },
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
