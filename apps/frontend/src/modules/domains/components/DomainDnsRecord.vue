<template>
    <VRow class="font-weight-bold">
        <VCol cols="2">{{ t('module.domains.dns.fields.status') }}</VCol>
        <VCol cols="1">{{ t('module.domains.dns.fields.type') }}</VCol>
        <VCol cols="4">{{ t('module.domains.dns.fields.host') }}</VCol>
        <VCol cols="4">{{ t('module.domains.dns.fields.value') }}</VCol>
    </VRow>
    <VRow align="center" class="mt-1">
        <VCol cols="2">
            <VChip
                v-if="record.status === 'valid'"
                color="success"
                :text="t('module.domains.status.valid')"
                prepend-icon="mdi-check"
            />
            <VChip v-else color="warning" :text="t('module.domains.status.invalid')" prepend-icon="mdi-alert" />
        </VCol>
        <VCol cols="1">{{ record.type.toUpperCase() }}</VCol>
        <VCol cols="4">
            <VTextField
                :model-value="record.host"
                readonly
                density="compact"
                class="dns-record-field"
                hide-details
                @focus="selectText"
            >
                <template #append-inner v-if="isSupported">
                    <VIconBtn
                        icon="mdi-clipboard-outline"
                        active-icon="mdi-clipboard-check-outline"
                        icon-size="small"
                        v-tooltip:start="{ text: t(copyHostTooltip) }"
                        @click.stop="copyHost"
                    />
                </template>
            </VTextField>
        </VCol>
        <VCol cols="4">
            <VTextField
                :model-value="record.value"
                readonly
                density="compact"
                class="dns-record-field"
                hide-details
                @focus="selectText"
            >
                <template #append-inner v-if="isSupported">
                    <VIconBtn
                        icon="mdi-clipboard-outline"
                        active-icon="mdi-clipboard-check-outline"
                        icon-size="small"
                        v-tooltip:start="{ text: t(copyValueTooltip) }"
                        @click.stop="copyValue"
                    />
                </template>
            </VTextField>
        </VCol>
        <VCol cols="1">
            <VMenu location="bottom end" offset="8">
                <template #activator="{ props }">
                    <VIconBtn v-bind="props" icon="mdi-dots-vertical" icon-size="small" />
                </template>
                <VList density="compact" elevation="1">
                    <VListItem title="Show current" />
                </VList>
            </VMenu>
        </VCol>
    </VRow>
</template>

<script lang="ts" setup>
    import type { DomainDnsRecordDto } from 'api'
    import { useI18n } from 'vue-i18n'
    import { refAutoReset, useClipboard } from '@vueuse/core'

    const props = defineProps<{
        record: DomainDnsRecordDto
    }>()

    const { t } = useI18n()
    const { copy, isSupported } = useClipboard()
    const copyHostTooltip = refAutoReset('cta.copy.default', 2000)
    const copyValueTooltip = refAutoReset('cta.copy.default', 2000)

    async function copyHost() {
        await copy(props.record.host)
        copyHostTooltip.value = 'cta.copy.success'
    }

    async function copyValue() {
        await copy(props.record.value)
        copyValueTooltip.value = 'cta.copy.success'
    }

    function selectText(event: FocusEvent) {
        if (event.target instanceof HTMLInputElement) {
            event.target.select()
        }
    }
</script>

<style lang="scss" scoped>
    .dns-record-field {
        :deep(.v-field--appended) {
            padding-right: 0;
        }

        :deep(.v-field) {
            font-size: 0.75rem;
        }
    }
</style>
