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
import type { UserPermission, UserPermissionCreate } from '../interfaces/role.interface'
import type { Permission } from '../permission.constants'
import { UserModel } from '../../user/models/user.model'

@Table({
    timestamps: true,
    tableName: 'user_permissions',
})
export class UserPermissionModel extends Model<UserPermission, UserPermissionCreate> implements UserPermission {
    @PrimaryKey
    @AutoIncrement
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare userPermissionId: number

    @ForeignKey(() => UserModel)
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare userId: number

    @AllowNull(false)
    @Column(DataType.STRING(64))
    declare permission: Permission

    @CreatedAt
    declare createdAt: Date

    @UpdatedAt
    declare updatedAt: Date
}
