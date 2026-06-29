import {
    AutoIncrement,
    Column,
    CreatedAt,
    DataType,
    Model,
    NotNull,
    PrimaryKey,
    Table,
    UpdatedAt
} from "sequelize-typescript";
import {User} from "./interfaces/user.interface";

@Table({
    timestamps: true,
    tableName: 'users',
})
export class UserModel extends Model<User, Omit<User, 'userId'>> implements User {
    @PrimaryKey
    @AutoIncrement
    @NotNull
    @Column(DataType.BIGINT.UNSIGNED)
    declare userId: number;

    @NotNull
    @Column(DataType.STRING(255))
    declare firstName: string;

    @NotNull
    @Column(DataType.STRING(255))
    declare lastName: string;

    @NotNull
    @Column(DataType.STRING(255))
    declare email: string;

    @NotNull
    @Column(DataType.STRING(255))
    declare password: string;

    @CreatedAt
    declare createdAt: Date

    @UpdatedAt
    declare updatedAt: Date
}
