import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import type { UserDto } from 'api'
import { useConfirm } from '@/composables/useConfirm.ts'
import { useNotify } from '@/composables/useNotify.ts'
import { useUserDeleteMutation } from '@/modules/users/mutations/useUserDeleteMutation.ts'
import { RouteNames } from '@/router/RouteNames.ts'

export function useDeleteUser() {
    const { t } = useI18n()
    const confirm = useConfirm()
    const notify = useNotify()
    const router = useRouter()
    const { mutateAsync } = useUserDeleteMutation()

    return async function deleteUser(
        user: Pick<UserDto, 'userId' | 'firstName' | 'lastName'>,
        projectCount: number,
        returnToList: boolean,
    ) {
        const name = `${user.firstName} ${user.lastName}`
        const confirmed = await confirm({
            title: t('module.users.delete.confirmTitle', { name }),
            body: t('module.users.delete.confirmBody', { name, count: projectCount }, projectCount),
            confirmLabel: t('module.users.delete.confirm'),
            destructive: true,
            errorText: t('module.users.delete.error'),
            action: () => mutateAsync(user.userId),
        })
        if (!confirmed) {
            return false
        }
        if (returnToList) {
            await router.push({ name: RouteNames.USER_LIST })
        }
        notify.success(t('module.users.delete.done', { name }))
        return true
    }
}
