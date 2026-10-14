import { describe, expect, it } from 'vitest'
import { defineComponent } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { ProjectListDto } from 'api'
import ProjectListEntry from '../partials/ProjectListEntry.vue'
import { mountView } from '@/__tests__/support.ts'
import { RouteNames } from '@/router/RouteNames.ts'

const project: ProjectListDto = {
    projectId: 4,
    name: 'Acme',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    inboundFormCount: 3,
    domainCount: 0,
}

function createTestRouter() {
    return createRouter({
        history: createMemoryHistory(),
        routes: [
            { path: '/', component: defineComponent({ render: () => null }) },
            {
                path: '/projects/:projectId',
                name: RouteNames.PROJECT_DETAILS,
                component: defineComponent({ render: () => null }),
            },
        ],
    })
}

describe('ProjectListEntry', () => {
    it('shows the project counts and links to its details', () => {
        const wrapper = mountView(ProjectListEntry, {
            props: { project },
            global: { plugins: [createTestRouter()] },
        })

        expect(wrapper.text()).toContain('Acme')
        expect(wrapper.text()).toContain('3 forms · 0 domains')
        expect(wrapper.get('a').attributes('href')).toBe('/projects/4')
    })
})
