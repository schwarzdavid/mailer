import { Logger, Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { join } from 'node:path'
import { SequelizeModule } from '@nestjs/sequelize'
import { AuthModule } from './modules/auth/auth.module'
import { UserModule } from './modules/user/user.module'
import { BootstrapService } from './services/bootstrap.service'
import { CacheModule } from '@nestjs/cache-manager'
import { createKeyv } from '@keyv/redis'
import { JwtModule } from '@nestjs/jwt'
import { DomainModule } from './modules/domain/domain.module'

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: [join(__dirname, '..', '..', '..', '.env')],
        }),
        SequelizeModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory(configService: ConfigService) {
                return {
                    dialect: 'postgres',
                    host: configService.get<string>('DB_HOST', 'localhost'),
                    port: configService.get<number>('DB_PORT'),
                    username: configService.get<string>('DB_USERNAME'),
                    password: configService.get<string>('DB_PASSWORD'),
                    database: configService.get<string>('DB_DATABASE'),
                    autoLoadModels: true,
                }
            },
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
        AuthModule,
        UserModule,
        DomainModule,
    ],
    providers: [BootstrapService],
})
export class AppModule {}
