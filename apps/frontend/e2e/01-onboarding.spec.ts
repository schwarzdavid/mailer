import { expect, test } from '@playwright/test'
import { admin, input, requireEnv, sendingDomain, serverIpv4 } from './support/fixtures.ts'

test('a fresh installation sets up the first administrator and shows the sending domain records', async ({ page }) => {
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

    await expect(page.getByRole('heading', { name: 'Publish the DNS records' })).toBeVisible()
    await expect(page.getByText(`Signed in as ${admin.firstName} ${admin.lastName}`)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sending domain' })).toHaveCount(0)
    await expect(input(page, 'serverIpv4')).toHaveCount(0)
    for (const record of ['A', 'MX', 'SPF', 'DKIM', 'DMARC', 'PTR (IPv4)']) {
        await expect(
            page.getByRole('heading', { level: 3, name: new RegExp(`^${record.replace(/[()]/g, '\\$&')}`) }).first(),
        ).toBeVisible()
    }
    const values = await page.locator('.copy-field__value').allTextContents()
    expect(values).toContain(sendingDomain)
    expect(values).toContain(serverIpv4)
    expect(values).toContain(`v=spf1 ip4:${serverIpv4} -all`)
    expect(values.some((value) => value.startsWith('v=DKIM1'))).toBe(true)

    await page.getByRole('button', { name: 'Finish setup' }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
    await expect(page.getByText('Get started')).toBeVisible()
})

test('setup is closed once the installation is set up', async ({ page }) => {
    await page.goto('/setup')
    await expect(page).toHaveURL(/\/login$/)
})
