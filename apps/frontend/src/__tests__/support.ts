import { createApp } from 'vue'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { vuetify } from '@/plugins/vuetify.ts'
import en from '@/locales/en.json'

// A composition-API i18n instance seeded with the real global messages. `legacy`
// must be false, otherwise `useI18n()` throws in the components under test.
export function createTestI18n() {
    return createI18n({
        legacy: false,
        locale: 'en',
        fallbackLocale: 'en',
        messages: { en },
    })
}

// Query/mutation retries and garbage collection are disabled so tests fail fast
// and stay isolated from each other.
export function createTestQueryClient() {
    return new QueryClient({
        defaultOptions: {
            queries: { retry: false, gcTime: 0 },
            mutations: { retry: false },
        },
    })
}

type MountArgs = Parameters<typeof mount>

// Mounts a component with the plugins it needs at runtime: Vuetify, i18n and
// Vue Query. Extra options (props, slots, further plugins) are merged in.
export function mountView(component: MountArgs[0], options: MountArgs[1] = {}) {
    const i18n = createTestI18n()
    const queryClient = createTestQueryClient()

    return mount(component, {
        ...options,
        global: {
            ...options?.global,
            plugins: [vuetify, i18n, [VueQueryPlugin, { queryClient }], ...(options?.global?.plugins ?? [])],
        },
    })
}

// Runs a composable inside a throwaway component so it can use `inject`-based
// APIs such as `useQueryClient`. Returns the composable result plus the query
// client backing it, and an `unmount` for cleanup.
export function withVueQuery<T>(composable: () => T): {
    result: T
    queryClient: QueryClient
    unmount: () => void
} {
    const queryClient = createTestQueryClient()

    let result!: T
    const app = createApp({
        setup() {
            result = composable()
            return () => null
        },
    })
    app.use(VueQueryPlugin, { queryClient })
    app.mount(document.createElement('div'))

    return { result, queryClient, unmount: () => app.unmount() }
}
