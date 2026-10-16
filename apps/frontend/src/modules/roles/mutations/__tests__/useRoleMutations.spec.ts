import { afterEach, describe, expect, it, vi } from 'vitest'
import { RoleApi, type RoleCreateDto, type RoleDto, type RoleUpdateDto } from 'api'
import { useRoleCreateMutation } from '../useRoleCreateMutation.ts'
import { useRoleUpdateMutation } from '../useRoleUpdateMutation.ts'
import { useRoleDeleteMutation } from '../useRoleDeleteMutation.ts'
import { withVueQuery } from '@/__tests__/support.ts'

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

const role: RoleDto = {
    roleId: 2,
    name: 'Editor',
    type: 'custom',
    scope: 'project',
    description: null,
    assignmentCount: 0,
    permissions: ['read', 'update'],
}

const createBody: RoleCreateDto = { scope: 'project', name: 'Editor', permissions: ['read', 'update'] }
const updateBody: RoleUpdateDto = { name: 'Editor', permissions: ['read'] }

afterEach(() => {
    vi.restoreAllMocks()
})

describe('useRoleCreateMutation', () => {
    it('creates the role and refreshes everything a role can affect', async () => {
        const createSpy = vi.spyOn(RoleApi, 'createRole').mockResolvedValue(role)
        const { result, queryClient, unmount } = withVueQuery(() => useRoleCreateMutation())
        const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

        await expect(result.mutateAsync(createBody)).resolves.toEqual(role)

        expect(createSpy).toHaveBeenCalledWith({ body: createBody })
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['roles'] })
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['users'] })
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['auth.ability'] })
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['auth.permissions'] })
        unmount()
    })

    it('does not refresh when creating fails', async () => {
        vi.spyOn(RoleApi, 'createRole').mockRejectedValue(new Error('Conflict'))
        const { result, queryClient, unmount } = withVueQuery(() => useRoleCreateMutation())
        const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

        await expect(result.mutateAsync(createBody)).rejects.toThrow('Conflict')

        expect(invalidateSpy).not.toHaveBeenCalled()
        unmount()
    })
})

describe('useRoleUpdateMutation', () => {
    it('stores the updated role and refreshes everything a role can affect', async () => {
        const updateSpy = vi.spyOn(RoleApi, 'updateRole').mockResolvedValue(role)
        const { result, queryClient, unmount } = withVueQuery(() => useRoleUpdateMutation())
        const setDataSpy = vi.spyOn(queryClient, 'setQueryData')
        const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

        await result.mutateAsync({ roleId: 2, body: updateBody })

        expect(updateSpy).toHaveBeenCalledWith({ path: { roleId: 2 }, body: updateBody })
        expect(setDataSpy).toHaveBeenCalledWith(['roles', 2], role)
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['roles'] })
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['users'] })
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['auth.ability'] })
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['auth.permissions'] })
        unmount()
    })

    it('does not touch the cache when updating fails', async () => {
        vi.spyOn(RoleApi, 'updateRole').mockRejectedValue(new Error('Forbidden'))
        const { result, queryClient, unmount } = withVueQuery(() => useRoleUpdateMutation())
        const setDataSpy = vi.spyOn(queryClient, 'setQueryData')
        const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

        await expect(result.mutateAsync({ roleId: 2, body: updateBody })).rejects.toThrow('Forbidden')

        expect(setDataSpy).not.toHaveBeenCalled()
        expect(invalidateSpy).not.toHaveBeenCalled()
        unmount()
    })
})

describe('useRoleDeleteMutation', () => {
    it('deletes the role, drops its cache entry and refreshes roles and users', async () => {
        const deleteSpy = vi.spyOn(RoleApi, 'deleteRole').mockResolvedValue(undefined)
        const { result, queryClient, unmount } = withVueQuery(() => useRoleDeleteMutation())
        const removeSpy = vi.spyOn(queryClient, 'removeQueries')
        const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

        await result.mutateAsync(2)

        expect(deleteSpy).toHaveBeenCalledWith({ path: { roleId: 2 } })
        expect(removeSpy).toHaveBeenCalledWith({ queryKey: ['roles', 2] })
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['roles'] })
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['users'] })
        unmount()
    })

    it('does not touch the cache when deleting fails', async () => {
        vi.spyOn(RoleApi, 'deleteRole').mockRejectedValue(new Error('In use'))
        const { result, queryClient, unmount } = withVueQuery(() => useRoleDeleteMutation())
        const removeSpy = vi.spyOn(queryClient, 'removeQueries')
        const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

        await expect(result.mutateAsync(2)).rejects.toThrow('In use')

        expect(removeSpy).not.toHaveBeenCalled()
        expect(invalidateSpy).not.toHaveBeenCalled()
        unmount()
    })
})
