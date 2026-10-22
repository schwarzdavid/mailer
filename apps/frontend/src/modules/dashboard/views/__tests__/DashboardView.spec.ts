import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthApi, BounceApi, DomainApi, InboundFormApi, ProjectApi, SettingsApi, type BounceDto } from 'api'
import DashboardView from '../DashboardView.vue'
import { findButton, mountInApp } from '@/__tests__/support.ts'
import { dnsRecord, domain, formListItem, projectListItem, receiver } from '@/__tests__/fixtures.ts'

vi.stubGlobal('visualViewport', null)

const bounce: BounceDto = {
    bounceId: 1,
    emailAddress: 'j.smith@gmial.com',
    type: 'permanent',
    statusCode: '5.1.1',
    reason: 'User unknown',
    receivedAt: new Date(),
}

function mockApis(overrides: { projects?: boolean; forms?: ReturnType<typeof formListItem>[] } = {}) {
    vi.spyOn(AuthApi, 'currentUser').mockResolvedValue({
        userId: 1,
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@acme.com',
        role: { roleId: 1, type: 'super_admin', name: 'Super Admin' },
        createdAt: new Date(),
        updatedAt: new Date(),
    })
    vi.spyOn(ProjectApi, 'getProjects').mockResolvedValue(overrides.projects === false ? [] : [projectListItem()])
    vi.spyOn(ProjectApi, 'getDeletedProjects').mockResolvedValue([])
    vi.spyOn(InboundFormApi, 'getInboundForms').mockResolvedValue(
        overrides.forms ?? [
            formListItem({ domainId: 5 }),
            formListItem({
                inboundFormId: 10,
                name: 'Newsletter',
                slug: 'newsletter',
                isActive: false,
                receivers: [
                    receiver({ inboundFormReceiverId: 2, emailReceiver: 'crm@acme.com', publishedVersion: null }),
                ],
            }),
        ],
    )
    vi.spyOn(DomainApi, 'getDomains').mockResolvedValue([
        domain(),
        domain({ domainId: 6, fqdn: 'acme-careers.com' }, 'invalid'),
    ])
    vi.spyOn(SettingsApi, 'getSettings').mockResolvedValue({
        sendingDomain: {
            fqdn: 'mail.acme-mailer.com',
            serverIpv4: '203.0.113.10',
            serverIpv6: null,
            lastCheckedAt: null,
            records: [dnsRecord({ use: 'a', type: 'a' }), dnsRecord({ use: 'dkim', status: 'invalid' })],
        },
    })
    vi.spyOn(BounceApi, 'getBounces').mockImplementation((options) => {
        if (options?.query?.type === 'permanent') {
            return Promise.resolve({ items: [bounce], total: 3 })
        }
        if (options?.query?.receivedAfter) {
            return Promise.resolve({ items: [bounce], total: 6 })
        }
        return Promise.resolve({ items: [bounce], total: 312 })
    })
}

afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
})

