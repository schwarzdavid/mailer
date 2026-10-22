import { Logger, Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { SequelizeModule } from '@nestjs/sequelize'
import { createSequelizeOptions, envFilePath } from './factories/database.config.js'
import { AuthModule } from './modules/auth/auth.module.js'
import { UserModule } from './modules/user/user.module.js'
import { CacheModule } from '@nestjs/cache-manager'
import { createKeyv } from '@keyv/redis'
import { JwtModule } from '@nestjs/jwt'
import { ThrottlerModule } from '@nestjs/throttler'
import { ScheduleModule } from '@nestjs/schedule'
import { DomainModule } from './modules/domain/domain.module.js'
import { ProjectModule } from './modules/project/project.module.js'
import { InboundFormModule } from './modules/inbound-form/inbound-form.module.js'
import { MailModule } from './modules/mail/mail.module.js'
import { BounceModule } from './modules/bounce/bounce.module.js'
import { SettingsModule } from './modules/settings/settings.module.js'
import { SetupModule } from './modules/setup/setup.module.js'
import { PermissionModule } from './modules/permission/permission.module.js'
import { ApiKeyModule } from './modules/api-key/api-key.module.js'
import { isApiKeyRoute, publicApiThrottleTracker } from './modules/api-key/helpers/extract-api-key.js'
import {
    PUBLIC_API_IP_LIMIT_FACTOR,
    PUBLIC_API_IP_THROTTLER,
    PUBLIC_API_THROTTLER,
} from './modules/api-key/api-key.constants.js'
import {
    FORM_SUBMIT_THROTTLER,
    FORM_TOKEN_THROTTLER,
    formThrottleKind,
    formThrottleTracker,
} from './modules/inbound-form/helpers/form-throttle.js'
import { Env, envSchema } from './config/env.schema.js'
import { createRedisClientOptions } from './factories/redis.options.js'
import { createStaticFrontendOptions } from './factories/static-frontend.js'
import { ServeStaticModule } from '@nestjs/serve-static'
import { ThrottlerStorageModule } from './modules/throttler-storage/throttler-storage.module.js'
import { FailOpenThrottlerStorage } from './modules/throttler-storage/services/fail-open-throttler-storage.service.js'

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath,
            validationSchema: envSchema,
        }),
        SequelizeModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: createSequelizeOptions,
        }),
        CacheModule.registerAsync({
            isGlobal: true,
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory(configService: ConfigService<Env, true>) {
                const logger = new Logger('CacheModule')
                const keyv = createKeyv(createRedisClientOptions(configService), { namespace: 'cache' })
                keyv.on('error', (error: Error) => logger.error(`Redis cache error: ${error.message}`))

                return {
                    stores: [keyv],
                    ttl: 1000 * 60,
                }
            },
        }),
        JwtModule.registerAsync({
            global: true,
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory(configService: ConfigService<Env, true>) {
                return {
                    secret: configService.get('BACKEND_JWT_SECRET', { infer: true }),
                    signOptions: {
                        expiresIn: '31d',
                    },
                }
            },
        }),
        ThrottlerModule.forRootAsync({
            imports: [ThrottlerStorageModule],
            inject: [FailOpenThrottlerStorage, ConfigService],
            useFactory(storage: FailOpenThrottlerStorage, configService: ConfigService<Env, true>) {
                return {
                    throttlers: [
                        {
                            ttl: 60_000,
                            limit: 10,
                            skipIf: isApiKeyRoute,
                        },
                        {
                            name: PUBLIC_API_THROTTLER,
                            ttl: configService.get('PUBLIC_API_RATE_TTL', { infer: true }),
                            limit: configService.get('PUBLIC_API_RATE_LIMIT', { infer: true }),
                            getTracker: publicApiThrottleTracker,
                            skipIf: (context) => !isApiKeyRoute(context),
                        },
                        {
                            name: PUBLIC_API_IP_THROTTLER,
                            ttl: configService.get('PUBLIC_API_RATE_TTL', { infer: true }),
                            limit:
                                configService.get('PUBLIC_API_RATE_LIMIT', { infer: true }) *
                                PUBLIC_API_IP_LIMIT_FACTOR,
                            skipIf: (context) => !isApiKeyRoute(context),
                        },
                        {
                            name: FORM_SUBMIT_THROTTLER,
                            ttl: configService.get('FORM_SUBMIT_RATE_TTL', { infer: true }),
                            limit: configService.get('FORM_SUBMIT_RATE_LIMIT', { infer: true }),
                            getTracker: formThrottleTracker,
                            skipIf: (context) => formThrottleKind(context) !== 'submit',
                        },
                        {
                            name: FORM_TOKEN_THROTTLER,
                            ttl: configService.get('FORM_TOKEN_RATE_TTL', { infer: true }),
                            limit: configService.get('FORM_TOKEN_RATE_LIMIT', { infer: true }),
                            getTracker: formThrottleTracker,
                            skipIf: (context) => formThrottleKind(context) !== 'token',
                        },
                    ],
                    storage,
                }
            },
        }),
        ScheduleModule.forRoot(),
        ServeStaticModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (configService: ConfigService<Env, true>) => createStaticFrontendOptions(configService),
        }),
        AuthModule,
        UserModule,
        DomainModule,
        ProjectModule,
        InboundFormModule,
        MailModule,
        BounceModule,
        SettingsModule,
        SetupModule,
        PermissionModule,
        ApiKeyModule,
    ],
})
export class AppModule {}
