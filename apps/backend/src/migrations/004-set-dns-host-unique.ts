import { MigrationFn } from 'umzug'
import { QueryInterface } from 'sequelize'

export const up: MigrationFn<QueryInterface> = async ({ context }) => {
    await context.addIndex('domain_dns', ['host'], { unique: true })
}

export const down: MigrationFn<QueryInterface> = async ({ context }) => {
    await context.removeIndex('domain_dns', ['host'])
}
