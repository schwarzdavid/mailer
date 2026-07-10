import 'reflect-metadata'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import { getConnectionToken, SequelizeModule } from '@nestjs/sequelize'
import { Sequelize } from 'sequelize-typescript'
import { SequelizeStorage, Umzug } from 'umzug'
import type { QueryInterface } from 'sequelize'
import { createSequelizeOptions, envFilePath } from './factories/database.config'

// Migrations must not boot AppModule: its BootstrapService queries tables that
// don't exist yet on a fresh database, and the cache module needs Redis.
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

const requireMigration = createRequire(__filename)

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
            glob: ['migrations/*.ts', { cwd: __dirname }],
            // Resolve via require so ts-node transpiles the .ts migration files;
            // umzug's default loader uses dynamic import() which bypasses the ts-node hook.
            resolve({ name, path, context }) {
                const migration = requireMigration(path!) as {
                    up: (params: { context: QueryInterface }) => Promise<unknown>
                    down: (params: { context: QueryInterface }) => Promise<unknown>
                }
                return {
                    name,
                    up: async () => migration.up({ context }),
                    down: async () => migration.down({ context }),
                }
            },
        },
        context: sequelize.getQueryInterface(),
        storage: new SequelizeStorage({ sequelize }),
        logger: console,
        create: {
            folder: join(__dirname, 'migrations'),
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
