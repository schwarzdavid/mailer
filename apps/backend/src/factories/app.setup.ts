import {
    ClassSerializerInterceptor,
    INestApplication,
    ValidationPipe,
    type ValidationPipeOptions,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { HttpAdapterHost, Reflector } from '@nestjs/core'
import type { ExpressAdapter } from '@nestjs/platform-express'
import type { Env } from '../config/env.schema.js'
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger'
import { SequelizeExceptionFilter } from '../filters/sequelize-exception.filter.js'

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
    app.enableShutdownHooks()
    app.enableCors()
    app.setGlobalPrefix('api')
    app.useGlobalPipes(new ValidationPipe(validationPipeOptions))
    app.useGlobalFilters(new SequelizeExceptionFilter(app.get(HttpAdapterHost).httpAdapter))
    app.useGlobalInterceptors(
        new ClassSerializerInterceptor(app.get(Reflector), {
            exposeDefaultValues: true,
            excludeExtraneousValues: true,
        }),
    )
}

function applyTrustProxy(app: INestApplication): void {
    const trustProxy = app.get<ConfigService<Env, true>>(ConfigService).get('TRUST_PROXY', { infer: true })
    app.get<HttpAdapterHost<ExpressAdapter>>(HttpAdapterHost).httpAdapter.set('trust proxy', trustProxy)
}

export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
    const openApiConfig = new DocumentBuilder()
        .setTitle('schwarzdavid Mailer')
        .setDescription('Simple Mail SaaS')
        .setVersion(process.env.npm_package_version ?? '0.0.0')
        .addBearerAuth()
        .addApiKey({
            type: 'apiKey',
            name: 'key',
            in: 'query',
        })
        .addServer('http://localhost:8000', 'Dev Server')
        .addServer('https://schwarzdavid.email', 'Production Server')
        .setContact('David Schwarz', 'https://schwarzdavid.at', 'hi@schwarzdavid.at')
        .build()

    return SwaggerModule.createDocument(app, openApiConfig, {
        operationIdFactory: (_, methodKey) => methodKey,
    })
}
