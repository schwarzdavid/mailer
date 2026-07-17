import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { subject } from '@casl/ability'
import { AppAbility } from '../interfaces/app-ability'
import { ProjectPermission } from '../permission.constants'

export function canOnProject(ability: AppAbility, permission: ProjectPermission, projectId: number): boolean {
    return ability.can(permission, subject('Project', { projectId }))
}

export function assertProjectReadable(ability: AppAbility, projectId: number): void {
    if (!canOnProject(ability, 'read', projectId)) {
        throw new NotFoundException('Unknown project')
    }
}

export function assertProjectUpdatable(ability: AppAbility, projectId: number): void {
    assertProjectReadable(ability, projectId)
    if (!canOnProject(ability, 'update', projectId)) {
        throw new ForbiddenException('Missing project permission')
    }
}

export function assertProjectDeletable(ability: AppAbility, projectId: number): void {
    assertProjectReadable(ability, projectId)
    if (!canOnProject(ability, 'delete', projectId)) {
        throw new ForbiddenException('Missing project permission')
    }
}
