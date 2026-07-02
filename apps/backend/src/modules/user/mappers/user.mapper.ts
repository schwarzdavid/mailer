import { FullUser, User } from '../interfaces/user.interface'

/**
 * Projects the persisted user (which carries the password hash) onto the public
 * domain `User` shape. This is the single place that strips the secret, so every
 * layer above the persistence boundary receives a password-free principal.
 */
export function toUser(user: FullUser): User {
    return {
        userId: user.userId,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
    }
}
