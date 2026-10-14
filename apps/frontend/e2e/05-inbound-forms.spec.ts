import { expect, test, type Page } from '@playwright/test'
import {
    admin,
    card,
    dialog,
    formName,
    formSlug,
    input,
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

async function openForm(page: Page): Promise<void> {
    await page.goto('/projects')
    await page.getByRole('link', { name: new RegExp(projectName) }).click()
    await card(page, 'Inbound forms')
        .getByRole('link', { name: new RegExp(formName) })
        .click()
    await expect(page.getByRole('heading', { name: formName, level: 1 })).toBeVisible()
}

async function addField(page: Page, field: FieldInput): Promise<void> {
    await card(page, 'Fields').getByRole('button', { name: 'Add field' }).click()
    const fieldDialog = dialog(page)
    await input(fieldDialog, 'key').fill(field.key)
    await input(fieldDialog, 'label').fill(field.label)
    if (field.type !== 'Text') {
        await selectOption(fieldDialog, 'Type', field.type)
    }
    if (field.required) {
        await input(fieldDialog, 'required').check()
    }
    await fieldDialog.getByRole('button', { name: 'Add field' }).click()
    await expect(fieldDialog).toBeHidden()
}

test.describe.configure({ mode: 'serial' })

test('an administrator creates an inbound form with fields and a receiver', async ({ page }) => {
    await login(page, admin)
    await page.goto('/projects')
    await page.getByRole('link', { name: new RegExp(projectName) }).click()
    await expect(page.getByRole('heading', { name: projectName, level: 1 })).toBeVisible()

    await card(page, 'Inbound forms').getByRole('button', { name: 'New form' }).click()
    const newForm = dialog(page)
    await expect(newForm.getByText('New inbound form')).toBeVisible()
    await input(newForm, 'name').fill(formName)
    await expect(input(newForm, 'slug')).toHaveValue(formSlug)
    await newForm.getByRole('button', { name: 'Create form' }).click()

    await expect(page).toHaveURL(/\/forms\/\d+$/)
    await expect(page.getByRole('heading', { name: formName, level: 1 })).toBeVisible()
    await expect(card(page, 'Endpoint').locator('.copy-field__value').first()).toHaveText(
        new RegExp(`/api/public/form/${formSlug}$`),
    )
    await expect(page.getByRole('navigation', { name: 'Breadcrumbs' })).toContainText(projectName)
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
    await expect(receivers.getByText('Submissions are accepted but nobody is emailed.')).toBeVisible()
    await receivers.getByRole('button', { name: 'Add receiver' }).click()
    const receiverDialog = dialog(page)
    await expect(input(receiverDialog, 'emailFrom')).toHaveValue(`noreply@${senderDomain}`)
    await receiverDialog.getByRole('combobox', { name: /^Recipient/ }).fill(receiverAddress)
    await receiverDialog.getByRole('combobox', { name: /^Reply-To/ }).fill('{{email}}')
    await receiverDialog.getByRole('button', { name: 'Add receiver' }).click()
    await expect(receiverDialog).toBeHidden()

    await expect(receivers.getByText(`noreply@${senderDomain} → ${receiverAddress}`)).toBeVisible()
    await expect(receivers.getByText('{{email}}')).toBeVisible()
    await expect(receivers.getByText('No template')).toBeVisible()
})

test('an administrator writes and publishes the receiver template', async ({ page }) => {
    await login(page, admin)
    await openForm(page)

    await card(page, 'Receivers').getByRole('link', { name: 'Write template' }).click()
    await expect(page.getByRole('heading', { name: 'Email template', level: 1 })).toBeVisible()
    await page.getByRole('button', { name: 'Start empty' }).click()

    await input(page, 'subject').fill('New contact from {{name}}')

    const editor = page.locator('.monaco-editor')
    await editor.locator('.view-lines').click()
    await page.keyboard.press('ControlOrMeta+A')
    await page.keyboard.press('Delete')
    await page.keyboard.type('<h1>Hello from ')
    await page.getByRole('button', { name: 'Insert field name', exact: true }).click()
    await editor.locator('.view-lines').click()
    await page.keyboard.press('ControlOrMeta+End')
    await page.keyboard.type('<p id="message">')
    await page.getByRole('button', { name: 'Insert field message', exact: true }).click()
    await expect(page.getByText('Unsaved changes')).toBeVisible()

    const preview = page.frameLocator('iframe[title="Preview"]')
    await expect(preview.locator('h1')).toHaveText('Hello from Sample Your name')
    await expect(preview.locator('#message')).toHaveText('Sample Message')

    await page.getByTestId('publish').click()
    const confirm = dialog(page)
    await expect(confirm.getByText('Publish draft v1?')).toBeVisible()
    const publishResponse = page.waitForResponse(
        (response) => response.request().method() === 'POST' && response.url().endsWith('/publish'),
    )
    await confirm.getByRole('button', { name: 'Publish' }).click()
    expect((await publishResponse).ok()).toBe(true)
    await expect(page.getByText('Published as v1')).toBeVisible()

    await page.reload()
    await expect(input(page, 'subject')).toHaveValue('New contact from {{name}}')
    await expect(preview.locator('h1')).toHaveText('Hello from Sample Your name')

    await page.getByRole('navigation', { name: 'Breadcrumbs' }).getByRole('link', { name: formName }).click()
    await expect(page.getByRole('heading', { name: formName, level: 1 })).toBeVisible()
    await expect(card(page, 'Receivers').getByText('Published v1')).toBeVisible()
})

test('the receiver dialog pre-fills the sender even when the project loads slowly', async ({ page }) => {
    await login(page, admin)
    await openForm(page)

    await page.route('**/api/project/*', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 1_000))
        await route.continue()
    })
    await page.reload()
    await card(page, 'Receivers').getByRole('button', { name: 'Add receiver' }).click()

    await expect(input(dialog(page), 'emailFrom')).toHaveValue(`noreply@${senderDomain}`)
})

test('the template editor closes tags, expands emmet and switches layouts', async ({ page }) => {
    await login(page, admin)
    await openForm(page)
    await card(page, 'Receivers').getByRole('link', { name: 'Edit template' }).click()
    await expect(page.getByRole('heading', { name: 'Email template', level: 1 })).toBeVisible()

    const editor = page.locator('.monaco-editor')
    await editor.locator('.view-lines').click()
    await page.keyboard.press('ControlOrMeta+End')
    await page.keyboard.press('Enter')
    await page.keyboard.type('<section>')
    await expect(editor.locator('.view-lines')).toContainText('<section></section>')

    await page.keyboard.press('Enter')
    await page.keyboard.type('ul>li*2')
    await page.keyboard.press('Tab')
    await expect(editor.locator('.view-lines')).toContainText('<li></li>')
    await page.keyboard.type('{{')
    await expect(page.locator('.suggest-widget.visible')).toBeVisible()
    await page.screenshot({ path: 'test-results/template-suggest.png' })
    await page.keyboard.press('Escape')

    await page.getByRole('button', { name: 'Preview', exact: true }).click()
    await expect(editor).toBeHidden()
    await expect(page.frameLocator('iframe[title="Preview"]').locator('h1')).toBeVisible()
    await page.getByRole('button', { name: 'Editor', exact: true }).click()
    await expect(page.locator('iframe[title="Preview"]')).toBeHidden()
    await page.getByRole('button', { name: 'Split', exact: true }).click()
    await expect(editor).toBeVisible()
    await page.screenshot({ path: 'test-results/template-split.png' })
})
