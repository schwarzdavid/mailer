import { createRouter, createWebHistory } from 'vue-router'
import AuthLayout from '@/modules/auth/layouts/AuthLayout.vue'
import LoginView from '@/modules/auth/views/LoginView.vue'
import { RouteNames } from '@/router/RouteNames.ts'
import AppLayout from '@/modules/dashboard/layouts/AppLayout.vue'
import DashboardView from '@/modules/dashboard/views/DashboardView.vue'
import DomainListView from '@/modules/domains/views/list/DomainListView.vue'
import { useAuthQuery } from '@/modules/auth/queries/useAuthQuery.ts'
import { useAbilityQuery } from '@/modules/auth/queries/useAbilityQuery.ts'
import { useSetupStatusQuery } from '@/modules/onboarding/queries/useSetupStatusQuery.ts'
import { queryClient } from '@/plugins/tanstack.ts'
import { ability } from '@/plugins/casl.ts'
import DomainDetailView from '@/modules/domains/views/details/DomainDetailView.vue'
import ProjectListView from '@/modules/projects/views/list/ProjectListView.vue'
import ProjectDetailView from '@/modules/projects/views/details/ProjectDetailView.vue'
import InboundFormDetailView from '@/modules/inbound-forms/views/details/InboundFormDetailView.vue'
import InboundFormTemplateView from '@/modules/inbound-forms/views/template/InboundFormTemplateView.vue'
import BounceListView from '@/modules/bounces/views/list/BounceListView.vue'
import SettingsView from '@/modules/settings/views/SettingsView.vue'
import OnboardingView from '@/modules/onboarding/views/OnboardingView.vue'
import UserListView from '@/modules/users/views/list/UserListView.vue'
import UserDetailView from '@/modules/users/views/details/UserDetailView.vue'

declare module 'vue-router' {
    interface RouteMeta {
        requiresAuth?: boolean
        ability?: { action: string; subject: string }
    }
}

export const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes: [
        {
            path: '/onboarding',
            name: RouteNames.ONBOARDING,
            component: OnboardingView,
        },
        {
            path: '/login',
            component: AuthLayout,
            children: [
                {
                    path: '',
                    component: LoginView,
                    name: RouteNames.LOGIN,
                },
            ],
        },
        {
            path: '/',
            component: AppLayout,
            children: [
                {
                    path: '',
                    name: RouteNames.DASHBOARD,
                    component: DashboardView,
                },
                {
                    path: '/domains',
                    name: RouteNames.DOMAIN_LIST,
                    component: DomainListView,
                    meta: { ability: { action: 'read', subject: 'Domain' } },
                },
                {
                    path: '/domains/:domainId',
                    name: RouteNames.DOMAIN_DETAILS,
                    component: DomainDetailView,
                    meta: { ability: { action: 'read', subject: 'Domain' } },
                },
                {
                    path: '/projects',
                    name: RouteNames.PROJECT_LIST,
                    component: ProjectListView,
                },
                {
                    path: '/projects/:projectId',
                    name: RouteNames.PROJECT_DETAILS,
                    component: ProjectDetailView,
                },
                {
                    path: '/forms/:inboundFormId',
                    name: RouteNames.INBOUND_FORM_DETAILS,
                    component: InboundFormDetailView,
                },
                {
                    path: '/forms/:inboundFormId/receivers/:inboundFormReceiverId/template',
                    name: RouteNames.INBOUND_FORM_TEMPLATE,
                    component: InboundFormTemplateView,
                },
                {
                    path: '/bounces',
                    name: RouteNames.BOUNCE_LIST,
                    component: BounceListView,
                    meta: { ability: { action: 'read', subject: 'Bounce' } },
                },
                {
                    path: '/settings',
                    name: RouteNames.SETTINGS,
                    component: SettingsView,
                    meta: { ability: { action: 'read', subject: 'Settings' } },
                },
                {
                    path: '/users',
                    name: RouteNames.USER_LIST,
                    component: UserListView,
                    meta: { ability: { action: 'read', subject: 'User' } },
                },
                {
                    path: '/users/:userId',
                    name: RouteNames.USER_DETAILS,
                    component: UserDetailView,
                    meta: { ability: { action: 'read', subject: 'User' } },
                },
            ],
            meta: {
                requiresAuth: true,
            },
        },
    ],
})

router.beforeEach(async (to) => {
    let needsSetup = false
    try {
        needsSetup = (await queryClient.fetchQuery(useSetupStatusQuery())).needsSetup
    } catch (err) {
        console.error(err)
    }

    if (needsSetup && to.name !== RouteNames.ONBOARDING) {
        return { name: RouteNames.ONBOARDING }
    }
    if (!needsSetup && to.name === RouteNames.ONBOARDING) {
        return { name: RouteNames.DASHBOARD }
    }
    if (!to.meta.requiresAuth) {
        return true
    }

    try {
        await queryClient.fetchQuery(useAuthQuery())
    } catch (err) {
        console.error(err)
        return { name: RouteNames.LOGIN }
    }

    try {
        await queryClient.fetchQuery(useAbilityQuery())
    } catch (err) {
        console.error(err)
    }

    if (to.meta.ability && !ability.can(to.meta.ability.action, to.meta.ability.subject)) {
        return { name: RouteNames.DASHBOARD }
    }

    return true
})
