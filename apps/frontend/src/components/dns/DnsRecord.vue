<template>
    <article class="dns-record">
        <div class="dns-record__head">
            <div class="dns-record__name">
                <h3 class="dns-record__title">
                    {{ name }}
                    <TagLabel :label="record.type.toUpperCase()" mono />
                </h3>
                <span class="dns-record__purpose">{{ t(`dns.purpose.${record.use}`) }}</span>
            </div>
            <StatusBadge
                :tone="checking ? 'pending' : valid ? 'success' : 'warning'"
                :label="checking ? t('dns.checking') : valid ? t('status.valid') : t('status.invalid')"
            />
        </div>
        <dl class="dns-record__pairs">
            <div class="dns-record__pair">
                <dt>{{ t('dns.host') }}</dt>
                <dd><CopyField :value="record.host" :label="t('dns.hostFor', { name })" /></dd>
            </div>
            <div class="dns-record__pair">
                <dt>{{ t('dns.value') }}</dt>
                <dd>
                    <CopyField :value="record.value" :label="t('dns.valueFor', { name })" :clamp="isLong" />
                    <template v-if="!valid && !checking">
                        <DisclosureBox v-if="record.current" class="dns-record__current" :summary="t('dns.different')">
                            <CopyField
                                class="dns-record__found"
                                :value="record.current"
                                :label="t('dns.currentFor', { name })"
                            />
                            <p v-if="advice" class="dns-record__advice">{{ advice }}</p>
                        </DisclosureBox>
                        <p v-else class="dns-record__reason">
                            <VIcon :icon="mdiAlertOutline" size="14" aria-hidden="true" />
                            {{ record.use === 'ptr' ? t('dns.reason.ptr') : t('dns.reason.missing') }}
                        </p>
                    </template>
                </dd>
            </div>
        </dl>
    </article>
</template>

<script setup lang="ts">
    import { computed } from 'vue'
    import { useI18n } from 'vue-i18n'
    import { mdiAlertOutline } from '@mdi/js'
    import type { DomainDnsRecordDto } from 'api'
    import CopyField from '@/components/CopyField.vue'
    import DisclosureBox from '@/components/DisclosureBox.vue'
    import StatusBadge from '@/components/StatusBadge.vue'
    import TagLabel from '@/components/TagLabel.vue'

    const props = withDefaults(defineProps<{ record: DomainDnsRecordDto; checking?: boolean }>(), {
        checking: false,
    })

    const { t } = useI18n()

    const name = computed(() => {
        if (props.record.use === 'ptr') {
            return props.record.host.includes(':') ? t('dns.ptrIpv6') : t('dns.ptrIpv4')
        }
        return props.record.use.toUpperCase()
    })
    const valid = computed(() => props.record.status === 'valid')
    const isLong = computed(() => props.record.value.length > 120)
    const advice = computed(() => {
        if (props.record.use === 'ptr') {
            return t('dns.advice.ptr', { host: props.record.host, value: props.record.value })
        }
        if (props.record.use === 'spf' && props.record.current?.startsWith('v=spf1')) {
            return t('dns.advice.spf')
        }
        return t('dns.advice.replace')
    })
</script>

<style scoped>
    .dns-record {
        display: grid;
        gap: 12px;
        padding: 20px 24px;
    }

    .dns-record + .dns-record {
        border-top: 1px solid rgb(var(--v-theme-border));
    }

    .dns-record__head {
        display: flex;
        align-items: flex-start;
        flex-wrap: wrap;
        gap: 8px 12px;
    }

    .dns-record__name {
        display: grid;
        gap: 2px;
        flex: 1 1 240px;
        min-width: 0;
    }

    .dns-record__title {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 0;
        font-size: 0.875rem;
        font-weight: 600;
        line-height: 1.25rem;
    }

    .dns-record__purpose {
        color: rgb(var(--v-theme-ink-muted));
    }

    .dns-record__pairs {
        display: grid;
        gap: 8px;
        margin: 0;
    }

    .dns-record__pair {
        display: grid;
        grid-template-columns: 64px minmax(0, 1fr);
        gap: 12px;
        align-items: start;
    }

    .dns-record__pair dt {
        padding-top: 12px;
        color: rgb(var(--v-theme-ink-muted));
        font-size: 0.75rem;
        font-weight: 500;
        line-height: 1rem;
    }

    .dns-record__pair dd {
        min-width: 0;
        margin: 0;
    }

    .dns-record__current {
        margin-top: 8px;
    }

    .dns-record__found {
        background: transparent;
        border: 1px dashed rgb(var(--v-theme-border-strong));
    }

    .dns-record__advice {
        margin: 8px 0 0;
        color: rgb(var(--v-theme-ink-muted));
    }

    .dns-record__reason {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        margin: 8px 0 0;
        color: rgb(var(--v-theme-warning));
        font-size: 0.75rem;
        font-weight: 500;
        line-height: 1rem;
    }

    @media (max-width: 599.98px) {
        .dns-record {
            padding: 16px;
        }

        .dns-record__pair {
            grid-template-columns: minmax(0, 1fr);
            gap: 4px;
        }

        .dns-record__pair dt {
            padding-top: 0;
        }
    }
</style>
