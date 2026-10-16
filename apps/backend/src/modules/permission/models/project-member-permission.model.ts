import {
    AllowNull,
    AutoIncrement,
    Column,
    CreatedAt,
    DataType,
    ForeignKey,
    Model,
    PrimaryKey,
    Table,
    UpdatedAt,
} from 'sequelize-typescript'
import type { ProjectMemberPermission, ProjectMemberPermissionCreate } from '../interfaces/project-member.interface.js'
import type { ProjectPermission } from '../permission.constants.js'
import { ProjectMemberModel } from './project-member.model.js'

@Table({
    timestamps: true,
    tableName: 'project_member_permissions',
    indexes: [
        {
            name: 'project_member_permissions_unique',
            unique: true,
            fields: ['projectMemberId', 'permission'],
        },
    ],
})
export class ProjectMemberPermissionModel
    extends Model<ProjectMemberPermission, ProjectMemberPermissionCreate>
    implements ProjectMemberPermission
{
    @PrimaryKey
    @AutoIncrement
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare projectMemberPermissionId: number

    @ForeignKey(() => ProjectMemberModel)
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare projectMemberId: number

    @AllowNull(false)
    @Column(DataType.STRING(32))
    declare permission: ProjectPermission

    @CreatedAt
    declare createdAt: Date

    @UpdatedAt
    declare updatedAt: Date
}
