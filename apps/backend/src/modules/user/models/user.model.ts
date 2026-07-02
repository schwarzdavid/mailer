import {
    AllowNull,
    AutoIncrement,
    Column,
    CreatedAt,
    DataType,
    DefaultScope,
    Model,
    PrimaryKey,
    Table,
    Unique,
    UpdatedAt,
} from 'sequelize-typescript'
import { FullUser, UserCreate } from '../interfaces/user.interface'

@DefaultScope(() => ({
    attributes: {
        exclude: ['password'],
    }
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

    @CreatedAt
    declare createdAt: Date

    @UpdatedAt
    declare updatedAt: Date
}
