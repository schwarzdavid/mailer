import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProjectApi } from 'api'
import type { Router } from 'vue-router'
import ProjectListView from '../ProjectListView.vue'
import { findButton, mountView } from '@/__tests__/support.ts'
import { deletedProject, projectListItem } from '@/__tests__/fixtures.ts'

const { push } = vi.hoisted(() => ({ push: vi.fn<Router['push']>() }))

vi.mock('vue-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('vue-router')>()
    return { ...actual, useRouter: () => ({ push }) }
})

vi.stubGlobal('visualViewport', null)

afterEach(() => {
    vi.restoreAllMocks()
    push.mockClear()
})

describe('ProjectListView', () => {
    it('lists projects as links with their counts', async () => {
        vi.spyOn(ProjectApi, 'getProjects').mockResolvedValue([projectListItem()])
        vi.spyOn(ProjectApi, 'getDeletedProjects').mockResolvedValue([])
        const wrapper = mountView(ProjectListView)

        await vi.waitFor(() => expect(wrapper.text()).toContain('Acme Website'))
        expect(wrapper.text()).toContain('3 forms · 1 sender domain · 2 members')
        expect(wrapper.get('h1').text()).toBe('Projects')
        expect(wrapper.find('a.list-row').exists()).toBe(true)
        expect(wrapper.text()).not.toContain('Domain invalid')
    })

    it('flags projects whose sender domains need attention', async () => {
        vi.spyOn(ProjectApi, 'getProjects').mockResolvedValue([projectListItem({ domainsHealthy: false })])
        vi.spyOn(ProjectApi, 'getDeletedProjects').mockResolvedValue([])
        const wrapper = mountView(ProjectListView)

        await vi.waitFor(() => expect(wrapper.text()).toContain('Domain invalid'))
    })

    it('lists recently deleted projects with a restore action', async () => {
        vi.spyOn(ProjectApi, 'getProjects').mockResolvedValue([projectListItem()])
        vi.spyOn(ProjectApi, 'getDeletedProjects').mockResolvedValue([deletedProject()])
        const wrapper = mountView(ProjectListView)

        await vi.waitFor(() => expect(wrapper.text()).toContain('Spring Campaign'))
        expect(wrapper.text()).toContain('Recently deleted')
        expect(wrapper.text()).toContain('Purged on 31 Jan 2026')
        expect(findButton(wrapper, 'Restore')).toBeDefined()
    })

    it('restores a deleted project', async () => {
        vi.spyOn(ProjectApi, 'getProjects').mockResolvedValue([projectListItem()])
        vi.spyOn(ProjectApi, 'getDeletedProjects').mockResolvedValue([deletedProject()])
        const restoreSpy = vi.spyOn(ProjectApi, 'restoreProject').mockResolvedValue(projectListItem())
        const wrapper = mountView(ProjectListView)

        await vi.waitFor(() => expect(findButton(wrapper, 'Restore')).toBeDefined())
        await findButton(wrapper, 'Restore')!.trigger('click')

        expect(restoreSpy).toHaveBeenCalledWith({ path: { projectId: 2 } })
    })

    it('invites to create the first project', async () => {
        vi.spyOn(ProjectApi, 'getProjects').mockResolvedValue([])
        vi.spyOn(ProjectApi, 'getDeletedProjects').mockResolvedValue([])
        const wrapper = mountView(ProjectListView, {}, [
            { action: 'create', subject: 'Project' },
            { action: 'read', subject: 'Project' },
        ])

        await vi.waitFor(() => expect(wrapper.text()).toContain('Create your first project'))
        expect(wrapper.findAll('button').filter((button) => button.text() === 'New project')).toHaveLength(2)
    })

    it('explains how to get access to users without memberships', async () => {
        vi.spyOn(ProjectApi, 'getProjects').mockResolvedValue([])
        vi.spyOn(ProjectApi, 'getDeletedProjects').mockResolvedValue([])
        const wrapper = mountView(ProjectListView, {}, [{ action: 'read', subject: 'Project' }])

        await vi.waitFor(() => expect(wrapper.text()).toContain("You're not in any project yet"))
        expect(findButton(wrapper, 'New project')).toBeUndefined()
    })

    it('shows a retryable error when loading fails', async () => {
        const getProjects = vi.spyOn(ProjectApi, 'getProjects').mockRejectedValue(new Error('offline'))
        vi.spyOn(ProjectApi, 'getDeletedProjects').mockResolvedValue([])
        const wrapper = mountView(ProjectListView)

        await vi.waitFor(() => expect(wrapper.text()).toContain("Couldn't load projects"))
        getProjects.mockResolvedValue([projectListItem()])
        await findButton(wrapper, 'Try again')!.trigger('click')

        await vi.waitFor(() => expect(wrapper.text()).toContain('Acme Website'))
    })
})
