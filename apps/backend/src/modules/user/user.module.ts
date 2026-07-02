import { Module } from '@nestjs/common'
import { UserService } from './services/user.service'
import { UserController } from './controller/user.controller'
import { SequelizeModule } from '@nestjs/sequelize'
import { UserModel } from './models/user.model'

@Module({
    imports: [SequelizeModule.forFeature([UserModel])],
    providers: [UserService],
    controllers: [UserController],
    exports: [UserService, SequelizeModule],
})
export class UserModule {}
