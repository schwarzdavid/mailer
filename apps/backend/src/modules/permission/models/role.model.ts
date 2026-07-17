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
    Unique,
    UpdatedAt,
} from 'sequelize-typescript'
import type { Role } from '../interfaces/role.interface'
import type { RoleType } from '../permission.constants'
import { RolePermissionModel } from './role-permission.model'

export type RoleCreate = Omit<Role, 'roleId' | 'createdAt' | 'updatedAt'>

@Table({
    timestamps: true,
    tableName: 'roles',
})
export class RoleModel extends Model<Role, RoleCreate> implements Role {
    @PrimaryKey
    @AutoIncrement
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare roleId: number

    @Unique
    @AllowNull(false)
    @Column(DataType.STRING(255))
    declare name: string

    @AllowNull(false)
    @Column(DataType.STRING(32))
    declare type: RoleType

    @HasMany(() => RolePermissionModel)
    declare permissions: RolePermissionModel[]

    @CreatedAt
    declare createdAt: Date

    @UpdatedAt
    declare updatedAt: Date
}
