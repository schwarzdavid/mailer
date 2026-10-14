import { UserWithRole } from '../../user/interfaces/user.interface.js'
import { Role } from '../../permission/interfaces/role.interface.js'

export interface Authentication {
    token: string
    user: Omit<UserWithRole, 'roleId' | 'role'> & { role: Pick<Role, 'roleId' | 'name' | 'type'> }
}
