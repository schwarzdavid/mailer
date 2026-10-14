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
import type { RolePermission, RolePermissionCreate } from '../interfaces/role.interface.js'
import type { Permission } from '../permission.constants.js'
import { RoleModel } from './role.model.js'

@Table({
    timestamps: true,
    tableName: 'role_permissions',
    indexes: [
        {
            name: 'role_permissions_unique',
            unique: true,
            fields: ['roleId', 'permission'],
        },
    ],
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
