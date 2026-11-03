import 'reflect-metadata'
import { ConfigService } from '@nestjs/config'
import { MODULE_METADATA } from '@nestjs/common/constants'
import type { FactoryProvider, Provider } from '@nestjs/common'
import { createTransport } from 'nodemailer'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { MailModule } from './mail.module.js'
import { MAIL_TRANSPORTER } from './mail.constants.js'
import { envSchema, type Env } from '../../config/env.schema.js'

vi.mock('nodemailer', () => ({ createTransport: vi.fn() }))

const requiredEnv = {
    BACKEND_JWT_SECRET: 'jwt-secret-for-unit-tests-0123456789',
    BACKEND_ENCRYPTION_SECRET: 'encryption-secret-for-unit-tests-0123',
    MAIL_HOSTNAME: 'mail.example.com',
    SMTP_HOST: 'smtp.example.com',
    SMTP_PORT: '587',
    DB_USERNAME: 'mailer',
    DB_PASSWORD: 'secret',
    DB_DATABASE: 'mailer',
}

function configFor(env: Record<string, string>): ConfigService<Env, true> {
    return new ConfigService<Env, true>(envSchema.parse({ ...requiredEnv, ...env }))
}

function transporterFactory(): (configService: ConfigService<Env, true>) => unknown {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, MailModule) as Provider[]
    const provider = providers.find(
        (candidate): candidate is FactoryProvider =>
            typeof candidate === 'object' && 'provide' in candidate && candidate.provide === MAIL_TRANSPORTER,
    )
    if (!provider) {
        throw new Error('MailModule does not provide MAIL_TRANSPORTER')
    }
    return provider.useFactory as (configService: ConfigService<Env, true>) => unknown
}

const pooledOptions = {
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 120_000,
    dnsTimeout: 10_000,
}

describe('MailModule transporter', () => {
    const createTransportMock = vi.mocked(createTransport) as unknown as Mock<(options: object) => object>

    beforeEach(() => {
        createTransportMock.mockReset()
        createTransportMock.mockReturnValue({})
    })

    it('connects to the configured SMTP server with credentials', () => {
        transporterFactory()(
            configFor({ SMTP_PORT: '465', SMTP_SECURE: 'true', SMTP_USER: 'mailer', SMTP_PASSWORD: 'secret' }),
        )

        expect(createTransportMock).toHaveBeenCalledWith({
            ...pooledOptions,
            host: 'smtp.example.com',
            port: 465,
            secure: true,
            requireTLS: true,
            auth: { user: 'mailer', pass: 'secret' },
        })
    })

    it('connects without authentication when no SMTP user is configured', () => {
        transporterFactory()(configFor({}))

        expect(createTransportMock).toHaveBeenCalledWith({
            ...pooledOptions,
            host: 'smtp.example.com',
            port: 587,
            secure: false,
            requireTLS: true,
            auth: undefined,
        })
    })

    it('can disable requireTLS for relays without STARTTLS', () => {
        transporterFactory()(configFor({ SMTP_REQUIRE_TLS: 'false' }))

        expect(createTransportMock).toHaveBeenCalledWith(expect.objectContaining({ requireTLS: false }))
    })

    it('treats SMTP_SECURE=false as a plain connection rather than a truthy string', () => {
        transporterFactory()(configFor({ SMTP_SECURE: 'false' }))

        expect(createTransportMock).toHaveBeenCalledWith(expect.objectContaining({ secure: false }))
    })

    it('verifies the server certificate against SMTP_TLS_SERVERNAME when it differs from the host', () => {
        transporterFactory()(configFor({ SMTP_HOST: 'mail', SMTP_TLS_SERVERNAME: 'mx.example.com' }))

        expect(createTransportMock).toHaveBeenCalledWith(
            expect.objectContaining({ host: 'mail', tls: { servername: 'mx.example.com' } }),
        )
    })

    it('leaves the TLS options untouched when SMTP_TLS_SERVERNAME is unset or empty', () => {
        transporterFactory()(configFor({}))
        transporterFactory()(configFor({ SMTP_TLS_SERVERNAME: '' }))

        expect(createTransportMock.mock.calls[0]?.[0]).not.toHaveProperty('tls')
        expect(createTransportMock.mock.calls[1]?.[0]).not.toHaveProperty('tls')
    })
})
