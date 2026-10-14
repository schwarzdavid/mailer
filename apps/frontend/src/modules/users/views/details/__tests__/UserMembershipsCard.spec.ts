import { describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import type { UserDetailDto } from 'api'
import UserMembershipsCard from '../partials/UserMembershipsCard.vue'
import { mountView } from '@/__tests__/support.ts'
import { RouteNames } from '@/router/RouteNames.ts'

function createTestRouter(): Router {
    return createRouter({
        history: createMemoryHistory(),
        routes: Object.values(RouteNames).map((name, index) => ({
            path: name === RouteNames.PROJECT_DETAILS ? '/projects/:projectId' : `/${index}`,
            name,
            component: { template: '<div />' },
        })),
    })
}

const grace: UserDetailDto = {
    userId: 7,
    firstName: 'Grace',
    lastName: 'Hopper',
    email: 'grace@example.com',
    role: { roleId: 3, name: 'User', type: 'user' },
    permissions: [],
    memberships: [],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
}

function mountCard(user: UserDetailDto) {
    return mountView(UserMembershipsCard, { props: { user }, global: { plugins: [createTestRouter()] } })
}

describe('UserMembershipsCard', () => {
    it('explains when the user has no project access', () => {
        const wrapper = mountCard(grace)

        expect(wrapper.text()).toContain('No project access granted.')
    })

    it('links every project membership with its permissions', async () => {
        const wrapper = mountCard({
            ...grace,
            memberships: [
                { projectId: 1, projectName: 'Acme', permissions: ['read', 'update'] },
                { projectId: 2, projectName: 'Globex', permissions: ['read', 'update', 'delete'] },
            ],
        })

        expect(wrapper.text()).not.toContain('No project access granted.')
        const items = wrapper.findAll('.v-list-item')
        expect(items).toHaveLength(2)
        expect(items[0]!.text()).toContain('Acme')
        expect(items[0]!.findAll('.v-chip').map((chip) => chip.text())).toEqual(['Read', 'Update'])
        expect(items[1]!.findAll('.v-chip').map((chip) => chip.text())).toEqual(['Read', 'Update', 'Delete'])
        await vi.waitFor(() => expect(items[1]!.attributes('href')).toBe('/projects/2'))
    })
})
