<template>
    <SectionCard
        :title="t('module.dashboard.attention.title')"
        :description="items.length ? t('module.dashboard.attention.description') : undefined"
        :count="items.length || undefined"
        flush
    >
        <ListSkeleton v-if="loading" :rows="2" />
        <EmptyState
            v-else-if="items.length === 0"
            tone="success"
            :icon="mdiCheckCircleOutline"
            :title="t('module.dashboard.attention.empty.title')"
            :text="t('module.dashboard.attention.empty.text')"
        />
        <template v-else>
            <ListRow
                v-for="item in shownItems"
                :key="item.key"
                :icon="item.icon"
                :lead-tone="item.tone"
                :title="item.title"
                :subtitle="item.subtitle"
                :to="item.to"
            >
                <template #meta>
                    <StatusBadge :tone="item.badgeTone" :label="item.badge" />
                </template>
            </ListRow>
            <div v-if="items.length > shownItems.length" class="attention__more">
                <VBtn
                    variant="text"
                    size="small"
                    :text="t('module.dashboard.attention.showAll', { count: items.length })"
                    @click="expanded = true"
                />
            </div>
        </template>
    </SectionCard>
</template>

<script setup lang="ts">
    import { computed, ref } from 'vue'
    import { useI18n } from 'vue-i18n'
    import { useDisplay } from 'vuetify'
    import type { RouteLocationRaw } from 'vue-router'
    import { mdiAlertOutline, mdiCheckCircleOutline, mdiCloseOctagonOutline, mdiCodeTags, mdiWeb } from '@mdi/js'
    import EmptyState from '@/components/EmptyState.vue'
    import ListRow from '@/components/ListRow.vue'
    import SectionCard from '@/components/SectionCard.vue'
    import StatusBadge from '@/components/StatusBadge.vue'
    import ListSkeleton from '@/components/skeletons/ListSkeleton.vue'
    import type { StatusTone } from '@/components/statusTone.ts'
    import { useDates } from '@/composables/useDates.ts'
    import type { useDashboardData } from '@/modules/dashboard/composables/useDashboardData.ts'
    import { domainRecords, useDomainStatus } from '@/modules/domains/helpers/domainStatus.ts'
    import { needsTemplate } from '@/modules/inbound-forms/helpers/receiverStatus.ts'
    import { RouteNames } from '@/router/RouteNames.ts'

    interface AttentionItem {
        key: string
        icon: string
        tone: 'warning' | 'error'
        title: string
        subtitle: string
        to: RouteLocationRaw
        badge: string
        badgeTone: StatusTone
    }

    const props = defineProps<{ data: ReturnType<typeof useDashboardData> }>()

    const { t } = useI18n()
    const { xs } = useDisplay()
    const dates = useDates()
    const domainStatus = useDomainStatus()
    const expanded = ref(false)

    const loading = computed(() => props.data.forms.isPending.value || props.data.projects.isPending.value)

    const items = computed<AttentionItem[]>(() => {
        const result: AttentionItem[] = []
        const health = props.data.health
        if (health.needsAttention.value) {
            const invalid = health.records.value.filter((record) => record.status !== 'valid')
            const fqdn = health.query.data.value?.sendingDomain?.fqdn
            result.push({
                key: 'sending-domain',
                icon: mdiAlertOutline,
                tone: 'warning',
                title: health.configured.value
                    ? t('module.dashboard.attention.sendingRecords', { count: invalid.length }, invalid.length)
                    : t('module.dashboard.attention.sendingMissing'),
                subtitle: health.configured.value
                    ? t('module.dashboard.attention.sendingSubtitle', {
                          names: invalid.map((record) => record.use.toUpperCase()).join(', '),
                          fqdn,
                      })
                    : t('nav.settings'),
                to: { name: RouteNames.SETTINGS },
                badge: domainStatus.badge(health.records.value).label,
                badgeTone: 'warning',
            })
        }
        for (const domain of props.data.invalidDomains.value) {
            const projects = [...(props.data.domainProjects.value.get(domain.domainId) ?? [])]
            result.push({
                key: `domain-${domain.domainId}`,
                icon: mdiWeb,
                tone: 'warning',
                title: t('module.dashboard.attention.domainCantSend', { fqdn: domain.fqdn }),
                subtitle: [domainStatus.invalidSummary(domainRecords(domain)), ...projects].filter(Boolean).join(' · '),
                to: { name: RouteNames.DOMAIN_DETAILS, params: { domainId: domain.domainId } },
                badge: domainStatus.domainBadge(domain).label,
                badgeTone: 'warning',
            })
        }
        for (const form of props.data.forms.data.value ?? []) {
            for (const receiver of form.receivers.filter(needsTemplate)) {
                result.push({
                    key: `receiver-${receiver.inboundFormReceiverId}`,
                    icon: mdiCodeTags,
                    tone: 'warning',
                    title: t('module.dashboard.attention.noTemplate'),
                    subtitle: [receiver.emailReceiver, form.name, props.data.projectNames.value.get(form.projectId)]
                        .filter(Boolean)
                        .join(' · '),
                    to: {
                        name: RouteNames.INBOUND_FORM_TEMPLATE,
                        params: {
                            inboundFormId: form.inboundFormId,
                            inboundFormReceiverId: receiver.inboundFormReceiverId,
                        },
                    },
                    badge: t('status.noTemplate'),
                    badgeTone: 'warning',
                })
            }
        }
        const permanent = props.data.permanentBounces.data.value
        if (permanent && permanent.total > 0) {
            const latest = permanent.items[0]
            result.push({
                key: 'bounces',
                icon: mdiCloseOctagonOutline,
                tone: 'error',
                title: t('module.dashboard.attention.permanentBounces', { count: permanent.total }, permanent.total),
                subtitle: latest
                    ? t('module.dashboard.attention.latestBounce', {
                          email: latest.emailAddress,
                          time: dates.smart(latest.receivedAt),
                      })
                    : '',
                to: { name: RouteNames.BOUNCE_LIST },
                badge: t('status.permanent'),
                badgeTone: 'error',
            })
        }
        return result
    })

    const shownItems = computed(() => (xs.value && !expanded.value ? items.value.slice(0, 3) : items.value))
</script>

<style scoped>
    .attention__more {
        padding: 4px 16px 8px;
    }
</style>
