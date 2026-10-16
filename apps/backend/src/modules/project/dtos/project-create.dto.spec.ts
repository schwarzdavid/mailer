import 'reflect-metadata'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { describe, expect, it } from 'vitest'
import { ProjectCreateDto, ProjectUpdateDto } from './project-create.dto.js'
import { ProjectDomainAssignDto } from './project-domain-assign.dto.js'
import { ProjectMemberPutDto } from './project-member.dto.js'

async function violations(type: new () => object, plain: object): Promise<string[]> {
    const errors = await validate(plainToInstance(type, plain, { exposeDefaultValues: true }))
    return errors.map((error) => error.property)
}

describe.each([ProjectCreateDto, ProjectUpdateDto])('%o', (type) => {
    it('accepts a project name', async () => {
        await expect(violations(type, { name: 'Acme' })).resolves.toEqual([])
    })

    it('rejects a missing, empty or overlong name', async () => {
        await expect(violations(type, {})).resolves.toEqual(['name'])
        await expect(violations(type, { name: '' })).resolves.toEqual(['name'])
        await expect(violations(type, { name: 'n'.repeat(256) })).resolves.toEqual(['name'])
    })
})

describe('ProjectDomainAssignDto', () => {
    it('accepts an integer domain id', async () => {
        await expect(violations(ProjectDomainAssignDto, { domainId: 3 })).resolves.toEqual([])
    })

    it.each([undefined, '3', 3.5, null])('rejects the domain id %o', async (domainId) => {
        await expect(violations(ProjectDomainAssignDto, { domainId })).resolves.toEqual(['domainId'])
    })
})

describe('ProjectMemberPutDto', () => {
    it('accepts a role with project permission levels', async () => {
        await expect(
            violations(ProjectMemberPutDto, { roleId: 5, permissions: ['read', 'update', 'delete'] }),
        ).resolves.toEqual([])
    })

    it('accepts a role without extra permissions', async () => {
        await expect(violations(ProjectMemberPutDto, { roleId: 5 })).resolves.toEqual([])
    })

    it.each([undefined, '5', 5.5])('rejects the role id %o', async (roleId) => {
        await expect(violations(ProjectMemberPutDto, { roleId, permissions: [] })).resolves.toEqual(['roleId'])
    })

    it.each([['manage'], ['projects.all'], ['read', 'admin']])(
        'rejects permissions outside the project levels: %o',
        async (...permissions) => {
            await expect(violations(ProjectMemberPutDto, { roleId: 5, permissions })).resolves.toEqual(['permissions'])
        },
    )

    it('requires an array', async () => {
        await expect(violations(ProjectMemberPutDto, { roleId: 5, permissions: 'read' })).resolves.toEqual([
            'permissions',
        ])
    })
})
