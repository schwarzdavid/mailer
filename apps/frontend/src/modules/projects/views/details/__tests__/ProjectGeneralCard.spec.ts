import { afterEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount } from '@vue/test-utils'
import type { RawRuleOf } from '@casl/ability'
import { ProjectApi, type ProjectDetailDto } from 'api'
import type { Router } from 'vue-router'
import ProjectGeneralCard from '../partials/ProjectGeneralCard.vue'
import { mountView } from '@/__tests__/support.ts'
import type { AppAbility } from '@/plugins/casl.ts'

const { push } = vi.hoisted(() => ({ push: vi.fn<Router['push']>() }))

vi.mock('vue-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('vue-router')>()
    return { ...actual, useRouter: () => ({ push }) }
})

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

vi.stubGlobal('visualViewport', undefined)
enableAutoUnmount(afterEach)

const project: ProjectDetailDto = {
    projectId: 1,
    name: 'Acme',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    domains: [],
}

const readOnly: RawRuleOf<AppAbility>[] = [{ action: 'read', subject: 'Project', conditions: { projectId: 1 } }]
const updater: RawRuleOf<AppAbility>[] = [
    { action: ['read', 'update'], subject: 'Project', conditions: { projectId: 1 } },
]
const deleter: RawRuleOf<AppAbility>[] = [
    { action: ['read', 'delete'], subject: 'Project', conditions: { projectId: 1 } },
]

afterEach(() => {
    vi.restoreAllMocks()
    push.mockClear()
})

function buttonLabels(wrapper: ReturnType<typeof mountView>): string[] {
    return wrapper.findAll('button').map((button) => button.text())
}

describe('ProjectGeneralCard', () => {
    it('saves a renamed project for members with update rights', async () => {
        const updateSpy = vi.spyOn(ProjectApi, 'updateProject').mockResolvedValue({ ...project, name: 'Acme Corp' })
        const wrapper = mountView(ProjectGeneralCard, { props: { project } }, updater)

        expect(buttonLabels(wrapper)).toEqual(['Save'])
        await wrapper.get('input[name="name"]').setValue('Acme Corp')
        await wrapper.get('form').trigger('submit')

        await vi.waitFor(() => {
            expect(updateSpy).toHaveBeenCalledWith({ path: { projectId: 1 }, body: { name: 'Acme Corp' } })
        })
    })

    it('is read-only without update or delete rights', () => {
        const wrapper = mountView(ProjectGeneralCard, { props: { project } }, readOnly)

        expect(wrapper.find('.v-input--disabled input[name="name"]').exists()).toBe(true)
        expect(wrapper.findAll('button')).toHaveLength(0)
    })

    it('only offers deletion to members with delete rights', () => {
        const wrapper = mountView(ProjectGeneralCard, { props: { project } }, deleter)

        expect(buttonLabels(wrapper)).toEqual(['Delete'])
        expect(wrapper.find('.v-input--disabled input[name="name"]').exists()).toBe(true)
    })

    it('ignores rights granted on a different project', () => {
        const wrapper = mountView(ProjectGeneralCard, { props: { project } }, [
            { action: ['update', 'delete'], subject: 'Project', conditions: { projectId: 2 } },
        ])

        expect(wrapper.findAll('button')).toHaveLength(0)
    })

    it('does not save an empty name', async () => {
        const updateSpy = vi.spyOn(ProjectApi, 'updateProject')
        const wrapper = mountView(ProjectGeneralCard, { props: { project } }, updater)

        await wrapper.get('input[name="name"]').setValue('')
        await wrapper.get('form').trigger('submit')

        await vi.waitFor(() => {
            expect(wrapper.find('.v-input--error input[name="name"]').exists()).toBe(true)
        })
        expect(updateSpy).not.toHaveBeenCalled()
    })

    it('shows the api error message when saving fails', async () => {
        vi.spyOn(ProjectApi, 'updateProject').mockRejectedValue({ message: 'Name already in use' })
        const wrapper = mountView(ProjectGeneralCard, { props: { project } }, updater)

        await wrapper.get('form').trigger('submit')

        await vi.waitFor(() => {
            expect(wrapper.get('.v-alert').text()).toContain('Name already in use')
        })
    })

    it('falls back to a generic error when the api gives no message', async () => {
        vi.spyOn(ProjectApi, 'updateProject').mockRejectedValue('Internal Server Error')
        const wrapper = mountView(ProjectGeneralCard, { props: { project } }, updater)

        await wrapper.get('form').trigger('submit')

        await vi.waitFor(() => {
            expect(wrapper.get('.v-alert').text()).toContain('The project could not be saved')
        })
    })
})
