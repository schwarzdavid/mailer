import { watch } from 'vue'
import { useLocalStorage } from '@vueuse/core'
import { useTheme } from 'vuetify'

export type ThemePreference = 'system' | 'light' | 'dark'

export const THEME_KEY = 'theme'

export function useThemePreference() {
    const theme = useTheme()
    const preference = useLocalStorage<ThemePreference>(THEME_KEY, 'system')

    watch(
        preference,
        (value) => {
            void theme.change(value)
        },
        { immediate: true },
    )

    return preference
}
