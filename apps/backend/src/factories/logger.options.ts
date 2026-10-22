import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Request } from 'express'
import { ConfigService } from '@nestjs/config'
import type { Params } from 'nestjs-pino'
import type { ReqId } from 'pino-http'
import type { Env } from '../config/env.schema.js'
import { API_PREFIX } from './app.setup.js'

export interface LoggedRequest {
    id?: ReqId
    method?: string
    url?: string
    remoteAddress?: string
    raw?: Partial<Pick<Request, 'ip'>>
}

export type SerializedRequest = Omit<LoggedRequest, 'raw'>

export type RequestIdResponse = Pick<ServerResponse, 'setHeader'>

export interface LoggedResponse {
    statusCode?: number
    headers?: Record<string, unknown>
}

const unloggedPaths = new Set([`/${API_PREFIX}/health`, `/${API_PREFIX}/health/ready`])

function pathOf(url: string | undefined): string | undefined {
    return url?.split('?')[0]
}

export function genReqId(_req: unknown, res: RequestIdResponse): string {
    const id = randomUUID()
    res.setHeader('X-Request-Id', id)
    return id
}

export function serializeRequest(req: LoggedRequest): SerializedRequest {
    return { id: req.id, method: req.method, url: pathOf(req.url), remoteAddress: req.raw?.ip ?? req.remoteAddress }
}

export function serializeResponse(res: LoggedResponse): Pick<LoggedResponse, 'statusCode'> {
    return { statusCode: res.statusCode }
}

export function isUnloggedRequest(req: Pick<IncomingMessage, 'url'>): boolean {
    return unloggedPaths.has(pathOf(req.url) ?? '')
}

export function createLoggerOptions(configService: ConfigService<Env, true>): Params {
    const isProduction = configService.get('NODE_ENV', { infer: true }) === 'production'

    return {
        pinoHttp: {
            level: configService.get('LOG_LEVEL', { infer: true }),
            ...(isProduction ? {} : { transport: { target: 'pino-pretty', options: { singleLine: true } } }),
            genReqId,
            quietReqLogger: true,
            customAttributeKeys: { reqId: 'reqId' },
            autoLogging: { ignore: isUnloggedRequest },
            serializers: { req: serializeRequest, res: serializeResponse },
            redact: ['req.headers.authorization', 'req.headers.cookie'],
        },
    }
}
