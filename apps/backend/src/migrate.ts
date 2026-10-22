import 'reflect-metadata'
import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import { getConnectionToken, SequelizeModule } from '@nestjs/sequelize'
import { Sequelize } from 'sequelize-typescript'
import { migrationEnvSchema } from './config/env.schema.js'
import { createSequelizeOptions, envFilePath } from './factories/database.config.js'
import { createUmzug } from './factories/umzug.factory.js'

// Migrations must not boot AppModule: its cache module needs Redis, which
// isn't available while running migrations against a fresh database.
@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath,
            validationSchema: migrationEnvSchema,
        }),
        SequelizeModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: createSequelizeOptions,
        }),
    ],
})
class MigrationModule {}

async function main(): Promise<void> {
    const app = await NestFactory.createApplicationContext(MigrationModule, {
        logger: ['error', 'warn'],
    })
    app.useLogger(['error', 'warn', 'log'])

    try {
        const sequelize = app.get<Sequelize>(getConnectionToken())
        const cliArgs = process.argv.slice(2)
        const succeeded = await createUmzug(sequelize).runAsCLI(cliArgs.length > 0 ? cliArgs : ['up'])
        if (!succeeded) {
            process.exitCode = 1
        }
    } finally {
        await app.close()
    }
}

void main()
