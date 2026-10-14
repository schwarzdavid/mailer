<template>
    <VMenu v-if="user" :location="variant === 'avatar' ? 'bottom end' : 'top start'" :close-on-content-click="false">
        <template #activator="{ props: activator }">
            <button
                v-bind="activator"
                type="button"
                class="account-menu__trigger"
                :class="`account-menu__trigger--${variant}`"
                :aria-label="t('nav.account.open', { name: fullName })"
            >
                <UserAvatar :first-name="user.firstName" :last-name="user.lastName" />
                <template v-if="variant === 'sidebar'">
                    <span class="account-menu__who">
                        <strong>{{ fullName }}</strong>
                        <span>{{ roleLabel }}</span>
                    </span>
                    <VIcon :icon="mdiUnfoldMoreHorizontal" size="20" class="account-menu__caret" />
                </template>
            </button>
        </template>
        <div class="account-menu">
            <div class="account-menu__header">
                <strong>{{ fullName }}</strong>
                <span>{{ user.email }}</span>
            </div>
            <div class="account-menu__theme">
                <span class="account-menu__theme-label">{{ t('nav.account.theme') }}</span>
                <VBtnToggle v-model="theme" mandatory density="compact" class="account-menu__toggle" divided>
                    <VBtn
                        value="system"
                        :prepend-icon="mdiMonitor"
                        :text="t('nav.account.themes.system')"
                        size="small"
                    />
                    <VBtn
                        value="light"
                        :prepend-icon="mdiWhiteBalanceSunny"
                        :text="t('nav.account.themes.light')"
                        size="small"
                    />
                    <VBtn
                        value="dark"
                        :prepend-icon="mdiWeatherNight"
                        :text="t('nav.account.themes.dark')"
                        size="small"
                    />
                </VBtnToggle>
            </div>
            <div class="account-menu__divider" />
            <button type="button" class="account-menu__item" @click="logout">
                <VIcon :icon="mdiLogout" size="20" />
                {{ t('nav.account.logout') }}
            </button>
        </div>
    </VMenu>
</template>

<script setup lang="ts">
    import { computed } from 'vue'
    import { useI18n } from 'vue-i18n'
    import { useQuery } from '@tanstack/vue-query'
    import { mdiLogout, mdiMonitor, mdiUnfoldMoreHorizontal, mdiWeatherNight, mdiWhiteBalanceSunny } from '@mdi/js'
    import UserAvatar from '@/components/UserAvatar.vue'
    import { useAuthQuery } from '@/modules/auth/queries/useAuthQuery.ts'
    import { useLogout } from '@/composables/useLogout.ts'
    import { useThemePreference } from '@/composables/useThemePreference.ts'
    import { useRoleLabel } from '@/modules/users/composables/useRoleLabel.ts'

    const props = withDefaults(defineProps<{ rail?: boolean; avatarOnly?: boolean }>(), {
        rail: false,
        avatarOnly: false,
    })

    const { t } = useI18n()
    const { data: user } = useQuery(useAuthQuery())
    const logout = useLogout()
    const theme = useThemePreference()
    const roleLabel = useRoleLabel(() => user.value?.role)

    const variant = computed(() => (props.avatarOnly ? 'avatar' : props.rail ? 'rail' : 'sidebar'))
    const fullName = computed(() => (user.value ? `${user.value.firstName} ${user.value.lastName}` : ''))
</script>

<style scoped>
    .account-menu__trigger {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 8px;
        border: 0;
        border-radius: 6px;
        background: transparent;
        color: rgb(var(--v-theme-ink));
        text-align: left;
        cursor: pointer;
    }

    .account-menu__trigger:hover {
        background: rgb(var(--v-theme-surface-hover));
    }

    .account-menu__trigger:focus-visible {
        outline: 2px solid rgb(var(--v-theme-focus));
        outline-offset: 2px;
    }

    .account-menu__trigger--sidebar {
        margin: 8px 12px 12px;
    }

    .account-menu__trigger--rail {
        justify-content: center;
        margin: 8px auto 12px;
    }

    .account-menu__trigger--avatar {
        padding: 6px;
    }

    .account-menu__who {
        display: grid;
        flex: 1;
        min-width: 0;
    }

    .account-menu__who strong {
        overflow: hidden;
        font-weight: 500;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .account-menu__who span {
        color: rgb(var(--v-theme-ink-muted));
        font-size: 0.75rem;
        line-height: 1rem;
    }

    .account-menu__caret {
        color: rgb(var(--v-theme-ink-muted));
    }

    .account-menu {
        min-width: 260px;
        padding: 4px;
        border: 1px solid rgb(var(--v-theme-border));
        border-radius: 10px;
        background: rgb(var(--v-theme-surface-overlay));
    }

    .account-menu__header {
        display: grid;
        padding: 10px 12px;
    }

    .account-menu__header span {
        color: rgb(var(--v-theme-ink-muted));
        font-size: 0.75rem;
        line-height: 1rem;
        overflow-wrap: anywhere;
    }

    .account-menu__theme {
        display: grid;
        gap: 6px;
        padding: 4px 12px 12px;
    }

    .account-menu__theme-label {
        color: rgb(var(--v-theme-ink-muted));
        font-size: 0.75rem;
        font-weight: 500;
        line-height: 1rem;
    }

    .account-menu__toggle {
        border: 1px solid rgb(var(--v-theme-border-strong));
    }

    .account-menu__toggle :deep(.v-btn--active) {
        background: rgb(var(--v-theme-primary-container));
        color: rgb(var(--v-theme-on-primary-container));
    }

    .account-menu__divider {
        height: 1px;
        margin: 4px 0;
        background: rgb(var(--v-theme-border));
    }

    .account-menu__item {
        display: flex;
        align-items: center;
        gap: 12px;
        width: 100%;
        height: 40px;
        padding: 0 12px;
        border: 0;
        border-radius: 6px;
        background: transparent;
        color: rgb(var(--v-theme-ink));
        font-weight: 500;
        cursor: pointer;
    }

    .account-menu__item:hover {
        background: rgb(var(--v-theme-surface-hover));
    }
</style>
