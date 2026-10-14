import { expect, test } from '@playwright/test'
import { admin, card, login, projectName, selectOption, senderDomain } from './support/fixtures.ts'

test('an administrator creates a project and assigns the sender domain', async ({ page }) => {
    await login(page, admin)
    await page.getByRole('tab', { name: 'Projects' }).click()
    await expect(page.getByText('No projects yet. Create one to group your forms and domains.')).toBeVisible()

    await page.getByRole('button', { name: 'Add' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('New Project')).toBeVisible()
    await dialog.getByLabel('Name', { exact: true }).fill(projectName)
    await dialog.getByRole('button', { name: 'Save' }).click()

    await expect(page).toHaveURL(/\/projects\/\d+$/)
    await expect(page.getByRole('heading', { name: projectName })).toBeVisible()
    await expect(
        page.getByText('No domains assigned yet. Assign a domain so forms in this project can send mail.'),
    ).toBeVisible()
    await expect(page.getByText('No forms in this project yet.')).toBeVisible()

    await selectOption(card(page, 'Domains'), 'Domain name', senderDomain)
    await page.getByRole('button', { name: 'Assign' }).click()

    const domainsCard = card(page, 'Domains')
    await expect(domainsCard.getByText(senderDomain, { exact: true })).toBeVisible()
    await expect(page.getByText('No domains assigned yet.', { exact: false })).toBeHidden()

    await page.reload()
    await expect(domainsCard.getByText(senderDomain, { exact: true })).toBeVisible()

    await page.goto('/projects')
    await expect(page.getByText(projectName)).toBeVisible()
    await expect(page.getByText('0 forms · 1 domains')).toBeVisible()
})
