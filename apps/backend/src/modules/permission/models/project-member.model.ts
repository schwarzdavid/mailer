import {
    AllowNull,
    AutoIncrement,
    BelongsTo,
    Column,
    CreatedAt,
    DataType,
    ForeignKey,
    Model,
    PrimaryKey,
    Table,
    UpdatedAt,
} from 'sequelize-typescript'
import type { ProjectMember, ProjectMemberCreate } from '../interfaces/project-member.interface'
import type { ProjectPermission } from '../permission.constants'
import { ProjectModel } from '../../project/models/project.model'
import { UserModel } from '../../user/models/user.model'

@Table({
    timestamps: true,
    tableName: 'project_members',
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

    @AllowNull(false)
    @Column(DataType.STRING(16))
    declare permission: ProjectPermission

    @BelongsTo(() => ProjectModel)
    declare project?: ProjectModel

    @BelongsTo(() => UserModel)
    declare user?: UserModel

    @CreatedAt
    declare createdAt: Date

    @UpdatedAt
    declare updatedAt: Date
}
