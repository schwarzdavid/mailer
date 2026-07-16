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
import { ProjectDomain, ProjectDomainCreate } from '../interfaces/project.interface'
import { ProjectModel } from './project.model'
import { DomainModel } from '../../domain/models/domain.model'

@Table({
    tableName: 'project_domains',
    timestamps: true,
})
export class ProjectDomainModel extends Model<ProjectDomain, ProjectDomainCreate> implements ProjectDomain {
    @PrimaryKey
    @AutoIncrement
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare projectDomainId: number

    @ForeignKey(() => ProjectModel)
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare projectId: number

    @ForeignKey(() => DomainModel)
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare domainId: number

    @CreatedAt
    declare createdAt: Date

    @UpdatedAt
    declare updatedAt: Date
}
