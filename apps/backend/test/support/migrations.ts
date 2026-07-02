import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Sequelize, type QueryInterface } from 'sequelize';
import type { E2eEnv } from './infrastructure';

interface Migration {
    up: (params: { name: string; context: QueryInterface }) => Promise<unknown>;
}

// The source migrations directory. Vitest runs with the backend as its cwd, so
// this discovers every migration (current and future) without a hand-kept list.
const migrationsDir = join(process.cwd(), 'src', 'migrations');

/**
 * Applies every migration in order against the freshly started Postgres, using a
 * short-lived connection, before any app boots. The umzug CLI loads migrations
 * through ts-node/require which Vitest can't do, so their `up()` functions are
 * imported and invoked directly here — the same schema, discovered dynamically.
 */
export async function runMigrations(env: E2eEnv): Promise<void> {
    const sequelize = new Sequelize({
        dialect: 'postgres',
        host: env.DB_HOST,
        port: Number(env.DB_PORT),
        username: env.DB_USERNAME,
        password: env.DB_PASSWORD,
        database: env.DB_DATABASE,
        logging: false,
    });

    try {
        const queryInterface = sequelize.getQueryInterface();
        // Zero-padded numeric prefixes make lexical order the execution order.
        const files = (await readdir(migrationsDir)).filter((file) => file.endsWith('.ts')).sort();

        for (const file of files) {
            const migration = (await import(pathToFileURL(join(migrationsDir, file)).href)) as Migration;
            await migration.up({ name: file, context: queryInterface });
        }
    } finally {
        await sequelize.close();
    }
}
