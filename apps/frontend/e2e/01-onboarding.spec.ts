import { expect, test } from '@playwright/test'
import { admin, input, requireEnv, sendingDomain } from './support/fixtures.ts'

test('a fresh installation sets up the first administrator and the sending domain', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/setup$/)
    await expect(page.getByRole('heading', { name: 'Welcome to Mail Admin' })).toBeVisible()
    await expect(page.getByText('Create the admin account')).toBeVisible()

    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page.getByText('Fill in this field.').first()).toBeVisible()

    await input(page, 'setupToken').fill(requireEnv('E2E_SETUP_TOKEN'))
    await input(page, 'firstName').fill(admin.firstName)
    await input(page, 'lastName').fill(admin.lastName)
    await input(page, 'email').fill(admin.email)
    await input(page, 'password').fill(admin.password)
    await page.getByRole('button', { name: 'Create account' }).click()

    await expect(page.getByRole('heading', { name: 'Where does this server send from?' })).toBeVisible()
    await expect(page.getByText(`Signed in as ${admin.firstName} ${admin.lastName}`)).toBeVisible()
    await expect(page.getByText(sendingDomain, { exact: true })).toBeVisible()
    await expect(input(page, 'fqdn')).toHaveCount(0)
    await input(page, 'serverIpv4').fill('999.1.1.1')
    await input(page, 'serverIpv4').blur()
    await expect(page.getByText('Enter an IPv4 address, like 203.0.113.10.')).toBeVisible()

    await input(page, 'serverIpv4').fill('203.0.113.10')
    await page.getByRole('button', { name: 'Save and continue' }).click()

    await expect(page.getByRole('heading', { name: 'Publish the DNS records' })).toBeVisible()
    for (const record of ['A', 'MX', 'SPF', 'DKIM', 'DMARC', 'PTR (IPv4)']) {
        await expect(
            page.getByRole('heading', { level: 3, name: new RegExp(`^${record.replace(/[()]/g, '\\$&')}`) }).first(),
        ).toBeVisible()
    }
    const values = await page.locator('.copy-field__value').allTextContents()
    expect(values).toContain(sendingDomain)
    expect(values).toContain('203.0.113.10')
    expect(values.some((value) => value.startsWith('v=DKIM1'))).toBe(true)

    await page.getByRole('button', { name: 'Sending domain' }).click()
    await expect(input(page, 'serverIpv4')).toHaveValue('203.0.113.10')
    await expect(page.getByText(sendingDomain, { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'DNS records' }).click()

    await page.getByRole('button', { name: 'Finish setup' }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
    await expect(page.getByText('Get started')).toBeVisible()
})

test('setup is closed once the installation is set up', async ({ page }) => {
    await page.goto('/setup')
    await expect(page).toHaveURL(/\/login$/)
})
