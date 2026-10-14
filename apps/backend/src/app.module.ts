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
import { Env, envSchema } from './config/env.schema.js'

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
                const host = configService.get('REDIS_HOST', { infer: true })
                const port = configService.get('REDIS_PORT', { infer: true })

                const keyv = createKeyv(
                    {
                        url: `redis://${host}:${port}/0`,
                        socket: {
                            connectTimeout: 1000,
                            reconnectStrategy: (retries: number) => Math.min(retries * 200, 2000),
                        },
                        // Reject commands immediately when disconnected instead of queueing
                        // them — a Redis outage must never hang requests (e.g. the JWT guard).
                        disableOfflineQueue: true,
                    },
                    { namespace: 'cache' },
                )
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
        ThrottlerModule.forRoot([
            {
                ttl: 60_000,
                limit: 10,
            },
        ]),
        ScheduleModule.forRoot(),
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
    ],
})
export class AppModule {}
