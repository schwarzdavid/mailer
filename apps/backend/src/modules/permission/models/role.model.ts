import {
    AllowNull,
    AutoIncrement,
    Column,
    CreatedAt,
    DataType,
    HasMany,
    Model,
    PrimaryKey,
    Table,
    UpdatedAt,
} from 'sequelize-typescript'
import type { Role } from '../interfaces/role.interface.js'
import type { RoleScope, RoleType } from '../permission.constants.js'
import { RolePermissionModel } from './role-permission.model.js'

export type RoleCreate = Omit<Role, 'roleId' | 'createdAt' | 'updatedAt'>

@Table({
    timestamps: true,
    tableName: 'roles',
    indexes: [
        {
            name: 'roles_scope_name_unique',
            unique: true,
            fields: ['scope', 'name'],
        },
    ],
})
export class RoleModel extends Model<Role, RoleCreate> implements Role {
    @PrimaryKey
    @AutoIncrement
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare roleId: number

    @AllowNull(false)
    @Column(DataType.STRING(255))
    declare name: string

    @AllowNull(false)
    @Column(DataType.STRING(16))
    declare scope: RoleScope

    @AllowNull(false)
    @Column(DataType.STRING(32))
    declare type: RoleType

    @AllowNull(true)
    @Column(DataType.STRING(255))
    declare description: string | null

    @HasMany(() => RolePermissionModel, {
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
    })
    declare permissions: RolePermissionModel[]

    @CreatedAt
    declare createdAt: Date

    @UpdatedAt
    declare updatedAt: Date
}
