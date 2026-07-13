import {
    AllowNull,
    AutoIncrement,
    Column,
    CreatedAt,
    DataType,
    Default,
    Model,
    PrimaryKey,
    Table,
    Unique,
    UpdatedAt,
} from 'sequelize-typescript'
import { EmailBlock, EmailBlockCreate } from '../interfaces/email-block.interface'

@Table({
    tableName: 'email_block',
})
export class EmailBlockModel extends Model<EmailBlock, EmailBlockCreate> implements EmailBlock {
    @PrimaryKey
    @AutoIncrement
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare emailBlockId: number

    @Unique
    @AllowNull(false)
    @Column(DataType.STRING(255))
    declare emailAddress: string

    @Default(0)
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare blockCount: number

    @AllowNull
    @Column(DataType.DATE)
    declare blockedUntil: Date | null

    @CreatedAt
    declare createdAt: Date

    @UpdatedAt
    declare updatedAt: Date
}
