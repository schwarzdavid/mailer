import {Module} from '@nestjs/common';
import {ConfigModule, ConfigService} from "@nestjs/config";
import {join} from "node:path";
import {SequelizeModule} from "@nestjs/sequelize";
import {AuthModule} from './auth/auth.module';
import {UserModule} from './user/user.module';

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
      }),
      AuthModule,
      UserModule
  ],
})
export class AppModule {}
