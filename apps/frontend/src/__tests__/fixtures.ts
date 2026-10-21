import type {
    ApiKeyCreatedDto,
    ApiKeyDto,
    DeletedProjectDto,
    DomainDetailDto,
    DomainDnsRecordDto,
    DomainDto,
    InboundFormDetailDto,
    InboundFormTemplateDto,
    InboundFormListDto,
    InboundFormReceiverDto,
    MailMessageDto,
    ProjectDetailDto,
    ProjectListDto,
    ProjectMemberDto,
    ProjectRoleDto,
    UserListDto,
} from 'api'

const created = new Date('2026-01-01T00:00:00.000Z')

export function dnsRecord(overrides: Partial<DomainDnsRecordDto> = {}): DomainDnsRecordDto {
    return {
        current: null,
        host: 'forms.acme.com',
        status: 'valid',
        type: 'txt',
        use: 'spf',
        value: 'v=spf1 include:mail.acme-mailer.com ~all',
        ...overrides,
    }
}

export function domain(overrides: Partial<DomainDto> = {}, status: DomainDnsRecordDto['status'] = 'valid'): DomainDto {
    return {
        domainId: 5,
        fqdn: 'forms.acme.com',
        rootDomain: 'acme.com',
        dns: {
            spf: dnsRecord({ use: 'spf', status }),
            dkim: dnsRecord({ use: 'dkim', host: 's1._domainkey.forms.acme.com', status }),
            dmarc: dnsRecord({ use: 'dmarc', host: '_dmarc.forms.acme.com', status }),
        },
        lastCheckedAt: null,
        ...overrides,
    }
}

export function domainDetail(overrides: Partial<DomainDetailDto> = {}): DomainDetailDto {
    return { ...domain(), projects: [], ...overrides }
}

export function projectListItem(overrides: Partial<ProjectListDto> = {}): ProjectListDto {
    return {
        projectId: 1,
        name: 'Acme Website',
        createdAt: created,
        updatedAt: created,
        inboundFormCount: 3,
        domainCount: 1,
        memberCount: 2,
        domainsHealthy: true,
        ...overrides,
    }
}

export function projectDetail(overrides: Partial<ProjectDetailDto> = {}): ProjectDetailDto {
    return {
        projectId: 1,
        name: 'Acme Website',
        createdAt: created,
        updatedAt: created,
        domains: [],
        ...overrides,
    }
}

export function deletedProject(overrides: Partial<DeletedProjectDto> = {}): DeletedProjectDto {
    return {
        projectId: 2,
        name: 'Spring Campaign',
        createdAt: created,
        updatedAt: created,
        deletedAt: created,
        purgeAt: new Date('2026-01-31T00:00:00.000Z'),
        ...overrides,
    }
}

export function receiver(overrides: Partial<InboundFormReceiverDto> = {}): InboundFormReceiverDto {
    return {
        inboundFormReceiverId: 1,
        emailFrom: 'forms@acme.com',
        emailReceiver: 'sales@acme.com',
        emailReplyTo: null,
        isActive: true,
        draftVersion: null,
        publishedVersion: 1,
        ...overrides,
    }
}

export function formListItem(overrides: Partial<InboundFormListDto> = {}): InboundFormListDto {
    return {
        inboundFormId: 9,
        projectId: 1,
        domainId: null,
        name: 'Contact request',
        slug: 'contact-request',
        isActive: true,
        allowedHostnames: [],
        createdAt: created,
        receivers: [receiver()],
        ...overrides,
    }
}

export function member(overrides: Partial<ProjectMemberDto> = {}): ProjectMemberDto {
    return {
        userId: 2,
        firstName: 'Lisa',
        lastName: 'Schneider',
        email: 'lisa@acme.com',
        role: { roleId: 7, name: 'Maintainer' },
        permissions: [],
        ...overrides,
    }
}

export function projectRoles(): ProjectRoleDto[] {
    return [
        { roleId: 5, name: 'Viewer', description: 'Sees the project, its forms and sent mail.', permissions: ['read'] },
        {
            roleId: 6,
            name: 'Editor',
            description: 'Builds forms and templates.',
            permissions: ['read', 'forms.manage'],
        },
        {
            roleId: 7,
            name: 'Maintainer',
            description: 'Runs the project day to day: forms, API keys, members and domains.',
            permissions: ['read', 'update', 'forms.manage', 'api_keys.manage', 'members.manage'],
        },
        {
            roleId: 8,
            name: 'Owner',
            description: 'Everything, including deleting the project.',
            permissions: ['read', 'update', 'delete', 'forms.manage', 'api_keys.manage', 'members.manage'],
        },
    ]
}

export function userListItem(overrides: Partial<UserListDto> = {}): UserListDto {
    return {
        userId: 3,
        firstName: 'Tom',
        lastName: 'Becker',
        email: 'tom@acme.com',
        role: { roleId: 3, type: 'user', name: 'User' },
        createdAt: created,
        updatedAt: created,
        membershipCount: 0,
        allProjects: false,
        ...overrides,
    }
}

export function formDetail(overrides: Partial<InboundFormDetailDto> = {}): InboundFormDetailDto {
    return {
        inboundFormId: 9,
        projectId: 1,
        domainId: 5,
        name: 'Contact request',
        slug: 'contact-request',
        isActive: true,
        allowedHostnames: [],
        createdAt: created,
        fields: [
            {
                inboundFormFieldId: 21,
                key: 'name',
                label: 'Full name',
                type: 'text',
                defaultValue: null,
                validation: { required: true, minLength: 1, maxLength: 100 },
            },
            {
                inboundFormFieldId: 22,
                key: 'email',
                label: 'Email address',
                type: 'email',
                defaultValue: null,
                validation: { required: true },
            },
        ],
        security: [{ inboundFormSecurityId: 41, type: 'honeypot', location: 'body', key: 'website', config: null }],
        receivers: [receiver({ emailFrom: 'noreply@forms.acme.com' })],
        ...overrides,
    }
}

export function template(overrides: Partial<InboundFormTemplateDto> = {}): InboundFormTemplateDto {
    return {
        inboundFormTemplateId: 61,
        inboundFormReceiverId: 1,
        status: 'draft',
        subject: 'New contact request',
        template: '<p>{{name}}</p>',
        version: 2,
        updatedAt: created,
        ...overrides,
    }
}

export function apiKey(overrides: Partial<ApiKeyDto> = {}): ApiKeyDto {
    return {
        apiKeyId: 11,
        name: 'Newsletter',
        prefix: 'sdm_a1B2c3D4',
        createdByUserId: 1,
        lastUsedAt: null,
        revokedAt: null,
        createdAt: new Date('2026-10-01T10:00:00Z'),
        ...overrides,
    }
}

export function apiKeyCreated(overrides: Partial<ApiKeyCreatedDto> = {}): ApiKeyCreatedDto {
    return {
        ...apiKey(),
        key: 'sdm_a1B2c3D4_Zx9-Q8_wV7uT6sR5qP4oN3mL2kJ1iH0gF9eD8cB7aA6',
        ...overrides,
    }
}

export function mailMessage(overrides: Partial<MailMessageDto> = {}): MailMessageDto {
    return {
        mailMessageId: 70,
        source: 'api',
        apiKeyId: 11,
        emailFrom: 'news@forms.acme.com',
        emailTo: 'reader@example.org',
        subject: 'Welcome aboard',
        status: 'sent',
        error: null,
        sentAt: new Date('2026-10-01T10:00:00Z'),
        createdAt: new Date('2026-10-01T10:00:00Z'),
        ...overrides,
    }
}
