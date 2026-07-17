import {
    AllowNull,
    AutoIncrement,
    BelongsTo,
    Column,
    CreatedAt,
    DataType,
    DefaultScope,
    ForeignKey,
    Model,
    PrimaryKey,
    Table,
    Unique,
    UpdatedAt,
} from 'sequelize-typescript'
import { FullUser, UserCreate } from '../interfaces/user.interface'
import { RoleModel } from '../../permission/models/role.model'

@DefaultScope(() => ({
    attributes: {
        exclude: ['password'],
    },
}))
@Table({
    timestamps: true,
    tableName: 'users',
})
export class UserModel extends Model<FullUser, UserCreate> implements FullUser {
    @PrimaryKey
    @AutoIncrement
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare userId: number

    @AllowNull(false)
    @Column(DataType.STRING(255))
    declare firstName: string

    @AllowNull(false)
    @Column(DataType.STRING(255))
    declare lastName: string

    @AllowNull(false)
    @Unique
    @Column(DataType.STRING(255))
    declare email: string

    @AllowNull(false)
    @Column(DataType.STRING(255))
    declare password: string

    @ForeignKey(() => RoleModel)
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare roleId: number

    @BelongsTo(() => RoleModel)
    declare role?: RoleModel

    @CreatedAt
    declare createdAt: Date

    @UpdatedAt
    declare updatedAt: Date
}
