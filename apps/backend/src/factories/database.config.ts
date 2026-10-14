import { join } from 'node:path'
import { ConfigService } from '@nestjs/config'
import { SequelizeModuleOptions } from '@nestjs/sequelize'
import type { Env } from '../config/env.schema.js'

export const envFilePath = [join(import.meta.dirname, '..', '..', '..', '..', '.env')]

export function createSequelizeOptions(configService: ConfigService<Env, true>): SequelizeModuleOptions {
    return {
        dialect: 'postgres',
        host: configService.get('DB_HOST', 'localhost', { infer: true }),
        port: configService.get('DB_PORT', { infer: true }),
        username: configService.get('DB_USERNAME', { infer: true }),
        password: configService.get('DB_PASSWORD', { infer: true }),
        database: configService.get('DB_DATABASE', { infer: true }),
        autoLoadModels: true,
        synchronize: false,
    }
}
