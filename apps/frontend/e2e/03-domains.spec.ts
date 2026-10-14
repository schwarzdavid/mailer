import { expect, test, type Page } from '@playwright/test'
import { admin, login, senderDomain } from './support/fixtures.ts'

async function readonlyValues(page: Page): Promise<string[]> {
    return page
        .locator('input[readonly]')
        .evaluateAll((inputs) => inputs.map((input) => (input instanceof HTMLInputElement ? input.value : '')))
}

test('an administrator adds a sender domain and inspects its DNS records', async ({ page }) => {
    await login(page, admin)
    await page.getByRole('tab', { name: 'Domains' }).click()
    await expect(page.getByRole('heading', { name: 'Domains' })).toBeVisible()

    await page.getByRole('button', { name: 'Add' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('New Domain')).toBeVisible()

    await dialog.getByLabel('Domain name', { exact: true }).fill('not a domain')
    await expect(dialog.getByText('Invalid domain name')).toBeVisible()

    await dialog.getByLabel('Domain name', { exact: true }).fill(senderDomain)
    await expect(dialog.getByText('Invalid domain name')).toBeHidden()
    await expect(dialog.getByText('It is recommended to use a subdomain', { exact: false })).toBeHidden()
    await dialog.getByRole('button', { name: 'Save' }).click()

    await expect(page).toHaveURL(/\/domains\/\d+$/)
    await expect(page.getByRole('heading', { name: senderDomain })).toBeVisible()
    await expect(page.getByText('DNS Records', { exact: true })).toBeVisible()
    for (const record of ['SPF', 'DKIM', 'DMARC']) {
        await expect(page.getByText(record, { exact: true })).toBeVisible()
    }
    await expect(page.getByText('Invalid', { exact: true }).first()).toBeVisible()

    await expect(page.locator('input[readonly]').first()).toBeVisible()
    const values = await readonlyValues(page)
    expect(values.some((value) => value.startsWith('v=spf1'))).toBe(true)
    expect(values.some((value) => value.startsWith('v=DKIM1'))).toBe(true)
    expect(values.some((value) => value.startsWith('v=DMARC1'))).toBe(true)
    expect(values.some((value) => value.includes(`_domainkey.${senderDomain}`))).toBe(true)
})

test('the domain list links to the domain detail page', async ({ page }) => {
    await login(page, admin)
    await page.goto('/domains')

    const entry = page.getByText(senderDomain, { exact: true })
    await expect(entry).toBeVisible()
    await entry.click()

    await expect(page).toHaveURL(/\/domains\/\d+$/)
    await expect(page.getByRole('heading', { name: senderDomain })).toBeVisible()

    await page.getByRole('link', { name: 'Back' }).click()
    await expect(page).toHaveURL(/\/domains$/)
})
