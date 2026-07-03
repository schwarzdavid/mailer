import { createRouter, createWebHistory } from 'vue-router'
import AuthLayout from '@/modules/auth/layouts/AuthLayout.vue'
import LoginView from '@/modules/auth/views/LoginView.vue'
import { RouteNames } from '@/router/RouteNames.ts'
import AppLayout from '@/modules/dashboard/layouts/AppLayout.vue'
import DashboardView from '@/modules/dashboard/views/DashboardView.vue'
import DomainListView from '@/modules/domains/views/list/DomainListView.vue'
import { useAuthQuery } from '@/modules/auth/queries/useAuthQuery.ts'
import { queryClient } from '@/plugins/tanstack.ts'
import DomainDetailView from '@/modules/domains/views/details/DomainDetailView.vue'

export const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes: [
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
            ],
            meta: {
                requiresAuth: true,
            },
        },
    ],
})

router.beforeEach(async (to) => {
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
