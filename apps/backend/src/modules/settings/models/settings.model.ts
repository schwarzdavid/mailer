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
import { Settings, SettingsCreate } from '../interfaces/settings.interface'
import { DomainModel } from '../../domain/models/domain.model'

@Table({
    tableName: 'settings',
    timestamps: true,
})
export class SettingsModel extends Model<Settings, SettingsCreate> implements Settings {
    @PrimaryKey
    @AutoIncrement
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare settingId: number

    @AllowNull
    @ForeignKey(() => DomainModel)
    @Column(DataType.INTEGER)
    declare sendingDomainId: number | null

    @AllowNull(false)
    @Column(DataType.STRING(45))
    declare serverIpv4: string

    @AllowNull
    @Column(DataType.STRING(45))
    declare serverIpv6: string | null

    @BelongsTo(() => DomainModel, {
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
    })
    sendingDomain?: DomainModel | null

    @CreatedAt
    declare createdAt: Date

    @UpdatedAt
    declare updatedAt: Date
}
