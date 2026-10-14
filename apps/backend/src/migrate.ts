import 'reflect-metadata'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import { getConnectionToken, SequelizeModule } from '@nestjs/sequelize'
import { Sequelize } from 'sequelize-typescript'
import { SequelizeStorage, Umzug } from 'umzug'
import type { QueryInterface } from 'sequelize'
import { createSequelizeOptions, envFilePath } from './factories/database.config.js'

// Migrations must not boot AppModule: its cache module needs Redis, which
// isn't available while running migrations against a fresh database.
@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath,
        }),
        SequelizeModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: createSequelizeOptions,
        }),
    ],
})
class MigrationModule {}

const MIGRATION_TEMPLATE = `import type {MigrationParams} from 'umzug';
import type {QueryInterface} from 'sequelize';

export const up = async ({context: queryInterface}: MigrationParams<QueryInterface>) => {
};

export const down = async ({context: queryInterface}: MigrationParams<QueryInterface>) => {
};
`

function buildUmzug(sequelize: Sequelize): Umzug<QueryInterface> {
    return new Umzug({
        migrations: {
            glob: ['migrations/*.ts', { cwd: import.meta.dirname }],
            // umzug's default loader rejects .ts files outright; import them ourselves so
            // the tsx loader running this script transpiles them.
            resolve({ name, path, context }) {
                const loadMigration = () =>
                    import(pathToFileURL(path!).href) as Promise<{
                        up: (params: { context: QueryInterface }) => Promise<unknown>
                        down: (params: { context: QueryInterface }) => Promise<unknown>
                    }>
                return {
                    name,
                    up: async () => (await loadMigration()).up({ context }),
                    down: async () => (await loadMigration()).down({ context }),
                }
            },
        },
        context: sequelize.getQueryInterface(),
        storage: new SequelizeStorage({ sequelize }),
        logger: console,
        create: {
            folder: join(import.meta.dirname, 'migrations'),
            template: (filepath) => [[filepath, MIGRATION_TEMPLATE]],
        },
    })
}

async function main(): Promise<void> {
    const app = await NestFactory.createApplicationContext(MigrationModule, {
        logger: ['error', 'warn'],
    })

    try {
        const sequelize = app.get<Sequelize>(getConnectionToken())
        await buildUmzug(sequelize).up()
    } finally {
        await app.close()
    }
}

void main()
