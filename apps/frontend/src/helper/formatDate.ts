const intlLocales: Record<string, string> = {
    en: 'en-GB',
}

const DAY_MS = 24 * 60 * 60 * 1000

const relativeUnits: { unit: Intl.RelativeTimeFormatUnit; ms: number }[] = [
    { unit: 'hour', ms: 60 * 60 * 1000 },
    { unit: 'minute', ms: 60 * 1000 },
    { unit: 'second', ms: 1000 },
]

export function intlLocale(locale: string): string {
    return intlLocales[locale] ?? locale
}

export function toDate(value: Date | string): Date {
    return value instanceof Date ? value : new Date(value)
}

export function formatAbsolute(value: Date | string, locale: string): string {
    return new Intl.DateTimeFormat(intlLocale(locale), {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).format(toDate(value))
}

export function formatDay(value: Date | string, locale: string): string {
    return new Intl.DateTimeFormat(intlLocale(locale), {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    }).format(toDate(value))
}

export function isWithinDay(value: Date | string, now: Date): boolean {
    return Math.abs(toDate(value).getTime() - now.getTime()) < DAY_MS
}

export function formatRelative(value: Date | string, locale: string, now: Date): string {
    const diff = toDate(value).getTime() - now.getTime()
    const formatter = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: 'auto', style: 'short' })
    for (const { unit, ms } of relativeUnits) {
        if (Math.abs(diff) >= ms || unit === 'second') {
            return formatter.format(Math.trunc(diff / ms), unit)
        }
    }
    return formatter.format(0, 'second')
}

export function formatSmart(value: Date | string, locale: string, now: Date): string {
    return isWithinDay(value, now) ? formatRelative(value, locale, now) : formatAbsolute(value, locale)
}

export function formatRelativeDays(value: Date | string, locale: string, now: Date): string {
    const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
    const days = Math.round((startOfDay(toDate(value)) - startOfDay(now)) / DAY_MS)
    return new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: 'auto' }).format(days, 'day')
}
