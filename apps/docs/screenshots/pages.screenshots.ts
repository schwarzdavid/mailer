import process from 'node:process'
import { expect, test, type Locator, type Page, type Request } from '@playwright/test'
import { admin, customerDomain, seedAfterOnboarding, type SeededIds } from './seed.ts'

const jwtStorageKey = 'mailer::jwt'
const apiResourceTypes = new Set(['fetch', 'xhr'])

let session: string | null = null
let seeded: SeededIds | null = null
const pendingRequests = new Set<Request>()
let lastNetworkActivity = 0

function requireEnv(
    key: 'DOCS_BASE_URL' | 'DOCS_FRONTEND_URL' | 'DOCS_API_URL' | 'DOCS_SETUP_TOKEN' | 'DOCS_GREENMAIL_SMTP_PORT',
): string {
    const value = process.env[key]
    if (!value) {
        throw new Error(`${key} is not set; run the screenshots through playwright.config.ts`)
    }
    return value
}

function ids(): SeededIds {
    if (!seeded) {
        throw new Error('The seed test has not run')
    }
    return seeded
}

function input(page: Page, name: string): Locator {
    return page.locator(`input[name="${name}"], textarea[name="${name}"]`).first()
}

function card(page: Page, title: string): Locator {
    return page
        .locator('section.section-card')
        .filter({ has: page.getByRole('heading', { level: 2, name: new RegExp(`^${title}`) }) })
}

async function rememberSession(page: Page): Promise<void> {
    session = await page.evaluate((key) => localStorage.getItem(key), jwtStorageKey)
}

async function openAuthenticated(page: Page, path: string): Promise<void> {
    if (!session) {
        throw new Error('No session to reuse')
    }
    await page.goto('/login')
    await page.evaluate(([key, value]) => localStorage.setItem(key, value), [jwtStorageKey, session] as const)
    await page.goto(path)
}

function unsettledRequests(): string[] {
    if (Date.now() - lastNetworkActivity < 750) {
        return ['settling']
    }
    return [...pendingRequests].map((request) => request.url())
}

async function settle(page: Page, heading: string): Promise<void> {
    await expect(page.getByRole('heading', { level: 1 }).first()).toContainText(heading)
    await expect.poll(unsettledRequests, { timeout: 30_000 }).toEqual([])
    await page.evaluate(() => document.fonts.ready)
    await expect(page.locator('.notification')).toHaveCount(0)
}

async function capture(page: Page, file: string, heading: string): Promise<void> {
    await settle(page, heading)
    await page.screenshot({ path: `public/screenshots/${file}.png` })
}

async function captureElement(element: Locator, file: string, heading: string): Promise<void> {
    await settle(element.page(), heading)
    await element.screenshot({ path: `public/screenshots/${file}.png` })
}

test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({ context, page }) => {
    const frontendUrl = requireEnv('DOCS_FRONTEND_URL')
    await context.route(`${requireEnv('DOCS_BASE_URL')}/**`, async (route) => {
        const { pathname, search } = new URL(route.request().url())
        await route.fulfill({ response: await route.fetch({ url: `${frontendUrl}${pathname}${search}` }) })
    })
    pendingRequests.clear()
    lastNetworkActivity = Date.now()
    const settleRequest = (request: Request) => {
        pendingRequests.delete(request)
        lastNetworkActivity = Date.now()
    }
    page.on('request', (request) => {
        if (apiResourceTypes.has(request.resourceType())) {
            pendingRequests.add(request)
            lastNetworkActivity = Date.now()
        }
    })
    page.on('requestfinished', settleRequest)
    page.on('requestfailed', settleRequest)
})

test('installation/onboarding-account', async ({ page }) => {
    await page.goto('/setup')
    await input(page, 'setupToken').fill(requireEnv('DOCS_SETUP_TOKEN'))
    await input(page, 'firstName').fill(admin.firstName)
    await input(page, 'lastName').fill(admin.lastName)
    await input(page, 'email').fill(admin.email)
    await input(page, 'password').fill(admin.password)
    await capture(page, 'installation/onboarding-account', 'Welcome to Mail Admin')

    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page.getByRole('heading', { name: 'Where does this server send from?' })).toBeVisible()
    await rememberSession(page)
})

test('installation/onboarding-domain', async ({ page }) => {
    await openAuthenticated(page, '/setup')
    await input(page, 'serverIpv4').fill('203.0.113.10')
    await input(page, 'serverIpv4').blur()
    await capture(page, 'installation/onboarding-domain', 'Where does this server send from?')

    await page.getByRole('button', { name: 'Save and continue' }).click()
    await expect(page.getByRole('heading', { name: 'Publish the DNS records' })).toBeVisible()
})

