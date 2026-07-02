import { PostgreSqlContainer } from '@testcontainers/postgresql'
import { GenericContainer, Wait } from 'testcontainers'

export interface E2eEnv {
    DB_HOST: string
    DB_PORT: string
    DB_USERNAME: string
    DB_PASSWORD: string
    DB_DATABASE: string
    REDIS_HOST: string
    REDIS_PORT: string
    REDIS_PASSWORD: string
    BACKEND_JWT_SECRET: string
    BACKEND_DKIM_SECRET: string
}

export interface Infrastructure {
    env: E2eEnv
    stop: () => Promise<void>
}

// Exposes the container connection settings to test files via inject('e2eEnv').
declare module 'vitest' {
    interface ProvidedContext {
        e2eEnv: E2eEnv
    }
}

/**
 * Starts throwaway Postgres + Redis containers and returns their connection
 * settings. Started once per run from the Vitest global setup.
 */
export async function startInfrastructure(): Promise<Infrastructure> {
    const postgres = await new PostgreSqlContainer('postgres:16-alpine')
        .withDatabase('mailservice')
        .withUsername('mailservice')
        .withPassword('mailservice')
        .start()

    const redis = await new GenericContainer('redis:7-alpine')
        .withExposedPorts(6379)
        .withWaitStrategy(Wait.forLogMessage('Ready to accept connections'))
        .start()

    const env: E2eEnv = {
        DB_HOST: postgres.getHost(),
        DB_PORT: String(postgres.getPort()),
        DB_USERNAME: postgres.getUsername(),
        DB_PASSWORD: postgres.getPassword(),
        DB_DATABASE: postgres.getDatabase(),
        REDIS_HOST: redis.getHost(),
        REDIS_PORT: String(redis.getMappedPort(6379)),
        REDIS_PASSWORD: '',
        BACKEND_JWT_SECRET: 'e2e-jwt-secret',
        BACKEND_DKIM_SECRET: 'e2e-dkim-secret',
    }

    return {
        env,
        async stop() {
            await redis.stop()
            await postgres.stop()
        },
    }
}
