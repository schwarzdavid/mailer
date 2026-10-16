import {
    AllowNull,
    AutoIncrement,
    BelongsTo,
    Column,
    CreatedAt,
    DataType,
    ForeignKey,
    HasMany,
    Model,
    PrimaryKey,
    Table,
    UpdatedAt,
} from 'sequelize-typescript'
import type { ProjectMember, ProjectMemberCreate } from '../interfaces/project-member.interface.js'
import { ProjectModel } from '../../project/models/project.model.js'
import { UserModel } from '../../user/models/user.model.js'
import { RoleModel } from './role.model.js'
import { ProjectMemberPermissionModel } from './project-member-permission.model.js'
import type { Relation } from '../../../types/relation.js'

@Table({
    timestamps: true,
    tableName: 'project_members',
    indexes: [
        {
            name: 'project_members_unique',
            unique: true,
            fields: ['projectId', 'userId'],
        },
        {
            name: 'project_members_user',
            fields: ['userId'],
        },
    ],
})
export class ProjectMemberModel extends Model<ProjectMember, ProjectMemberCreate> implements ProjectMember {
    @PrimaryKey
    @AutoIncrement
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare projectMemberId: number

    @ForeignKey(() => ProjectModel)
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare projectId: number

    @ForeignKey(() => UserModel)
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare userId: number

    @ForeignKey(() => RoleModel)
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare roleId: number

    @BelongsTo(() => ProjectModel, {
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
    })
    declare project?: Relation<ProjectModel>

    @BelongsTo(() => UserModel, {
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
    })
    declare user?: Relation<UserModel>

    @BelongsTo(() => RoleModel, {
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
    })
    declare role?: Relation<RoleModel>

    @HasMany(() => ProjectMemberPermissionModel, {
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
    })
    declare permissions: ProjectMemberPermissionModel[]

    @CreatedAt
    declare createdAt: Date

    @UpdatedAt
    declare updatedAt: Date
}
