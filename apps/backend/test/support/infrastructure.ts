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
    BACKEND_JWT_SECRET: string
    BACKEND_DKIM_SECRET: string
    SMTP_HOST: string
    SMTP_PORT: string
    SMTP_SECURE: string
    MAILHOG_URL: string
    IMAP_HOST: string
    IMAP_PORT: string
    IMAP_SECURE: string
    IMAP_USER: string
    IMAP_PASSWORD: string
    GREENMAIL_SMTP_HOST: string
    GREENMAIL_SMTP_PORT: string
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

    const mailhog = await new GenericContainer('mailhog/mailhog')
        .withExposedPorts(1025, 8025)
        .withWaitStrategy(Wait.forListeningPorts())
        .start()

    const greenmail = await new GenericContainer('greenmail/standalone:2.1.0')
        .withEnvironment({
            GREENMAIL_OPTS: [
                '-Dgreenmail.setup.test.smtp',
                '-Dgreenmail.setup.test.imap',
                '-Dgreenmail.auth.disabled',
                '-Dgreenmail.hostname=0.0.0.0',
            ].join(' '),
        })
        .withExposedPorts(3025, 3143)
        .withWaitStrategy(Wait.forListeningPorts())
        .start()

    const env: E2eEnv = {
        DB_HOST: postgres.getHost(),
        DB_PORT: String(postgres.getPort()),
        DB_USERNAME: postgres.getUsername(),
        DB_PASSWORD: postgres.getPassword(),
        DB_DATABASE: postgres.getDatabase(),
        REDIS_HOST: redis.getHost(),
        REDIS_PORT: String(redis.getMappedPort(6379)),
        BACKEND_JWT_SECRET: 'e2e-jwt-secret',
        BACKEND_DKIM_SECRET: 'e2e-dkim-secret',
        SMTP_HOST: mailhog.getHost(),
        SMTP_PORT: String(mailhog.getMappedPort(1025)),
        SMTP_SECURE: 'false',
        MAILHOG_URL: `http://${mailhog.getHost()}:${mailhog.getMappedPort(8025)}`,
        IMAP_HOST: greenmail.getHost(),
        IMAP_PORT: String(greenmail.getMappedPort(3143)),
        IMAP_SECURE: 'false',
        IMAP_USER: 'bounce@e2e-bounces.test',
        IMAP_PASSWORD: 'e2e-imap-password',
        GREENMAIL_SMTP_HOST: greenmail.getHost(),
        GREENMAIL_SMTP_PORT: String(greenmail.getMappedPort(3025)),
    }

    return {
        env,
        async stop() {
            await greenmail.stop()
            await mailhog.stop()
            await redis.stop()
            await postgres.stop()
        },
    }
}
