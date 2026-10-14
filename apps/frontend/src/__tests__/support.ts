import { createApp, defineComponent, h, ref, type Component } from 'vue'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { RouteNames } from '@/router/RouteNames.ts'
import { createI18n } from 'vue-i18n'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { vuetify } from '@/plugins/vuetify.ts'
import en from '@/locales/en.json'
import { abilitiesPlugin } from '@casl/vue'
import { createMongoAbility, type RawRuleOf } from '@casl/ability'
import type { AppAbility } from '@/plugins/casl.ts'
import { VApp } from 'vuetify/components'
import ConfirmDialogHost from '@/components/ConfirmDialogHost.vue'
import NotificationHost from '@/components/NotificationHost.vue'

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

export function createTestRouter(): Router {
    return createRouter({
        history: createMemoryHistory(),
        routes: Object.values(RouteNames).map((name, index) => ({
            path: index === 0 ? '/' : `/${name.replace('::', '/')}`,
            name,
            component: { render: () => null },
        })),
    })
}

function isRouter(plugin: unknown): boolean {
    return typeof plugin === 'object' && plugin !== null && 'currentRoute' in plugin
}

// Mounts a component with the plugins it needs at runtime: Vuetify, i18n,
// Vue Query and CASL abilities. Extra options (props, slots, further plugins)
// are merged in. `rules` defaults to manage-all so existing specs keep passing.
export function mountView(
    component: MountArgs[0],
    options: MountArgs[1] = {},
    rules: RawRuleOf<AppAbility>[] = [{ action: 'manage', subject: 'all' }],
) {
    const i18n = createTestI18n()
    const queryClient = createTestQueryClient()
    const extraPlugins = options?.global?.plugins ?? []
    const router = extraPlugins.some(isRouter) ? [] : [createTestRouter()]

    return mount(component, {
        ...options,
        global: {
            ...options?.global,
            plugins: [
                vuetify,
                i18n,
                [VueQueryPlugin, { queryClient }],
                [abilitiesPlugin, createMongoAbility(rules)],
                ...router,
                ...extraPlugins,
            ],
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

type Wrapper = ReturnType<typeof mountView>

export function findButton(wrapper: Wrapper, label: string) {
    return wrapper.findAll('button, a').find((element) => element.text().trim() === label)
}

export function overlayButton(label: string): HTMLButtonElement {
    const button = [...document.body.querySelectorAll<HTMLButtonElement>('.v-overlay-container button')].find(
        (candidate) => candidate.textContent?.trim() === label,
    )
    if (!button) {
        throw new Error(`No overlay button labelled "${label}"`)
    }
    return button
}

export function overlayText(): string {
    return document.body.querySelector('.v-overlay-container')?.textContent ?? ''
}

export function mountInApp(
    component: Component,
    props: Record<string, unknown> = {},
    rules: RawRuleOf<AppAbility>[] = [{ action: 'manage', subject: 'all' }],
    plugins: NonNullable<NonNullable<MountArgs[1]>['global']>['plugins'] = [],
) {
    const Host = defineComponent({
        setup: () => () => h(VApp, () => [h(component, props), h(ConfirmDialogHost), h(NotificationHost)]),
    })
    return mountView(Host, { global: { plugins } }, rules)
}

export function mountDialog(
    component: Component,
    props: Record<string, unknown> = {},
    rules: RawRuleOf<AppAbility>[] = [{ action: 'manage', subject: 'all' }],
) {
    const open = ref(true)
    const Host = defineComponent({
        setup: () => () =>
            h(VApp, () => [
                h(component, {
                    ...props,
                    modelValue: open.value,
                    'onUpdate:modelValue': (value: boolean) => (open.value = value),
                }),
                h(ConfirmDialogHost),
            ]),
    })
    const wrapper = mountView(Host, {}, rules)
    return { wrapper, open }
}

export function overlayInput(name: string): HTMLInputElement {
    const input = document.body.querySelector<HTMLInputElement>(`.v-overlay-container [name="${name}"]`)
    if (!input) {
        throw new Error(`No overlay input named "${name}"`)
    }
    return input
}

export async function setOverlayInput(name: string, value: string) {
    const input = overlayInput(name)
    input.value = value
    input.dispatchEvent(new Event('input'))
    await new Promise((resolve) => setTimeout(resolve))
}

export function submitOverlayForm() {
    document.body.querySelector('.v-overlay-container form')!.dispatchEvent(new Event('submit'))
}
