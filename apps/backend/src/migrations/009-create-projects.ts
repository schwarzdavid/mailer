import type { MigrationFn } from 'umzug'
import { DataTypes, type QueryInterface } from 'sequelize'

export const up: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
    await queryInterface.createTable('projects', {
        projectId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true,
        },
        name: {
            type: DataTypes.STRING(255),
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
        deletedAt: {
            type: DataTypes.DATE,
            allowNull: true,
        },
    })

    await queryInterface.addIndex('projects', ['name'], {
        name: 'projects_name_unique',
        unique: true,
    })

    await queryInterface.createTable('project_domains', {
        projectDomainId: {
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
        domainId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'domains',
                key: 'domainId',
            },
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE',
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

    await queryInterface.addIndex('project_domains', ['projectId', 'domainId'], {
        name: 'project_domains_unique',
        unique: true,
    })

    await queryInterface.addColumn('inbound_form', 'projectId', {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
            model: 'projects',
            key: 'projectId',
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
    })

    const [countRows] = (await queryInterface.sequelize.query(
        'SELECT COUNT(*)::int AS "count" FROM "inbound_form"',
    )) as [{ count: number }[], unknown]

    if (countRows[0]!.count > 0) {
        const [projectRows] = (await queryInterface.sequelize.query(
            `INSERT INTO "projects" ("name", "createdAt", "updatedAt") VALUES ('Default', NOW(), NOW()) RETURNING "projectId"`,
        )) as [{ projectId: number }[], unknown]
        const defaultProjectId = projectRows[0]!.projectId

        await queryInterface.sequelize.query('UPDATE "inbound_form" SET "projectId" = :projectId', {
            replacements: { projectId: defaultProjectId },
        })

        await queryInterface.sequelize.query(
            `INSERT INTO "project_domains" ("projectId", "domainId", "createdAt", "updatedAt")
             SELECT DISTINCT :projectId, "domainId", NOW(), NOW() FROM "inbound_form" WHERE "domainId" IS NOT NULL`,
            { replacements: { projectId: defaultProjectId } },
        )
    }

    await queryInterface.sequelize.query('ALTER TABLE "inbound_form" ALTER COLUMN "projectId" SET NOT NULL')
}

export const down: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
    await queryInterface.removeColumn('inbound_form', 'projectId')
    await queryInterface.dropTable('project_domains')
    await queryInterface.dropTable('projects')
}
