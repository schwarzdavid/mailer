import { UserWithRole } from '../../user/interfaces/user.interface.js'
import { AllProjectsGrants } from '../interfaces/project-member.interface.js'

export function hasAllProjectsGrant(user: UserWithRole, grants: AllProjectsGrants): boolean {
    return (
        user.role.type === 'super_admin' || grants.roleIds.includes(user.roleId) || grants.userIds.includes(user.userId)
    )
}
