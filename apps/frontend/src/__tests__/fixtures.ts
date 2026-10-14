import type {
    DeletedProjectDto,
    DomainDetailDto,
    DomainDnsRecordDto,
    DomainDto,
    InboundFormDetailDto,
    InboundFormTemplateDto,
    InboundFormListDto,
    InboundFormReceiverDto,
    ProjectDetailDto,
    ProjectListDto,
    ProjectMemberDto,
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
        permissions: ['read', 'update'],
        ...overrides,
    }
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
