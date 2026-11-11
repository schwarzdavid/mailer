import type { MigrationFn } from 'umzug'
import { type QueryInterface } from 'sequelize'

export const up: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
    await queryInterface.sequelize.query(`ALTER TABLE "settings" DROP COLUMN "serverIpv4", DROP COLUMN "serverIpv6"`)
}

export const down: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
    await queryInterface.sequelize.query(
        `ALTER TABLE "settings" ADD COLUMN "serverIpv4" VARCHAR(45), ADD COLUMN "serverIpv6" VARCHAR(45)`,
    )
    await queryInterface.sequelize.query(
        `UPDATE "settings" SET
            "serverIpv4" = (SELECT "value" FROM "domain_dns" WHERE "domainId" = "settings"."sendingDomainId" AND "use" = 'a' LIMIT 1),
            "serverIpv6" = (SELECT "value" FROM "domain_dns" WHERE "domainId" = "settings"."sendingDomainId" AND "use" = 'aaaa' LIMIT 1)`,
    )
    await queryInterface.sequelize.query(`UPDATE "settings" SET "serverIpv4" = '0.0.0.0' WHERE "serverIpv4" IS NULL`)
    await queryInterface.sequelize.query(`ALTER TABLE "settings" ALTER COLUMN "serverIpv4" SET NOT NULL`)
}
