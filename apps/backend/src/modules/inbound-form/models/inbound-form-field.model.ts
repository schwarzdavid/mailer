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
    Unique,
    UpdatedAt,
} from 'sequelize-typescript'
import { InboundFormField, InboundFormFieldCreate } from '../interfaces/inbound-form-field.interface'
import { InboundFormModel } from './inbound-form.model'

@Table({
    tableName: 'inbound_form_fields',
    timestamps: true,
})
export class InboundFormFieldModel extends Model<InboundFormField, InboundFormFieldCreate> implements InboundFormField {
    @PrimaryKey
    @AutoIncrement
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare inboundFormFieldId: number

    @Unique('form_key_unique')
    @ForeignKey(() => InboundFormModel)
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare inboundFormId: number

    @Unique('form_key_unique')
    @AllowNull(false)
    @Column(DataType.STRING(255))
    declare key: string

    @AllowNull(false)
    @Column(DataType.STRING(255))
    declare label: string

    @AllowNull
    @Column(DataType.STRING(255))
    declare defaultValue: string | null

    @AllowNull
    @Column(DataType.JSON)
    declare validation: string | null

    @CreatedAt
    declare createdAt: Date

    @UpdatedAt
    declare updatedAt: Date

    @BelongsTo(() => InboundFormModel, {
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
    })
    inboundForm: InboundFormModel | null = null
}
