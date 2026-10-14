import { expect, test, type Locator, type Page } from '@playwright/test'
import {
    admin,
    card,
    formName,
    formSlug,
    login,
    projectName,
    receiverAddress,
    selectOption,
    senderDomain,
} from './support/fixtures.ts'

interface FieldInput {
    key: string
    label: string
    type: 'Text' | 'Email'
    required: boolean
}

const fields: FieldInput[] = [
    { key: 'name', label: 'Your name', type: 'Text', required: true },
    { key: 'email', label: 'Your email', type: 'Email', required: true },
    { key: 'message', label: 'Message', type: 'Text', required: false },
]

async function addField(page: Page, field: FieldInput): Promise<void> {
    await card(page, 'Fields').getByRole('button', { name: 'Add field' }).click()
    const dialog: Locator = page.getByRole('dialog')
    await dialog.getByLabel('Key', { exact: true }).fill(field.key)
    await dialog.getByLabel('Label', { exact: true }).fill(field.label)
    if (field.type !== 'Text') {
        await selectOption(dialog, 'Type', field.type)
    }
    if (field.required) {
        await dialog.getByLabel('Required', { exact: true }).check()
    }
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).toBeHidden()
}

test.describe.configure({ mode: 'serial' })

test('an administrator creates an inbound form with fields and a receiver', async ({ page }) => {
    await login(page, admin)
    await page.goto('/projects')
    await page.getByText(projectName).click()
    await expect(page.getByRole('heading', { name: projectName })).toBeVisible()

    await card(page, 'Inbound Forms').getByRole('button', { name: 'Add', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('New Form')).toBeVisible()
    await dialog.getByLabel('Name', { exact: true }).fill(formName)
    await expect(dialog.getByLabel('Slug', { exact: true })).toHaveValue(formSlug)
    await selectOption(dialog, 'Domain name', senderDomain)
    await dialog.getByRole('button', { name: 'Save' }).click()

    await expect(page).toHaveURL(/\/forms\/\d+$/)
    await expect(page.getByRole('heading', { name: formName })).toBeVisible()
    await expect(card(page, 'General').getByLabel('Endpoint URL', { exact: true })).toHaveValue(
        new RegExp(`/api/public/form/${formSlug}$`),
    )
    await expect(card(page, 'General').getByText(senderDomain, { exact: true })).toBeVisible()

    for (const field of fields) {
        await addField(page, field)
    }
    const fieldRows = card(page, 'Fields').locator('tbody tr')
    await expect(fieldRows).toHaveCount(fields.length)
    for (const field of fields) {
        await expect(fieldRows.filter({ hasText: field.label })).toContainText(field.type)
    }

    await page.reload()
    await expect(card(page, 'Fields').locator('tbody tr')).toHaveCount(fields.length)

    const receivers = card(page, 'Receivers')
    await receivers.getByRole('button', { name: 'Add receiver' }).click()
    const receiverDialog = page.getByRole('dialog')
    await receiverDialog.getByLabel('Sender', { exact: true }).fill(`noreply@${senderDomain}`)
    await receiverDialog.getByLabel('Recipient', { exact: true }).fill(receiverAddress)
    await receiverDialog.getByLabel('Reply-To', { exact: true }).fill('{{email}}')
    await receiverDialog.getByRole('button', { name: 'Save' }).click()
    await expect(receiverDialog).toBeHidden()

    await expect(receivers.getByText(`noreply@${senderDomain} → ${receiverAddress}`)).toBeVisible()
    await expect(receivers.getByText('Reply-To: {{email}}', { exact: false })).toBeVisible()
    await expect(receivers.getByText('No template')).toBeVisible()
})

test('an administrator writes and publishes the receiver template', async ({ page }) => {
    await login(page, admin)
    await page.goto('/projects')
    await page.getByText(projectName).click()
    await page.getByText(formName).click()
    await expect(page.getByRole('heading', { name: formName })).toBeVisible()

    await card(page, 'Receivers').getByRole('link', { name: 'Edit template' }).click()
    await expect(page.getByRole('heading', { name: 'Email template' })).toBeVisible()

    await page.getByLabel('Subject', { exact: true }).fill('New contact from {{name}}')

    const editor = page.locator('.monaco-editor')
    await editor.locator('.view-lines').click()
    await page.keyboard.press('ControlOrMeta+A')
    await page.keyboard.press('Delete')
    await page.keyboard.insertText('<h1>Hello from ')
    await page.getByRole('button', { name: 'Insert field name', exact: true }).click()
    await editor.locator('.view-lines').click()
    await page.keyboard.press('ControlOrMeta+End')
    await page.keyboard.insertText('</h1><p id="message">')
    await page.getByRole('button', { name: 'Insert field message', exact: true }).click()
    await editor.locator('.view-lines').click()
    await page.keyboard.press('ControlOrMeta+End')
    await page.keyboard.insertText('</p>')

    const preview = page.frameLocator('iframe[title="Preview"]')
    await expect(preview.locator('h1')).toHaveText('Hello from Sample Your name')
    await expect(preview.locator('#message')).toHaveText('Sample Message')

    const publishResponse = page.waitForResponse(
        (response) => response.request().method() === 'POST' && response.url().endsWith('/publish'),
    )
    await page.getByRole('button', { name: 'Publish' }).click()
    expect((await publishResponse).ok()).toBe(true)

    await page.reload()
    await expect(page.getByLabel('Subject', { exact: true })).toHaveValue('New contact from {{name}}')
    await expect(preview.locator('h1')).toHaveText('Hello from Sample Your name')

    await page
        .getByRole('link')
        .filter({ has: page.locator('.mdi-arrow-left') })
        .click()
    await expect(page.getByRole('heading', { name: formName })).toBeVisible()
    await expect(card(page, 'Receivers').getByText('Published v1')).toBeVisible()
})

test('the receiver dialog pre-fills the sender even when opened before the domains have loaded', async ({ page }) => {
    await login(page, admin)
    await page.goto('/projects')
    await page.getByText(projectName).click()
    await page.getByText(formName).click()
    await expect(page.getByRole('heading', { name: formName })).toBeVisible()

    await page.route('**/api/domain', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 1_000))
        await route.continue()
    })
    await page.reload()
    await card(page, 'Receivers').getByRole('button', { name: 'Add receiver' }).click()

    await expect(page.getByRole('dialog').getByLabel('Sender', { exact: true })).toHaveValue(`noreply@${senderDomain}`)
})
