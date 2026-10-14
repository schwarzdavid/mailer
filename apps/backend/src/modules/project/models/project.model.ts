import {
    AllowNull,
    AutoIncrement,
    BelongsToMany,
    Column,
    CreatedAt,
    DataType,
    DeletedAt,
    HasMany,
    Model,
    PrimaryKey,
    Table,
    Unique,
    UpdatedAt,
} from 'sequelize-typescript'
import { Project, ProjectCreate } from '../interfaces/project.interface.js'
import { ProjectDomainModel } from './project-domain.model.js'
import { DomainModel } from '../../domain/models/domain.model.js'
import { InboundFormModel } from '../../inbound-form/models/inbound-form.model.js'

@Table({
    tableName: 'projects',
    timestamps: true,
    paranoid: true,
})
export class ProjectModel extends Model<Project, ProjectCreate> implements Project {
    @PrimaryKey
    @AutoIncrement
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare projectId: number

    @Unique
    @AllowNull(false)
    @Column(DataType.STRING(255))
    declare name: string

    @BelongsToMany(() => DomainModel, () => ProjectDomainModel)
    declare domains: DomainModel[]

    @HasMany(() => InboundFormModel)
    declare inboundForms: InboundFormModel[]

    @CreatedAt
    declare createdAt: Date

    @UpdatedAt
    declare updatedAt: Date

    @DeletedAt
    declare deletedAt: Date | null
}
