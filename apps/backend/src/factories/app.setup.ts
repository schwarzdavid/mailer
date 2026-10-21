import {
    ClassSerializerInterceptor,
    INestApplication,
    ValidationPipe,
    type ValidationPipeOptions,
} from '@nestjs/common'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ConfigService } from '@nestjs/config'
import { HttpAdapterHost, Reflector } from '@nestjs/core'
import type { ExpressAdapter } from '@nestjs/platform-express'
import express, { type NextFunction, type Request, type Response } from 'express'
import type { Env } from '../config/env.schema.js'
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger'
import { SequelizeExceptionFilter } from '../filters/sequelize-exception.filter.js'
import { MAX_BODY_LENGTH } from '../modules/api-key/dtos/public-send.dto.js'

export const API_PREFIX = 'api'

const PUBLIC_SEND_PATH = `/${API_PREFIX}/v1/send`
const PUBLIC_SEND_BODY_FIELDS = 2
const MAX_UTF8_BYTES_PER_CHAR = 4
const JSON_ENVELOPE_BYTES = 64 * 1024
const PUBLIC_SEND_JSON_LIMIT_BYTES =
    PUBLIC_SEND_BODY_FIELDS * MAX_BODY_LENGTH * MAX_UTF8_BYTES_PER_CHAR + JSON_ENVELOPE_BYTES

export const validationPipeOptions: ValidationPipeOptions = {
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    transformOptions: {
        exposeDefaultValues: true,
    },
}

export function configureApp(app: INestApplication): void {
    applyTrustProxy(app)
    applyPublicSendJsonLimit(app)
    app.enableShutdownHooks()
    app.enableCors()
    app.setGlobalPrefix(API_PREFIX)
    app.useGlobalPipes(new ValidationPipe(validationPipeOptions))
    app.useGlobalFilters(new SequelizeExceptionFilter(app.get(HttpAdapterHost).httpAdapter))
    app.useGlobalInterceptors(
        new ClassSerializerInterceptor(app.get(Reflector), {
            exposeDefaultValues: true,
            excludeExtraneousValues: true,
        }),
    )
}

function applyPublicSendJsonLimit(app: INestApplication): void {
    const parseJson = express.json({ limit: PUBLIC_SEND_JSON_LIMIT_BYTES })

    app.use(PUBLIC_SEND_PATH, function publicSendJsonParser(request: Request, response: Response, next: NextFunction) {
        parseJson(request, response, next)
    })
}

function applyTrustProxy(app: INestApplication): void {
    const trustProxy = app.get<ConfigService<Env, true>>(ConfigService).get('TRUST_PROXY', { infer: true })
    app.get<HttpAdapterHost<ExpressAdapter>>(HttpAdapterHost).httpAdapter.set('trust proxy', trustProxy)
}

function readPackageVersion(): string {
    const packageJson = JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'package.json'), 'utf8')) as {
        version: string
    }
    return packageJson.version
}

export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
    const openApiConfig = new DocumentBuilder()
        .setTitle('schwarzdavid Mailer')
        .setDescription('Simple Mail SaaS')
        .setVersion(readPackageVersion())
        .addBearerAuth()
        .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'sdm_…' }, 'api-key')
        .addApiKey({ type: 'apiKey', name: 'key', in: 'query' }, 'api-key-query')
        .addServer('http://localhost:8000', 'Dev Server')
        .addServer('https://schwarzdavid.email', 'Production Server')
        .setContact('David Schwarz', 'https://schwarzdavid.at', 'hi@schwarzdavid.at')
        .build()

    return SwaggerModule.createDocument(app, openApiConfig, {
        operationIdFactory: (_, methodKey) => methodKey,
    })
}
