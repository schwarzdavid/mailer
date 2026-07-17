<template>
    <VDialog max-width="500" v-model="model" :persistent="isPending">
        <template #activator="props">
            <slot v-bind="props" />
        </template>
        <VCard :title="t('module.users.delete.title')">
            <VCardItem>
                <VAlert v-if="errorMessage" type="error" class="mb-4" :text="errorMessage" />
                <p>{{ t('module.users.delete.confirm', { name: `${user.firstName} ${user.lastName}` }) }}</p>
            </VCardItem>
            <VCardActions>
                <VSpacer />
                <VBtn :text="t('cta.abort')" :disabled="isPending" @click="model = false" />
                <VBtn color="error" variant="elevated" :text="t('cta.delete')" :loading="isPending" @click="onDelete" />
            </VCardActions>
        </VCard>
    </VDialog>
</template>

<script setup lang="ts">
    import { ref } from 'vue'
    import type { UserDto } from 'api'
    import { useI18n } from 'vue-i18n'
    import { useUserDeleteMutation } from '@/modules/users/mutations/useUserDeleteMutation.ts'
    import { apiErrorMessage } from '@/helper/apiErrorMessage.ts'

    const props = defineProps<{ user: UserDto }>()
    const model = ref<undefined | boolean>()
    const { t } = useI18n()
    const errorMessage = ref<string | null>(null)
    const { mutateAsync, isPending } = useUserDeleteMutation()

    async function onDelete() {
        errorMessage.value = null
        try {
            await mutateAsync(props.user.userId)
            model.value = false
        } catch (error) {
            errorMessage.value = apiErrorMessage(error, t('module.users.delete.error'))
        }
    }
</script>
