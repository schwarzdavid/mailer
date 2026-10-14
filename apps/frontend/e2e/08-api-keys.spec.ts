import { expect, test } from '@playwright/test'
import {
    admin,
    card,
    dialog,
    input,
    login,
    navigation,
    projectName,
    requireEnv,
    senderDomain,
} from './support/fixtures.ts'

const recipient = 'api-reader@acme-e2e.com'
const sendUrl = () => new URL('/api/v1/send', requireEnv('E2E_API_URL')).href

test('an administrator creates an API key, sends mail with it and sees it in the log', async ({ page, request }) => {
    await login(page, admin)
    await navigation(page).getByRole('link', { name: 'Projects' }).click()
    await page.getByRole('link', { name: projectName, exact: true }).click()

    const keys = card(page, 'API keys')
    await expect(keys.getByText('No API keys yet')).toBeVisible()
    await keys.getByRole('button', { name: 'New API key' }).click()
    const create = dialog(page)
    await input(create, 'name').fill('E2E shop')
    await create.getByRole('button', { name: 'Create key' }).click()

    const reveal = dialog(page)
    await expect(reveal.getByText("Copy this key now. You won't be able to see it again.")).toBeVisible()
    const key = (await reveal.getByText(/^sdm_[0-9A-Za-z]{8}_/).textContent())!.trim()
    await reveal.getByRole('button', { name: 'Done' }).click()
    await expect(keys.getByText('E2E shop')).toBeVisible()
    await expect(keys.getByText('Never used')).toBeVisible()

    const response = await request.post(sendUrl(), {
        headers: { Authorization: `Bearer ${key}` },
        data: { from: `shop@${senderDomain}`, to: recipient, subject: 'Order confirmed', html: '<p>Thanks!</p>' },
    })
    expect(response.status()).toBe(202)

    await page.getByRole('link', { name: 'Sent mail' }).click()
    await expect(page).toHaveURL(/\/projects\/\d+\/messages$/)
    await expect(page.getByText(recipient)).toBeVisible()
    await expect(page.getByText('Order confirmed')).toBeVisible()

    await page.goBack()
    await keys.getByRole('button', { name: 'Revoke E2E shop' }).click()
    await dialog(page).getByRole('button', { name: 'Revoke key' }).click()
    await expect(keys.getByText('Revoked')).toBeVisible()

    const rejected = await request.post(sendUrl(), {
        headers: { Authorization: `Bearer ${key}` },
        data: { from: `shop@${senderDomain}`, to: recipient, subject: 'x', html: 'x' },
    })
    expect(rejected.status()).toBe(401)
})
