import { expect, test } from '@playwright/test'
import { admin, input, login, submitLogin } from './support/fixtures.ts'

const jwtKey = 'mailer::jwt'

test('protected pages redirect anonymous visitors to the login and back', async ({ page }) => {
    await page.goto('/domains')
    await expect(page).toHaveURL(/\/login\?redirect=(%2F|\/)domains$/)
    await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible()

    await submitLogin(page, admin)

    await expect(page).toHaveURL(/\/domains$/)
    await expect(page.getByRole('heading', { name: 'Domains', level: 1 })).toBeVisible()
})

test('a redirect to another site is ignored after the login', async ({ page }) => {
    await page.goto('/login?redirect=%2F%2Fevil.example.com')
    await submitLogin(page, admin)

    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
    await expect(page).toHaveURL(/\/$/)
})

test('a wrong password is rejected, explained and keeps the visitor logged out', async ({ page }) => {
    await page.goto('/login')
    await input(page, 'email').fill(admin.email)
    await input(page, 'password').fill('definitely-not-the-password')

    const loginResponse = page.waitForResponse((response) => response.url().endsWith('/api/auth/login'))
    await page.getByRole('button', { name: 'Log in', exact: true }).click()

    expect((await loginResponse).status()).toBe(401)
    await expect(page.getByRole('alert')).toContainText('Email or password is wrong. Check both and try again.')
    await expect(page).toHaveURL(/\/login$/)
    expect(await page.evaluate((key) => localStorage.getItem(key), jwtKey)).toBeNull()
})

test('an expired session sends the visitor to the login with a notice', async ({ page }) => {
    await page.goto('/login')
    await page.evaluate((key) => localStorage.setItem(key, 'expired-token'), jwtKey)

    await page.goto('/projects')

    await expect(page).toHaveURL(/\/login\?redirect=(%2F|\/)projects&expired=1$/)
    await expect(page.getByText('Your session expired. Log in again to continue where you left off.')).toBeVisible()
})

test('login and logout round-trip the session', async ({ page }) => {
    await login(page, admin)
    expect(await page.evaluate((key) => localStorage.getItem(key), jwtKey)).toBeTruthy()

    await page.reload()
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()

    await page.getByRole('button', { name: `Account menu for ${admin.firstName} ${admin.lastName}` }).click()
    await expect(page.getByText(admin.email)).toBeVisible()
    await page.getByRole('button', { name: 'Log out' }).click()
    await expect(page).toHaveURL(/\/login$/)
    expect(await page.evaluate((key) => localStorage.getItem(key), jwtKey)).toBeNull()

    await page.goto('/')
    await expect(page).toHaveURL(/\/login$/)
})
