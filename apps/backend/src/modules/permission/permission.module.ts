import { Global, Module } from '@nestjs/common'
import { SequelizeModule } from '@nestjs/sequelize'
import { RoleModel } from './models/role.model.js'
import { RolePermissionModel } from './models/role-permission.model.js'
import { UserPermissionModel } from './models/user-permission.model.js'
import { ProjectMemberModel } from './models/project-member.model.js'
import { ProjectModel } from '../project/models/project.model.js'
import { UserModel } from '../user/models/user.model.js'
import { RoleService } from './services/role.service.js'
import { AbilityFactory } from './services/ability-factory.service.js'
import { PermissionCacheService } from './services/permission-cache.service.js'
import { ProjectMemberService } from './services/project-member.service.js'
import { RoleController } from './controller/role.controller.js'

@Global()
@Module({
    imports: [
        SequelizeModule.forFeature([
            RoleModel,
            RolePermissionModel,
            UserPermissionModel,
            ProjectMemberModel,
            ProjectModel,
            UserModel,
        ]),
    ],
    controllers: [RoleController],
    providers: [RoleService, AbilityFactory, PermissionCacheService, ProjectMemberService],
    exports: [SequelizeModule, RoleService, AbilityFactory, PermissionCacheService, ProjectMemberService],
})
export class PermissionModule {}
