<template>
    <VMain class="bg-primary d-flex align-center justify-center">
        <VCard elevation="1" width="800" max-width="calc(100% - 32px)">
            <VStepper v-model="step" flat>
                <VStepperHeader>
                    <template v-for="(item, index) in steps" :key="item.key">
                        <VDivider v-if="index > 0" />
                        <VStepperItem :value="index + 1" :title="t(item.title)" />
                    </template>
                </VStepperHeader>
                <VStepperWindow>
                    <VStepperWindowItem :value="1">
                        <OnboardingAccountStep @completed="step = 2" />
                    </VStepperWindowItem>
                    <VStepperWindowItem :value="2">
                        <OnboardingDomainStep @completed="step = 3" />
                    </VStepperWindowItem>
                    <VStepperWindowItem :value="3">
                        <OnboardingRecordsStep @completed="finish" />
                    </VStepperWindowItem>
                </VStepperWindow>
            </VStepper>
        </VCard>
    </VMain>
</template>

<script lang="ts" setup>
    import { ref } from 'vue'
    import { useI18n } from 'vue-i18n'
    import { useRouter } from 'vue-router'
    import { RouteNames } from '@/router/RouteNames.ts'
    import OnboardingAccountStep from './partials/OnboardingAccountStep.vue'
    import OnboardingDomainStep from './partials/OnboardingDomainStep.vue'
    import OnboardingRecordsStep from './partials/OnboardingRecordsStep.vue'

    const { t } = useI18n()
    const router = useRouter()

    const step = ref(1)
    const steps = [
        { key: 'account', title: 'module.onboarding.steps.account.title' },
        { key: 'domain', title: 'module.onboarding.steps.domain.title' },
        { key: 'records', title: 'module.onboarding.steps.records.title' },
    ]

    function finish() {
        void router.push({ name: RouteNames.DASHBOARD })
    }
</script>
