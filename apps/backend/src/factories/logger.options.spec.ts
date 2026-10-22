import type { ServerResponse } from 'node:http'
import { ConfigService } from '@nestjs/config'
import { describe, expect, it, vi } from 'vitest'
import {
    createLoggerOptions,
    genReqId,
    isUnloggedRequest,
    serializeRequest,
    serializeResponse,
    type LoggedRequest,
    type RequestIdResponse,
} from './logger.options.js'
import { envSchema, type Env } from '../config/env.schema.js'

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

function requestLike(overrides: Partial<LoggedRequest>): LoggedRequest {
    return {
        id: 'request-id',
        method: 'GET',
        url: '/',
        remoteAddress: '203.0.113.7',
        ...overrides,
    }
}

function responseLike(overrides: Partial<RequestIdResponse>): RequestIdResponse {
    return {
        setHeader: vi.fn<ServerResponse['setHeader']>(),
        ...overrides,
    }
}

describe('logger options', () => {
    it('logs json at LOG_LEVEL in production', () => {
        const { pinoHttp } = createLoggerOptions(configFor({ NODE_ENV: 'production', LOG_LEVEL: 'warn' }))

        expect(pinoHttp).toMatchObject({ level: 'warn' })
        expect(pinoHttp).not.toHaveProperty('transport')
    })

    it('logs at info by default', () => {
        expect(createLoggerOptions(configFor({})).pinoHttp).toMatchObject({ level: 'info' })
    })

    it('pretty-prints single lines outside production', () => {
        expect(createLoggerOptions(configFor({})).pinoHttp).toMatchObject({
            transport: { target: 'pino-pretty', options: { singleLine: true } },
        })
    })

    it('strips the query string from the logged url', () => {
        expect(serializeRequest(requestLike({ method: 'GET', url: '/api/v1/send?key=sdm_secret', id: 'r1' }))).toEqual({
            id: 'r1',
            method: 'GET',
            url: '/api/v1/send',
            remoteAddress: '203.0.113.7',
        })
    })

    it('logs the client address express resolves through trust proxy', () => {
        expect(
            serializeRequest(requestLike({ remoteAddress: '172.18.0.5', raw: { ip: '198.51.100.4' } })).remoteAddress,
        ).toBe('198.51.100.4')
    })

    it('falls back to the socket address when express resolved no client address', () => {
        expect(serializeRequest(requestLike({ remoteAddress: '172.18.0.5', raw: {} })).remoteAddress).toBe('172.18.0.5')
    })

    it('never serializes headers or the body', () => {
        expect(Object.keys(serializeRequest(requestLike({ url: '/api/x', raw: { ip: '198.51.100.4' } })))).toEqual([
            'id',
            'method',
            'url',
            'remoteAddress',
        ])
    })

    it('logs only the status code of the response', () => {
        expect(serializeResponse({ statusCode: 204, headers: { 'set-cookie': 'session=secret' } })).toEqual({
            statusCode: 204,
        })
    })

    it('redacts authorization and cookie headers', () => {
        expect(createLoggerOptions(configFor({})).pinoHttp).toMatchObject({
            redact: ['req.headers.authorization', 'req.headers.cookie'],
        })
    })

    it('does not auto-log health probes', () => {
        expect(isUnloggedRequest(requestLike({ url: '/api/health' }))).toBe(true)
        expect(isUnloggedRequest(requestLike({ url: '/api/health/ready' }))).toBe(true)
        expect(isUnloggedRequest(requestLike({ url: '/api/health/ready?probe=1' }))).toBe(true)
        expect(isUnloggedRequest(requestLike({ url: '/api/healthz' }))).toBe(false)
        expect(isUnloggedRequest(requestLike({ url: '/api/setup/status' }))).toBe(false)
    })

    it('generates a uuid request id and exposes it on the response', () => {
        const setHeader = vi.fn<ServerResponse['setHeader']>()
        const id = genReqId(requestLike({}), responseLike({ setHeader }))

        expect(id).toMatch(/^[0-9a-f-]{36}$/)
        expect(setHeader).toHaveBeenCalledWith('X-Request-Id', id)
    })

    it('binds the request id to every log line of a request as reqId', () => {
        expect(createLoggerOptions(configFor({})).pinoHttp).toMatchObject({
            quietReqLogger: true,
            customAttributeKeys: { reqId: 'reqId' },
        })
    })

    it('generates a fresh id per request', () => {
        expect(genReqId(requestLike({}), responseLike({}))).not.toBe(genReqId(requestLike({}), responseLike({})))
    })
})
