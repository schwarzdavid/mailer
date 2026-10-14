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
import type { UserPermission, UserPermissionCreate } from '../interfaces/role.interface.js'
import type { Permission } from '../permission.constants.js'
import { UserModel } from '../../user/models/user.model.js'
import type { Relation } from '../../../types/relation.js'

@Table({
    timestamps: true,
    tableName: 'user_permissions',
    indexes: [
        {
            name: 'user_permissions_unique',
            unique: true,
            fields: ['userId', 'permission'],
        },
    ],
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

    @BelongsTo(() => UserModel, {
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
    })
    declare user?: Relation<UserModel>

    @CreatedAt
    declare createdAt: Date

    @UpdatedAt
    declare updatedAt: Date
}
