<template>
    <VMain class="setup">
        <header class="setup__bar">
            <AppLogo wordmark />
            <div v-if="user" class="setup__who">
                <span class="setup__signed-in">{{
                    t('module.setup.signedInAs', { name: `${user.firstName} ${user.lastName}` })
                }}</span>
                <VBtn class="setup__logout" variant="text" :text="t('nav.account.logout')" @click="logout" />
                <IconButton
                    class="setup__logout-icon"
                    :icon="mdiLogout"
                    :label="t('nav.account.logout')"
                    @click="logout"
                />
            </div>
        </header>
        <div class="setup__main">
            <SetupStepper :current="current" :reached="reached" @select="viewing = $event" />
            <div class="setup__intro">
                <h1>{{ t(`module.setup.intro.${current}.title`) }}</h1>
                <p>{{ t(`module.setup.intro.${current}.lead`) }}</p>
            </div>
            <ErrorState v-if="statusError" size="page" :thing="t('module.setup.thing')" @retry="refetchStatus()" />
            <OnboardingAccountStep v-else-if="current === 'account'" @completed="viewing = null" />
            <SendingDomainCard
                v-else-if="current === 'sendingDomain'"
                mode="setup"
                :sending-domain="settings?.sendingDomain ?? null"
                @saved="onDomainSaved"
            />
            <template v-else-if="current === 'records'">
                <OnboardingRecordsStep
                    v-if="settings?.sendingDomain"
                    :sending-domain="settings.sendingDomain"
                    @back="viewing = 'sendingDomain'"
                    @completed="finish"
                />
                <SectionCard v-else :title="t('dns.title')" flush>
                    <DnsRecordSkeleton />
                </SectionCard>
            </template>
        </div>
        <footer class="setup__footer">{{ t('app.copyright', { year }) }}</footer>
    </VMain>
</template>

<script lang="ts" setup>
    import { computed, ref } from 'vue'
    import { useI18n } from 'vue-i18n'
    import { useRouter } from 'vue-router'
    import { useTitle } from '@vueuse/core'
    import { useQuery, useQueryClient } from '@tanstack/vue-query'
    import { mdiLogout } from '@mdi/js'
    import type { SetupStatusDto } from 'api'
    import AppLogo from '@/components/AppLogo.vue'
    import ErrorState from '@/components/ErrorState.vue'
    import IconButton from '@/components/IconButton.vue'
    import SectionCard from '@/components/SectionCard.vue'
    import DnsRecordSkeleton from '@/components/skeletons/DnsRecordSkeleton.vue'
    import { useLogout } from '@/composables/useLogout.ts'
    import { useAuthQuery } from '@/modules/auth/queries/useAuthQuery.ts'
    import SetupStepper from '@/modules/onboarding/components/SetupStepper.vue'
    import type { SetupStepKey } from '@/modules/onboarding/components/setupStep.ts'
    import { useSetupStatusQuery } from '@/modules/onboarding/queries/useSetupStatusQuery.ts'
    import OnboardingAccountStep from '@/modules/onboarding/views/partials/OnboardingAccountStep.vue'
    import OnboardingRecordsStep from '@/modules/onboarding/views/partials/OnboardingRecordsStep.vue'
    import SendingDomainCard from '@/modules/settings/components/SendingDomainCard.vue'
    import { useSettingsQuery } from '@/modules/settings/queries/useSettingsQuery.ts'
    import { RouteNames } from '@/router/RouteNames.ts'

    const { t } = useI18n()
    const router = useRouter()
    const client = useQueryClient()
    const logout = useLogout()
    const year = new Date().getFullYear()
    const viewing = ref<SetupStepKey | null>(null)

    const { data: status, isError: statusError, refetch: refetchStatus } = useQuery(useSetupStatusQuery())
    const reached = computed<SetupStepKey>(() => {
        const step = status.value?.step
        if (step === 'finished') {
            return 'records'
        }
        return step === 'sendingDomain' || step === 'records' ? step : 'account'
    })
    const current = computed<SetupStepKey>(() => viewing.value ?? reached.value)
    const signedIn = computed(() => reached.value !== 'account')

    const { queryKey: authKey, queryFn: authFn } = useAuthQuery()
    const { data: user } = useQuery({ queryKey: authKey, queryFn: authFn, enabled: signedIn })
    const { queryKey: settingsKey, queryFn: settingsFn } = useSettingsQuery()
    const { data: settings } = useQuery({ queryKey: settingsKey, queryFn: settingsFn, enabled: signedIn })

    useTitle(() => t('app.documentTitle', { page: t('module.setup.title') }))

    function onDomainSaved() {
        viewing.value = null
        client.setQueryData<SetupStatusDto>(['setup.status'], { needsSetup: true, step: 'records' })
    }

    async function finish() {
        await router.push({ name: RouteNames.DASHBOARD })
    }
</script>

<style scoped>
    .setup {
        min-height: 100dvh;
        background: rgb(var(--v-theme-background));
    }

    .setup__bar {
        display: flex;
        align-items: center;
        gap: 8px;
        height: 64px;
        padding: 0 32px;
        border-bottom: 1px solid rgb(var(--v-theme-border));
        background: rgb(var(--v-theme-surface));
    }

    .setup__who {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-left: auto;
        color: rgb(var(--v-theme-ink-muted));
    }

    .setup__logout-icon {
        display: none;
    }

    .setup__main {
        display: grid;
        align-content: start;
        gap: 24px;
        width: 100%;
        max-width: 760px;
        margin: 0 auto;
        padding: 48px 24px 64px;
    }

    .setup__intro {
        display: grid;
        gap: 4px;
    }

    .setup__intro h1 {
        margin: 0;
        font-size: 1.5rem;
        font-weight: 600;
        line-height: 2rem;
        letter-spacing: -0.01em;
    }

    .setup__intro p {
        margin: 0;
        color: rgb(var(--v-theme-ink-muted));
        font-size: 1rem;
        line-height: 1.5rem;
    }

    .setup__footer {
        padding: 0 16px 24px;
        color: rgb(var(--v-theme-ink-muted));
        font-size: 0.75rem;
        line-height: 1rem;
        text-align: center;
    }

    @media (max-width: 599.98px) {
        .setup__bar {
            padding: 0 8px 0 16px;
        }

        .setup__signed-in,
        .setup__logout {
            display: none;
        }

        .setup__logout-icon {
            display: inline-flex;
        }

        .setup__main {
            padding: 24px 16px 48px;
        }
    }
</style>
