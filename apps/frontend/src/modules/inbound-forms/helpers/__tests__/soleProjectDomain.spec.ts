import { describe, expect, it } from 'vitest'
import type { DomainDto, ProjectDetailDto } from 'api'
import { domain as domainFixture, projectDetail } from '@/__tests__/fixtures.ts'
import { soleProjectDomain } from '../soleProjectDomain.ts'

const first: DomainDto = domainFixture({ domainId: 3, fqdn: 'one.example.com' })
const second: DomainDto = domainFixture({ domainId: 4, fqdn: 'two.example.com' })

function projectWith(domains: DomainDto[]): ProjectDetailDto {
    return projectDetail({ domains })
}

describe('soleProjectDomain', () => {
    it('returns the only domain of a project', () => {
        expect(soleProjectDomain(projectWith([first]))).toEqual(first)
    })

    it('returns null when the project has several domains or none', () => {
        expect(soleProjectDomain(projectWith([first, second]))).toBeNull()
        expect(soleProjectDomain(projectWith([]))).toBeNull()
    })

    it('returns null while the project is not loaded', () => {
        expect(soleProjectDomain(undefined)).toBeNull()
    })
})
