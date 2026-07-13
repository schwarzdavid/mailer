import {
    AllowNull,
    AutoIncrement,
    Column,
    CreatedAt,
    DataType,
    Model,
    PrimaryKey,
    Table,
    UpdatedAt,
} from 'sequelize-typescript'
import { Bounce, BounceCreate, BounceType } from '../interfaces/bounce.interface'

@Table({
    tableName: 'bounce',
})
export class BounceModel extends Model<Bounce, BounceCreate> implements Bounce {
    @PrimaryKey
    @AutoIncrement
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare bounceId: number

    @AllowNull(false)
    @Column({ type: DataType.STRING(255), unique: 'bounce_message_id_email_address_unique' })
    declare emailAddress: string

    @AllowNull(false)
    @Column(DataType.STRING(255))
    declare type: BounceType

    @AllowNull
    @Column(DataType.STRING(16))
    declare statusCode: string | null

    @AllowNull(false)
    @Column(DataType.TEXT)
    declare reason: string

    @AllowNull
    @Column({ type: DataType.STRING(998), unique: 'bounce_message_id_email_address_unique' })
    declare messageId: string | null

    @AllowNull(false)
    @Column(DataType.DATE)
    declare receivedAt: Date

    @CreatedAt
    declare createdAt: Date

    @UpdatedAt
    declare updatedAt: Date
}
