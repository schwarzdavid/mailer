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
import type { RolePermission, RolePermissionCreate } from '../interfaces/role.interface'
import type { Permission } from '../permission.constants'
import { RoleModel } from './role.model'

@Table({
    timestamps: true,
    tableName: 'role_permissions',
})
export class RolePermissionModel extends Model<RolePermission, RolePermissionCreate> implements RolePermission {
    @PrimaryKey
    @AutoIncrement
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare rolePermissionId: number

    @ForeignKey(() => RoleModel)
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare roleId: number

    @AllowNull(false)
    @Column(DataType.STRING(64))
    declare permission: Permission

    @CreatedAt
    declare createdAt: Date

    @UpdatedAt
    declare updatedAt: Date
}