test('installation/onboarding-records', async ({ page }) => {
    await openAuthenticated(page, '/setup')
    await capture(page, 'installation/onboarding-records', 'Publish the DNS records')

    await page.getByRole('button', { name: 'Finish setup' }).click()
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
})

test('admin-guide/login', async ({ page }) => {
    await openAuthenticated(page, '/')
    await page.getByRole('button', { name: `Account menu for ${admin.firstName} ${admin.lastName}` }).click()
    await page.getByRole('button', { name: 'Log out' }).click()
    await expect(page).toHaveURL(/\/login$/)
    await capture(page, 'admin-guide/login', 'Log in')
})

test('admin-guide/dashboard', async ({ page }) => {
    await page.goto('/login')
    await input(page, 'email').fill(admin.email)
    await input(page, 'password').fill(admin.password)
    await page.getByRole('button', { name: 'Log in', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
    await rememberSession(page)
    await capture(page, 'admin-guide/dashboard', 'Dashboard')
})

test('seed', async () => {
    test.setTimeout(300_000)
    seeded = await seedAfterOnboarding(requireEnv('DOCS_API_URL'), Number(requireEnv('DOCS_GREENMAIL_SMTP_PORT')))
    expect(seeded.projectId).toBeGreaterThan(0)
})

test('admin-guide/projects-list', async ({ page }) => {
    await openAuthenticated(page, '/projects')
    await capture(page, 'admin-guide/projects-list', 'Projects')
})

test('admin-guide/project-detail', async ({ page }) => {
    await openAuthenticated(page, `/projects/${ids().projectId}`)
    await capture(page, 'admin-guide/project-detail', 'Acme Website')
})

test('admin-guide/project-messages', async ({ page }) => {
    await openAuthenticated(page, `/projects/${ids().projectId}/messages`)
    await capture(page, 'admin-guide/project-messages', 'Sent mail')
})

test('admin-guide/domain-detail', async ({ page }) => {
    await openAuthenticated(page, `/domains/${ids().domainId}`)
    await capture(page, 'admin-guide/domain-detail', customerDomain)
})

test('admin-guide/form-detail', async ({ page }) => {
    await openAuthenticated(page, `/forms/${ids().inboundFormId}`)
    await capture(page, 'admin-guide/form-detail', 'Contact form')
})

for (const [file, title] of [
    ['form-fields', 'Fields'],
    ['form-security', 'Security'],
    ['form-receivers', 'Receivers'],
] as const) {
    test(`admin-guide/${file}`, async ({ page }) => {
        await openAuthenticated(page, `/forms/${ids().inboundFormId}`)
        await captureElement(card(page, title), `admin-guide/${file}`, 'Contact form')
    })
}

test('admin-guide/template-editor', async ({ page }) => {
    await openAuthenticated(page, `/forms/${ids().inboundFormId}/receivers/${ids().receiverId}/template`)
    await capture(page, 'admin-guide/template-editor', 'Email template')
})

test('admin-guide/bounces', async ({ page }) => {
    await openAuthenticated(page, '/bounces')
    await capture(page, 'admin-guide/bounces', 'Bounces')
})

test('admin-guide/blocked-addresses', async ({ page }) => {
    await openAuthenticated(page, '/bounces/blocked')
    await capture(page, 'admin-guide/blocked-addresses', 'Bounces')
})

test('admin-guide/users-list', async ({ page }) => {
    await openAuthenticated(page, '/users')
    await capture(page, 'admin-guide/users-list', 'Users')
})

test('admin-guide/user-detail', async ({ page }) => {
    await openAuthenticated(page, `/users/${ids().userId}`)
    await capture(page, 'admin-guide/user-detail', 'Max Member')
})

test('admin-guide/roles-list', async ({ page }) => {
    await openAuthenticated(page, '/roles')
    await capture(page, 'admin-guide/roles-list', 'Roles')
})

test('admin-guide/role-detail', async ({ page }) => {
    await openAuthenticated(page, `/roles/${ids().roleId}`)
    await capture(page, 'admin-guide/role-detail', 'Support')
})

test('admin-guide/settings', async ({ page }) => {
    await openAuthenticated(page, '/settings')
    await capture(page, 'admin-guide/settings', 'Settings')
})
