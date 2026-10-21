import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Sequelize, type QueryInterface } from 'sequelize'
import { createUmzug } from '../../src/factories/umzug.factory.js'
import type { E2eEnv } from './infrastructure.js'

type MigrationStep = (params: { name: string; context: QueryInterface }) => Promise<unknown>

export interface Migration {
    name: string
    up: MigrationStep
    down: MigrationStep
}

// The source migrations directory. Vitest runs with the backend as its cwd, so
// this discovers every migration (current and future) without a hand-kept list.
const migrationsDir = join(process.cwd(), 'src', 'migrations')

// Zero-padded numeric prefixes make lexical order the execution order.
export async function listMigrationFiles(): Promise<string[]> {
    return (await readdir(migrationsDir)).filter((file) => file.endsWith('.ts')).sort()
}

// Imported directly rather than through umzug because the per-migration e2e specs
// need an individual up/down handle for each migration.
export async function loadMigrations(): Promise<Migration[]> {
    const files = await listMigrationFiles()

    return Promise.all(
        files.map(async (file) => {
            const module = (await import(pathToFileURL(join(migrationsDir, file)).href)) as Omit<Migration, 'name'>
            return { name: file, up: module.up, down: module.down }
        }),
    )
}

export function createConnection(env: E2eEnv, database = env.DB_DATABASE): Sequelize {
    return new Sequelize({
        dialect: 'postgres',
        host: env.DB_HOST,
        port: Number(env.DB_PORT),
        username: env.DB_USERNAME,
        password: env.DB_PASSWORD,
        database,
        logging: false,
    })
}

/**
 * Applies every migration in order against the freshly started Postgres, using a
 * short-lived connection, before any app boots.
 */
export async function runMigrations(env: E2eEnv): Promise<void> {
    const sequelize = createConnection(env)

    try {
        await createUmzug(sequelize).up()
    } finally {
        await sequelize.close()
    }
}
