<template>
    <nav class="setup-stepper" :aria-label="t('module.setup.stepper.label')">
        <ol class="setup-stepper__full">
            <li v-for="(step, index) in steps" :key="step.key">
                <component
                    :is="step.clickable ? 'button' : 'span'"
                    :type="step.clickable ? 'button' : undefined"
                    class="setup-stepper__step"
                    :class="`setup-stepper__step--${step.state}`"
                    :aria-current="step.state === 'current' ? 'step' : undefined"
                    @click="step.clickable ? emit('select', step.key) : undefined"
                >
                    <span class="setup-stepper__mark">
                        <VIcon v-if="step.state === 'done'" :icon="mdiCheck" size="16" />
                        <template v-else>{{ index + 1 }}</template>
                    </span>
                    {{ step.title }}
                </component>
                <VIcon v-if="index < steps.length - 1" :icon="mdiChevronRight" size="18" class="setup-stepper__sep" />
            </li>
        </ol>
        <div class="setup-stepper__compact">
            <span>{{
                t('module.setup.stepper.compact', {
                    current: currentIndex + 1,
                    total: steps.length,
                    title: currentTitle,
                })
            }}</span>
            <span class="setup-stepper__bar"
                ><span :style="{ width: `${((currentIndex + 1) / steps.length) * 100}%` }"
            /></span>
        </div>
    </nav>
</template>

<script setup lang="ts">
    import { computed } from 'vue'
    import { useI18n } from 'vue-i18n'
    import { mdiCheck, mdiChevronRight } from '@mdi/js'
    import type { SetupStepKey } from '@/modules/onboarding/components/setupStep.ts'

    const props = defineProps<{ current: SetupStepKey; reached: SetupStepKey }>()
    const emit = defineEmits<{ select: [step: SetupStepKey] }>()

    const { t } = useI18n()
    const order: SetupStepKey[] = ['account', 'sendingDomain', 'records']

    const currentIndex = computed(() => order.indexOf(props.current))
    const currentTitle = computed(() => t(`module.setup.steps.${props.current}`))

    const steps = computed(() =>
        order.map((key, index) => ({
            key,
            title: t(`module.setup.steps.${key}`),
            clickable: key !== 'account' && key !== props.current && index <= order.indexOf(props.reached),
            state: key === props.current ? 'current' : index < order.indexOf(props.reached) ? 'done' : 'upcoming',
        })),
    )
</script>

<style scoped>
    .setup-stepper__full {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 4px;
        margin: 0;
        padding: 0;
        list-style: none;
    }

    .setup-stepper__full li {
        display: inline-flex;
        align-items: center;
        gap: 4px;
    }

    .setup-stepper__step {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        height: 36px;
        padding: 0 12px 0 6px;
        border: 0;
        border-radius: 9999px;
        background: transparent;
        color: rgb(var(--v-theme-ink-muted));
        font-size: 0.875rem;
        font-weight: 500;
    }

    button.setup-stepper__step {
        cursor: pointer;
    }

    button.setup-stepper__step:hover {
        background: rgb(var(--v-theme-surface-hover));
        color: rgb(var(--v-theme-ink));
    }

    .setup-stepper__step--current {
        background: rgb(var(--v-theme-primary-container));
        color: rgb(var(--v-theme-on-primary-container));
        font-weight: 600;
    }

    .setup-stepper__mark {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        border: 1.5px solid rgb(var(--v-theme-border-strong));
        border-radius: 9999px;
        font-size: 0.75rem;
        font-weight: 600;
    }

    .setup-stepper__step--done .setup-stepper__mark {
        border-color: rgb(var(--v-theme-ink));
        background: rgb(var(--v-theme-ink));
        color: rgb(var(--v-theme-surface));
    }

    .setup-stepper__step--current .setup-stepper__mark {
        border-color: rgb(var(--v-theme-on-primary-container));
    }

    .setup-stepper__sep {
        color: rgb(var(--v-theme-ink-muted));
    }

    .setup-stepper__compact {
        display: none;
        gap: 8px;
        color: rgb(var(--v-theme-ink-muted));
        font-size: 0.6875rem;
        font-weight: 600;
        line-height: 1rem;
        letter-spacing: 0.04em;
        text-transform: uppercase;
    }

    .setup-stepper__bar {
        display: block;
        height: 4px;
        border-radius: 9999px;
        background: rgb(var(--v-theme-surface-sunken));
        overflow: hidden;
    }

    .setup-stepper__bar span {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: rgb(var(--v-theme-ink));
    }

    @media (max-width: 599.98px) {
        .setup-stepper__full {
            display: none;
        }

        .setup-stepper__compact {
            display: grid;
        }
    }
</style>
