import { createRouter, createWebHistory, type RouteLocationRaw } from 'vue-router'
import AuthLayout from '@/modules/auth/layouts/AuthLayout.vue'
import LoginView from '@/modules/auth/views/LoginView.vue'
import { RouteNames } from '@/router/RouteNames.ts'
import AppLayout from '@/modules/dashboard/layouts/AppLayout.vue'
import DashboardView from '@/modules/dashboard/views/DashboardView.vue'
import NotFoundView from '@/modules/dashboard/views/NotFoundView.vue'
import DomainListView from '@/modules/domains/views/list/DomainListView.vue'
import { useAuthQuery } from '@/modules/auth/queries/useAuthQuery.ts'
import { useAbilityQuery } from '@/modules/auth/queries/useAbilityQuery.ts'
import { useSetupStatusQuery } from '@/modules/onboarding/queries/useSetupStatusQuery.ts'
import { queryClient } from '@/plugins/tanstack.ts'
import DomainDetailView from '@/modules/domains/views/details/DomainDetailView.vue'
import ProjectListView from '@/modules/projects/views/list/ProjectListView.vue'
import ProjectDetailView from '@/modules/projects/views/details/ProjectDetailView.vue'
import ProjectMessagesView from '@/modules/projects/views/messages/ProjectMessagesView.vue'
import InboundFormDetailView from '@/modules/inbound-forms/views/details/InboundFormDetailView.vue'
import InboundFormTemplateView from '@/modules/inbound-forms/views/template/InboundFormTemplateView.vue'
import BounceListView from '@/modules/bounces/views/list/BounceListView.vue'
import SettingsView from '@/modules/settings/views/SettingsView.vue'
import OnboardingView from '@/modules/onboarding/views/OnboardingView.vue'
import UserListView from '@/modules/users/views/list/UserListView.vue'
import UserDetailView from '@/modules/users/views/details/UserDetailView.vue'
import { JWT_KEY } from '@/constants/jwtKey.ts'
import type { SetupStatusDto } from 'api'

declare module 'vue-router' {
    interface RouteMeta {
        requiresAuth?: boolean
        ability?: { action: string; subject: string }
        section?: 'dashboard' | 'projects' | 'domains' | 'bounces' | 'users' | 'settings'
        rail?: boolean
        wide?: boolean
    }
}

export const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes: [
        {
            path: '/setup',
            name: RouteNames.ONBOARDING,
            component: OnboardingView,
        },
        {
            path: '/onboarding',
            redirect: { name: RouteNames.ONBOARDING },
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
                    meta: { section: 'dashboard' },
                },
                {
                    path: '/domains',
                    name: RouteNames.DOMAIN_LIST,
                    component: DomainListView,
                    meta: { section: 'domains', ability: { action: 'read', subject: 'Domain' } },
                },
                {
                    path: '/domains/:domainId',
                    name: RouteNames.DOMAIN_DETAILS,
                    component: DomainDetailView,
                    meta: { section: 'domains', ability: { action: 'read', subject: 'Domain' } },
                },
                {
                    path: '/projects',
                    name: RouteNames.PROJECT_LIST,
                    component: ProjectListView,
                    meta: { section: 'projects' },
                },
                {
                    path: '/projects/:projectId',
                    name: RouteNames.PROJECT_DETAILS,
                    component: ProjectDetailView,
                    meta: { section: 'projects' },
                },
                {
                    path: '/projects/:projectId/messages',
                    name: RouteNames.PROJECT_MESSAGES,
                    component: ProjectMessagesView,
                    meta: { section: 'projects' },
                },
                {
                    path: '/forms/:inboundFormId',
                    name: RouteNames.INBOUND_FORM_DETAILS,
                    component: InboundFormDetailView,
                    meta: { section: 'projects' },
                },
                {
                    path: '/forms/:inboundFormId/receivers/:inboundFormReceiverId/template',
                    name: RouteNames.INBOUND_FORM_TEMPLATE,
                    component: InboundFormTemplateView,
                    meta: { section: 'projects', rail: true, wide: true },
                },
                {
                    path: '/bounces',
                    name: RouteNames.BOUNCE_LIST,
                    component: BounceListView,
                    meta: { section: 'bounces', ability: { action: 'read', subject: 'Bounce' } },
                },
                {
                    path: '/bounces/blocked',
                    name: RouteNames.BOUNCE_BLOCKED,
                    component: BounceListView,
                    meta: { section: 'bounces', ability: { action: 'read', subject: 'Bounce' } },
                },
                {
                    path: '/settings',
                    name: RouteNames.SETTINGS,
                    component: SettingsView,
                    meta: { section: 'settings', ability: { action: 'read', subject: 'Settings' } },
                },
                {
                    path: '/users',
                    name: RouteNames.USER_LIST,
                    component: UserListView,
                    meta: { section: 'users', ability: { action: 'read', subject: 'User' } },
                },
                {
                    path: '/users/:userId',
                    name: RouteNames.USER_DETAILS,
                    component: UserDetailView,
                    meta: { section: 'users', ability: { action: 'read', subject: 'User' } },
                },
                {
                    path: '/:pathMatch(.*)*',
                    name: RouteNames.NOT_FOUND,
                    component: NotFoundView,
                },
            ],
            meta: {
                requiresAuth: true,
            },
        },
    ],
})

export function loginRedirect(target: string, expired: boolean): RouteLocationRaw {
    const query: Record<string, string> = {}
    if (target !== '/') {
        query.redirect = target
    }
    if (expired) {
        query.expired = '1'
    }
    return { name: RouteNames.LOGIN, query }
}

async function isAuthenticated() {
    try {
        await queryClient.fetchQuery(useAuthQuery())
        return true
    } catch (err) {
        console.error(err)
        return false
    }
}

function endSession(target: string) {
    const hadSession = !!localStorage.getItem(JWT_KEY)
    localStorage.removeItem(JWT_KEY)
    return loginRedirect(target, hadSession)
}

router.beforeEach(async (to) => {
    let step: SetupStatusDto['step'] = 'finished'
    try {
        step = (await queryClient.fetchQuery(useSetupStatusQuery())).step
    } catch (err) {
        console.error(err)
    }

    if (step === 'account') {
        return to.name === RouteNames.ONBOARDING ? true : { name: RouteNames.ONBOARDING }
    }
    if (step !== 'finished') {
        if (to.name === RouteNames.LOGIN) {
            return true
        }
        if (!(await isAuthenticated())) {
            return endSession('/')
        }
        return to.name === RouteNames.ONBOARDING ? true : { name: RouteNames.ONBOARDING }
    }
    if (to.name === RouteNames.ONBOARDING) {
        return { name: RouteNames.DASHBOARD }
    }
    if (!to.meta.requiresAuth) {
        return true
    }

    if (!(await isAuthenticated())) {
        return endSession(to.fullPath)
    }

    try {
        await queryClient.fetchQuery(useAbilityQuery())
    } catch (err) {
        console.error(err)
    }

    return true
})
