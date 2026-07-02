import type { ProvidedContext } from 'vitest';
import { startInfrastructure } from './infrastructure';
import { runMigrations } from './migrations';

// Minimal shape of the context Vitest passes to a global setup function.
interface GlobalSetupContext {
    provide: <K extends keyof ProvidedContext>(key: K, value: ProvidedContext[K]) => void;
}

/**
 * Runs once for the whole e2e run: boots the shared Postgres + Redis containers,
 * applies migrations, and publishes the connection settings to every test file
 * via `provide`. The returned function tears the containers down afterwards.
 */
export default async function setup({ provide }: GlobalSetupContext): Promise<() => Promise<void>> {
    const infra = await startInfrastructure();
    await runMigrations(infra.env);
    provide('e2eEnv', infra.env);

    return async () => {
        await infra.stop();
    };
}
