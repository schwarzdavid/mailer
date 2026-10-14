import { Module } from '@nestjs/common'
import { UserService } from './services/user.service.js'
import { UserController } from './controller/user.controller.js'
import { SequelizeModule } from '@nestjs/sequelize'
import { UserModel } from './models/user.model.js'

@Module({
    imports: [SequelizeModule.forFeature([UserModel])],
    providers: [UserService],
    controllers: [UserController],
    exports: [UserService, SequelizeModule],
})
export class UserModule {}
