import { createRouter, createWebHistory } from 'vue-router'
import AuthLayout from '@/modules/auth/layouts/AuthLayout.vue'
import LoginView from '@/modules/auth/views/LoginView.vue'
import { RouteNames } from '@/router/RouteNames.ts'
import AppLayout from '@/modules/dashboard/layouts/AppLayout.vue'
import DashboardView from '@/modules/dashboard/views/DashboardView.vue'
import DomainListView from '@/modules/domains/views/list/DomainListView.vue'
import { useAuthQuery } from '@/modules/auth/queries/useAuthQuery.ts'
import { useSetupStatusQuery } from '@/modules/onboarding/queries/useSetupStatusQuery.ts'
import { queryClient } from '@/plugins/tanstack.ts'
import DomainDetailView from '@/modules/domains/views/details/DomainDetailView.vue'
import ProjectListView from '@/modules/projects/views/list/ProjectListView.vue'
import ProjectDetailView from '@/modules/projects/views/details/ProjectDetailView.vue'
import InboundFormDetailView from '@/modules/inbound-forms/views/details/InboundFormDetailView.vue'
import InboundFormTemplateView from '@/modules/inbound-forms/views/template/InboundFormTemplateView.vue'
import BounceListView from '@/modules/bounces/views/list/BounceListView.vue'
import SettingsView from '@/modules/settings/views/SettingsView.vue'
import OnboardingView from '@/modules/onboarding/views/OnboardingView.vue'

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
                },
                {
                    path: '/domains/:domainId',
                    name: RouteNames.DOMAIN_DETAILS,
                    component: DomainDetailView,
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
                },
                {
                    path: '/settings',
                    name: RouteNames.SETTINGS,
                    component: SettingsView,
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
        return true
    } catch (err) {
        console.error(err)
        return { name: RouteNames.LOGIN }
    }
})
