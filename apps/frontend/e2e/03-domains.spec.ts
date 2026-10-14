import { expect, test } from '@playwright/test'
import { admin, card, dialog, input, login, navigation, senderDomain } from './support/fixtures.ts'

test('an administrator adds a sender domain and inspects its DNS records', async ({ page }) => {
    await login(page, admin)
    await navigation(page).getByRole('link', { name: 'Domains' }).click()
    await expect(page.getByRole('heading', { name: 'Domains', level: 1 })).toBeVisible()
    await expect(page.getByText('Add your first sender domain')).toBeVisible()

    await page.getByRole('button', { name: 'New domain' }).first().click()
    const newDomain = dialog(page)
    await expect(newDomain.getByText('New sender domain')).toBeVisible()

    await input(newDomain, 'fqdn').fill('not a domain')
    await input(newDomain, 'fqdn').blur()
    await expect(newDomain.getByText('Enter a domain name, like mail.example.com.')).toBeVisible()

    await input(newDomain, 'fqdn').fill('acme-e2e.com')
    await expect(newDomain.getByText('Use a subdomain if you can')).toBeVisible()
    await input(newDomain, 'fqdn').fill(senderDomain)
    await expect(newDomain.getByText('Use a subdomain if you can')).toBeHidden()
    await newDomain.getByRole('button', { name: 'Add domain' }).click()

    await expect(page).toHaveURL(/\/domains\/\d+$/)
    await expect(page.getByRole('heading', { name: senderDomain, level: 1 })).toBeVisible()
    const records = card(page, 'DNS records')
    await expect(records).toBeVisible()
    for (const record of ['SPF', 'DKIM', 'DMARC']) {
        await expect(records.getByRole('heading', { level: 3, name: new RegExp(`^${record}`) })).toBeVisible()
    }
    await expect(records.getByText('Invalid', { exact: true }).first()).toBeVisible()

    const values = await records.locator('.copy-field__value').allTextContents()
    expect(values.some((value) => value.startsWith('v=spf1'))).toBe(true)
    expect(values.some((value) => value.startsWith('v=DKIM1'))).toBe(true)
    expect(values.some((value) => value.startsWith('v=DMARC1'))).toBe(true)
    expect(values.some((value) => value.includes(`_domainkey.${senderDomain}`))).toBe(true)
    await expect(card(page, 'Used by').getByText('No project uses this domain')).toBeVisible()
})

test('the domain list links to the domain page and breadcrumbs lead back', async ({ page }) => {
    await login(page, admin)
    await page.goto('/domains')

    const entry = page.getByRole('link', { name: new RegExp(senderDomain) })
    await expect(entry).toBeVisible()
    await entry.click()

    await expect(page).toHaveURL(/\/domains\/\d+$/)
    await expect(page.getByRole('heading', { name: senderDomain, level: 1 })).toBeVisible()

    await page.getByRole('navigation', { name: 'Breadcrumbs' }).getByRole('link', { name: 'Domains' }).click()
    await expect(page).toHaveURL(/\/domains$/)
})
