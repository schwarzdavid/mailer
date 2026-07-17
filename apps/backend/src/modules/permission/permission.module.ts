import { Global, Module } from '@nestjs/common'
import { SequelizeModule } from '@nestjs/sequelize'
import { RoleModel } from './models/role.model'
import { RolePermissionModel } from './models/role-permission.model'
import { UserPermissionModel } from './models/user-permission.model'
import { ProjectMemberModel } from './models/project-member.model'
import { ProjectModel } from '../project/models/project.model'
import { UserModel } from '../user/models/user.model'
import { RoleService } from './services/role.service'
import { AbilityFactory } from './services/ability-factory.service'
import { PermissionCacheService } from './services/permission-cache.service'
import { ProjectMemberService } from './services/project-member.service'
import { RoleController } from './controller/role.controller'

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
