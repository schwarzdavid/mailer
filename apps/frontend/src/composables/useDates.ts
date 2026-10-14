import { useI18n } from 'vue-i18n'
import { formatAbsolute, formatDay, formatRelative, formatRelativeDays, formatSmart } from '@/helper/formatDate.ts'

export function useDates() {
    const { locale } = useI18n()

    return {
        absolute: (value: Date | string) => formatAbsolute(value, locale.value),
        day: (value: Date | string) => formatDay(value, locale.value),
        relative: (value: Date | string, now = new Date()) => formatRelative(value, locale.value, now),
        relativeDays: (value: Date | string, now = new Date()) => formatRelativeDays(value, locale.value, now),
        smart: (value: Date | string, now = new Date()) => formatSmart(value, locale.value, now),
    }
}
