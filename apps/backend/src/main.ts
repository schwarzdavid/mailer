import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module.js'
import { Logger } from '@nestjs/common'
import { SwaggerModule } from '@nestjs/swagger'
import { ConfigService } from '@nestjs/config'
import { appOptions } from './factories/app.options.js'
import { configureApp, createOpenApiDocument } from './factories/app.setup.js'
import type { Env } from './config/env.schema.js'

async function bootstrap() {
    const app = await NestFactory.create(AppModule, appOptions)

    configureApp(app)

    SwaggerModule.setup('docs', app, createOpenApiDocument(app))
    await app.listen(app.get<ConfigService<Env, true>>(ConfigService).get('PORT', { infer: true }))
    new Logger('Bootstrap').log(`Application is running on: ${await app.getUrl()}`)
}

void bootstrap()
