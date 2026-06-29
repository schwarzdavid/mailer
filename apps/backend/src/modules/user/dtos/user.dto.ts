import {User} from "../interfaces/user.interface";

export class UserDto implements Omit<User, 'password'> {
    userId!: number;
    firstName!: string;
    lastName!: string;
    email!: string;
    createdAt!: Date;
    updatedAt!: Date;

    static toDto(user: User): UserDto {
        const dto = new UserDto()

        dto.userId = user.userId
        dto.firstName = user.firstName
        dto.lastName = user.lastName
        dto.email = user.email

        return dto
    }
}
