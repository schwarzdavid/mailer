import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProjectApi } from 'api'
import { useProjectDomainAssignMutation } from '../useProjectDomainAssignMutation.ts'
import { useProjectDomainUnassignMutation } from '../useProjectDomainUnassignMutation.ts'
import { withVueQuery } from '@/__tests__/support.ts'

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

afterEach(() => {
    vi.restoreAllMocks()
})

describe('useProjectDomainAssignMutation', () => {
    it('assigns the domain to the project and refreshes project queries', async () => {
        const assignSpy = vi.spyOn(ProjectApi, 'assignProjectDomain').mockResolvedValue(undefined)
        const { result, queryClient, unmount } = withVueQuery(() => useProjectDomainAssignMutation())
        const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

        await result.mutateAsync({ projectId: 1, domainId: 3 })

        expect(assignSpy).toHaveBeenCalledWith({ path: { projectId: 1 }, body: { domainId: 3 } })
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['projects'] })
        unmount()
    })

    it('does not refresh when the assignment fails', async () => {
        vi.spyOn(ProjectApi, 'assignProjectDomain').mockRejectedValue(new Error('Already assigned'))
        const { result, queryClient, unmount } = withVueQuery(() => useProjectDomainAssignMutation())
        const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

        await expect(result.mutateAsync({ projectId: 1, domainId: 3 })).rejects.toThrow('Already assigned')

        expect(invalidateSpy).not.toHaveBeenCalled()
        unmount()
    })
})

describe('useProjectDomainUnassignMutation', () => {
    it('unassigns the domain from the project and refreshes project queries', async () => {
        const unassignSpy = vi.spyOn(ProjectApi, 'unassignProjectDomain').mockResolvedValue(undefined)
        const { result, queryClient, unmount } = withVueQuery(() => useProjectDomainUnassignMutation())
        const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

        await result.mutateAsync({ projectId: 1, domainId: 3 })

        expect(unassignSpy).toHaveBeenCalledWith({ path: { projectId: 1, domainId: 3 } })
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['projects'] })
        unmount()
    })
})
