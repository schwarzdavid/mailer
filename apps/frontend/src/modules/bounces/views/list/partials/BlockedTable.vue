<template>
    <VFadeTransition leave-absolute>
        <div class="d-flex flex-column gr-3 pt-6" v-if="isPending">
            <VSkeletonLoader v-for="i in 3" :key="i" type="table-heading" />
        </div>
        <p class="pt-6" v-else-if="!blocked?.length">{{ t('module.bounces.blocked.empty') }}</p>
        <div v-else>
            <VAlert v-if="errorMessage" type="error" class="mb-4" :text="errorMessage" />
            <VTable>
                <thead>
                    <tr>
                        <th>{{ t('module.bounces.blocked.fields.email') }}</th>
                        <th>{{ t('module.bounces.blocked.fields.blockedUntil') }}</th>
                        <th>{{ t('module.bounces.blocked.fields.blockCount') }}</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="block in blocked" :key="block.emailBlockId">
                        <td>{{ block.emailAddress }}</td>
                        <td>{{ block.blockedUntil?.toLocaleString() }}</td>
                        <td>{{ block.blockCount }}</td>
                        <td class="text-right">
                            <VBtn
                                size="small"
                                variant="tonal"
                                :loading="isUnblocking"
                                :text="t('module.bounces.blocked.unblock')"
                                @click="onUnblock(block.emailBlockId)"
                            />
                        </td>
                    </tr>
                </tbody>
            </VTable>
        </div>
    </VFadeTransition>
</template>

<script setup lang="ts">
    import { ref } from 'vue'
    import { useQuery } from '@tanstack/vue-query'
    import { useI18n } from 'vue-i18n'
    import { useBlockedAddressesQuery } from '@/modules/bounces/queries/useBlockedAddressesQuery.ts'
    import { useUnblockMutation } from '@/modules/bounces/mutations/useUnblockMutation.ts'
    import { apiErrorMessage } from '@/helper/apiErrorMessage.ts'

    const { data: blocked, isPending } = useQuery(useBlockedAddressesQuery())
    const { mutate: unblock, isPending: isUnblocking } = useUnblockMutation()
    const { t } = useI18n()
    const errorMessage = ref<string | null>(null)

    function onUnblock(emailBlockId: number) {
        errorMessage.value = null
        unblock(emailBlockId, {
            onError(error) {
                errorMessage.value = apiErrorMessage(error, t('module.bounces.blocked.error'))
            },
        })
    }
</script>
