import { Logger, Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { SequelizeModule } from '@nestjs/sequelize'
import { createSequelizeOptions, envFilePath } from './database.config'
import { AuthModule } from './modules/auth/auth.module'
import { UserModule } from './modules/user/user.module'
import { BootstrapService } from './services/bootstrap.service'
import { CacheModule } from '@nestjs/cache-manager'
import { createKeyv } from '@keyv/redis'
import { JwtModule } from '@nestjs/jwt'
import { ThrottlerModule } from '@nestjs/throttler'
import { DomainModule } from './modules/domain/domain.module'
import { InboundFormModule } from './modules/inbound-form/inbound-form.module'
import { MailModule } from './modules/mail/mail.module'

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath,
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
            useFactory(configService: ConfigService) {
                const logger = new Logger('CacheModule')
                const host = configService.get<string>('REDIS_HOST', '127.0.0.1')
                const port = configService.get<string>('REDIS_PORT', '6379')
                const password = configService.get<string>('REDIS_PASSWORD', '')

                const keyv = createKeyv(
                    {
                        url: `redis://:${password}@${host}:${port}/0`,
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
            useFactory(configService: ConfigService) {
                return {
                    secret: configService.get<string>('BACKEND_JWT_SECRET', 'no-secret'),
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
        AuthModule,
        UserModule,
        DomainModule,
        InboundFormModule,
        MailModule,
    ],
    providers: [BootstrapService],
})
export class AppModule {}
