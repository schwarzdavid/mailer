import {User} from "../../user/interfaces/user.interface";

export interface Authentication {
    token: string
    user: User
}
