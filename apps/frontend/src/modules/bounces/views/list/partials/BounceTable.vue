<template>
    <VFadeTransition leave-absolute>
        <div class="d-flex flex-column gr-3 pt-6" v-if="isPending">
            <VSkeletonLoader v-for="i in 3" :key="i" type="table-heading" />
        </div>
        <p class="pt-6" v-else-if="!bounces?.length">{{ t('module.bounces.list.empty') }}</p>
        <VTable v-else>
            <thead>
                <tr>
                    <th>{{ t('module.bounces.list.fields.email') }}</th>
                    <th>{{ t('module.bounces.list.fields.type') }}</th>
                    <th>{{ t('module.bounces.list.fields.statusCode') }}</th>
                    <th>{{ t('module.bounces.list.fields.reason') }}</th>
                    <th>{{ t('module.bounces.list.fields.receivedAt') }}</th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="bounce in bounces" :key="bounce.bounceId">
                    <td>{{ bounce.emailAddress }}</td>
                    <td>
                        <VChip
                            :color="bounce.type === 'permanent' ? 'error' : 'warning'"
                            :text="t(`module.bounces.list.typeOptions.${bounce.type}`)"
                            size="small"
                        />
                    </td>
                    <td>{{ bounce.statusCode }}</td>
                    <td>{{ bounce.reason }}</td>
                    <td>{{ bounce.receivedAt.toLocaleString() }}</td>
                </tr>
            </tbody>
        </VTable>
    </VFadeTransition>
</template>

<script setup lang="ts">
    import { useQuery } from '@tanstack/vue-query'
    import { useI18n } from 'vue-i18n'
    import { useBouncesQuery } from '@/modules/bounces/queries/useBouncesQuery.ts'

    const { data: bounces, isPending } = useQuery(useBouncesQuery())
    const { t } = useI18n()
</script>
