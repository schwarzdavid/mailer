import { UserWithRole } from '../../user/interfaces/user.interface'
import { Role } from '../../permission/interfaces/role.interface'

export interface Authentication {
    token: string
    user: Omit<UserWithRole, 'roleId' | 'role'> & { role: Pick<Role, 'roleId' | 'name' | 'type'> }
}
