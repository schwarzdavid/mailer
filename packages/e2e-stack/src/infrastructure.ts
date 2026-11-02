import { PostgreSqlContainer } from '@testcontainers/postgresql'
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers'

export interface BackendEnv {
    DB_HOST: string
    DB_PORT: string
    DB_USERNAME: string
    DB_PASSWORD: string
    DB_DATABASE: string
    REDIS_HOST: string
    REDIS_PORT: string
    BACKEND_JWT_SECRET: string
    BACKEND_ENCRYPTION_SECRET: string
    MAIL_HOSTNAME: string
    SMTP_HOST: string
    SMTP_PORT: string
    SMTP_SECURE: string
    SMTP_REQUIRE_TLS: string
    SEND_REQUIRE_VALID_DNS: string
    SMTP_USER: string
    SMTP_PASSWORD: string
    IMAP_HOST: string
    IMAP_PORT: string
    IMAP_SECURE: string
    IMAP_USER: string
    IMAP_PASSWORD: string
}

export interface Infrastructure {
    backendEnv: BackendEnv
    mailhogUrl: string
    greenmailSmtpPort: number
    stop: () => Promise<void>
}

export interface InfrastructureOptions {
    mailHostname: string
    imapUser: string
    imapPassword: string
}

export async function startInfrastructure(options: InfrastructureOptions): Promise<Infrastructure> {
    const [postgres, redis, mailhog, greenmail] = await Promise.all([
        new PostgreSqlContainer('postgres:17-alpine')
            .withDatabase('mailservice')
            .withUsername('mailservice')
            .withPassword('mailservice')
            .start(),
        new GenericContainer('redis:8-alpine')
            .withExposedPorts(6379)
            .withWaitStrategy(Wait.forLogMessage('Ready to accept connections'))
            .start(),
        new GenericContainer('mailhog/mailhog:v1.0.1')
            .withExposedPorts(1025, 8025)
            .withWaitStrategy(Wait.forListeningPorts())
            .start(),
        new GenericContainer('greenmail/standalone:2.1.0')
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
            .start(),
    ])

    const containers: StartedTestContainer[] = [greenmail, mailhog, redis, postgres]

    return {
        backendEnv: {
            DB_HOST: postgres.getHost(),
            DB_PORT: String(postgres.getPort()),
            DB_USERNAME: postgres.getUsername(),
            DB_PASSWORD: postgres.getPassword(),
            DB_DATABASE: postgres.getDatabase(),
            REDIS_HOST: redis.getHost(),
            REDIS_PORT: String(redis.getMappedPort(6379)),
            BACKEND_JWT_SECRET: 'playwright-jwt-secret-0123456789ab',
            BACKEND_ENCRYPTION_SECRET: 'playwright-encryption-secret-012345',
            MAIL_HOSTNAME: options.mailHostname,
            SMTP_HOST: mailhog.getHost(),
            SMTP_PORT: String(mailhog.getMappedPort(1025)),
            SMTP_SECURE: 'false',
            SMTP_REQUIRE_TLS: 'false',
            SEND_REQUIRE_VALID_DNS: 'false',
            SMTP_USER: '',
            SMTP_PASSWORD: '',
            IMAP_HOST: greenmail.getHost(),
            IMAP_PORT: String(greenmail.getMappedPort(3143)),
            IMAP_SECURE: 'false',
            IMAP_USER: options.imapUser,
            IMAP_PASSWORD: options.imapPassword,
        },
        mailhogUrl: `http://${mailhog.getHost()}:${mailhog.getMappedPort(8025)}`,
        greenmailSmtpPort: greenmail.getMappedPort(3025),
        async stop() {
            await Promise.all(containers.map((container) => container.stop()))
        },
    }
}
