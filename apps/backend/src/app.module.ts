import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import {ConfigModule, ConfigService} from "@nestjs/config";
import {join} from "node:path";
import {SequelizeModule} from "@nestjs/sequelize";

@Module({
  imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        envFilePath: [join(__dirname, '..', '..', '.env')]
      }),
      SequelizeModule.forRootAsync({
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory(configService: ConfigService) {
              return {
                  dialect: 'postgres',
                  host: configService.get('DB_HOST'),
                  port: configService.get('DB_PORT'),
                  username: configService.get('DB_USERNAME'),
                  password: configService.get('DB_PASSWORD'),
                  database: configService.get('DB_DATABASE'),
                  autoLoadModels: true,
              }
          }
      })
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
