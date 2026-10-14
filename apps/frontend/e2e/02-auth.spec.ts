import { expect, test } from '@playwright/test'
import { admin, login } from './support/fixtures.ts'

const jwtKey = 'mailer::jwt'

test('protected pages redirect anonymous visitors to the login and back', async ({ page }) => {
    await page.goto('/domains')
    await expect(page).toHaveURL(/\/login\?redirect=(%2F|\/)domains$/)
    await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible()

    await page.getByLabel('Email Address', { exact: true }).fill(admin.email)
    await page.getByLabel('Password', { exact: true }).fill(admin.password)
    await page.getByRole('button', { name: 'Login' }).click()

    await expect(page).toHaveURL(/\/domains$/)
    await expect(page.getByRole('heading', { name: 'Domains' })).toBeVisible()
})

test('a redirect to another site is ignored after the login', async ({ page }) => {
    await page.goto('/login?redirect=%2F%2Fevil.example.com')
    await page.getByLabel('Email Address', { exact: true }).fill(admin.email)
    await page.getByLabel('Password', { exact: true }).fill(admin.password)
    await page.getByRole('button', { name: 'Login' }).click()

    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    await expect(page).toHaveURL(/\/$/)
})

test('a wrong password is rejected and keeps the visitor logged out', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email Address', { exact: true }).fill(admin.email)
    await page.getByLabel('Password', { exact: true }).fill('definitely-not-the-password')

    const loginResponse = page.waitForResponse((response) => response.url().endsWith('/api/auth/login'))
    await page.getByRole('button', { name: 'Login' }).click()

    expect((await loginResponse).status()).toBe(401)
    await expect(page).toHaveURL(/\/login$/)
    expect(await page.evaluate((key) => localStorage.getItem(key), jwtKey)).toBeNull()
})

test('a wrong password shows an error message', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email Address', { exact: true }).fill(admin.email)
    await page.getByLabel('Password', { exact: true }).fill('definitely-not-the-password')
    await page.getByRole('button', { name: 'Login' }).click()
    await expect(page.locator('.v-alert')).toBeVisible()
    await expect(page.locator('.v-alert')).toContainText('Invalid email or password')
})

test('login and logout round-trip the session', async ({ page }) => {
    await login(page, admin)
    expect(await page.evaluate((key) => localStorage.getItem(key), jwtKey)).toBeTruthy()

    await page.reload()
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

    await page.getByRole('button', { name: 'Logout' }).click()
    await expect(page).toHaveURL(/\/login$/)
    expect(await page.evaluate((key) => localStorage.getItem(key), jwtKey)).toBeNull()

    await page.goto('/')
    await expect(page).toHaveURL(/\/login$/)
})
