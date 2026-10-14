import { expect, test } from '@playwright/test'
import {
    admin,
    card,
    dialog,
    input,
    login,
    navigation,
    projectName,
    selectOption,
    senderDomain,
} from './support/fixtures.ts'

test('an administrator creates a project and assigns the sender domain', async ({ page }) => {
    await login(page, admin)
    await navigation(page).getByRole('link', { name: 'Projects' }).click()
    await expect(page.getByText('Create your first project')).toBeVisible()

    await page.getByRole('button', { name: 'New project' }).first().click()
    const newProject = dialog(page)
    await expect(newProject.getByText('New project')).toBeVisible()
    await newProject.getByRole('button', { name: 'Create project' }).click()
    await expect(newProject.getByText('Enter a name for the project.')).toBeVisible()
    await input(newProject, 'name').fill(projectName)
    await newProject.getByRole('button', { name: 'Create project' }).click()

    await expect(page).toHaveURL(/\/projects\/\d+$/)
    await expect(page.getByRole('heading', { name: projectName, level: 1 })).toBeVisible()
    await expect(page.getByText('Project created')).toBeVisible()
    await expect(card(page, 'Sender domains').getByText("Forms here can't send mail yet")).toBeVisible()
    await expect(card(page, 'Inbound forms').getByText('No forms yet')).toBeVisible()

    await card(page, 'Sender domains').getByRole('button', { name: 'Assign domain' }).click()
    const assign = dialog(page)
    await selectOption(assign, 'Sender domain', senderDomain)
    await assign.getByRole('button', { name: 'Assign domain' }).click()
    await expect(assign).toBeHidden()

    const domainsCard = card(page, 'Sender domains')
    await expect(domainsCard.getByText(senderDomain, { exact: true })).toBeVisible()
    await expect(domainsCard.getByText("Forms here can't send mail yet")).toBeHidden()

    await page.reload()
    await expect(domainsCard.getByText(senderDomain, { exact: true })).toBeVisible()

    await page.goto('/projects')
    await expect(page.getByText(projectName)).toBeVisible()
    await expect(page.getByText('No forms · 1 sender domain · No members')).toBeVisible()
    await expect(page.getByText('Domain invalid')).toBeVisible()
})
