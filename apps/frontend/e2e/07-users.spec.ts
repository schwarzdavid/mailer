import { expect, test } from '@playwright/test'
import { admin, card, jwt, login, member, projectName, requireEnv, selectOption } from './support/fixtures.ts'

const memberName = `${member.firstName} ${member.lastName}`

test.describe.configure({ mode: 'serial' })

test('an administrator creates a user with the limited User role', async ({ page }) => {
    await login(page, admin)
    await page.getByRole('tab', { name: 'Users' }).click()
    await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible()
    await expect(page.getByText(admin.email)).toBeVisible()

    await page.getByRole('button', { name: 'Add' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('New User')).toBeVisible()
    await dialog.getByLabel('First name', { exact: true }).fill(member.firstName)
    await dialog.getByLabel('Last name', { exact: true }).fill(member.lastName)
    await dialog.getByLabel('Email Address', { exact: true }).fill(member.email)
    await dialog.getByLabel('Password', { exact: true }).fill(member.password)
    await selectOption(dialog, 'Role', 'User')
    await dialog.getByRole('button', { name: 'Save' }).click()

    await expect(page).toHaveURL(/\/users\/\d+$/)
    await expect(page.getByRole('heading', { name: memberName })).toBeVisible()
    await expect(page.getByText('No project access granted.')).toBeVisible()

    await page.goto('/users')
    await expect(page.getByText(member.email)).toBeVisible()
})

test('an administrator grants the user read access to the project', async ({ page }) => {
    await login(page, admin)
    await page.goto('/projects')
    await page.getByText(projectName).click()

    const members = card(page, 'Members')
    await expect(members.getByText('No members yet.')).toBeVisible()
    await members.getByRole('button', { name: 'Add member' }).click()
    const dialog = page.getByRole('dialog')
    await selectOption(dialog, 'User', memberName)
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).toBeHidden()

    await expect(members.getByText(member.email)).toBeVisible()
    await expect(members.getByText('Read', { exact: true })).toBeVisible()
})

test('the limited user only sees what their permissions allow', async ({ page, request }) => {
    await login(page, member)

    await expect(page.getByRole('tab', { name: 'Dashboard' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Projects' })).toBeVisible()
    for (const hidden of ['Domains', 'Bounces', 'Users', 'Settings']) {
        await expect(page.getByRole('tab', { name: hidden })).toBeHidden()
    }

    await page.getByRole('tab', { name: 'Projects' }).click()
    await expect(page.getByText(projectName)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add' })).toBeHidden()

    await page.getByText(projectName).click()
    await expect(page.getByRole('heading', { name: projectName })).toBeVisible()
    await expect(card(page, 'Members')).toBeHidden()
    await expect(card(page, 'Domains').getByRole('button', { name: 'Assign' })).toBeHidden()
    await expect(card(page, 'Inbound Forms').getByRole('button', { name: 'Add', exact: true })).toBeHidden()

    for (const path of ['/users', '/domains', '/settings', '/bounces']) {
        await page.goto(path)
        await expect(page).toHaveURL(/\/$/)
        await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    }

    const token = await jwt(page)
    expect(token).toBeTruthy()
    const headers = { Authorization: `Bearer ${token}` }
    const apiUrl = requireEnv('E2E_API_URL')
    for (const path of ['/api/domain', '/api/user', '/api/settings']) {
        const response = await request.get(new URL(path, apiUrl).href, { headers })
        expect(response.status(), path).toBe(403)
    }
    const createProject = await request.post(new URL('/api/project', apiUrl).href, {
        headers,
        data: { name: 'Not allowed' },
    })
    expect(createProject.status()).toBe(403)
})
