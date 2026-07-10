import { join } from 'node:path'
import { ConfigService } from '@nestjs/config'
import { SequelizeModuleOptions } from '@nestjs/sequelize'

export const envFilePath = [join(__dirname, '..', '..', '..', '..', '.env')]

export function createSequelizeOptions(configService: ConfigService): SequelizeModuleOptions {
    return {
        dialect: 'postgres',
        host: configService.get<string>('DB_HOST', 'localhost'),
        port: configService.get<number>('DB_PORT'),
        username: configService.get<string>('DB_USERNAME'),
        password: configService.get<string>('DB_PASSWORD'),
        database: configService.get<string>('DB_DATABASE'),
        autoLoadModels: true,
        synchronize: false,
    }
}
