import { expect, test } from '@playwright/test'
import { admin, sendingDomain } from './support/fixtures.ts'

test('a fresh installation onboards the first administrator and the sending domain', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/onboarding$/)
    await expect(page.getByText('Create the administrator account for this installation.')).toBeVisible()

    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page.getByText('This field is required').first()).toBeVisible()

    await page.getByLabel('First name', { exact: true }).fill(admin.firstName)
    await page.getByLabel('Last name', { exact: true }).fill(admin.lastName)
    await page.getByLabel('Email Address', { exact: true }).fill(admin.email)
    await page.getByLabel('Password', { exact: true }).fill(admin.password)
    await expect(page.getByText('This field is required')).toHaveCount(0)
    await page.getByRole('button', { name: 'Continue' }).click()

    await expect(page.getByText('Configure the domain this server sends mail from.')).toBeVisible()
    await page.getByLabel('Domain name', { exact: true }).fill('not a domain')
    await page.getByLabel('Server IPv4 address', { exact: true }).fill('999.1.1.1')
    await expect(page.getByText('Invalid domain name')).toBeVisible()
    await expect(page.getByText('Invalid IPv4 address')).toBeVisible()

    await page.getByLabel('Domain name', { exact: true }).fill(sendingDomain)
    await page.getByLabel('Server IPv4 address', { exact: true }).fill('203.0.113.10')
    await expect(page.getByText('Invalid domain name')).toBeHidden()
    await expect(page.getByText('Invalid IPv4 address')).toBeHidden()
    await page.getByRole('button', { name: 'Save' }).click()

    await expect(page.getByText('Publish these DNS records so receivers can authenticate your mail.')).toBeVisible()
    for (const record of ['A', 'MX', 'SPF', 'DKIM', 'DMARC', 'PTR (Reverse DNS)']) {
        await expect(page.getByText(record, { exact: true }).first()).toBeVisible()
    }
    const recordValues = page.locator('input[readonly]')
    await expect(recordValues.first()).toBeVisible()
    const values = await recordValues.evaluateAll((inputs) =>
        inputs.map((input) => (input instanceof HTMLInputElement ? input.value : '')),
    )
    expect(values).toContain(sendingDomain)
    expect(values).toContain('203.0.113.10')
    expect(values.some((value) => value.startsWith('v=DKIM1'))).toBe(true)

    await page.getByRole('button', { name: 'Finish' }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
})

test('onboarding is closed once the installation is set up', async ({ page }) => {
    await page.goto('/onboarding')
    await expect(page).toHaveURL(/\/login$/)
})
