export interface User {
    userId: number,
    firstName: string,
    lastName: string,
    email: string,
    password: string,
    createdAt: Date,
    updatedAt: Date,
}

export type UserCreate = Omit<User, 'userId' | 'createdAt' | 'updatedAt'>
