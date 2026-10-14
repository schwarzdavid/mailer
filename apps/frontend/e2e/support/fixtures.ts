import { expect, type Locator, type Page } from '@playwright/test'

export interface Credentials {
    email: string
    password: string
}

export const admin = {
    firstName: 'Ada',
    lastName: 'Admin',
    email: 'ada.admin@playwright-e2e.com',
    password: 'correct-horse-battery-staple',
} as const

export const member = {
    firstName: 'Max',
    lastName: 'Member',
    email: 'max.member@playwright-e2e.com',
    password: 'limited-access-password',
} as const

export const sendingDomain = 'mail.playwright-e2e.com'
export const senderDomain = 'forms.acme-e2e.com'
export const projectName = 'Acme Website'
export const formName = 'Contact Request'
export const formSlug = 'contact-request'
export const receiverAddress = 'inbox@acme-e2e.com'

export function requireEnv(key: 'E2E_API_URL' | 'E2E_MAILHOG_URL'): string {
    const value = process.env[key]
    if (!value) {
        throw new Error(`${key} is not set; run the suite through playwright.config.ts so the global setup runs`)
    }
    return value
}

// The backend throttles logins per account, so the form is only driven once per
// user and later tests reuse the issued token.
const sessionTokens = new Map<string, string>()
const jwtStorageKey = 'mailer::jwt'

export async function login(page: Page, credentials: Credentials): Promise<void> {
    await page.goto('/login')

    const token = sessionTokens.get(credentials.email)
    if (token) {
        await page.evaluate(([key, value]) => localStorage.setItem(key, value), [jwtStorageKey, token] as const)
        await page.goto('/')
    } else {
        await page.getByLabel('Email Address', { exact: true }).fill(credentials.email)
        await page.getByLabel('Password', { exact: true }).fill(credentials.password)
        await page.getByRole('button', { name: 'Login' }).click()
    }

    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

    const issued = await jwt(page)
    if (issued) {
        sessionTokens.set(credentials.email, issued)
    }
}

export async function selectOption(scope: Locator, label: string, option: string): Promise<void> {
    await scope
        .locator('.v-select')
        .filter({ has: scope.page().getByLabel(label, { exact: true }) })
        .click()
    await scope.page().getByRole('option', { name: option, exact: true }).click()
}

export function card(page: Page, title: string): Locator {
    return page.locator('.v-card').filter({ has: page.locator('.v-card-title').getByText(title, { exact: true }) })
}

export function jwt(page: Page): Promise<string | null> {
    return page.evaluate((key) => localStorage.getItem(key), jwtStorageKey)
}