describe('DashboardView', () => {
    it('greets the user and shows the stats', async () => {
        mockApis()
        const wrapper = mountInApp(DashboardView)

        await vi.waitFor(() => expect(wrapper.text()).toContain('Welcome back, Ada.'))
        await vi.waitFor(() => expect(wrapper.text()).toContain('Bounces · 7 days'))
        expect(wrapper.text()).toContain('Newsletter is off')
        expect(wrapper.text()).toContain('3 permanent · 3 transient')
        expect(wrapper.text()).toContain('1 needs DNS records')
    })

    it('lists everything that keeps mail from reaching an inbox', async () => {
        mockApis()
        const wrapper = mountInApp(DashboardView)

        await vi.waitFor(() => expect(wrapper.text()).toContain('1 sending-domain record is invalid'))
        await vi.waitFor(() => expect(wrapper.text()).toContain("acme-careers.com can't send yet"))
        expect(wrapper.text()).toContain('A receiver has no template')
        expect(wrapper.text()).toContain('3 permanent bounces this week')
    })

    it('groups forms by project with links', async () => {
        mockApis()
        const wrapper = mountInApp(DashboardView)

        await vi.waitFor(() => expect(wrapper.text()).toContain('Every form you can open, by project.'))
        expect(wrapper.text()).toContain('contact-request')
        expect(wrapper.text()).toContain('Acme Website')
    })

    it('flags a form without allowed domains as open to any website', async () => {
        mockApis({ forms: [formListItem({ allowedHostnames: [] })] })
        const wrapper = mountInApp(DashboardView)

        await vi.waitFor(() => expect(wrapper.text()).toContain('contact-request'))
        expect(wrapper.text()).toContain('Any website')
    })

    it('shows no open-origin warning once domains are allowed', async () => {
        mockApis({ forms: [formListItem({ allowedHostnames: ['kunde.at'] })] })
        const wrapper = mountInApp(DashboardView)

        await vi.waitFor(() => expect(wrapper.text()).toContain('contact-request'))
        expect(wrapper.text()).not.toContain('Any website')
    })

    it('says so when nothing needs attention', async () => {
        mockApis({ forms: [formListItem({ domainId: 5 })] })
        vi.spyOn(DomainApi, 'getDomains').mockResolvedValue([domain()])
        vi.spyOn(SettingsApi, 'getSettings').mockResolvedValue({
            sendingDomain: {
                fqdn: 'mail.acme-mailer.com',
                serverIpv4: '203.0.113.10',
                serverIpv6: null,
                lastCheckedAt: null,
                records: [dnsRecord()],
            },
        })
        vi.spyOn(BounceApi, 'getBounces').mockResolvedValue({ items: [], total: 0 })
        const wrapper = mountInApp(DashboardView)

        await vi.waitFor(() => expect(wrapper.text()).toContain('Nothing needs you'))
    })

    it('guides a new installation through getting started', async () => {
        mockApis({ projects: false, forms: [] })
        vi.spyOn(DomainApi, 'getDomains').mockResolvedValue([])
        const wrapper = mountInApp(DashboardView)

        await vi.waitFor(() => expect(wrapper.text()).toContain('Get started'))
        expect(wrapper.text()).toContain('Setup is done. Four steps to your first delivered submission.')
        expect(wrapper.text()).toContain('0 of 4 done.')
        expect(wrapper.text()).toContain('How it fits together')
        expect(wrapper.text()).not.toContain('Recent bounces')
    })

    it('shows limited users only what their permissions allow', async () => {
        mockApis()
        const wrapper = mountInApp(DashboardView, {}, [
            { action: 'read', subject: 'Project', conditions: { projectId: { $in: [1] } } },
        ])

        await vi.waitFor(() => expect(wrapper.text()).toContain('Forms in the projects you are a member of.'))
        expect(wrapper.text()).not.toContain('Delivery health')
        expect(wrapper.text()).not.toContain('Recent bounces')
        expect(wrapper.text()).not.toContain('Sender domains')
        expect(wrapper.text()).not.toContain('Get started')
    })

    it('offers a new form in an empty project to its form managers', async () => {
        mockApis({ forms: [] })
        const wrapper = mountInApp(DashboardView, {}, [
            { action: 'read', subject: 'Project', conditions: { projectId: { $in: [1] } } },
            { action: 'forms.manage', subject: 'Project', conditions: { projectId: { $in: [1] } } },
        ])

        await vi.waitFor(() => expect(wrapper.text()).toContain('No forms yet.'))
        expect(findButton(wrapper, 'New form')).toBeDefined()
    })

    it('offers no new form to project members without forms.manage', async () => {
        mockApis({ forms: [] })
        const wrapper = mountInApp(DashboardView, {}, [
            { action: 'read', subject: 'Project', conditions: { projectId: { $in: [1] } } },
            { action: 'update', subject: 'Project', conditions: { projectId: { $in: [1] } } },
        ])

        await vi.waitFor(() => expect(wrapper.text()).toContain('No forms yet.'))
        expect(findButton(wrapper, 'New form')).toBeUndefined()
    })

    it('keeps the dashboard usable when one card fails', async () => {
        mockApis()
        vi.spyOn(BounceApi, 'getBounces').mockRejectedValue(new Error('offline'))
        const wrapper = mountInApp(DashboardView)

        await vi.waitFor(() => expect(wrapper.text()).toContain("Couldn't load bounces"))
        expect(wrapper.text()).toContain('Contact request')
    })
})
