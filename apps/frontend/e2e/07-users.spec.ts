import { expect, test } from '@playwright/test'
import {
    admin,
    card,
    dialog,
    input,
    jwt,
    login,
    member,
    navigation,
    projectName,
    requireEnv,
    selectOption,
} from './support/fixtures.ts'

const memberName = `${member.firstName} ${member.lastName}`

test.describe.configure({ mode: 'serial' })

test('an administrator creates a user with the limited User role', async ({ page }) => {
    await login(page, admin)
    await navigation(page).getByRole('link', { name: 'Users' }).click()
    await expect(page.getByRole('heading', { name: 'Users', level: 1 })).toBeVisible()
    await expect(page.getByText(admin.email)).toBeVisible()

    await page.getByRole('button', { name: 'New user' }).click()
    const newUser = dialog(page)
    await expect(newUser.getByText('New user')).toBeVisible()
    await input(newUser, 'firstName').fill(member.firstName)
    await input(newUser, 'lastName').fill(member.lastName)
    await input(newUser, 'email').fill(member.email)
    await input(newUser, 'password').fill(member.password)
    await expect(newUser.getByText('No permissions of its own')).toBeVisible()
    await newUser.getByRole('button', { name: 'Create user' }).click()

    await expect(page).toHaveURL(/\/users\/\d+$/)
    await expect(page.getByRole('heading', { name: memberName, level: 1 })).toBeVisible()
    await expect(card(page, 'Project memberships').getByText('No project memberships')).toBeVisible()

    await page.goto('/users')
    await expect(page.getByText(member.email)).toBeVisible()
})

test('an administrator grants the user read access to the project', async ({ page }) => {
    await login(page, admin)
    await page.goto('/projects')
    await page.getByRole('link', { name: new RegExp(projectName) }).click()

    const members = card(page, 'Members')
    await expect(members.getByText('No members yet')).toBeVisible()
    await members.getByRole('button', { name: 'Add member' }).click()
    const memberDialog = dialog(page)
    await selectOption(memberDialog, 'User', memberName)
    await memberDialog.getByRole('button', { name: 'Add member' }).click()
    await expect(memberDialog).toBeHidden()

    await expect(members.getByText(member.email)).toBeVisible()
    await expect(members.getByText('Read', { exact: true })).toBeVisible()
})

test('the limited user only sees what their permissions allow', async ({ page, request }) => {
    await login(page, member)

    await expect(navigation(page).getByRole('link', { name: 'Dashboard' })).toBeVisible()
    await expect(navigation(page).getByRole('link', { name: 'Projects' })).toBeVisible()
    for (const hidden of ['Domains', 'Bounces', 'Users', 'Settings']) {
        await expect(navigation(page).getByRole('link', { name: hidden })).toBeHidden()
    }

    await navigation(page).getByRole('link', { name: 'Projects' }).click()
    await expect(page.getByRole('link', { name: new RegExp(projectName) })).toBeVisible()
    await expect(page.getByRole('button', { name: 'New project' })).toBeHidden()

    await page.getByRole('link', { name: new RegExp(projectName) }).click()
    await expect(page.getByRole('heading', { name: projectName, level: 1 })).toBeVisible()
    await expect(page.getByText('Read only')).toBeVisible()
    await expect(card(page, 'Members')).toBeHidden()
    await expect(page.getByRole('button', { name: 'Assign domain' })).toBeHidden()
    await expect(page.getByRole('button', { name: 'New form' })).toBeHidden()
    await expect(page.getByText('Delete project')).toBeHidden()

    for (const path of ['/users', '/domains', '/settings', '/bounces']) {
        await page.goto(path)
        await expect(page.getByText("You don't have access to this page")).toBeVisible()
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
