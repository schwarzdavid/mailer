<template>
    <VCard :title="t('module.users.details.permissions.title')" class="permissions-card">
        <VCardItem>
            <VAlert v-if="errorMessage" type="error" class="mb-4" :text="errorMessage" />
            <p class="mb-4">{{ t('module.users.details.permissions.intro') }}</p>
            <div class="d-flex flex-wrap ga-6">
                <div v-for="(groupPermissions, group) in PERMISSION_GROUPS" :key="group">
                    <div class="text-subtitle-2">{{ t(`permissions.groups.${group}`) }}</div>
                    <VCheckbox
                        v-for="permission in groupPermissions"
                        :key="permission"
                        v-model="selected"
                        :value="permission"
                        :label="t(`permissions.labels.${permission.replace('.', '_')}`)"
                        :disabled="!canEdit"
                        density="compact"
                        hide-details
                    />
                </div>
            </div>
        </VCardItem>
        <VCardActions v-if="canEdit">
            <VSpacer />
            <VBtn color="primary" variant="elevated" :text="t('cta.save')" :loading="isPending" @click="onSave" />
        </VCardActions>
    </VCard>
</template>

<script setup lang="ts">
    import { computed, ref } from 'vue'
    import { useI18n } from 'vue-i18n'
    import { useAbility } from '@casl/vue'
    import { subject } from '@casl/ability'
    import type { Permission, UserDetailDto } from 'api'
    import { PERMISSION_GROUPS } from '@/modules/users/permissionGroups.ts'
    import { useUserPermissionsMutation } from '@/modules/users/mutations/useUserPermissionsMutation.ts'
    import { apiErrorMessage } from '@/helper/apiErrorMessage.ts'

    const props = defineProps<{ user: UserDetailDto }>()
    const { t } = useI18n()
    const userAbility = useAbility()
    const can = userAbility.can.bind(userAbility)
    const errorMessage = ref<string | null>(null)
    const selected = ref<Permission[]>([...props.user.permissions])
    const { mutateAsync, isPending } = useUserPermissionsMutation()

    const canEdit = computed(() => can('update', subject('User', { ...props.user })))

    async function onSave() {
        errorMessage.value = null
        try {
            await mutateAsync({ userId: props.user.userId, permissions: selected.value })
        } catch (error) {
            errorMessage.value = apiErrorMessage(error, t('module.users.details.permissions.error'))
        }
    }
</script>
