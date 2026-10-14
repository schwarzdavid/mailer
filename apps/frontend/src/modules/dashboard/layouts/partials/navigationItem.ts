import type { RouteLocationRaw } from 'vue-router'

export interface NavigationItem {
    section: string
    title: string
    icon: string
    to: RouteLocationRaw
    attention?: string
}
