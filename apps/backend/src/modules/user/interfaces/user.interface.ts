export interface User {
    userId: number
    firstName: string
    lastName: string
    email: string
    createdAt: Date
    updatedAt: Date
}

export interface FullUser extends User {
    password: string
}

export type UserCreate = Omit<FullUser, 'userId' | 'createdAt' | 'updatedAt'>
