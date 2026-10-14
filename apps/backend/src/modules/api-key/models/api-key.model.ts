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
import { ApiKeyCreate, ApiKeyRecord } from '../interfaces/api-key.interface.js'
import { ProjectModel } from '../../project/models/project.model.js'
import { UserModel } from '../../user/models/user.model.js'

@Table({
    tableName: 'api_keys',
    indexes: [
        {
            name: 'api_keys_project_id',
            fields: ['projectId'],
        },
    ],
})
export class ApiKeyModel extends Model<ApiKeyRecord, ApiKeyCreate> implements ApiKeyRecord {
    @PrimaryKey
    @AutoIncrement
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare apiKeyId: number

    @ForeignKey(() => ProjectModel)
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare projectId: number

    @AllowNull(false)
    @Column(DataType.STRING(100))
    declare name: string

    @AllowNull(false)
    @Column({ type: DataType.STRING(16), unique: 'api_keys_prefix_unique' })
    declare prefix: string

    @AllowNull(false)
    @Column(DataType.CHAR(64))
    declare secretHash: string

    @ForeignKey(() => UserModel)
    @AllowNull
    @Column(DataType.INTEGER)
    declare createdByUserId: number | null

    @AllowNull
    @Column(DataType.DATE)
    declare lastUsedAt: Date | null

    @AllowNull
    @Column(DataType.DATE)
    declare revokedAt: Date | null

    @CreatedAt
    declare createdAt: Date

    @UpdatedAt
    declare updatedAt: Date

    @BelongsTo(() => ProjectModel, {
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
    })
    project: ProjectModel | null = null

    @BelongsTo(() => UserModel, {
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
    })
    createdBy: UserModel | null = null
}
