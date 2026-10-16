import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { createMongoAbility } from '@casl/ability'
import { describe, expect, it } from 'vitest'
import {
    assertProjectDeletable,
    assertProjectPermission,
    assertProjectReadable,
    assertProjectUpdatable,
    canOnProject,
} from './project-access.js'
import { AppAbility } from '../interfaces/app-ability.js'

const memberAbility = createMongoAbility<AppAbility>([
    { action: 'read', subject: 'Project', conditions: { projectId: { $in: [1, 2] } } },
    { action: 'update', subject: 'Project', conditions: { projectId: { $in: [1] } } },
])

describe('project access helpers', () => {
    it('evaluates membership-scoped project abilities', () => {
        expect(canOnProject(memberAbility, 'read', 1)).toBe(true)
        expect(canOnProject(memberAbility, 'read', 3)).toBe(false)
        expect(canOnProject(memberAbility, 'update', 2)).toBe(false)
    })

    it('hides unreadable projects behind a 404', () => {
        expect(() => assertProjectReadable(memberAbility, 1)).not.toThrow()
        expect(() => assertProjectReadable(memberAbility, 3)).toThrow(NotFoundException)
    })

    it('rejects updates without the update level', () => {
        expect(() => assertProjectUpdatable(memberAbility, 1)).not.toThrow()
        expect(() => assertProjectUpdatable(memberAbility, 2)).toThrow(ForbiddenException)
        expect(() => assertProjectUpdatable(memberAbility, 3)).toThrow(NotFoundException)
    })

    it('rejects deletes without the delete level', () => {
        expect(() => assertProjectDeletable(memberAbility, 1)).toThrow(ForbiddenException)
        expect(() => assertProjectDeletable(memberAbility, 3)).toThrow(NotFoundException)
    })

    it('checks any catalog permission after the read gate', () => {
        const editor = createMongoAbility<AppAbility>([
            { action: 'read', subject: 'Project', conditions: { projectId: { $in: [1] } } },
            { action: 'forms.manage', subject: 'Project', conditions: { projectId: { $in: [1] } } },
        ])

        expect(() => assertProjectPermission(editor, 'forms.manage', 1)).not.toThrow()
        expect(() => assertProjectPermission(editor, 'api_keys.manage', 1)).toThrow(ForbiddenException)
        expect(() => assertProjectPermission(editor, 'forms.manage', 2)).toThrow(NotFoundException)
    })
})
