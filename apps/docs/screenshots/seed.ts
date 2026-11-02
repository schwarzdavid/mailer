import { setTimeout as delay } from 'node:timers/promises'
import { expect } from '@playwright/test'
import { createTransport } from 'nodemailer'
import {
    ApiKeyApi,
    AuthApi,
    BounceApi,
    DomainApi,
    InboundFormApi,
    MailMessageApi,
    ProjectApi,
    PublicFormApi,
    RoleApi,
    SettingsApi,
    UserApi,
} from 'api'
import { client } from 'api/client'

export const admin = {
    firstName: 'Ada',
    lastName: 'Admin',
    email: 'ada@example.org',
    password: 'correct-horse-battery-staple',
} as const

export interface SeededIds {
    projectId: number
    domainId: number
    inboundFormId: number
    receiverId: number
    userId: number
    roleId: number
}

const websiteOrigin = 'https://www.example.org'
const bounceMailbox = 'bounce@example.com'
const bouncedAddress = 'blocked@example.org'
export const customerDomain = 'mail.example.net'

const contactTemplate = [
    '<h1>New message from {{name}}</h1>',
    '<p>Name: {{name}}</p>',
    '<p>Email: {{email}}</p>',
    '<p>{{message}}</p>',
].join('\n')

function dsnSource(): string {
    return [
        'From: MAILER-DAEMON@relay.example.net',
        `To: ${bounceMailbox}`,
        'Subject: Undelivered Mail Returned to Sender',
        `Date: ${new Date().toUTCString()}`,
        'Message-ID: <dsn-screenshots@relay.example.net>',
        'MIME-Version: 1.0',
        'Content-Type: multipart/report; report-type=delivery-status; boundary="BOUND"',
        '',
        '--BOUND',
        'Content-Type: text/plain; charset=utf-8',
        '',
        'This is the mail system at host relay.example.net.',
        '',
        '--BOUND',
        'Content-Type: message/delivery-status',
        '',
        'Reporting-MTA: dns; relay.example.net',
        '',
        `Final-Recipient: rfc822; ${bouncedAddress}`,
        'Action: failed',
        'Status: 5.1.1',
        'Diagnostic-Code: smtp; 550 5.1.1 User unknown',
        '',
        '--BOUND--',
        '',
    ].join('\r\n')
}

async function submitContactForm(slug: string): Promise<void> {
    const headers = { Origin: websiteOrigin }
    const issued = await PublicFormApi.issueInboundFormToken({ path: { slug }, headers })
    await delay(issued.waitMs + 500)
    await PublicFormApi.submitInboundForm({
        path: { slug },
        headers,
        body: {
            data: {
                name: 'Jane Doe',
                email: 'jane.doe@example.org',
                message: 'I would like a quote for your services.',
            },
            security: { website: '', formToken: issued.token },
        },
    })
}

async function injectBounce(greenmailSmtpPort: number): Promise<void> {
    const transport = createTransport({ host: '127.0.0.1', port: greenmailSmtpPort, secure: false, ignoreTLS: true })
    await transport.sendMail({
        envelope: { from: 'mailer-daemon@relay.example.net', to: bounceMailbox },
        raw: dsnSource(),
    })
    transport.close()
}

export async function seedAfterOnboarding(apiUrl: string, greenmailSmtpPort: number): Promise<SeededIds> {
    client.setConfig({ baseUrl: apiUrl })
    const { token } = await AuthApi.login({ body: { email: admin.email, password: admin.password } })
    client.setConfig({ baseUrl: apiUrl, auth: () => token })

    await SettingsApi.configureSendingDomain({ body: { serverIpv4: '203.0.113.10', serverIpv6: '2001:db8::10' } })

    const { projectId } = await ProjectApi.createProject({ body: { name: 'Acme Website' } })
    const { domainId } = await DomainApi.createDomain({ body: { fqdn: customerDomain } })
    await ProjectApi.assignProjectDomain({ path: { projectId }, body: { domainId } })

    const { inboundFormId, slug } = await InboundFormApi.createInboundForm({
        body: { projectId, domainId, name: 'Contact form', slug: 'contact' },
    })
    await InboundFormApi.updateInboundForm({
        path: { inboundFormId },
        body: { allowedHostnames: [new URL(websiteOrigin).hostname] },
    })
    await InboundFormApi.updateInboundFormFields({
        path: { inboundFormId },
        body: {
            fields: [
                { type: 'text', key: 'name', label: 'Name', defaultValue: null, validation: { required: true } },
                { type: 'email', key: 'email', label: 'Email', defaultValue: null, validation: { required: true } },
                {
                    type: 'text',
                    key: 'message',
                    label: 'Message',
                    defaultValue: null,
                    validation: { required: true, maxLength: 2000 },
                },
            ],
        },
    })
    await InboundFormApi.updateInboundFormSecurity({
        path: { inboundFormId },
        body: {
            security: [
                { type: 'honeypot', location: 'body', key: 'website', config: null },
                {
                    type: 'timed-token',
                    location: 'body',
                    key: 'formToken',
                    config: { minDelaySeconds: 3, maxAgeSeconds: 3600 },
                },
            ],
        },
    })
    const { inboundFormReceiverId: receiverId } = await InboundFormApi.createInboundFormReceiver({
        path: { inboundFormId },
        body: {
            isActive: true,
            emailFrom: `contact@${customerDomain}`,
            emailReceiver: 'inbox@example.org',
            emailReplyTo: '{{email}}',
        },
    })
    const templatePath = { inboundFormId, inboundFormReceiverId: receiverId }
    await InboundFormApi.saveInboundFormTemplateDraft({
        path: templatePath,
        body: { subject: 'New message from {{name}}', template: contactTemplate },
    })
    await InboundFormApi.publishInboundFormTemplate({ path: templatePath })

    await ApiKeyApi.createApiKey({ path: { projectId }, body: { name: 'Website' } })

    const userRole = (await RoleApi.getRoles()).find((role) => role.type === 'user')
    if (!userRole) {
        throw new Error('The built-in User role is missing')
    }
    const { userId } = await UserApi.createUser({
        body: {
            firstName: 'Max',
            lastName: 'Member',
            email: 'max@example.org',
            password: 'limited-access-password',
            roleId: userRole.roleId,
        },
    })
    const { roleId } = await RoleApi.createRole({
        body: {
            name: 'Support',
            scope: 'global',
            description: 'Reads bounces to answer delivery questions.',
            permissions: ['bounces.read'],
        },
    })

    await submitContactForm(slug)
    await expect
        .poll(async () => (await MailMessageApi.getProjectMessages({ path: { projectId } })).items.length, {
            timeout: 60_000,
        })
        .toBe(1)

    await injectBounce(greenmailSmtpPort)
    await expect
        .poll(async () => (await BounceApi.getBounces()).items.length, { timeout: 120_000, intervals: [5_000] })
        .toBe(1)

    return { projectId, domainId, inboundFormId, receiverId, userId, roleId }
}
