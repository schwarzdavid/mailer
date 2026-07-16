# Sending-Domain Configuration, DNS Health Cron & Onboarding — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Configure the platform's sending domain via a settings screen (with all deliverability DNS records), re-check records periodically with a health indicator in the nav, and replace the seeded admin user with a multi-step onboarding wizard.

**Architecture:** A single-row `settings` table points at a row in the existing `domains` table; the sending domain reuses domain/DKIM/DNS-record infrastructure with new record types (A, AAAA, MX, PTR, ip-based SPF). A `DnsHealthService` interval re-checks all domains. A public `setup` module registers the first user; the frontend gates all routes on setup status and shares the sending-domain form between onboarding and settings.

**Tech Stack:** NestJS + Sequelize/Postgres (backend), umzug migrations, `@nestjs/schedule`, Vue 3 + Vuetify 4 + TanStack Query + vee-validate/Zod (frontend), `@hey-api/openapi-ts` contract pipeline, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-15-sending-domain-config-onboarding-design.md`

## Global Constraints

- **Never touch git.** No `git add`/`commit`/anything. Tasks end with verification commands instead of commits; the user commits.
- **No comments in code**, including config files. Self-explanatory names only.
- **Prettier owns formatting:** 4-space indent, single quotes, no semicolons, trailing commas. Run `pnpm format:fix` if unsure; never hand-format against it.
- **Strict TypeScript everywhere.** `noUncheckedIndexedAccess` is on — index access yields `T | undefined`.
- **Typed test doubles:** every `vi.fn` typed with its call signature, prefer `Mock<Collaborator['method']>`; inputs/returns declared with domain interfaces/DTOs, no `as` casts. Sequelize rows modeled as `Interface & { get(options: { plain: true }): Interface }`.
- **Services return raw domain rows;** response DTOs with `@Expose` + `@ResponseDto`/`SerializeOptions` strip at the HTTP boundary.
- **Package manager is pnpm.** Single test file: `pnpm --filter backend exec vitest run <path>` / `pnpm --filter frontend exec vitest run <path>`.
- **After endpoint changes** regenerate the contract: `pnpm --filter backend generate` then `pnpm --filter api build` (requires local Postgres/Redis from `dev/docker-compose.yml` and a root `.env`).
- **Frontend i18n:** global `src/locales/en.json` only; shared keys at root (`field.*`, `cta.*`, `validation.*`), feature copy under `module.*`. Add Zod constraints and translation keys together.
- **Frontend never calls the SDK from components** — always via `queries/`/`mutations/` composables; route names only via the `RouteNames` enum.
- Backend unit specs live beside source as `*.spec.ts`; frontend specs under `__tests__/`. Frontend view specs must mock `waitAtleast` (`vi.mock('@/helper/waitAtleast.ts', ...)`) when a mutation uses it, otherwise tests stall on its timer.

---

### Task 1: Settings table, model, interfaces, and the `domain_dns` composite unique index

The sending domain's A, MX and SPF records all live on host `<fqdn>`, but migration 004 made `domain_dns.host` globally unique. Replace it with a composite unique on `(host, use)` and create the `settings` table.

**Files:**

- Create: `apps/backend/src/migrations/008-create-settings.ts`
- Create: `apps/backend/src/modules/settings/interfaces/settings.interface.ts`
- Create: `apps/backend/src/modules/settings/models/settings.model.ts`
- Modify: `apps/backend/src/modules/domain/models/domain-dns.model.ts` (drop `@Unique` on `host`, add composite index)
- Modify: `apps/backend/src/modules/domain/interfaces/domain.interface.ts` (add `SendingDomainIps`)

**Interfaces:**

- Produces: `Settings`, `SettingsCreate`, `SendingDomain`, `SendingDomainConfigure` (settings module); `SendingDomainIps` (domain module); `SettingsModel` with `sendingDomainId: number | null`, `serverIpv4: string`, `serverIpv6: string | null`. Later tasks inject `SettingsModel` via `@InjectModel(SettingsModel)`.

- [ ] **Step 1: Write the migration**

```typescript
// apps/backend/src/migrations/008-create-settings.ts
import type { MigrationFn } from 'umzug'
import { DataTypes, type QueryInterface } from 'sequelize'

export const up: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
    await queryInterface.createTable('settings', {
        settingId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true,
        },
        sendingDomainId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'domains',
                key: 'domainId',
            },
            onDelete: 'SET NULL',
            onUpdate: 'CASCADE',
        },
        serverIpv4: {
            type: DataTypes.STRING(45),
            allowNull: false,
        },
        serverIpv6: {
            type: DataTypes.STRING(45),
            allowNull: true,
        },
        createdAt: {
            type: DataTypes.DATE,
            allowNull: false,
        },
        updatedAt: {
            type: DataTypes.DATE,
            allowNull: false,
        },
    })

    await queryInterface.removeIndex('domain_dns', ['host'])
    await queryInterface.addIndex('domain_dns', ['host', 'use'], {
        name: 'domain_dns_host_use_unique',
        unique: true,
    })
}

export const down: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
    await queryInterface.removeIndex('domain_dns', 'domain_dns_host_use_unique')
    await queryInterface.addIndex('domain_dns', ['host'], { unique: true })
    await queryInterface.dropTable('settings')
}
```

- [ ] **Step 2: Write the settings interfaces**

```typescript
// apps/backend/src/modules/settings/interfaces/settings.interface.ts
import { DomainDnsRecord } from '../../domain/interfaces/domain-dns.interface'

export interface Settings {
    settingId: number
    sendingDomainId: number | null
    serverIpv4: string
    serverIpv6: string | null
    createdAt: Date
    updatedAt: Date
}

export type SettingsCreate = Omit<Settings, 'settingId' | 'createdAt' | 'updatedAt'>

export interface SendingDomain {
    fqdn: string
    serverIpv4: string
    serverIpv6: string | null
    lastCheckedAt: Date | null
    records: DomainDnsRecord[]
}

export interface SendingDomainConfigure {
    fqdn: string
    serverIpv4: string
    serverIpv6: string | null
}
```

- [ ] **Step 3: Add `SendingDomainIps` to the domain interfaces**

Append to `apps/backend/src/modules/domain/interfaces/domain.interface.ts`:

```typescript
export interface SendingDomainIps {
    serverIpv4: string
    serverIpv6: string | null
}
```

- [ ] **Step 4: Write the settings model**

```typescript
// apps/backend/src/modules/settings/models/settings.model.ts
import {
    AllowNull,
    AutoIncrement,
    BelongsTo,
    Column,
    CreatedAt,
    DataType,
    ForeignKey,
    Model,
    PrimaryKey,
    Table,
    UpdatedAt,
} from 'sequelize-typescript'
import { Settings, SettingsCreate } from '../interfaces/settings.interface'
import { DomainModel } from '../../domain/models/domain.model'

@Table({
    tableName: 'settings',
    timestamps: true,
})
export class SettingsModel extends Model<Settings, SettingsCreate> implements Settings {
    @PrimaryKey
    @AutoIncrement
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare settingId: number

    @AllowNull
    @ForeignKey(() => DomainModel)
    @Column(DataType.INTEGER)
    declare sendingDomainId: number | null

    @AllowNull(false)
    @Column(DataType.STRING(45))
    declare serverIpv4: string

    @AllowNull
    @Column(DataType.STRING(45))
    declare serverIpv6: string | null

    @BelongsTo(() => DomainModel, {
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
    })
    sendingDomain?: DomainModel | null

    @CreatedAt
    declare createdAt: Date

    @UpdatedAt
    declare updatedAt: Date
}
```

- [ ] **Step 5: Relax the host uniqueness on `DomainDnsModel`**

In `apps/backend/src/modules/domain/models/domain-dns.model.ts`:

- Remove the `@Unique` decorator from the `host` column (and drop `Unique` from the `sequelize-typescript` import).
- Change the `@Table` decorator to:

```typescript
@Table({
    tableName: 'domain_dns',
    indexes: [
        {
            name: 'domain_dns_host_use_unique',
            unique: true,
            fields: ['host', 'use'],
        },
    ],
})
```

- [ ] **Step 6: Verify**

Run: `pnpm --filter backend typecheck && pnpm --filter backend lint`
Expected: both pass (the new model is not yet registered anywhere, which is fine).

---

### Task 2: DNS record type/use extensions and per-type resolution in `DomainDnsService`

Extend the record enums, make `reloadDnsRecords` resolve A/AAAA/MX/PTR/TXT, tolerate unrelated TXT records on the same host (match any), and treat `ENODATA` like a missing record. Narrow `DomainDnsDto` so the wider enum doesn't break it.

**Files:**

- Modify: `apps/backend/src/modules/domain/interfaces/domain-dns.interface.ts`
- Modify: `apps/backend/src/modules/domain/services/domain-dns.service.ts`
- Modify: `apps/backend/src/modules/domain/dtos/domain-dns.dto.ts`
- Test: `apps/backend/src/modules/domain/services/domain-dns.service.spec.ts`

**Interfaces:**

- Consumes: nothing new.
- Produces: `DomainDnsRecordType.{TXT,A,AAAA,MX,PTR}`, `DomainDnsRecordUse.{SPF,DKIM,DMARC,A,AAAA,MX,PTR}`; `reloadDnsRecords(domainId: number): Promise<Domain>` unchanged in signature but resolving every type; private `resolveCurrentValues(record): Promise<string[]>`; private `createRecord(values: DomainDnsRecordCreate): Promise<DomainDnsRecord>` reused by later tasks.

- [ ] **Step 1: Extend the enums**

In `apps/backend/src/modules/domain/interfaces/domain-dns.interface.ts` replace the two enums:

```typescript
export enum DomainDnsRecordType {
    TXT = 'txt',
    A = 'a',
    AAAA = 'aaaa',
    MX = 'mx',
    PTR = 'ptr',
}

export enum DomainDnsRecordUse {
    SPF = 'spf',
    DKIM = 'dkim',
    DMARC = 'dmarc',
    A = 'a',
    AAAA = 'aaaa',
    MX = 'mx',
    PTR = 'ptr',
}
```

- [ ] **Step 2: Narrow `DomainDnsDto` to the customer uses**

Replace `apps/backend/src/modules/domain/dtos/domain-dns.dto.ts` with:

```typescript
import { DomainDnsRecord, DomainDnsRecordUse } from '../interfaces/domain-dns.interface'
import { DomainDnsRecordDto } from './domain-dns-record.dto'
import { Expose, plainToInstance } from 'class-transformer'
import { ApiProperty } from '@nestjs/swagger'

type CustomerDnsRecordUse = DomainDnsRecordUse.SPF | DomainDnsRecordUse.DKIM | DomainDnsRecordUse.DMARC

const CUSTOMER_DNS_RECORD_USES: readonly DomainDnsRecordUse[] = [
    DomainDnsRecordUse.SPF,
    DomainDnsRecordUse.DKIM,
    DomainDnsRecordUse.DMARC,
]

const isCustomerDnsRecordUse = (use: DomainDnsRecordUse): use is CustomerDnsRecordUse =>
    CUSTOMER_DNS_RECORD_USES.includes(use)

export class DomainDnsDto implements Record<CustomerDnsRecordUse, DomainDnsRecordDto> {
    @Expose()
    @ApiProperty({ name: DomainDnsRecordUse.SPF })
    [DomainDnsRecordUse.SPF]!: DomainDnsRecordDto;

    @Expose()
    @ApiProperty({ name: DomainDnsRecordUse.DKIM })
    [DomainDnsRecordUse.DKIM]!: DomainDnsRecordDto;

    @Expose()
    @ApiProperty({ name: DomainDnsRecordUse.DMARC })
    [DomainDnsRecordUse.DMARC]!: DomainDnsRecordDto

    static fromArray(records: DomainDnsRecord[]): DomainDnsDto {
        const dnsDto = new DomainDnsDto()
        records.forEach((record) => {
            if (isCustomerDnsRecordUse(record.use)) {
                dnsDto[record.use] = plainToInstance(DomainDnsRecordDto, record, {
                    excludeExtraneousValues: true,
                    exposeDefaultValues: true,
                })
            }
        })
        return dnsDto
    }
}
```

- [ ] **Step 3: Update the spec's DNS mock and write failing tests for per-type resolution**

In `apps/backend/src/modules/domain/services/domain-dns.service.spec.ts`:

Replace the module mock and mocked handles at the top:

```typescript
import { resolve, resolve4, resolveMx, reverse } from 'node:dns/promises'

vi.mock('node:dns/promises', () => ({
    resolve: vi.fn(),
    resolve4: vi.fn(),
    resolve6: vi.fn(),
    resolveMx: vi.fn(),
    reverse: vi.fn(),
}))

const resolveTxt = vi.mocked(resolve)
const resolveA = vi.mocked(resolve4)
const resolveMxRecords = vi.mocked(resolveMx)
const reversePtr = vi.mocked(reverse)
```

Inside the existing `describe('reloadDnsRecords', ...)` block, **delete** the test `'throws when a host resolves to more than one TXT record'` and add these tests:

```typescript
it('accepts the expected TXT value even when unrelated TXT records exist on the host', async () => {
    const record = reloadDnsRow(
        dnsRecord({
            use: DomainDnsRecordUse.SPF,
            host: 'example.com',
            value: 'v=spf1 include:mail.sending-domain.org ~all',
        }),
    )

    findByPk.mockResolvedValue(domainRow(domain))
    findAll.mockResolvedValue([record])
    resolveTxt.mockResolvedValue([['google-site-verification=abc'], ['v=spf1 include:mail.sending-domain.org ~all']])

    await service.reloadDnsRecords(3)

    expect(record.status).toBe(DomainDnsRecordStatus.VALID)
    expect(record.current).toBe('v=spf1 include:mail.sending-domain.org ~all')
})

it('treats ENODATA as a missing record', async () => {
    const record = reloadDnsRow(dnsRecord({ value: 'v=DKIM1; k=rsa; p=abc' }))
    const noData: NodeJS.ErrnoException = Object.assign(new Error('no data'), { code: 'ENODATA' })

    findByPk.mockResolvedValue(domainRow(domain))
    findAll.mockResolvedValue([record])
    resolveTxt.mockRejectedValue(noData)

    await service.reloadDnsRecords(3)

    expect(record.current).toBeNull()
    expect(record.status).toBe(DomainDnsRecordStatus.INVALID)
})

it('resolves an A record against the expected server ip', async () => {
    const record = reloadDnsRow(
        dnsRecord({
            type: DomainDnsRecordType.A,
            use: DomainDnsRecordUse.A,
            host: 'mail.sending-domain.org',
            value: '203.0.113.10',
        }),
    )

    findByPk.mockResolvedValue(domainRow(domain))
    findAll.mockResolvedValue([record])
    resolveA.mockResolvedValue(['203.0.113.10'])

    await service.reloadDnsRecords(3)

    expect(resolveA).toHaveBeenCalledWith('mail.sending-domain.org')
    expect(record.status).toBe(DomainDnsRecordStatus.VALID)
})

it('resolves an MX record by priority and exchange', async () => {
    const record = reloadDnsRow(
        dnsRecord({
            type: DomainDnsRecordType.MX,
            use: DomainDnsRecordUse.MX,
            host: 'mail.sending-domain.org',
            value: '10 mail.sending-domain.org',
        }),
    )

    findByPk.mockResolvedValue(domainRow(domain))
    findAll.mockResolvedValue([record])
    resolveMxRecords.mockResolvedValue([{ priority: 10, exchange: 'mail.sending-domain.org' }])

    await service.reloadDnsRecords(3)

    expect(record.status).toBe(DomainDnsRecordStatus.VALID)
})

it('resolves a PTR record through a reverse lookup of the ip host', async () => {
    const record = reloadDnsRow(
        dnsRecord({
            type: DomainDnsRecordType.PTR,
            use: DomainDnsRecordUse.PTR,
            host: '203.0.113.10',
            value: 'mail.sending-domain.org',
        }),
    )

    findByPk.mockResolvedValue(domainRow(domain))
    findAll.mockResolvedValue([record])
    reversePtr.mockResolvedValue(['mail.sending-domain.org'])

    await service.reloadDnsRecords(3)

    expect(reversePtr).toHaveBeenCalledWith('203.0.113.10')
    expect(record.status).toBe(DomainDnsRecordStatus.VALID)
})
```

- [ ] **Step 4: Run the spec to verify the new tests fail**

Run: `pnpm --filter backend exec vitest run src/modules/domain/services/domain-dns.service.spec.ts`
Expected: FAIL — A/MX/PTR tests error (resolvers never called), multi-TXT test fails with `Multiple TXT records found`.

- [ ] **Step 5: Rework resolution in `DomainDnsService`**

In `apps/backend/src/modules/domain/services/domain-dns.service.ts`:

Update the dns import and add a missing-code constant:

```typescript
import { resolve, resolve4, resolve6, resolveMx, reverse } from 'node:dns/promises'
```

```typescript
private static readonly MISSING_RECORD_CODES = ['ENOTFOUND', 'ENODATA']
```

Replace the body of `reloadDnsRecords` and add the two private helpers (`resolveCurrentValues`, `createRecord`); refactor the three existing `createDefault*Record` methods to use `createRecord`:

```typescript
async reloadDnsRecords(domainId: number): Promise<Domain> {
    const domain = await this.domainModel.findByPk(domainId, { rejectOnEmpty: true })
    const dnsRecords = await this.domainDnsModel.findAll({ where: { domainId } })

    this.logger.log(`Reloading DNS records for domain ${domain.fqdn}`)

    for (const record of dnsRecords) {
        const currentValues = await this.resolveCurrentValues(record)
        const matchedValue = currentValues.find((value) => value === record.value)

        this.logger.log(`Got ${record.type.toUpperCase()} values for ${record.host}: ${currentValues.join(', ') || '---'}`)

        record.current = matchedValue ?? currentValues[0] ?? null
        record.status = matchedValue ? DomainDnsRecordStatus.VALID : DomainDnsRecordStatus.INVALID

        await record.save()
    }

    domain.lastCheckedAt = new Date()
    await domain.save()

    domain.dnsRecords = dnsRecords

    return domain.get({ plain: true })
}

private async resolveCurrentValues(record: DomainDnsRecord): Promise<string[]> {
    try {
        switch (record.type) {
            case DomainDnsRecordType.TXT:
                return (await resolve(record.host, 'TXT')).map((chunks) => chunks.join(''))
            case DomainDnsRecordType.A:
                return await resolve4(record.host)
            case DomainDnsRecordType.AAAA:
                return await resolve6(record.host)
            case DomainDnsRecordType.MX:
                return (await resolveMx(record.host)).map((entry) => `${entry.priority} ${entry.exchange}`)
            case DomainDnsRecordType.PTR:
                return await reverse(record.host)
        }
    } catch (err) {
        const code = (err as ErrnoException)?.code
        if (code && DomainDnsService.MISSING_RECORD_CODES.includes(code)) {
            return []
        }
        throw err
    }
}

private async createRecord(values: DomainDnsRecordCreate): Promise<DomainDnsRecord> {
    const record = await this.domainDnsModel.create(values, { returning: true })
    return record.get({ plain: true })
}
```

`createDefaultSpfRecord`, `createDefaultDkimRecord` and `createDefaultDmarcRecord` keep their record attributes but delegate persistence to `this.createRecord({...})` instead of calling `domainDnsModel.create` + `get` themselves. Import `DomainDnsRecordCreate` from the interfaces file.

- [ ] **Step 6: Run the spec to verify it passes**

Run: `pnpm --filter backend exec vitest run src/modules/domain/services/domain-dns.service.spec.ts`
Expected: PASS (all existing tests plus the five new ones).

- [ ] **Step 7: Verify the workspace still builds**

Run: `pnpm --filter backend typecheck && pnpm --filter backend lint && pnpm --filter backend test`
Expected: all pass.

---

### Task 3: Sending-domain record creation and settings-driven SPF include host

`DomainDnsService` learns to create the sending domain's record set (A/AAAA/MX/ip-SPF/DKIM/DMARC/PTR), to look up the SPF include host for customer domains from the settings row (replacing the hardcoded `spf.schwarzdavid.email`), to regenerate customer SPF values after the sending domain changes, and to delete a domain's records.

**Files:**

- Modify: `apps/backend/src/modules/domain/services/domain-dns.service.ts`
- Modify: `apps/backend/src/modules/domain/domain.module.ts` (register `SettingsModel` in `forFeature`, export `DomainDnsService`)
- Test: `apps/backend/src/modules/domain/services/domain-dns.service.spec.ts`

**Interfaces:**

- Consumes: `SettingsModel`, `SendingDomainIps` (Task 1); `createRecord` (Task 2).
- Produces:
    - `createSendingDomainDnsRecords(domain: Domain, dkim: DomainDkim, ips: SendingDomainIps): Promise<DomainDnsRecord[]>`
    - `regenerateCustomerSpfRecords(sendingDomain: Pick<Domain, 'domainId' | 'fqdn'>): Promise<void>`
    - `deleteRecordsForDomain(domainId: number): Promise<void>`
    - `createDefaultDnsRecords` now **async-fails** with `BadRequestException('No sending domain configured.')` when no settings row/sending domain exists.

- [ ] **Step 1: Write failing tests**

In `domain-dns.service.spec.ts`:

Add imports: `BadRequestException` from `@nestjs/common`, `Op` from `sequelize`, `SettingsModel` from `../../settings/models/settings.model`, `Settings` from `../../settings/interfaces/settings.interface`, `SendingDomainIps` from `../interfaces/domain.interface`.

Extend the testing module with a settings mock. Add to the `describe` scope:

```typescript
let settingsFindOne: Mock<() => Promise<Settings | null>>
let update: Mock<(typeof DomainDnsModel)['update']>
let destroy: Mock<(options: { where: { domainId: number } }) => Promise<number>>

const settings: Settings = {
    settingId: 1,
    sendingDomainId: 10,
    serverIpv4: '203.0.113.10',
    serverIpv6: null,
    createdAt: new Date(),
    updatedAt: new Date(),
}

const sendingDomain: Domain = {
    domainId: 10,
    fqdn: 'mail.sending-domain.org',
    rootDomain: 'sending-domain.org',
    activeDkimId: 77,
    dnsRecords: [],
    lastCheckedAt: null,
}
```

In `beforeEach`, initialize them and register the provider:

```typescript
settingsFindOne = vi.fn<typeof settingsFindOne>().mockResolvedValue(settings)
update = vi.fn<typeof update>().mockResolvedValue([0])
destroy = vi.fn<typeof destroy>().mockResolvedValue(0)
```

- extend the `DomainDnsModel` provider value to `{ create, findAll, update, destroy }`
- widen the existing `findByPk` mock type to `Mock<(id: number, options?: { rejectOnEmpty: true }) => Promise<DomainRow>>` (it is currently typed with a `string` id) and make it resolve the sending domain for id `10`: `findByPk.mockImplementation((id) => Promise.resolve(domainRow(id === 10 ? sendingDomain : domain)))`
- add `{ provide: getModelToken(SettingsModel), useValue: { findOne: settingsFindOne } }` to the providers.

Update the existing SPF expectation test (`'builds the SPF record from the domain fqdn'`) to the settings-driven value:

```typescript
it('builds the customer SPF record from the configured sending domain', async () => {
    await service.createDefaultDnsRecords(domain, dkim)

    expect(attrsFor(DomainDnsRecordUse.SPF)).toEqual({
        domainId: 3,
        host: 'example.com',
        value: 'v=spf1 include:mail.sending-domain.org ~all',
        use: DomainDnsRecordUse.SPF,
        current: null,
        status: DomainDnsRecordStatus.INVALID,
        type: DomainDnsRecordType.TXT,
    })
})
```

Also update the `'rejects a DKIM key that belongs to a different domain'` test — the method is now async:

```typescript
it('rejects a DKIM key that belongs to a different domain', async () => {
    const foreignDkim: DomainDkim = { ...dkim, domainId: 99 }

    await expect(service.createDefaultDnsRecords(domain, foreignDkim)).rejects.toThrow('Domain and DKIM do not match')
    expect(create).not.toHaveBeenCalled()
})
```

Add new describe blocks:

```typescript
describe('createDefaultDnsRecords without a configured sending domain', () => {
    it('rejects with a bad request', async () => {
        settingsFindOne.mockResolvedValue(null)

        await expect(service.createDefaultDnsRecords(domain, dkim)).rejects.toBeInstanceOf(BadRequestException)
        expect(create).not.toHaveBeenCalled()
    })
})

describe('createSendingDomainDnsRecords', () => {
    const sendingDkim: DomainDkim = { ...dkim, dkimId: 77, domainId: 10 }
    const ips: SendingDomainIps = { serverIpv4: '203.0.113.10', serverIpv6: null }

    it('creates a, mx, ip-based spf, dkim, dmarc and ptr records', async () => {
        await service.createSendingDomainDnsRecords(sendingDomain, sendingDkim, ips)

        expect(attrsFor(DomainDnsRecordUse.A)).toMatchObject({
            domainId: 10,
            host: 'mail.sending-domain.org',
            value: '203.0.113.10',
            type: DomainDnsRecordType.A,
        })
        expect(attrsFor(DomainDnsRecordUse.MX)).toMatchObject({
            host: 'mail.sending-domain.org',
            value: '10 mail.sending-domain.org',
            type: DomainDnsRecordType.MX,
        })
        expect(attrsFor(DomainDnsRecordUse.SPF)).toMatchObject({
            host: 'mail.sending-domain.org',
            value: 'v=spf1 ip4:203.0.113.10 -all',
            type: DomainDnsRecordType.TXT,
        })
        expect(attrsFor(DomainDnsRecordUse.PTR)).toMatchObject({
            host: '203.0.113.10',
            value: 'mail.sending-domain.org',
            type: DomainDnsRecordType.PTR,
        })
        expect(attrsFor(DomainDnsRecordUse.DKIM)).toMatchObject({
            host: 's1._domainkey.mail.sending-domain.org',
        })
        expect(attrsFor(DomainDnsRecordUse.DMARC)).toMatchObject({
            host: '_dmarc.mail.sending-domain.org',
            value: 'v=DMARC1; p=none;',
        })
        expect(create).toHaveBeenCalledTimes(6)
    })

    it('adds aaaa and a second ptr record when an ipv6 address is configured', async () => {
        await service.createSendingDomainDnsRecords(sendingDomain, sendingDkim, {
            serverIpv4: '203.0.113.10',
            serverIpv6: '2001:db8::1',
        })

        expect(attrsFor(DomainDnsRecordUse.AAAA)).toMatchObject({
            host: 'mail.sending-domain.org',
            value: '2001:db8::1',
            type: DomainDnsRecordType.AAAA,
        })
        expect(attrsFor(DomainDnsRecordUse.SPF)).toMatchObject({
            value: 'v=spf1 ip4:203.0.113.10 ip6:2001:db8::1 -all',
        })
        const ptrCalls = create.mock.calls.filter(([values]) => values.use === DomainDnsRecordUse.PTR)
        expect(ptrCalls.map(([values]) => values.host)).toEqual(['203.0.113.10', '2001:db8::1'])
        expect(create).toHaveBeenCalledTimes(8)
    })

    it('rejects a DKIM key that belongs to a different domain', async () => {
        await expect(service.createSendingDomainDnsRecords(sendingDomain, dkim, ips)).rejects.toThrow(
            'Domain and DKIM do not match',
        )
    })
})

describe('regenerateCustomerSpfRecords', () => {
    it('rewrites every customer spf record and resets its status', async () => {
        await service.regenerateCustomerSpfRecords(sendingDomain)

        expect(update).toHaveBeenCalledWith(
            {
                value: 'v=spf1 include:mail.sending-domain.org ~all',
                status: DomainDnsRecordStatus.INVALID,
            },
            {
                where: {
                    use: DomainDnsRecordUse.SPF,
                    domainId: { [Op.ne]: 10 },
                },
            },
        )
    })
})

describe('deleteRecordsForDomain', () => {
    it('destroys all records of the domain', async () => {
        await service.deleteRecordsForDomain(10)

        expect(destroy).toHaveBeenCalledWith({ where: { domainId: 10 } })
    })
})
```

- [ ] **Step 2: Run the spec to verify the new tests fail**

Run: `pnpm --filter backend exec vitest run src/modules/domain/services/domain-dns.service.spec.ts`
Expected: FAIL — new methods missing, SPF value still hardcoded.

- [ ] **Step 3: Implement**

In `domain-dns.service.ts`:

- Remove the `SPF_MAILER` constant. Add imports: `BadRequestException` (from `@nestjs/common`), `Op` (from `sequelize`), `SettingsModel` (from `../../settings/models/settings.model`), `SendingDomainIps` (from `../interfaces/domain.interface`).
- Inject the settings model in the constructor:

```typescript
@InjectModel(SettingsModel) private readonly settingsModel: typeof SettingsModel,
```

- Make `createDefaultDnsRecords` async and settings-driven:

```typescript
async createDefaultDnsRecords(domain: Domain, dkim: DomainDkim): Promise<DomainDnsRecord[]> {
    if (domain.domainId !== dkim.domainId) {
        throw new Error('Domain and DKIM do not match')
    }

    const spfIncludeHost = await this.getSpfIncludeHost()

    return Promise.all([
        this.createRecord({
            domainId: domain.domainId,
            host: domain.fqdn,
            value: `v=spf1 include:${spfIncludeHost} ~all`,
            use: DomainDnsRecordUse.SPF,
            current: null,
            status: DomainDnsRecordStatus.INVALID,
            type: DomainDnsRecordType.TXT,
        }),
        this.createDefaultDkimRecord(domain, dkim),
        this.createDefaultDmarcRecord(domain),
    ])
}

private async getSpfIncludeHost(): Promise<string> {
    const settings = await this.settingsModel.findOne()
    if (!settings?.sendingDomainId) {
        throw new BadRequestException('No sending domain configured.')
    }
    const sendingDomain = await this.domainModel.findByPk(settings.sendingDomainId, { rejectOnEmpty: true })
    return sendingDomain.fqdn
}
```

(`createDefaultSpfRecord` disappears — its body is inlined above.)

- Add the new methods:

```typescript
async createSendingDomainDnsRecords(
    domain: Domain,
    dkim: DomainDkim,
    ips: SendingDomainIps,
): Promise<DomainDnsRecord[]> {
    if (domain.domainId !== dkim.domainId) {
        throw new Error('Domain and DKIM do not match')
    }

    const spfMechanisms = [`ip4:${ips.serverIpv4}`]
    if (ips.serverIpv6) {
        spfMechanisms.push(`ip6:${ips.serverIpv6}`)
    }

    const creates: DomainDnsRecordCreate[] = [
        {
            domainId: domain.domainId,
            host: domain.fqdn,
            value: ips.serverIpv4,
            use: DomainDnsRecordUse.A,
            current: null,
            status: DomainDnsRecordStatus.INVALID,
            type: DomainDnsRecordType.A,
        },
        {
            domainId: domain.domainId,
            host: domain.fqdn,
            value: `10 ${domain.fqdn}`,
            use: DomainDnsRecordUse.MX,
            current: null,
            status: DomainDnsRecordStatus.INVALID,
            type: DomainDnsRecordType.MX,
        },
        {
            domainId: domain.domainId,
            host: domain.fqdn,
            value: `v=spf1 ${spfMechanisms.join(' ')} -all`,
            use: DomainDnsRecordUse.SPF,
            current: null,
            status: DomainDnsRecordStatus.INVALID,
            type: DomainDnsRecordType.TXT,
        },
        {
            domainId: domain.domainId,
            host: ips.serverIpv4,
            value: domain.fqdn,
            use: DomainDnsRecordUse.PTR,
            current: null,
            status: DomainDnsRecordStatus.INVALID,
            type: DomainDnsRecordType.PTR,
        },
    ]

    if (ips.serverIpv6) {
        creates.push(
            {
                domainId: domain.domainId,
                host: domain.fqdn,
                value: ips.serverIpv6,
                use: DomainDnsRecordUse.AAAA,
                current: null,
                status: DomainDnsRecordStatus.INVALID,
                type: DomainDnsRecordType.AAAA,
            },
            {
                domainId: domain.domainId,
                host: ips.serverIpv6,
                value: domain.fqdn,
                use: DomainDnsRecordUse.PTR,
                current: null,
                status: DomainDnsRecordStatus.INVALID,
                type: DomainDnsRecordType.PTR,
            },
        )
    }

    const records: DomainDnsRecord[] = []
    for (const values of creates) {
        records.push(await this.createRecord(values))
    }
    records.push(await this.createDefaultDkimRecord(domain, dkim))
    records.push(await this.createDefaultDmarcRecord(domain))

    return records
}

async regenerateCustomerSpfRecords(sendingDomain: Pick<Domain, 'domainId' | 'fqdn'>): Promise<void> {
    await this.domainDnsModel.update(
        {
            value: `v=spf1 include:${sendingDomain.fqdn} ~all`,
            status: DomainDnsRecordStatus.INVALID,
        },
        {
            where: {
                use: DomainDnsRecordUse.SPF,
                domainId: { [Op.ne]: sendingDomain.domainId },
            },
        },
    )
}

async deleteRecordsForDomain(domainId: number): Promise<void> {
    await this.domainDnsModel.destroy({ where: { domainId } })
}
```

Note the sequential `for` loop when persisting: the ipv6 PTR insert must not race the ipv4 PTR insert on the composite unique index check inside one transactionless batch — sequential inserts keep failure modes deterministic and the test's call-order assertion stable.

- [ ] **Step 4: Register `SettingsModel` in the domain module and export the DNS service**

Replace `apps/backend/src/modules/domain/domain.module.ts` content:

```typescript
import { Module } from '@nestjs/common'
import { SequelizeModule } from '@nestjs/sequelize'
import { DomainModel } from './models/domain.model'
import { DomainDkimModel } from './models/domain-dkim.model'
import { DomainController } from './controller/domain.controller'
import { DomainService } from './services/domain.service'
import { DomainDkimService } from './services/domain-dkim.service'
import { DkimEncryptionService } from './services/dkim-encryption.service'
import { DomainDnsService } from './services/domain-dns.service'
import { DomainDnsModel } from './models/domain-dns.model'
import { SettingsModel } from '../settings/models/settings.model'

@Module({
    imports: [SequelizeModule.forFeature([DomainModel, DomainDkimModel, DomainDnsModel, SettingsModel])],
    controllers: [DomainController],
    providers: [DomainService, DomainDkimService, DkimEncryptionService, DomainDnsService],
    exports: [DomainService, DkimEncryptionService, DomainDnsService],
})
export class DomainModule {}
```

- [ ] **Step 5: Run the spec to verify it passes**

Run: `pnpm --filter backend exec vitest run src/modules/domain/services/domain-dns.service.spec.ts`
Expected: PASS.

- [ ] **Step 6: Verify the backend suite**

Run: `pnpm --filter backend test && pnpm --filter backend typecheck && pnpm --filter backend lint`
Expected: `domain.service.spec.ts` now FAILS (its `createDefaultDnsRecords` mock signature is stale and `DomainService` lacks the settings model — fixed in Task 4). Everything else passes. If only that spec fails, proceed.

---

### Task 4: `DomainService` sending-domain operations and customer-list exclusion

**Files:**

- Modify: `apps/backend/src/modules/domain/services/domain.service.ts`
- Test: `apps/backend/src/modules/domain/services/domain.service.spec.ts`

**Interfaces:**

- Consumes: `createSendingDomainDnsRecords`, `deleteRecordsForDomain` (Task 3); `SettingsModel`, `SendingDomainIps` (Task 1).
- Produces (used by Tasks 5 and 7):
    - `createSendingDomain(fqdn: string, ips: SendingDomainIps): Promise<Domain>`
    - `recreateSendingDomainRecords(fqdn: string, ips: SendingDomainIps): Promise<Domain>`
    - `getConfiguredSendingDomain(): Promise<Domain | null>`
    - `deleteDomain(domainId: number): Promise<void>`
    - `getDomains()` excludes the configured sending domain.

- [ ] **Step 1: Write failing tests**

In `apps/backend/src/modules/domain/services/domain.service.spec.ts`:

Add imports: `SettingsModel` from `../../settings/models/settings.model`, `Settings` from `../../settings/interfaces/settings.interface`, `SendingDomainIps` from `../interfaces/domain.interface`, and `Op` from `sequelize`.

Add mocks in the describe scope and `beforeEach`:

```typescript
let settingsFindOne: Mock<() => Promise<Settings | null>>
let destroy: Mock<(options: { where: { domainId: number } }) => Promise<number>>
let createSendingDomainDnsRecords: Mock<DomainDnsService['createSendingDomainDnsRecords']>
let deleteRecordsForDomain: Mock<DomainDnsService['deleteRecordsForDomain']>

const settings: Settings = {
    settingId: 1,
    sendingDomainId: 10,
    serverIpv4: '203.0.113.10',
    serverIpv6: null,
    createdAt: new Date(),
    updatedAt: new Date(),
}

const ips: SendingDomainIps = { serverIpv4: '203.0.113.10', serverIpv6: null }
```

```typescript
settingsFindOne = vi.fn<typeof settingsFindOne>().mockResolvedValue(null)
destroy = vi.fn<typeof destroy>().mockResolvedValue(1)
createSendingDomainDnsRecords = vi.fn<typeof createSendingDomainDnsRecords>().mockResolvedValue(dnsRecords)
deleteRecordsForDomain = vi.fn<typeof deleteRecordsForDomain>().mockResolvedValue(undefined)
```

- extend the `DomainDnsService` provider value to `{ createDefaultDnsRecords, createSendingDomainDnsRecords, deleteRecordsForDomain }`
- extend the `DomainModel` provider value to `{ create, findAll, findByPk, findOne, destroy }`
- add `{ provide: getModelToken(SettingsModel), useValue: { findOne: settingsFindOne } }`.

New tests:

```typescript
describe('createSendingDomain', () => {
    it('persists the domain, provisions dkim and creates the sending record set', async () => {
        const result = await service.createSendingDomain('mail.sending-domain.org', ips)

        expect(create).toHaveBeenCalledWith(
            { fqdn: 'mail.sending-domain.org', rootDomain: 'sending-domain.org' },
            { returning: true },
        )
        expect(createDkimForDomain).toHaveBeenCalledWith(expect.objectContaining({ domainId: 3 }), true)
        expect(createSendingDomainDnsRecords).toHaveBeenCalledWith(expect.objectContaining({ domainId: 3 }), dkim, ips)
        expect(result.dnsRecords).toBe(dnsRecords)
        expect(result.activeDkimId).toBe(55)
    })

    it('rejects an fqdn without a resolvable root domain', async () => {
        await expect(service.createSendingDomain('localhost', ips)).rejects.toBeInstanceOf(BadRequestException)
        expect(create).not.toHaveBeenCalled()
    })
})

describe('recreateSendingDomainRecords', () => {
    it('replaces the record set of the existing sending domain', async () => {
        const activeDkim: DomainDkim = { ...dkim, dkimId: 7, domainId: 1 }
        const sendingDomain: DomainWithActiveDkim = {
            domainId: 1,
            fqdn: 'mail.sending-domain.org',
            rootDomain: 'sending-domain.org',
            activeDkimId: 7,
            dnsRecords: [],
            lastCheckedAt: null,
            activeDkim,
        }
        findOne.mockResolvedValue({ activeDkim, get: () => sendingDomain } as unknown as DomainModel)

        const result = await service.recreateSendingDomainRecords('mail.sending-domain.org', ips)

        expect(deleteRecordsForDomain).toHaveBeenCalledWith(1)
        expect(createSendingDomainDnsRecords).toHaveBeenCalledWith(sendingDomain, activeDkim, ips)
        expect(result.dnsRecords).toBe(dnsRecords)
    })

    it('rejects when no sending domain exists for the fqdn', async () => {
        findOne.mockResolvedValue(null)

        await expect(service.recreateSendingDomainRecords('mail.sending-domain.org', ips)).rejects.toBeInstanceOf(
            BadRequestException,
        )
        expect(deleteRecordsForDomain).not.toHaveBeenCalled()
    })
})

describe('getConfiguredSendingDomain', () => {
    it('returns null when nothing is configured', async () => {
        settingsFindOne.mockResolvedValue(null)

        await expect(service.getConfiguredSendingDomain()).resolves.toBeNull()
    })

    it('returns the configured domain as a plain object', async () => {
        settingsFindOne.mockResolvedValue(settings)
        findByPk.mockResolvedValue(domainRow(persistedDomain))

        const result = await service.getConfiguredSendingDomain()

        expect(findByPk).toHaveBeenCalledWith(10)
        expect(result).toEqual(persistedDomain)
    })
})

describe('deleteDomain', () => {
    it('destroys the domain row', async () => {
        await service.deleteDomain(4)

        expect(destroy).toHaveBeenCalledWith({ where: { domainId: 4 } })
    })
})
```

And inside the existing `describe('getDomains', ...)`:

```typescript
it('excludes the configured sending domain', async () => {
    settingsFindOne.mockResolvedValue(settings)

    await service.getDomains()

    expect(findAll).toHaveBeenCalledWith({ where: { domainId: { [Op.ne]: 10 } } })
})

it('queries without a filter when nothing is configured', async () => {
    settingsFindOne.mockResolvedValue(null)

    await service.getDomains()

    expect(findAll).toHaveBeenCalledWith(undefined)
})
```

Note: if Task 3 did not already do it, widen the `findByPk` mock type to `(id: number, options?: { rejectOnEmpty: true }) => Promise<DomainRow>` — the service passes numbers and `getConfiguredSendingDomain` calls it without options.

- [ ] **Step 2: Run the spec to verify the new tests fail**

Run: `pnpm --filter backend exec vitest run src/modules/domain/services/domain.service.spec.ts`
Expected: FAIL — DI cannot resolve `SettingsModel` token / methods missing.

- [ ] **Step 3: Implement**

In `apps/backend/src/modules/domain/services/domain.service.ts`:

Add imports (`Op` from `sequelize`, `SettingsModel`, `SendingDomainIps`) and the constructor injection:

```typescript
@InjectModel(SettingsModel) private readonly settingsModel: typeof SettingsModel,
```

Replace `getDomains` and add the new methods:

```typescript
async createSendingDomain(fqdn: string, ips: SendingDomainIps): Promise<Domain> {
    const { domain: rootDomain } = parse(fqdn)
    if (!rootDomain) {
        throw new BadRequestException('Invalid domain.')
    }
    const domainModel = await this.domainModel.create(
        {
            fqdn,
            rootDomain,
        },
        { returning: true },
    )
    this.logger.log(`Created sending domain ${domainModel.fqdn}`)

    const dkim = await this.domainDkimService.createDkimForDomain(domainModel, true)
    const dnsRecords = await this.domainDnsService.createSendingDomainDnsRecords(domainModel, dkim, ips)

    const domain = domainModel.get({ plain: true })
    domain.activeDkimId = dkim.dkimId
    domain.dnsRecords = dnsRecords

    return domain
}

async recreateSendingDomainRecords(fqdn: string, ips: SendingDomainIps): Promise<Domain> {
    const domain = await this.getSendingDomainByFqdn(fqdn)
    if (!domain) {
        throw new BadRequestException(`No sending domain found for ${fqdn}`)
    }

    await this.domainDnsService.deleteRecordsForDomain(domain.domainId)
    domain.dnsRecords = await this.domainDnsService.createSendingDomainDnsRecords(domain, domain.activeDkim, ips)

    return domain
}

async getDomains(): Promise<Domain[]> {
    const settings = await this.settingsModel.findOne()
    const domains = await this.domainModel.findAll(
        settings?.sendingDomainId ? { where: { domainId: { [Op.ne]: settings.sendingDomainId } } } : undefined,
    )

    return domains.map((domain) => domain.get({ plain: true }))
}

async getConfiguredSendingDomain(): Promise<Domain | null> {
    const settings = await this.settingsModel.findOne()
    if (!settings?.sendingDomainId) {
        return null
    }
    const domain = await this.domainModel.findByPk(settings.sendingDomainId)

    return domain ? domain.get({ plain: true }) : null
}

async deleteDomain(domainId: number): Promise<void> {
    await this.domainModel.destroy({ where: { domainId } })
}
```

- [ ] **Step 4: Run the spec to verify it passes**

Run: `pnpm --filter backend exec vitest run src/modules/domain/services/domain.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Verify the backend suite**

Run: `pnpm --filter backend test && pnpm --filter backend typecheck && pnpm --filter backend lint`
Expected: all pass.

---

### Task 5: Settings module — service, controller, DTOs, wiring

**Files:**

- Create: `apps/backend/src/modules/settings/services/settings.service.ts`
- Create: `apps/backend/src/modules/settings/controller/settings.controller.ts`
- Create: `apps/backend/src/modules/settings/dtos/settings.dto.ts`
- Create: `apps/backend/src/modules/settings/dtos/sending-domain.dto.ts`
- Create: `apps/backend/src/modules/settings/dtos/sending-domain-configure.dto.ts`
- Create: `apps/backend/src/modules/settings/settings.module.ts`
- Modify: `apps/backend/src/app.module.ts` (import `SettingsModule`)
- Test: `apps/backend/src/modules/settings/services/settings.service.spec.ts`

**Interfaces:**

- Consumes: `DomainService.createSendingDomain/recreateSendingDomainRecords/getDomainById/deleteDomain` (Task 4), `DomainDnsService.regenerateCustomerSpfRecords/reloadDnsRecords` (Task 3), `SettingsModel` (Task 1).
- Produces HTTP endpoints `GET /settings`, `PUT /settings/sending-domain`, `POST /settings/sending-domain/refresh` (tag `settings` → SDK `SettingsApi.getSettings/configureSendingDomain/refreshSendingDomain`) and `SettingsService.getSendingDomain(): Promise<SendingDomain | null>`.

- [ ] **Step 1: Write the failing service spec**

```typescript
// apps/backend/src/modules/settings/services/settings.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing'
import { getModelToken } from '@nestjs/sequelize'
import { Logger, NotFoundException } from '@nestjs/common'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { SettingsService } from './settings.service'
import { SettingsModel } from '../models/settings.model'
import { Settings, SettingsCreate } from '../interfaces/settings.interface'
import { DomainService } from '../../domain/services/domain.service'
import { DomainDnsService } from '../../domain/services/domain-dns.service'
import { Domain } from '../../domain/interfaces/domain.interface'
import {
    DomainDnsRecord,
    DomainDnsRecordStatus,
    DomainDnsRecordType,
    DomainDnsRecordUse,
} from '../../domain/interfaces/domain-dns.interface'

type SettingsRow = Settings & { save: Mock<() => Promise<void>> }

const settingsRow = (base: Settings): SettingsRow => ({
    ...base,
    save: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
})

describe('SettingsService', () => {
    let service: SettingsService
    let findOne: Mock<() => Promise<SettingsRow | null>>
    let create: Mock<(values: SettingsCreate, options: { returning: true }) => Promise<SettingsRow>>
    let getDomainById: Mock<DomainService['getDomainById']>
    let createSendingDomain: Mock<DomainService['createSendingDomain']>
    let recreateSendingDomainRecords: Mock<DomainService['recreateSendingDomainRecords']>
    let deleteDomain: Mock<DomainService['deleteDomain']>
    let regenerateCustomerSpfRecords: Mock<DomainDnsService['regenerateCustomerSpfRecords']>
    let reloadDnsRecords: Mock<DomainDnsService['reloadDnsRecords']>

    const records: DomainDnsRecord[] = [
        {
            dnsId: 1,
            domainId: 10,
            type: DomainDnsRecordType.TXT,
            use: DomainDnsRecordUse.SPF,
            status: DomainDnsRecordStatus.INVALID,
            host: 'mail.sending-domain.org',
            value: 'v=spf1 ip4:203.0.113.10 -all',
            current: null,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    ]

    const sendingDomain: Domain = {
        domainId: 10,
        fqdn: 'mail.sending-domain.org',
        rootDomain: 'sending-domain.org',
        activeDkimId: 77,
        dnsRecords: records,
        lastCheckedAt: null,
    }

    const reloadedDomain: Domain = {
        ...sendingDomain,
        lastCheckedAt: new Date(),
        dnsRecords: [{ ...records[0]!, status: DomainDnsRecordStatus.VALID }],
    }

    const settings: Settings = {
        settingId: 1,
        sendingDomainId: 10,
        serverIpv4: '203.0.113.10',
        serverIpv6: null,
        createdAt: new Date(),
        updatedAt: new Date(),
    }

    beforeEach(async () => {
        vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
        vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)

        findOne = vi.fn<typeof findOne>().mockResolvedValue(null)
        create = vi
            .fn<typeof create>()
            .mockImplementation((values) => Promise.resolve(settingsRow({ ...settings, ...values })))
        getDomainById = vi.fn<typeof getDomainById>().mockResolvedValue(sendingDomain)
        createSendingDomain = vi.fn<typeof createSendingDomain>().mockResolvedValue(sendingDomain)
        recreateSendingDomainRecords = vi.fn<typeof recreateSendingDomainRecords>().mockResolvedValue(sendingDomain)
        deleteDomain = vi.fn<typeof deleteDomain>().mockResolvedValue(undefined)
        regenerateCustomerSpfRecords = vi.fn<typeof regenerateCustomerSpfRecords>().mockResolvedValue(undefined)
        reloadDnsRecords = vi.fn<typeof reloadDnsRecords>().mockResolvedValue(reloadedDomain)

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                SettingsService,
                {
                    provide: DomainService,
                    useValue: { getDomainById, createSendingDomain, recreateSendingDomainRecords, deleteDomain },
                },
                { provide: DomainDnsService, useValue: { regenerateCustomerSpfRecords, reloadDnsRecords } },
                { provide: getModelToken(SettingsModel), useValue: { findOne, create } },
            ],
        }).compile()

        service = module.get(SettingsService)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    describe('getSendingDomain', () => {
        it('returns null when no settings row exists', async () => {
            await expect(service.getSendingDomain()).resolves.toBeNull()
        })

        it('maps the configured domain and settings into a sending domain', async () => {
            findOne.mockResolvedValue(settingsRow(settings))

            const result = await service.getSendingDomain()

            expect(getDomainById).toHaveBeenCalledWith(10)
            expect(result).toEqual({
                fqdn: 'mail.sending-domain.org',
                serverIpv4: '203.0.113.10',
                serverIpv6: null,
                lastCheckedAt: null,
                records,
            })
        })
    })

    describe('configureSendingDomain', () => {
        const config = { fqdn: 'mail.sending-domain.org', serverIpv4: '203.0.113.10', serverIpv6: null }

        it('creates the domain and the settings row on first configuration', async () => {
            const result = await service.configureSendingDomain(config)

            expect(createSendingDomain).toHaveBeenCalledWith('mail.sending-domain.org', {
                serverIpv4: '203.0.113.10',
                serverIpv6: null,
            })
            expect(create).toHaveBeenCalledWith(
                { sendingDomainId: 10, serverIpv4: '203.0.113.10', serverIpv6: null },
                { returning: true },
            )
            expect(regenerateCustomerSpfRecords).toHaveBeenCalledWith(sendingDomain)
            expect(reloadDnsRecords).toHaveBeenCalledWith(10)
            expect(result.records).toEqual(reloadedDomain.dnsRecords)
        })

        it('recreates the record set when the fqdn is unchanged', async () => {
            const row = settingsRow(settings)
            findOne.mockResolvedValue(row)

            await service.configureSendingDomain({ ...config, serverIpv6: '2001:db8::1' })

            expect(recreateSendingDomainRecords).toHaveBeenCalledWith('mail.sending-domain.org', {
                serverIpv4: '203.0.113.10',
                serverIpv6: '2001:db8::1',
            })
            expect(createSendingDomain).not.toHaveBeenCalled()
            expect(deleteDomain).not.toHaveBeenCalled()
            expect(row.serverIpv6).toBe('2001:db8::1')
            expect(row.save).toHaveBeenCalledOnce()
        })

        it('creates a new domain and deletes the old one when the fqdn changes', async () => {
            const row = settingsRow(settings)
            findOne.mockResolvedValue(row)
            const newDomain: Domain = { ...sendingDomain, domainId: 11, fqdn: 'mail.other-sending.org' }
            createSendingDomain.mockResolvedValue(newDomain)
            reloadDnsRecords.mockResolvedValue(newDomain)

            await service.configureSendingDomain({ ...config, fqdn: 'mail.other-sending.org' })

            expect(createSendingDomain).toHaveBeenCalledWith('mail.other-sending.org', {
                serverIpv4: '203.0.113.10',
                serverIpv6: null,
            })
            expect(row.sendingDomainId).toBe(11)
            expect(row.save).toHaveBeenCalledOnce()
            expect(deleteDomain).toHaveBeenCalledWith(10)
        })

        it('returns the unrefreshed records when the initial dns check fails', async () => {
            reloadDnsRecords.mockRejectedValue(new Error('resolver down'))

            const result = await service.configureSendingDomain(config)

            expect(result.records).toEqual(records)
        })
    })

    describe('refreshSendingDomain', () => {
        it('throws when nothing is configured', async () => {
            await expect(service.refreshSendingDomain()).rejects.toBeInstanceOf(NotFoundException)
        })

        it('reloads the records and maps the result', async () => {
            findOne.mockResolvedValue(settingsRow(settings))

            const result = await service.refreshSendingDomain()

            expect(reloadDnsRecords).toHaveBeenCalledWith(10)
            expect(result.records).toEqual(reloadedDomain.dnsRecords)
            expect(result.lastCheckedAt).toBe(reloadedDomain.lastCheckedAt)
        })
    })
})
```

- [ ] **Step 2: Run the spec to verify it fails**

Run: `pnpm --filter backend exec vitest run src/modules/settings/services/settings.service.spec.ts`
Expected: FAIL — `settings.service.ts` does not exist.

- [ ] **Step 3: Implement the service**

```typescript
// apps/backend/src/modules/settings/services/settings.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/sequelize'
import { SettingsModel } from '../models/settings.model'
import { SendingDomain, SendingDomainConfigure, Settings } from '../interfaces/settings.interface'
import { DomainService } from '../../domain/services/domain.service'
import { DomainDnsService } from '../../domain/services/domain-dns.service'
import { Domain, SendingDomainIps } from '../../domain/interfaces/domain.interface'

@Injectable()
export class SettingsService {
    private readonly logger = new Logger(SettingsService.name)

    constructor(
        private readonly domainService: DomainService,
        private readonly domainDnsService: DomainDnsService,
        @InjectModel(SettingsModel) private readonly settingsModel: typeof SettingsModel,
    ) {}

    async getSendingDomain(): Promise<SendingDomain | null> {
        const settings = await this.settingsModel.findOne()
        if (!settings?.sendingDomainId) {
            return null
        }
        const domain = await this.domainService.getDomainById(settings.sendingDomainId)

        return this.toSendingDomain(domain, settings)
    }

    async configureSendingDomain(config: SendingDomainConfigure): Promise<SendingDomain> {
        const settings = await this.settingsModel.findOne()
        const currentDomain = settings?.sendingDomainId
            ? await this.domainService.getDomainById(settings.sendingDomainId)
            : null
        const ips: SendingDomainIps = { serverIpv4: config.serverIpv4, serverIpv6: config.serverIpv6 }

        const domain =
            currentDomain?.fqdn === config.fqdn
                ? await this.domainService.recreateSendingDomainRecords(config.fqdn, ips)
                : await this.domainService.createSendingDomain(config.fqdn, ips)

        let updatedSettings: Settings
        if (settings) {
            settings.sendingDomainId = domain.domainId
            settings.serverIpv4 = ips.serverIpv4
            settings.serverIpv6 = ips.serverIpv6
            await settings.save()
            updatedSettings = settings
        } else {
            updatedSettings = await this.settingsModel.create(
                { sendingDomainId: domain.domainId, ...ips },
                { returning: true },
            )
        }

        if (currentDomain && currentDomain.fqdn !== config.fqdn) {
            await this.domainService.deleteDomain(currentDomain.domainId)
        }

        await this.domainDnsService.regenerateCustomerSpfRecords(domain)
        this.logger.log(`Configured sending domain ${domain.fqdn}`)

        return this.toSendingDomain(await this.reloadRecords(domain), updatedSettings)
    }

    async refreshSendingDomain(): Promise<SendingDomain> {
        const settings = await this.settingsModel.findOne()
        if (!settings?.sendingDomainId) {
            throw new NotFoundException('No sending domain configured.')
        }
        const domain = await this.domainDnsService.reloadDnsRecords(settings.sendingDomainId)

        return this.toSendingDomain(domain, settings)
    }

    private async reloadRecords(domain: Domain): Promise<Domain> {
        try {
            return await this.domainDnsService.reloadDnsRecords(domain.domainId)
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            this.logger.error(`Initial DNS check for ${domain.fqdn} failed: ${message}`)
            return domain
        }
    }

    private toSendingDomain(domain: Domain, settings: Pick<Settings, 'serverIpv4' | 'serverIpv6'>): SendingDomain {
        return {
            fqdn: domain.fqdn,
            serverIpv4: settings.serverIpv4,
            serverIpv6: settings.serverIpv6,
            lastCheckedAt: domain.lastCheckedAt,
            records: domain.dnsRecords,
        }
    }
}
```

- [ ] **Step 4: Run the spec to verify it passes**

Run: `pnpm --filter backend exec vitest run src/modules/settings/services/settings.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Write the DTOs**

```typescript
// apps/backend/src/modules/settings/dtos/sending-domain.dto.ts
import { ApiProperty } from '@nestjs/swagger'
import { Expose, Type } from 'class-transformer'
import { SendingDomain } from '../interfaces/settings.interface'
import { DomainDnsRecordDto } from '../../domain/dtos/domain-dns-record.dto'

export class SendingDomainDto implements Omit<SendingDomain, 'records'> {
    @Expose()
    fqdn!: string

    @Expose()
    serverIpv4!: string

    @Expose()
    @ApiProperty({ type: String, nullable: true })
    serverIpv6: string | null = null

    @Expose()
    @ApiProperty({ type: Date, nullable: true })
    lastCheckedAt: Date | null = null

    @Expose()
    @Type(() => DomainDnsRecordDto)
    @ApiProperty({ type: [DomainDnsRecordDto] })
    records: DomainDnsRecordDto[] = []
}
```

```typescript
// apps/backend/src/modules/settings/dtos/settings.dto.ts
import { ApiProperty } from '@nestjs/swagger'
import { Expose, Type } from 'class-transformer'
import { SendingDomainDto } from './sending-domain.dto'

export class SettingsDto {
    @Expose()
    @Type(() => SendingDomainDto)
    @ApiProperty({ type: SendingDomainDto, nullable: true })
    sendingDomain: SendingDomainDto | null = null
}
```

```typescript
// apps/backend/src/modules/settings/dtos/sending-domain-configure.dto.ts
import { ApiProperty } from '@nestjs/swagger'
import { Expose } from 'class-transformer'
import { IsFQDN, IsIP, IsNotEmpty, IsOptional, IsString } from 'class-validator'
import { IsIcann } from '../../domain/validators/IsIcann'

export class SendingDomainConfigureDto {
    @Expose()
    @IsString()
    @IsNotEmpty()
    @IsFQDN()
    @IsIcann()
    fqdn!: string

    @Expose()
    @IsIP('4')
    serverIpv4!: string

    @Expose()
    @IsOptional()
    @IsIP('6')
    @ApiProperty({ type: String, required: false })
    serverIpv6?: string
}
```

- [ ] **Step 6: Write the controller and module, wire into `AppModule`**

```typescript
// apps/backend/src/modules/settings/controller/settings.controller.ts
import { Body, Controller, Get, Post, Put } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { JwtAuth } from '../../auth/decorators/JwtAuth'
import { ResponseDto } from '../../../decorators/ResponseDto'
import { SettingsService } from '../services/settings.service'
import { SettingsDto } from '../dtos/settings.dto'
import { SendingDomainDto } from '../dtos/sending-domain.dto'
import { SendingDomainConfigureDto } from '../dtos/sending-domain-configure.dto'

@JwtAuth()
@ApiTags('settings')
@Controller('settings')
export class SettingsController {
    constructor(private readonly settingsService: SettingsService) {}

    @ResponseDto(SettingsDto)
    @Get()
    async getSettings(): Promise<SettingsDto> {
        const sendingDomain = await this.settingsService.getSendingDomain()

        return { sendingDomain }
    }

    @ResponseDto(SendingDomainDto)
    @Put('sending-domain')
    configureSendingDomain(@Body() config: SendingDomainConfigureDto): Promise<SendingDomainDto> {
        return this.settingsService.configureSendingDomain({
            fqdn: config.fqdn,
            serverIpv4: config.serverIpv4,
            serverIpv6: config.serverIpv6 ?? null,
        })
    }

    @ResponseDto(SendingDomainDto)
    @Post('sending-domain/refresh')
    refreshSendingDomain(): Promise<SendingDomainDto> {
        return this.settingsService.refreshSendingDomain()
    }
}
```

(If `getSettings` raises a structural type error on `sendingDomain`, the `SendingDomain` interface and `SendingDomainDto` have drifted — align them rather than casting.)

```typescript
// apps/backend/src/modules/settings/settings.module.ts
import { Module } from '@nestjs/common'
import { SequelizeModule } from '@nestjs/sequelize'
import { SettingsModel } from './models/settings.model'
import { SettingsController } from './controller/settings.controller'
import { SettingsService } from './services/settings.service'
import { DomainModule } from '../domain/domain.module'

@Module({
    imports: [SequelizeModule.forFeature([SettingsModel]), DomainModule],
    controllers: [SettingsController],
    providers: [SettingsService],
    exports: [SettingsService],
})
export class SettingsModule {}
```

In `apps/backend/src/app.module.ts` add `import { SettingsModule } from './modules/settings/settings.module'` and append `SettingsModule` to the `imports` array (after `BounceModule`).

- [ ] **Step 7: Verify**

Run: `pnpm --filter backend test && pnpm --filter backend typecheck && pnpm --filter backend lint`
Expected: all pass.

---

### Task 6: DNS health cron

**Files:**

- Create: `apps/backend/src/modules/domain/domain.constants.ts`
- Create: `apps/backend/src/modules/domain/services/dns-health.service.ts`
- Modify: `apps/backend/src/modules/domain/domain.module.ts` (add `DnsHealthService` to providers)
- Test: `apps/backend/src/modules/domain/services/dns-health.service.spec.ts`

**Interfaces:**

- Consumes: `DomainDnsService.reloadDnsRecords` (Task 2).
- Produces: `DnsHealthService.checkAllDomains(): Promise<void>` on an `@Interval(DNS_CHECK_INTERVAL_MS)` of 15 minutes.

- [ ] **Step 1: Write the failing spec**

```typescript
// apps/backend/src/modules/domain/services/dns-health.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing'
import { getModelToken } from '@nestjs/sequelize'
import { Logger } from '@nestjs/common'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { DnsHealthService } from './dns-health.service'
import { DomainDnsService } from './domain-dns.service'
import { DomainModel } from '../models/domain.model'
import { Domain } from '../interfaces/domain.interface'

type DomainListRow = Pick<Domain, 'domainId' | 'fqdn'>

describe('DnsHealthService', () => {
    let service: DnsHealthService
    let findAll: Mock<() => Promise<DomainListRow[]>>
    let reloadDnsRecords: Mock<DomainDnsService['reloadDnsRecords']>

    const domains: DomainListRow[] = [
        { domainId: 1, fqdn: 'mail.sending-domain.org' },
        { domainId: 2, fqdn: 'example.com' },
    ]

    beforeEach(async () => {
        vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
        vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)

        findAll = vi.fn<typeof findAll>().mockResolvedValue(domains)
        reloadDnsRecords = vi.fn<typeof reloadDnsRecords>().mockResolvedValue({} as Domain)

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                DnsHealthService,
                { provide: DomainDnsService, useValue: { reloadDnsRecords } },
                { provide: getModelToken(DomainModel), useValue: { unscoped: () => ({ findAll }) } },
            ],
        }).compile()

        service = module.get(DnsHealthService)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('reloads the records of every domain', async () => {
        await service.checkAllDomains()

        expect(reloadDnsRecords).toHaveBeenCalledTimes(2)
        expect(reloadDnsRecords).toHaveBeenCalledWith(1)
        expect(reloadDnsRecords).toHaveBeenCalledWith(2)
    })

    it('continues with the remaining domains when one check fails', async () => {
        reloadDnsRecords.mockRejectedValueOnce(new Error('resolver down'))

        await service.checkAllDomains()

        expect(reloadDnsRecords).toHaveBeenCalledTimes(2)
        expect(reloadDnsRecords).toHaveBeenLastCalledWith(2)
    })

    it('skips a round while a previous round is still running', async () => {
        let finishFirstReload!: (value: Domain) => void
        reloadDnsRecords.mockReturnValueOnce(
            new Promise<Domain>((resolve) => {
                finishFirstReload = resolve
            }),
        )

        const firstRound = service.checkAllDomains()
        await service.checkAllDomains()

        finishFirstReload({} as Domain)
        await firstRound

        expect(findAll).toHaveBeenCalledTimes(1)
    })
})
```

- [ ] **Step 2: Run the spec to verify it fails**

Run: `pnpm --filter backend exec vitest run src/modules/domain/services/dns-health.service.spec.ts`
Expected: FAIL — service missing.

- [ ] **Step 3: Implement**

```typescript
// apps/backend/src/modules/domain/domain.constants.ts
export const DNS_CHECK_INTERVAL_MS = 15 * 60 * 1000
```

```typescript
// apps/backend/src/modules/domain/services/dns-health.service.ts
import { Injectable, Logger } from '@nestjs/common'
import { Interval } from '@nestjs/schedule'
import { InjectModel } from '@nestjs/sequelize'
import { DomainModel } from '../models/domain.model'
import { DomainDnsService } from './domain-dns.service'
import { DNS_CHECK_INTERVAL_MS } from '../domain.constants'

@Injectable()
export class DnsHealthService {
    private readonly logger = new Logger(DnsHealthService.name)
    private checkRunning = false

    constructor(
        private readonly domainDnsService: DomainDnsService,
        @InjectModel(DomainModel) private readonly domainModel: typeof DomainModel,
    ) {}

    @Interval(DNS_CHECK_INTERVAL_MS)
    async handleCheckInterval(): Promise<void> {
        await this.checkAllDomains()
    }

    async checkAllDomains(): Promise<void> {
        if (this.checkRunning) {
            return
        }
        this.checkRunning = true

        try {
            const domains = await this.domainModel.unscoped().findAll({ attributes: ['domainId', 'fqdn'] })
            for (const domain of domains) {
                try {
                    await this.domainDnsService.reloadDnsRecords(domain.domainId)
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error)
                    this.logger.error(`DNS check for ${domain.fqdn} failed: ${message}`)
                }
            }
        } finally {
            this.checkRunning = false
        }
    }
}
```

Add `DnsHealthService` to the `providers` array in `domain.module.ts` (import from `./services/dns-health.service`). It does not need to be exported.

- [ ] **Step 4: Run the spec to verify it passes**

Run: `pnpm --filter backend exec vitest run src/modules/domain/services/dns-health.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Verify**

Run: `pnpm --filter backend test && pnpm --filter backend typecheck && pnpm --filter backend lint`
Expected: all pass.

---

### Task 7: MailService derives the bounce envelope from the sending domain

**Files:**

- Modify: `apps/backend/src/modules/mail/services/mail.service.ts`
- Modify: `.env.example` (remove `BOUNCE_ADDRESS`)
- Test: `apps/backend/src/modules/mail/services/mail.service.spec.ts`

**Interfaces:**

- Consumes: `DomainService.getConfiguredSendingDomain()` (Task 4).
- Produces: unchanged `sendMail(mail: SendMail)`; envelope from becomes `bounce@<sending fqdn>`; `MailService` no longer injects `ConfigService`.

- [ ] **Step 1: Update the spec to the new behavior (failing first)**

In `apps/backend/src/modules/mail/services/mail.service.spec.ts`:

- Add a mock next to the existing DomainService mocks:

```typescript
let getConfiguredSendingDomain: Mock<DomainService['getConfiguredSendingDomain']>
```

```typescript
getConfiguredSendingDomain = vi.fn<typeof getConfiguredSendingDomain>().mockResolvedValue(null)
```

- Extend the DomainService provider: `{ provide: DomainService, useValue: { getSendingDomainByFqdn, getConfiguredSendingDomain } }`.
- Remove the `ConfigService` provider, the `config` record, and its import — the service no longer uses it.
- Replace the `BOUNCE_ADDRESS` envelope test:

```typescript
it('uses a bounce address at the configured sending domain as the envelope sender', async () => {
    getConfiguredSendingDomain.mockResolvedValue({
        domainId: 10,
        fqdn: 'mail.sending-domain.org',
        rootDomain: 'sending-domain.org',
        activeDkimId: 77,
        dnsRecords: [],
        lastCheckedAt: null,
    })

    await service.sendMail(mail)

    expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
            envelope: { from: 'bounce@mail.sending-domain.org', to: 'owner@business.com' },
        }),
    )
})

it('sends without an envelope override when no sending domain is configured', async () => {
    await service.sendMail(mail)

    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ envelope: undefined }))
})
```

- [ ] **Step 2: Run the spec to verify it fails**

Run: `pnpm --filter backend exec vitest run src/modules/mail/services/mail.service.spec.ts`
Expected: FAIL — `getConfiguredSendingDomain` never called; DI mismatch on removed ConfigService.

- [ ] **Step 3: Implement**

In `mail.service.ts`:

- Remove the `ConfigService` import and constructor parameter.
- Replace the `bounceAddress` lookup and envelope line:

```typescript
const sendingDomain = await this.domainService.getConfiguredSendingDomain()
```

```typescript
envelope: sendingDomain ? { from: `bounce@${sendingDomain.fqdn}`, to: mail.to } : undefined,
```

In `.env.example` delete the `BOUNCE_ADDRESS=bounces@example.com` line.

- [ ] **Step 4: Run the spec to verify it passes**

Run: `pnpm --filter backend exec vitest run src/modules/mail/services/mail.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Verify**

Run: `pnpm --filter backend test && pnpm --filter backend typecheck && pnpm --filter backend lint`
Expected: all pass.

---

### Task 8: Setup module, first-user registration, BootstrapService removal

**Files:**

- Create: `apps/backend/src/modules/setup/setup.constants.ts`
- Create: `apps/backend/src/modules/setup/services/setup.service.ts`
- Create: `apps/backend/src/modules/setup/controller/setup.controller.ts`
- Create: `apps/backend/src/modules/setup/dtos/setup-status.dto.ts`
- Create: `apps/backend/src/modules/setup/dtos/register-user.dto.ts`
- Create: `apps/backend/src/modules/setup/setup.module.ts`
- Modify: `apps/backend/src/modules/user/services/user.service.ts` (optional transaction)
- Modify: `apps/backend/src/app.module.ts` (add `SetupModule`, remove `BootstrapService`)
- Delete: `apps/backend/src/services/bootstrap.service.ts`, `apps/backend/src/services/bootstrap.service.spec.ts`
- Modify: `.env.example` (remove `ADMIN_EMAIL`), `CLAUDE.md` (bootstrap + env key references)
- Test: `apps/backend/src/modules/setup/services/setup.service.spec.ts`, `apps/backend/src/modules/setup/controller/setup.controller.spec.ts`

**Interfaces:**

- Consumes: `UserService.createUser`, `UserModel`, `JwtHelperService.createToken`, `AuthenticationDto`.
- Produces: `GET /setup/status` → `SetupStatusDto { needsSetup: boolean }`; `POST /setup/user` (body `RegisterUserDto`, 200) → `AuthenticationDto`; tag `setup` → SDK `SetupApi.getStatus/registerUser`. `SetupService.needsSetup(): Promise<boolean>`, `SetupService.registerFirstUser(user: UserCreate): Promise<User>`.

- [ ] **Step 1: Write the failing service spec**

```typescript
// apps/backend/src/modules/setup/services/setup.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing'
import { getModelToken } from '@nestjs/sequelize'
import { ForbiddenException } from '@nestjs/common'
import { Sequelize } from 'sequelize-typescript'
import type { Transaction } from 'sequelize'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { SetupService } from './setup.service'
import { UserService } from '../../user/services/user.service'
import { UserModel } from '../../user/models/user.model'
import { User, UserCreate } from '../../user/interfaces/user.interface'
import { SETUP_LOCK_KEY } from '../setup.constants'

describe('SetupService', () => {
    let service: SetupService
    let count: Mock<(options?: { transaction: Transaction }) => Promise<number>>
    let createUser: Mock<UserService['createUser']>
    let query: Mock<Sequelize['query']>
    let transaction: Mock<Sequelize['transaction']>

    const transactionStub = {} as Transaction

    const userCreate: UserCreate = {
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        password: 'correct-horse-battery-staple',
    }

    const user: User = {
        userId: 1,
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        createdAt: new Date(),
        updatedAt: new Date(),
    }

    beforeEach(async () => {
        count = vi.fn<typeof count>().mockResolvedValue(0)
        createUser = vi.fn<typeof createUser>().mockResolvedValue(user)
        query = vi.fn<typeof query>().mockResolvedValue([[], 0])
        transaction = vi
            .fn<typeof transaction>()
            .mockImplementation((callback) => (callback as (t: Transaction) => Promise<unknown>)(transactionStub))

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                SetupService,
                { provide: Sequelize, useValue: { transaction, query } },
                { provide: UserService, useValue: { createUser } },
                { provide: getModelToken(UserModel), useValue: { count } },
            ],
        }).compile()

        service = module.get(SetupService)
    })

    describe('needsSetup', () => {
        it('is true while no user exists', async () => {
            await expect(service.needsSetup()).resolves.toBe(true)
        })

        it('is false once a user exists', async () => {
            count.mockResolvedValue(1)

            await expect(service.needsSetup()).resolves.toBe(false)
        })
    })

    describe('registerFirstUser', () => {
        it('creates the user inside a locked transaction', async () => {
            const result = await service.registerFirstUser(userCreate)

            expect(query).toHaveBeenCalledWith('SELECT pg_advisory_xact_lock(:key)', {
                replacements: { key: SETUP_LOCK_KEY },
                transaction: transactionStub,
            })
            expect(count).toHaveBeenCalledWith({ transaction: transactionStub })
            expect(createUser).toHaveBeenCalledWith(userCreate, transactionStub)
            expect(result).toBe(user)
        })

        it('refuses to register once a user exists', async () => {
            count.mockResolvedValue(1)

            await expect(service.registerFirstUser(userCreate)).rejects.toBeInstanceOf(ForbiddenException)
            expect(createUser).not.toHaveBeenCalled()
        })
    })
})
```

- [ ] **Step 2: Run the spec to verify it fails**

Run: `pnpm --filter backend exec vitest run src/modules/setup/services/setup.service.spec.ts`
Expected: FAIL — files missing.

- [ ] **Step 3: Implement constants, service, DTOs**

```typescript
// apps/backend/src/modules/setup/setup.constants.ts
export const SETUP_LOCK_KEY = 815_002
```

```typescript
// apps/backend/src/modules/setup/services/setup.service.ts
import { ForbiddenException, Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/sequelize'
import { Sequelize } from 'sequelize-typescript'
import { UserModel } from '../../user/models/user.model'
import { UserService } from '../../user/services/user.service'
import { User, UserCreate } from '../../user/interfaces/user.interface'
import { SETUP_LOCK_KEY } from '../setup.constants'

@Injectable()
export class SetupService {
    constructor(
        private readonly sequelize: Sequelize,
        private readonly userService: UserService,
        @InjectModel(UserModel) private readonly userModel: typeof UserModel,
    ) {}

    async needsSetup(): Promise<boolean> {
        return (await this.userModel.count()) === 0
    }

    registerFirstUser(user: UserCreate): Promise<User> {
        return this.sequelize.transaction(async (transaction) => {
            await this.sequelize.query('SELECT pg_advisory_xact_lock(:key)', {
                replacements: { key: SETUP_LOCK_KEY },
                transaction,
            })

            const userCount = await this.userModel.count({ transaction })
            if (userCount > 0) {
                throw new ForbiddenException('Setup is already completed.')
            }

            return this.userService.createUser(user, transaction)
        })
    }
}
```

```typescript
// apps/backend/src/modules/setup/dtos/setup-status.dto.ts
import { Expose } from 'class-transformer'

export class SetupStatusDto {
    @Expose()
    needsSetup!: boolean
}
```

```typescript
// apps/backend/src/modules/setup/dtos/register-user.dto.ts
import { Expose } from 'class-transformer'
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator'
import { UserCreate } from '../../user/interfaces/user.interface'

export class RegisterUserDto implements UserCreate {
    @Expose()
    @IsString()
    @IsNotEmpty()
    firstName!: string

    @Expose()
    @IsString()
    @IsNotEmpty()
    lastName!: string

    @Expose()
    @IsEmail()
    email!: string

    @Expose()
    @IsString()
    @MinLength(8)
    password!: string
}
```

In `apps/backend/src/modules/user/services/user.service.ts` extend `createUser`:

```typescript
import type { Transaction } from 'sequelize'
```

```typescript
async createUser(user: UserCreate, transaction?: Transaction): Promise<User> {
    const hashedPassword = await bcrypt.hash(user.password, 10)

    const userModel = await this.userModel.create(
        {
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            password: hashedPassword,
        },
        { returning: true, transaction },
    )

    return userModel.get({ plain: true })
}
```

- [ ] **Step 4: Run the service spec to verify it passes**

Run: `pnpm --filter backend exec vitest run src/modules/setup/services/setup.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing controller spec**

```typescript
// apps/backend/src/modules/setup/controller/setup.controller.spec.ts
import { Test, TestingModule } from '@nestjs/testing'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { SetupController } from './setup.controller'
import { SetupService } from '../services/setup.service'
import { JwtHelperService } from '../../auth/services/jwt-helper.service'
import { User } from '../../user/interfaces/user.interface'
import { RegisterUserDto } from '../dtos/register-user.dto'

describe('SetupController', () => {
    let controller: SetupController
    let needsSetup: Mock<SetupService['needsSetup']>
    let registerFirstUser: Mock<SetupService['registerFirstUser']>
    let createToken: Mock<JwtHelperService['createToken']>

    const user: User = {
        userId: 1,
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        createdAt: new Date(),
        updatedAt: new Date(),
    }

    const registration: RegisterUserDto = {
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        password: 'correct-horse-battery-staple',
    }

    beforeEach(async () => {
        needsSetup = vi.fn<typeof needsSetup>().mockResolvedValue(true)
        registerFirstUser = vi.fn<typeof registerFirstUser>().mockResolvedValue(user)
        createToken = vi.fn<typeof createToken>().mockResolvedValue('jwt-token')

        const module: TestingModule = await Test.createTestingModule({
            controllers: [SetupController],
            providers: [
                { provide: SetupService, useValue: { needsSetup, registerFirstUser } },
                { provide: JwtHelperService, useValue: { createToken } },
            ],
        }).compile()

        controller = module.get(SetupController)
    })

    it('reports the setup status', async () => {
        await expect(controller.getStatus()).resolves.toEqual({ needsSetup: true })
    })

    it('registers the first user and returns an authentication', async () => {
        const result = await controller.registerUser(registration)

        expect(registerFirstUser).toHaveBeenCalledWith(registration)
        expect(createToken).toHaveBeenCalledWith(user)
        expect(result).toEqual({ token: 'jwt-token', user })
    })
})
```

Run: `pnpm --filter backend exec vitest run src/modules/setup/controller/setup.controller.spec.ts`
Expected: FAIL — controller missing.

- [ ] **Step 6: Implement controller and module, remove BootstrapService**

```typescript
// apps/backend/src/modules/setup/controller/setup.controller.ts
import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { ResponseDto } from '../../../decorators/ResponseDto'
import { SetupService } from '../services/setup.service'
import { SetupStatusDto } from '../dtos/setup-status.dto'
import { RegisterUserDto } from '../dtos/register-user.dto'
import { AuthenticationDto } from '../../auth/dtos/authentication.dto'
import { JwtHelperService } from '../../auth/services/jwt-helper.service'

@ApiTags('setup')
@Controller('setup')
export class SetupController {
    constructor(
        private readonly setupService: SetupService,
        private readonly jwtHelperService: JwtHelperService,
    ) {}

    @ResponseDto(SetupStatusDto)
    @Get('status')
    async getStatus(): Promise<SetupStatusDto> {
        return { needsSetup: await this.setupService.needsSetup() }
    }

    @HttpCode(HttpStatus.OK)
    @ResponseDto(AuthenticationDto)
    @Post('user')
    async registerUser(@Body() registration: RegisterUserDto): Promise<AuthenticationDto> {
        const user = await this.setupService.registerFirstUser(registration)
        const token = await this.jwtHelperService.createToken(user)

        return { token, user }
    }
}
```

```typescript
// apps/backend/src/modules/setup/setup.module.ts
import { Module } from '@nestjs/common'
import { UserModule } from '../user/user.module'
import { SetupController } from './controller/setup.controller'
import { SetupService } from './services/setup.service'
import { JwtHelperService } from '../auth/services/jwt-helper.service'

@Module({
    imports: [UserModule],
    controllers: [SetupController],
    providers: [SetupService, JwtHelperService],
})
export class SetupModule {}
```

In `apps/backend/src/app.module.ts`:

- Delete the `BootstrapService` import and remove it from `providers` (leave `providers` out entirely if empty).
- Add `import { SetupModule } from './modules/setup/setup.module'` and append `SetupModule` to `imports`.

Delete `apps/backend/src/services/bootstrap.service.ts` and `apps/backend/src/services/bootstrap.service.spec.ts`.

In `.env.example` delete the `ADMIN_EMAIL=admin@example.com` line (and the blank line above it if it leaves a double gap).

In `CLAUDE.md`:

- In the sentence starting `Cross-cutting wiring (app.module.ts):` replace `BootstrapService.onApplicationBootstrap seeds an admin user with a random password (logged once) when the users table is empty.` with `The setup module registers the first user via public endpoints (GET /setup/status, POST /setup/user); no admin user is seeded.`
- In the repository-layout env key list, remove `ADMIN_EMAIL` and `BOUNCE_ADDRESS`.

- [ ] **Step 7: Run the controller spec and the full backend suite**

Run: `pnpm --filter backend exec vitest run src/modules/setup/controller/setup.controller.spec.ts && pnpm --filter backend test && pnpm --filter backend typecheck && pnpm --filter backend lint`
Expected: all pass (bootstrap spec is gone).

---

### Task 9: E2E coverage and adjustments to existing e2e suites

Customer-domain creation now requires a configured sending domain, so every e2e file that POSTs `/api/domain` must configure one first. E2E files share one database and run sequentially (`fileParallelism: false`), but their order is not contractual — each file makes its own state deterministic in `beforeAll`.

**Files:**

- Create: `apps/backend/test/support/sending-domain.ts`
- Create: `apps/backend/test/setup.e2e-spec.ts`
- Create: `apps/backend/test/settings.e2e-spec.ts`
- Modify: `apps/backend/test/domain.e2e-spec.ts`, `apps/backend/test/inbound-form.e2e-spec.ts` (configure a sending domain in `beforeAll`)

**Interfaces:**

- Consumes: endpoints from Tasks 5 and 8; `createTestApp`, `seedUser`, `login` from existing support files.
- Produces: `configureSendingDomain(app, token, fqdn?)` e2e helper.

- [ ] **Step 1: Write the shared helper**

```typescript
// apps/backend/test/support/sending-domain.ts
import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import type { App } from 'supertest/types'

export async function configureSendingDomain(
    app: INestApplication<App>,
    token: string,
    fqdn = 'mail.sending-e2e.org',
): Promise<void> {
    await request(app.getHttpServer())
        .put('/api/settings/sending-domain')
        .set('Authorization', `Bearer ${token}`)
        .send({ fqdn, serverIpv4: '203.0.113.10' })
        .expect(200)
}
```

- [ ] **Step 2: Write the setup e2e spec**

```typescript
// apps/backend/test/setup.e2e-spec.ts
import { INestApplication } from '@nestjs/common'
import { getModelToken } from '@nestjs/sequelize'
import request from 'supertest'
import type { App } from 'supertest/types'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApp } from './support/app'
import { UserModel } from '../src/modules/user/models/user.model'

describe('SetupController (e2e)', () => {
    let app: INestApplication<App>

    const registration = {
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'setup.user@example.com',
        password: 'correct-horse-battery-staple',
    }

    const http = () => request(app.getHttpServer())

    beforeAll(async () => {
        app = await createTestApp()
        const userModel = app.get<typeof UserModel>(getModelToken(UserModel))
        await userModel.destroy({ where: {} })
    })

    afterAll(async () => {
        await app?.close()
    })

    it('reports that setup is needed while no user exists', async () => {
        const response = await http().get('/api/setup/status').expect(200)

        expect(response.body).toEqual({ needsSetup: true })
    })

    it('registers the first user and returns a usable token', async () => {
        const response = await http().post('/api/setup/user').send(registration).expect(200)
        const body = response.body as { token: string; user: { email: string; password?: string } }

        expect(body.token.length).toBeGreaterThan(0)
        expect(body.user).toMatchObject({ email: registration.email })
        expect(body.user.password).toBeUndefined()

        await http().get('/api/auth/user').set('Authorization', `Bearer ${body.token}`).expect(200)
    })

    it('reports that setup is completed afterwards', async () => {
        const response = await http().get('/api/setup/status').expect(200)

        expect(response.body).toEqual({ needsSetup: false })
    })

    it('refuses a second registration with 403', async () => {
        await http()
            .post('/api/setup/user')
            .send({ ...registration, email: 'second.user@example.com' })
            .expect(403)
    })

    it('rejects an invalid registration body with 400', async () => {
        await http().post('/api/setup/user').send({ firstName: 'Ada' }).expect(400)
    })
})
```

- [ ] **Step 3: Write the settings e2e spec**

```typescript
// apps/backend/test/settings.e2e-spec.ts
import { INestApplication } from '@nestjs/common'
import { getModelToken } from '@nestjs/sequelize'
import request from 'supertest'
import type { App } from 'supertest/types'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApp } from './support/app'
import { login, seedUser, type Credentials } from './support/session'
import { DomainModel } from '../src/modules/domain/models/domain.model'
import { SettingsModel } from '../src/modules/settings/models/settings.model'
import { DomainDnsRecordDto } from '../src/modules/domain/dtos/domain-dns-record.dto'

describe('SettingsController (e2e)', () => {
    let app: INestApplication<App>
    let token: string

    const credentials: Credentials = {
        email: 'settings.user@example.com',
        password: 'correct-horse-battery-staple',
    }

    const http = () => request(app.getHttpServer())

    beforeAll(async () => {
        app = await createTestApp()
        await app.get<typeof SettingsModel>(getModelToken(SettingsModel)).destroy({ where: {} })
        await app.get<typeof DomainModel>(getModelToken(DomainModel)).destroy({ where: {} })
        await seedUser(app, credentials)
        token = await login(app, credentials)
    })

    afterAll(async () => {
        await app?.close()
    })

    it('rejects unauthenticated access', async () => {
        await http().get('/api/settings').expect(401)
    })

    it('returns no sending domain before configuration', async () => {
        const response = await http().get('/api/settings').set('Authorization', `Bearer ${token}`).expect(200)

        expect(response.body).toEqual({ sendingDomain: null })
    })

    it('rejects customer domain creation while no sending domain is configured', async () => {
        await http()
            .post('/api/domain')
            .set('Authorization', `Bearer ${token}`)
            .send({ fqdn: 'customer-early.org' })
            .expect(400)
    })

    it('configures the sending domain and returns the full record set', async () => {
        const response = await http()
            .put('/api/settings/sending-domain')
            .set('Authorization', `Bearer ${token}`)
            .send({ fqdn: 'mail.sending-e2e.org', serverIpv4: '203.0.113.10' })
            .expect(200)
        const body = response.body as { fqdn: string; records: DomainDnsRecordDto[] }

        expect(body.fqdn).toBe('mail.sending-e2e.org')
        const uses = body.records.map((record) => record.use).sort()
        expect(uses).toEqual(['a', 'dkim', 'dmarc', 'mx', 'ptr', 'spf'])
        const spf = body.records.find((record) => record.use === 'spf')
        expect(spf?.value).toBe('v=spf1 ip4:203.0.113.10 -all')
        const ptr = body.records.find((record) => record.use === 'ptr')
        expect(ptr?.host).toBe('203.0.113.10')
    })

    it('generates customer SPF records against the sending domain and hides it from the list', async () => {
        const createResponse = await http()
            .post('/api/domain')
            .set('Authorization', `Bearer ${token}`)
            .send({ fqdn: 'customer-e2e.org' })
            .expect(201)
        const created = createResponse.body as { dns: { spf: DomainDnsRecordDto } }

        expect(created.dns.spf.value).toBe('v=spf1 include:mail.sending-e2e.org ~all')

        const listResponse = await http().get('/api/domain').set('Authorization', `Bearer ${token}`).expect(200)
        const fqdns = (listResponse.body as { fqdn: string }[]).map((domain) => domain.fqdn)

        expect(fqdns).toContain('customer-e2e.org')
        expect(fqdns).not.toContain('mail.sending-e2e.org')
    })

    it('swaps the sending domain and rewrites customer SPF values', async () => {
        await http()
            .put('/api/settings/sending-domain')
            .set('Authorization', `Bearer ${token}`)
            .send({ fqdn: 'mail.sending-e2e-two.org', serverIpv4: '203.0.113.11' })
            .expect(200)

        const settingsResponse = await http().get('/api/settings').set('Authorization', `Bearer ${token}`).expect(200)
        const settings = settingsResponse.body as { sendingDomain: { fqdn: string } }
        expect(settings.sendingDomain.fqdn).toBe('mail.sending-e2e-two.org')

        const domainModel = app.get<typeof DomainModel>(getModelToken(DomainModel))
        await expect(domainModel.findOne({ where: { fqdn: 'mail.sending-e2e.org' } })).resolves.toBeNull()

        const listResponse = await http().get('/api/domain').set('Authorization', `Bearer ${token}`).expect(200)
        const customer = (listResponse.body as { fqdn: string; dns: { spf: DomainDnsRecordDto } }[]).find(
            (domain) => domain.fqdn === 'customer-e2e.org',
        )
        expect(customer?.dns.spf.value).toBe('v=spf1 include:mail.sending-e2e-two.org ~all')
    })

    it('refreshes the sending domain records on demand', async () => {
        const response = await http()
            .post('/api/settings/sending-domain/refresh')
            .set('Authorization', `Bearer ${token}`)
            .expect(201)
        const body = response.body as { lastCheckedAt: string | null }

        expect(body.lastCheckedAt).not.toBeNull()
    })
})
```

- [ ] **Step 4: Update the existing e2e suites**

In `apps/backend/test/domain.e2e-spec.ts` and `apps/backend/test/inbound-form.e2e-spec.ts` add to the imports:

```typescript
import { configureSendingDomain } from './support/sending-domain'
```

and extend each `beforeAll` (after `token = await login(app, credentials)`):

```typescript
await configureSendingDomain(app, token)
```

`domain.e2e-spec.ts` creates `example.com` — root `example.com` differs from the helper's `sending-e2e.org`, so the `rootDomain` uniqueness is not violated. The suites run sequentially against a shared database; the settings spec resets `settings` + `domains` in its own `beforeAll`, so ordering stays irrelevant.

- [ ] **Step 5: Run the e2e suite**

Run: `pnpm --filter backend test:e2e` (requires Docker; first run pulls images)
Expected: PASS. Note: `PUT /settings/sending-domain` performs real DNS lookups for the `.org` test fqdns — they NXDOMAIN and the records simply stay `invalid`; assertions above don't depend on record status.

---

### Task 10: Regenerate the API contract

**Files:**

- Generated: `packages/api/assets/openapi.json`, `packages/api/dist/**`

**Interfaces:**

- Produces for the frontend: `SetupApi.getStatus/registerUser`, `SettingsApi.getSettings/configureSendingDomain/refreshSendingDomain`, types `SetupStatusDto`, `RegisterUserDto`, `SettingsDto`, `SendingDomainDto`, `SendingDomainConfigureDto`, and Zod schemas including `zRegisterUserDto`.

- [ ] **Step 1: Start the local infrastructure if not running**

Run: `docker compose -f dev/docker-compose.yml up -d`
Expected: Postgres/Redis containers healthy (a root `.env` must exist — copy `.env.example` if missing).

- [ ] **Step 2: Regenerate spec and client**

Run: `pnpm --filter backend generate && pnpm --filter api build`
Expected: `packages/api/assets/openapi.json` contains `/setup/status`, `/setup/user`, `/settings`, `/settings/sending-domain`, `/settings/sending-domain/refresh`; `api` builds cleanly.

- [ ] **Step 3: Confirm the exports exist**

Run: `pnpm --filter api exec node -e "const a = require('./dist/index.cjs'); console.log(typeof a.SetupApi.getStatus, typeof a.SettingsApi.configureSendingDomain, typeof a.zRegisterUserDto)"`
Expected: prints `function function object`. (If the dist layout differs, verify by grepping `packages/api/dist` for `SetupApi` instead.)

- [ ] **Step 4: Verify the monorepo still typechecks**

Run: `pnpm typecheck && pnpm lint`
Expected: pass — the frontend compiles against the regenerated client.

---

### Task 11: Frontend foundation — route names, setup query, register mutation, router gate, zod error map

**Files:**

- Modify: `apps/frontend/src/router/RouteNames.ts`
- Create: `apps/frontend/src/modules/onboarding/queries/useSetupStatusQuery.ts`
- Create: `apps/frontend/src/modules/onboarding/mutations/useRegisterMutation.ts`
- Modify: `apps/frontend/src/router/index.ts` (setup gate in `beforeEach`)
- Modify: `apps/frontend/src/main.ts` (ipv4/ipv6 error-map cases)
- Modify: `apps/frontend/src/locales/en.json` (validation + field keys)
- Test: `apps/frontend/src/modules/onboarding/mutations/__tests__/useRegisterMutation.spec.ts`

**Interfaces:**

- Consumes: `SetupApi`, generated types (Task 10).
- Produces: `RouteNames.SETTINGS = 'settings::index'`, `RouteNames.ONBOARDING = 'onboarding::index'`; `useSetupStatusQuery()` (key `['setup.status']`, `staleTime: Infinity`); `useRegisterMutation()` storing the JWT and priming `['auth.user']` + `['setup.status']`.

- [ ] **Step 1: Extend `RouteNames`**

```typescript
export enum RouteNames {
    LOGIN = 'auth::login',
    ONBOARDING = 'onboarding::index',
    DASHBOARD = 'dashboard::index',
    DOMAIN_LIST = 'domains::list',
    DOMAIN_DETAILS = 'domains::details',
    INBOUND_FORM_LIST = 'inboundForms::list',
    INBOUND_FORM_DETAILS = 'inboundForms::details',
    INBOUND_FORM_TEMPLATE = 'inboundForms::template',
    BOUNCE_LIST = 'bounces::list',
    SETTINGS = 'settings::index',
}
```

- [ ] **Step 2: Write the setup status query**

```typescript
// apps/frontend/src/modules/onboarding/queries/useSetupStatusQuery.ts
import { queryOptions } from '@tanstack/vue-query'
import { SetupApi } from 'api'

export function useSetupStatusQuery() {
    return queryOptions({
        queryKey: ['setup.status'],
        queryFn: () => SetupApi.getStatus(),
        staleTime: Infinity,
    })
}
```

- [ ] **Step 3: Write the failing register-mutation spec**

```typescript
// apps/frontend/src/modules/onboarding/mutations/__tests__/useRegisterMutation.spec.ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SetupApi, type AuthenticationDto, type RegisterUserDto } from 'api'
import { useRegisterMutation } from '../useRegisterMutation.ts'
import { withVueQuery } from '@/__tests__/support.ts'
import { JWT_KEY } from '@/constants/jwtKey.ts'

const registration: RegisterUserDto = {
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    password: 'correct-horse-battery-staple',
}

const authentication: AuthenticationDto = {
    token: 'jwt-token',
    user: {
        userId: 1,
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    },
}

afterEach(() => {
    vi.restoreAllMocks()
    localStorage.removeItem(JWT_KEY)
})

describe('useRegisterMutation', () => {
    it('sends the registration to SetupApi.registerUser', async () => {
        const registerSpy = vi.spyOn(SetupApi, 'registerUser').mockResolvedValue(authentication)
        const { result, unmount } = withVueQuery(() => useRegisterMutation())

        await result.mutateAsync(registration)

        expect(registerSpy).toHaveBeenCalledWith({ body: registration })
        unmount()
    })

    it('stores the token and primes the auth and setup caches on success', async () => {
        vi.spyOn(SetupApi, 'registerUser').mockResolvedValue(authentication)
        const { result, queryClient, unmount } = withVueQuery(() => useRegisterMutation())

        await result.mutateAsync(registration)

        expect(queryClient.getQueryData(['auth.user'])).toEqual(authentication.user)
        expect(queryClient.getQueryData(['setup.status'])).toEqual({ needsSetup: false })
        unmount()
    })

    it('caches nothing when the request fails', async () => {
        vi.spyOn(SetupApi, 'registerUser').mockRejectedValue(new Error('Forbidden'))
        const { result, queryClient, unmount } = withVueQuery(() => useRegisterMutation())

        await expect(result.mutateAsync(registration)).rejects.toThrow('Forbidden')
        expect(queryClient.getQueryData(['auth.user'])).toBeUndefined()
        expect(queryClient.getQueryData(['setup.status'])).toBeUndefined()
        unmount()
    })
})
```

Run: `pnpm --filter frontend exec vitest run src/modules/onboarding/mutations/__tests__/useRegisterMutation.spec.ts`
Expected: FAIL — mutation file missing.

- [ ] **Step 4: Implement the mutation**

```typescript
// apps/frontend/src/modules/onboarding/mutations/useRegisterMutation.ts
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { SetupApi, type RegisterUserDto, type SetupStatusDto } from 'api'
import { useLocalStorage } from '@vueuse/core'
import { JWT_KEY } from '@/constants/jwtKey.ts'

export function useRegisterMutation() {
    const client = useQueryClient()
    const jwt = useLocalStorage<string | null>(JWT_KEY, null)

    return useMutation({
        mutationFn: (registration: RegisterUserDto) =>
            SetupApi.registerUser({
                body: registration,
            }),
        onSuccess({ user, token }) {
            jwt.value = token
            client.setQueryData(['auth.user'], user)
            client.setQueryData(['setup.status'], { needsSetup: false } satisfies SetupStatusDto)
        },
    })
}
```

Run: `pnpm --filter frontend exec vitest run src/modules/onboarding/mutations/__tests__/useRegisterMutation.spec.ts`
Expected: PASS.

- [ ] **Step 5: Gate the router on setup status**

In `apps/frontend/src/router/index.ts` add `import { useSetupStatusQuery } from '@/modules/onboarding/queries/useSetupStatusQuery.ts'` and replace the `router.beforeEach` block:

```typescript
router.beforeEach(async (to) => {
    let needsSetup = false
    try {
        needsSetup = (await queryClient.fetchQuery(useSetupStatusQuery())).needsSetup
    } catch (err) {
        console.error(err)
    }

    if (needsSetup && to.name !== RouteNames.ONBOARDING) {
        return { name: RouteNames.ONBOARDING }
    }
    if (!needsSetup && to.name === RouteNames.ONBOARDING) {
        return { name: RouteNames.DASHBOARD }
    }
    if (!to.meta.requiresAuth) {
        return true
    }

    try {
        await queryClient.fetchQuery(useAuthQuery())
        return true
    } catch (err) {
        console.error(err)
        return { name: RouteNames.LOGIN }
    }
})
```

(The `/onboarding` route itself is added in Task 15; the guard referencing the name is safe before that because `needsSetup` requires a reachable backend that reports `true`, which only happens once onboarding exists end-to-end. Do not reorder tasks because of this.)

- [ ] **Step 6: Extend the zod error map and locale keys**

In `apps/frontend/src/main.ts`, inside the `invalid_format` switch, add cases above `default`:

```typescript
case 'ipv4':
    return t('validation.ipv4')
case 'ipv6':
    return t('validation.ipv6')
```

In `apps/frontend/src/locales/en.json` add to `validation`:

```json
"ipv4": "Invalid IPv4 address",
"ipv6": "Invalid IPv6 address"
```

and to `field`:

```json
"firstName": "First name",
"lastName": "Last name",
"serverIpv4": "Server IPv4 address",
"serverIpv6": "Server IPv6 address (optional)"
```

- [ ] **Step 7: Verify**

Run: `pnpm --filter frontend test && pnpm --filter frontend typecheck && pnpm --filter frontend lint`
Expected: all pass.

---

### Task 12: Settings data layer and `SendingDomainForm`

**Files:**

- Create: `apps/frontend/src/modules/settings/queries/useSettingsQuery.ts`
- Create: `apps/frontend/src/modules/settings/mutations/useSendingDomainMutation.ts`
- Create: `apps/frontend/src/modules/settings/mutations/useSendingDomainRefreshMutation.ts`
- Create: `apps/frontend/src/modules/settings/components/SendingDomainForm.vue`
- Modify: `apps/frontend/src/locales/en.json` (settings module keys)
- Test: `apps/frontend/src/modules/settings/mutations/__tests__/useSendingDomainMutation.spec.ts`, `apps/frontend/src/modules/settings/components/__tests__/SendingDomainForm.spec.ts`

**Interfaces:**

- Consumes: `SettingsApi`, `SettingsDto`, `SendingDomainDto`, `SendingDomainConfigureDto` (Task 10).
- Produces: `useSettingsQuery()` (key `['settings']`); `useSendingDomainMutation()` / `useSendingDomainRefreshMutation()` both writing `['settings']` via `setQueryData`; `<SendingDomainForm :sending-domain="SendingDomainDto | null" @saved="(dto: SendingDomainDto) => void">`.

- [ ] **Step 1: Write the query and the failing mutation spec**

```typescript
// apps/frontend/src/modules/settings/queries/useSettingsQuery.ts
import { queryOptions } from '@tanstack/vue-query'
import { SettingsApi } from 'api'

export function useSettingsQuery() {
    return queryOptions({
        queryKey: ['settings'],
        queryFn: () => SettingsApi.getSettings(),
    })
}
```

```typescript
// apps/frontend/src/modules/settings/mutations/__tests__/useSendingDomainMutation.spec.ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SettingsApi, type SendingDomainConfigureDto, type SendingDomainDto } from 'api'
import { useSendingDomainMutation } from '../useSendingDomainMutation.ts'
import { withVueQuery } from '@/__tests__/support.ts'

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

const config: SendingDomainConfigureDto = {
    fqdn: 'mail.sending-domain.org',
    serverIpv4: '203.0.113.10',
}

const sendingDomain: SendingDomainDto = {
    fqdn: 'mail.sending-domain.org',
    serverIpv4: '203.0.113.10',
    serverIpv6: null,
    lastCheckedAt: null,
    records: [],
}

afterEach(() => {
    vi.restoreAllMocks()
})

describe('useSendingDomainMutation', () => {
    it('sends the configuration to SettingsApi.configureSendingDomain', async () => {
        const configureSpy = vi.spyOn(SettingsApi, 'configureSendingDomain').mockResolvedValue(sendingDomain)
        const { result, unmount } = withVueQuery(() => useSendingDomainMutation())

        await result.mutateAsync(config)

        expect(configureSpy).toHaveBeenCalledWith({ body: config })
        unmount()
    })

    it('writes the sending domain into the settings cache on success', async () => {
        vi.spyOn(SettingsApi, 'configureSendingDomain').mockResolvedValue(sendingDomain)
        const { result, queryClient, unmount } = withVueQuery(() => useSendingDomainMutation())

        await result.mutateAsync(config)

        expect(queryClient.getQueryData(['settings'])).toEqual({ sendingDomain })
        unmount()
    })
})
```

Run: `pnpm --filter frontend exec vitest run src/modules/settings/mutations/__tests__/useSendingDomainMutation.spec.ts`
Expected: FAIL — mutation missing.

- [ ] **Step 2: Implement the mutations**

```typescript
// apps/frontend/src/modules/settings/mutations/useSendingDomainMutation.ts
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { SettingsApi, type SendingDomainConfigureDto, type SettingsDto } from 'api'
import { waitAtleast } from '@/helper/waitAtleast.ts'

export function useSendingDomainMutation() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: (config: SendingDomainConfigureDto) =>
            waitAtleast(
                SettingsApi.configureSendingDomain({
                    body: config,
                }),
            ),
        onSuccess(sendingDomain) {
            client.setQueryData(['settings'], { sendingDomain } satisfies SettingsDto)
        },
    })
}
```

```typescript
// apps/frontend/src/modules/settings/mutations/useSendingDomainRefreshMutation.ts
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { SettingsApi, type SettingsDto } from 'api'
import { waitAtleast } from '@/helper/waitAtleast.ts'

export function useSendingDomainRefreshMutation() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: () => waitAtleast(SettingsApi.refreshSendingDomain(), 2000),
        onSuccess(sendingDomain) {
            client.setQueryData(['settings'], { sendingDomain } satisfies SettingsDto)
        },
    })
}
```

Run: `pnpm --filter frontend exec vitest run src/modules/settings/mutations/__tests__/useSendingDomainMutation.spec.ts`
Expected: PASS.

- [ ] **Step 3: Add the settings locale keys**

In `apps/frontend/src/locales/en.json` add to `module` (after `bounces`):

```json
"settings": {
    "nav": "Settings",
    "title": "Settings",
    "sendingDomain": {
        "title": "Sending Domain",
        "intro": "The sending domain is the mail infrastructure domain of this server. It is used as the bounce address for outgoing mails and as the SPF include target for all sender domains.",
        "records": {
            "title": "DNS Records",
            "intro": "Configure these records in your DNS zone (the PTR record is set at your hosting provider). Once every record is valid, your server is fully set up for reliable delivery.",
            "lastChecked": "Last checked at {date}",
            "a": {
                "title": "A",
                "description": "Points the sending domain at your server's IPv4 address."
            },
            "aaaa": {
                "title": "AAAA",
                "description": "Points the sending domain at your server's IPv6 address."
            },
            "mx": {
                "title": "MX",
                "description": "Routes bounce messages back to this server so failed deliveries are detected."
            },
            "spf": {
                "title": "SPF",
                "description": "Authorizes your server's IP addresses to send mail for this domain."
            },
            "dkim": {
                "title": "DKIM",
                "description": "Allows receivers to verify that mails were signed by this server."
            },
            "dmarc": {
                "title": "DMARC",
                "description": "Defines how receivers should treat mails that fail SPF or DKIM."
            },
            "ptr": {
                "title": "PTR (Reverse DNS)",
                "description": "Set at your hosting provider: the server IP must resolve back to the sending domain."
            }
        }
    }
}
```

- [ ] **Step 4: Write the failing form spec**

```typescript
// apps/frontend/src/modules/settings/components/__tests__/SendingDomainForm.spec.ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SettingsApi, type SendingDomainDto } from 'api'
import SendingDomainForm from '../SendingDomainForm.vue'
import { mountView } from '@/__tests__/support.ts'

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

const sendingDomain: SendingDomainDto = {
    fqdn: 'mail.sending-domain.org',
    serverIpv4: '203.0.113.10',
    serverIpv6: null,
    lastCheckedAt: null,
    records: [],
}

afterEach(() => {
    vi.restoreAllMocks()
})

describe('SendingDomainForm', () => {
    it('renders fields for domain and server addresses', () => {
        const wrapper = mountView(SendingDomainForm)

        expect(wrapper.find('input[name="fqdn"]').exists()).toBe(true)
        expect(wrapper.find('input[name="serverIpv4"]').exists()).toBe(true)
        expect(wrapper.find('input[name="serverIpv6"]').exists()).toBe(true)
    })

    it('prefills from an existing configuration', () => {
        const wrapper = mountView(SendingDomainForm, { props: { sendingDomain } })

        expect((wrapper.get('input[name="fqdn"]').element as HTMLInputElement).value).toBe('mail.sending-domain.org')
        expect((wrapper.get('input[name="serverIpv4"]').element as HTMLInputElement).value).toBe('203.0.113.10')
    })

    it('does not submit an invalid ipv4 address', async () => {
        const configureSpy = vi.spyOn(SettingsApi, 'configureSendingDomain')
        const wrapper = mountView(SendingDomainForm)

        await wrapper.get('input[name="fqdn"]').setValue('mail.sending-domain.org')
        await wrapper.get('input[name="serverIpv4"]').setValue('not-an-ip')
        await wrapper.get('form').trigger('submit')

        await vi.waitFor(() => {
            expect(wrapper.find('.v-input--error').exists()).toBe(true)
        })
        expect(configureSpy).not.toHaveBeenCalled()
    })

    it('submits the configuration and emits saved', async () => {
        const configureSpy = vi.spyOn(SettingsApi, 'configureSendingDomain').mockResolvedValue(sendingDomain)
        const wrapper = mountView(SendingDomainForm)

        await wrapper.get('input[name="fqdn"]').setValue('mail.sending-domain.org')
        await wrapper.get('input[name="serverIpv4"]').setValue('203.0.113.10')
        await wrapper.get('form').trigger('submit')

        await vi.waitFor(() => {
            expect(wrapper.emitted('saved')).toBeTruthy()
        })
        expect(configureSpy).toHaveBeenCalledWith({
            body: { fqdn: 'mail.sending-domain.org', serverIpv4: '203.0.113.10', serverIpv6: undefined },
        })
    })
})
```

Run: `pnpm --filter frontend exec vitest run src/modules/settings/components/__tests__/SendingDomainForm.spec.ts`
Expected: FAIL — component missing.

- [ ] **Step 5: Implement the form**

```vue
<!-- apps/frontend/src/modules/settings/components/SendingDomainForm.vue -->
<template>
    <form novalidate @submit.prevent="onSubmit">
        <VTextField
            v-model="fqdn"
            name="fqdn"
            :label="t('field.domain')"
            placeholder="email.example.com"
            :error-messages="errors.fqdn"
        />
        <VTextField
            v-model="serverIpv4"
            name="serverIpv4"
            :label="t('field.serverIpv4')"
            placeholder="203.0.113.10"
            :error-messages="errors.serverIpv4"
        />
        <VTextField
            v-model="serverIpv6"
            name="serverIpv6"
            :label="t('field.serverIpv6')"
            placeholder="2001:db8::1"
            :error-messages="errors.serverIpv6"
        />
        <div class="d-flex justify-end">
            <VBtn type="submit" :text="t('cta.save')" :loading="isPending" />
        </div>
    </form>
</template>

<script lang="ts" setup>
    import { useForm } from 'vee-validate'
    import { toTypedSchema } from '@vee-validate/zod'
    import { z } from 'zod'
    import { parse } from 'tldts'
    import { useI18n } from 'vue-i18n'
    import type { SendingDomainDto } from 'api'
    import { useSendingDomainMutation } from '@/modules/settings/mutations/useSendingDomainMutation.ts'

    const props = defineProps<{
        sendingDomain?: SendingDomainDto | null
    }>()

    const emit = defineEmits<{
        saved: [sendingDomain: SendingDomainDto]
    }>()

    const { t } = useI18n()
    const { mutateAsync, isPending } = useSendingDomainMutation()

    const { defineField, handleSubmit, errors } = useForm({
        validationSchema: toTypedSchema(
            z.object({
                fqdn: z.string().and(
                    z.custom(
                        (value) => {
                            const { isIcann } = parse(value as string)
                            return !!isIcann
                        },
                        {
                            error: t('validation.hostname'),
                        },
                    ),
                ),
                serverIpv4: z.ipv4(),
                serverIpv6: z.ipv6().optional().or(z.literal('')),
            }),
        ),
        initialValues: {
            fqdn: props.sendingDomain?.fqdn ?? '',
            serverIpv4: props.sendingDomain?.serverIpv4 ?? '',
            serverIpv6: props.sendingDomain?.serverIpv6 ?? '',
        },
    })

    const [fqdn] = defineField('fqdn')
    const [serverIpv4] = defineField('serverIpv4')
    const [serverIpv6] = defineField('serverIpv6')

    const onSubmit = handleSubmit(async (values) => {
        const sendingDomain = await mutateAsync({
            fqdn: values.fqdn,
            serverIpv4: values.serverIpv4,
            serverIpv6: values.serverIpv6 || undefined,
        })
        emit('saved', sendingDomain)
    })
</script>
```

(If `values.fqdn` is not inferred as `string` through the `.and(z.custom(...))` intersection, mirror how `AddDomainDialog.vue` passes its values — the same pattern typechecks there.)

- [ ] **Step 6: Run the form spec**

Run: `pnpm --filter frontend exec vitest run src/modules/settings/components/__tests__/SendingDomainForm.spec.ts`
Expected: PASS.

- [ ] **Step 7: Verify**

Run: `pnpm --filter frontend test && pnpm --filter frontend typecheck && pnpm --filter frontend lint`
Expected: all pass.

---

### Task 13: `SendingDomainRecordsCard`, `SettingsView`, and the settings route

The record-row component moves out of the domain detail partials so both the customer DNS card and the sending-domain card share it.

**Files:**

- Move: `apps/frontend/src/modules/domains/views/details/partials/DomainDnsRecord.vue` → `apps/frontend/src/modules/domains/components/DomainDnsRecord.vue` (content unchanged)
- Modify: `apps/frontend/src/modules/domains/views/details/partials/DomainDnsCard.vue` (update the import path)
- Create: `apps/frontend/src/modules/settings/components/SendingDomainRecordsCard.vue`
- Create: `apps/frontend/src/modules/settings/views/SettingsView.vue`
- Modify: `apps/frontend/src/router/index.ts` (add the `/settings` child route)
- Test: `apps/frontend/src/modules/settings/views/__tests__/SettingsView.spec.ts`

**Interfaces:**

- Consumes: `useSettingsQuery`, `useSendingDomainRefreshMutation`, `SendingDomainForm` (Task 12), `DomainDnsRecord` row component.
- Produces: `<SendingDomainRecordsCard :sending-domain="SendingDomainDto">`; route `RouteNames.SETTINGS` at `/settings` inside the `AppLayout` children.

- [ ] **Step 1: Move the record row component**

Move the file (content byte-identical) and update the import in `DomainDnsCard.vue`:

```typescript
import DomainDnsRecord from '@/modules/domains/components/DomainDnsRecord.vue'
```

Run: `pnpm --filter frontend test`
Expected: PASS (no component references the old path anymore).

- [ ] **Step 2: Implement the records card**

```vue
<!-- apps/frontend/src/modules/settings/components/SendingDomainRecordsCard.vue -->
<template>
    <VCard prepend-icon="mdi-magnify-scan">
        <template #title>
            <span class="text-body-large">{{ t('module.settings.sendingDomain.records.title') }}</span>
        </template>
        <template #append>
            <span class="d-block pe-4 text-medium-emphasis" v-if="sendingDomain.lastCheckedAt">{{
                t('module.settings.sendingDomain.records.lastChecked', { date: lastCheckedDate })
            }}</span>
            <VBtn
                prepend-icon="mdi-refresh"
                size="default"
                :text="t('cta.refresh')"
                @click="mutateAsync()"
                :loading="isPending"
            />
        </template>
        <VCardText>
            <p class="text-body-large">{{ t('module.settings.sendingDomain.records.intro') }}</p>
            <template v-for="(record, index) in orderedRecords" :key="`${record.use}-${record.host}`">
                <VDivider v-if="index > 0" class="my-4" />
                <strong>{{ t(`module.settings.sendingDomain.records.${record.use}.title`) }}</strong>
                <p class="mt-0">{{ t(`module.settings.sendingDomain.records.${record.use}.description`) }}</p>
                <DomainDnsRecord :record="record" />
            </template>
        </VCardText>
    </VCard>
</template>

<script lang="ts" setup>
    import { computed } from 'vue'
    import { useI18n } from 'vue-i18n'
    import { useDateFormat } from '@vueuse/core'
    import type { SendingDomainDto } from 'api'
    import DomainDnsRecord from '@/modules/domains/components/DomainDnsRecord.vue'
    import { useSendingDomainRefreshMutation } from '@/modules/settings/mutations/useSendingDomainRefreshMutation.ts'

    const props = defineProps<{
        sendingDomain: SendingDomainDto
    }>()

    const RECORD_ORDER = ['a', 'aaaa', 'mx', 'spf', 'dkim', 'dmarc', 'ptr']

    const { t } = useI18n()
    const { mutateAsync, isPending } = useSendingDomainRefreshMutation()

    const orderedRecords = computed(() =>
        [...props.sendingDomain.records].sort(
            (left, right) => RECORD_ORDER.indexOf(left.use) - RECORD_ORDER.indexOf(right.use),
        ),
    )

    const lastCheckedDate = useDateFormat(() => props.sendingDomain.lastCheckedAt!, 'DD.MM.YYYY HH:mm:ss')
</script>
```

- [ ] **Step 3: Write the failing settings view spec**

```typescript
// apps/frontend/src/modules/settings/views/__tests__/SettingsView.spec.ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SettingsApi, type SettingsDto } from 'api'
import SettingsView from '../SettingsView.vue'
import { mountView } from '@/__tests__/support.ts'

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

const configured: SettingsDto = {
    sendingDomain: {
        fqdn: 'mail.sending-domain.org',
        serverIpv4: '203.0.113.10',
        serverIpv6: null,
        lastCheckedAt: null,
        records: [
            {
                host: 'mail.sending-domain.org',
                type: 'a',
                use: 'a',
                value: '203.0.113.10',
                current: null,
                status: 'invalid',
            },
        ],
    },
}

afterEach(() => {
    vi.restoreAllMocks()
})

describe('SettingsView', () => {
    it('shows the sending domain form without a records card while unconfigured', async () => {
        vi.spyOn(SettingsApi, 'getSettings').mockResolvedValue({ sendingDomain: null })
        const wrapper = mountView(SettingsView)

        await vi.waitFor(() => {
            expect(wrapper.find('input[name="fqdn"]').exists()).toBe(true)
        })
        expect(wrapper.text()).not.toContain('DNS Records')
    })

    it('shows the prefilled form and the records card when configured', async () => {
        vi.spyOn(SettingsApi, 'getSettings').mockResolvedValue(configured)
        const wrapper = mountView(SettingsView)

        await vi.waitFor(() => {
            expect(wrapper.text()).toContain('DNS Records')
        })
        expect((wrapper.get('input[name="fqdn"]').element as HTMLInputElement).value).toBe('mail.sending-domain.org')
    })
})
```

(If the literal record in `configured` fails the generated types — e.g. `use` is a string union — adjust the literal to the generated enum values, never cast.)

Run: `pnpm --filter frontend exec vitest run src/modules/settings/views/__tests__/SettingsView.spec.ts`
Expected: FAIL — view missing.

- [ ] **Step 4: Implement the view and route**

```vue
<!-- apps/frontend/src/modules/settings/views/SettingsView.vue -->
<template>
    <VContainer>
        <VFadeTransition leave-absolute>
            <div v-if="!settings" class="d-flex justify-center">
                <VProgressCircular indeterminate size="128" class="mt-16" />
            </div>
            <div v-else>
                <h1>{{ t('module.settings.title') }}</h1>
                <VDivider class="mb-6" />
                <VCard class="mb-6">
                    <template #title>
                        <span class="text-body-large">{{ t('module.settings.sendingDomain.title') }}</span>
                    </template>
                    <VCardText>
                        <p class="text-body-large">{{ t('module.settings.sendingDomain.intro') }}</p>
                        <SendingDomainForm
                            :key="settings.sendingDomain?.fqdn ?? 'unconfigured'"
                            :sending-domain="settings.sendingDomain"
                        />
                    </VCardText>
                </VCard>
                <SendingDomainRecordsCard v-if="settings.sendingDomain" :sending-domain="settings.sendingDomain" />
            </div>
        </VFadeTransition>
    </VContainer>
</template>

<script lang="ts" setup>
    import { useQuery } from '@tanstack/vue-query'
    import { useI18n } from 'vue-i18n'
    import { useSettingsQuery } from '@/modules/settings/queries/useSettingsQuery.ts'
    import SendingDomainForm from '@/modules/settings/components/SendingDomainForm.vue'
    import SendingDomainRecordsCard from '@/modules/settings/components/SendingDomainRecordsCard.vue'

    const { t } = useI18n()
    const { data: settings } = useQuery(useSettingsQuery())
</script>
```

In `apps/frontend/src/router/index.ts` add `import SettingsView from '@/modules/settings/views/SettingsView.vue'` and append to the `AppLayout` children:

```typescript
{
    path: '/settings',
    name: RouteNames.SETTINGS,
    component: SettingsView,
},
```

- [ ] **Step 5: Run the spec and verify**

Run: `pnpm --filter frontend exec vitest run src/modules/settings/views/__tests__/SettingsView.spec.ts && pnpm --filter frontend test && pnpm --filter frontend typecheck && pnpm --filter frontend lint`
Expected: all pass.

---

### Task 14: Settings nav tab with health indicator

**Files:**

- Modify: `apps/frontend/src/modules/dashboard/layouts/AppLayout.vue`
- Test: `apps/frontend/src/modules/dashboard/layouts/__tests__/AppLayout.spec.ts`

**Interfaces:**

- Consumes: `useSettingsQuery` (Task 12), `RouteNames.SETTINGS` (Task 11).
- Produces: a Settings tab whose trailing icon is `mdi-check-circle` (success) when every sending-domain record is valid, `mdi-alert-circle` (warning) when any record is invalid or nothing is configured; settings query polled with `refetchInterval: 60_000`.

- [ ] **Step 1: Write the failing layout spec**

```typescript
// apps/frontend/src/modules/dashboard/layouts/__tests__/AppLayout.spec.ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { defineComponent, h } from 'vue'
import { VApp } from 'vuetify/components'
import { SettingsApi, type SettingsDto } from 'api'
import AppLayout from '../AppLayout.vue'
import { mountView } from '@/__tests__/support.ts'
import { RouteNames } from '@/router/RouteNames.ts'

const EmptyView = defineComponent({ render: () => h('div') })

const AppLayoutHost = defineComponent({
    setup: () => () => h(VApp, () => h(AppLayout)),
})

function createTestRouter(): Router {
    return createRouter({
        history: createMemoryHistory(),
        routes: [
            { path: '/', name: RouteNames.DASHBOARD, component: EmptyView },
            { path: '/domains', name: RouteNames.DOMAIN_LIST, component: EmptyView },
            { path: '/forms', name: RouteNames.INBOUND_FORM_LIST, component: EmptyView },
            { path: '/bounces', name: RouteNames.BOUNCE_LIST, component: EmptyView },
            { path: '/settings', name: RouteNames.SETTINGS, component: EmptyView },
            { path: '/login', name: RouteNames.LOGIN, component: EmptyView },
        ],
    })
}

const healthy: SettingsDto = {
    sendingDomain: {
        fqdn: 'mail.sending-domain.org',
        serverIpv4: '203.0.113.10',
        serverIpv6: null,
        lastCheckedAt: null,
        records: [
            {
                host: 'mail.sending-domain.org',
                type: 'a',
                use: 'a',
                value: '203.0.113.10',
                current: '203.0.113.10',
                status: 'valid',
            },
        ],
    },
}

afterEach(() => {
    vi.restoreAllMocks()
})

describe('AppLayout', () => {
    it('shows a warning icon while no sending domain is configured', async () => {
        vi.spyOn(SettingsApi, 'getSettings').mockResolvedValue({ sendingDomain: null })
        const wrapper = mountView(AppLayoutHost, { global: { plugins: [createTestRouter()] } })

        await vi.waitFor(() => {
            expect(wrapper.find('.mdi-alert-circle').exists()).toBe(true)
        })
        expect(wrapper.find('.mdi-check-circle').exists()).toBe(false)
    })

    it('shows a healthy icon when every record is valid', async () => {
        vi.spyOn(SettingsApi, 'getSettings').mockResolvedValue(healthy)
        const wrapper = mountView(AppLayoutHost, { global: { plugins: [createTestRouter()] } })

        await vi.waitFor(() => {
            expect(wrapper.find('.mdi-check-circle').exists()).toBe(true)
        })
        expect(wrapper.find('.mdi-alert-circle').exists()).toBe(false)
    })

    it('shows a warning icon when a record is invalid', async () => {
        const ill: SettingsDto = {
            sendingDomain: {
                ...healthy.sendingDomain!,
                records: [{ ...healthy.sendingDomain!.records[0]!, status: 'invalid' }],
            },
        }
        vi.spyOn(SettingsApi, 'getSettings').mockResolvedValue(ill)
        const wrapper = mountView(AppLayoutHost, { global: { plugins: [createTestRouter()] } })

        await vi.waitFor(() => {
            expect(wrapper.find('.mdi-alert-circle').exists()).toBe(true)
        })
    })
})
```

Run: `pnpm --filter frontend exec vitest run src/modules/dashboard/layouts/__tests__/AppLayout.spec.ts`
Expected: FAIL — no settings tab/icon yet.

- [ ] **Step 2: Implement the tab**

In `AppLayout.vue`, add after the bounces `VTab`:

```vue
<VTab :to="{ name: RouteNames.SETTINGS }">
    {{ t('module.settings.nav') }}
    <VIcon :icon="healthIcon" :color="healthColor" size="small" class="ms-1" />
</VTab>
```

and extend the script setup:

```typescript
import { computed } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { useSettingsQuery } from '@/modules/settings/queries/useSettingsQuery.ts'
```

```typescript
const { data: settings } = useQuery({ ...useSettingsQuery(), refetchInterval: 60_000 })

const isHealthy = computed(
    () =>
        !!settings.value?.sendingDomain &&
        settings.value.sendingDomain.records.every((record) => record.status === 'valid'),
)
const healthIcon = computed(() => (isHealthy.value ? 'mdi-check-circle' : 'mdi-alert-circle'))
const healthColor = computed(() => (isHealthy.value ? 'success' : 'warning'))
```

- [ ] **Step 3: Run the spec and verify**

Run: `pnpm --filter frontend exec vitest run src/modules/dashboard/layouts/__tests__/AppLayout.spec.ts && pnpm --filter frontend test && pnpm --filter frontend typecheck && pnpm --filter frontend lint`
Expected: all pass.

---

### Task 15: Onboarding wizard

**Files:**

- Create: `apps/frontend/src/modules/onboarding/views/OnboardingView.vue`
- Create: `apps/frontend/src/modules/onboarding/views/partials/OnboardingAccountStep.vue`
- Create: `apps/frontend/src/modules/onboarding/views/partials/OnboardingDomainStep.vue`
- Modify: `apps/frontend/src/router/index.ts` (add the `/onboarding` top-level route)
- Modify: `apps/frontend/src/locales/en.json` (onboarding + cta keys)
- Test: `apps/frontend/src/modules/onboarding/views/__tests__/OnboardingView.spec.ts`

**Interfaces:**

- Consumes: `useRegisterMutation` (Task 11), `SendingDomainForm`/`SendingDomainRecordsCard`/`useSettingsQuery` (Tasks 12–13), `zRegisterUserDto` (Task 10).
- Produces: route `RouteNames.ONBOARDING` at `/onboarding` (outside `AppLayout`); a `VStepper` whose steps array is the extension point for future customization steps.

- [ ] **Step 1: Add the locale keys**

In `en.json` add to `cta`:

```json
"continue": "Continue",
"finish": "Finish"
```

and to `module`:

```json
"onboarding": {
    "title": "Welcome",
    "steps": {
        "account": {
            "title": "Create your account",
            "intro": "Create the administrator account for this installation."
        },
        "domain": {
            "title": "Sending domain",
            "intro": "Configure the domain this server sends mail from. You can finish setup while the DNS records are still propagating."
        }
    }
}
```

- [ ] **Step 2: Write the failing wizard spec**

```typescript
// apps/frontend/src/modules/onboarding/views/__tests__/OnboardingView.spec.ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Router } from 'vue-router'
import { defineComponent, h } from 'vue'
import { VApp } from 'vuetify/components'
import { SettingsApi, SetupApi, type AuthenticationDto } from 'api'
import OnboardingView from '../OnboardingView.vue'
import { mountView } from '@/__tests__/support.ts'
import { RouteNames } from '@/router/RouteNames.ts'
import { JWT_KEY } from '@/constants/jwtKey.ts'

const OnboardingHost = defineComponent({
    setup: () => () => h(VApp, () => h(OnboardingView)),
})

const { push } = vi.hoisted(() => ({ push: vi.fn<Router['push']>() }))

vi.mock('vue-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('vue-router')>()
    return { ...actual, useRouter: () => ({ push }) }
})

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

const authentication: AuthenticationDto = {
    token: 'jwt-token',
    user: {
        userId: 1,
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    },
}

async function fillAccountStep(wrapper: ReturnType<typeof mountView>) {
    await wrapper.get('input[name="firstName"]').setValue('Ada')
    await wrapper.get('input[name="lastName"]').setValue('Lovelace')
    await wrapper.get('input[type="email"]').setValue('ada@example.com')
    await wrapper.get('input[type="password"]').setValue('correct-horse-battery-staple')
    await wrapper.get('form').trigger('submit')
}

function domainForm(wrapper: ReturnType<typeof mountView>) {
    return wrapper.findAll('form').find((form) => form.find('input[name="fqdn"]').exists())
}

afterEach(() => {
    vi.restoreAllMocks()
    push.mockClear()
    localStorage.removeItem(JWT_KEY)
})

describe('OnboardingView', () => {
    it('starts on the account step', () => {
        const wrapper = mountView(OnboardingHost)

        expect(wrapper.text()).toContain('Create your account')
        expect(wrapper.find('input[name="firstName"]').exists()).toBe(true)
    })

    it('advances to the domain step after a successful registration', async () => {
        vi.spyOn(SetupApi, 'registerUser').mockResolvedValue(authentication)
        vi.spyOn(SettingsApi, 'getSettings').mockResolvedValue({ sendingDomain: null })
        const wrapper = mountView(OnboardingHost)

        await fillAccountStep(wrapper)

        await vi.waitFor(() => {
            expect(wrapper.find('input[name="fqdn"]').exists()).toBe(true)
        })
    })

    it('shows the records and the finish action after the domain is saved, then routes to the dashboard', async () => {
        vi.spyOn(SetupApi, 'registerUser').mockResolvedValue(authentication)
        vi.spyOn(SettingsApi, 'getSettings').mockResolvedValue({ sendingDomain: null })
        vi.spyOn(SettingsApi, 'configureSendingDomain').mockResolvedValue({
            fqdn: 'mail.sending-domain.org',
            serverIpv4: '203.0.113.10',
            serverIpv6: null,
            lastCheckedAt: null,
            records: [],
        })
        const wrapper = mountView(OnboardingHost)

        await fillAccountStep(wrapper)
        await vi.waitFor(() => {
            expect(wrapper.find('input[name="fqdn"]').exists()).toBe(true)
        })

        await wrapper.get('input[name="fqdn"]').setValue('mail.sending-domain.org')
        await wrapper.get('input[name="serverIpv4"]').setValue('203.0.113.10')
        await domainForm(wrapper)!.trigger('submit')

        const finishButton = () => wrapper.findAll('button').find((button) => button.text().includes('Finish'))

        await vi.waitFor(() => {
            expect(finishButton()).toBeTruthy()
        })

        await finishButton()!.trigger('click')

        expect(push).toHaveBeenCalledWith({ name: RouteNames.DASHBOARD })
    })
})
```

Run: `pnpm --filter frontend exec vitest run src/modules/onboarding/views/__tests__/OnboardingView.spec.ts`
Expected: FAIL — view missing.

- [ ] **Step 3: Implement the steps and the wizard**

```vue
<!-- apps/frontend/src/modules/onboarding/views/partials/OnboardingAccountStep.vue -->
<template>
    <div>
        <p class="mb-6">{{ t('module.onboarding.steps.account.intro') }}</p>
        <form novalidate @submit.prevent="onSubmit">
            <VTextField
                v-model="firstName"
                name="firstName"
                :label="t('field.firstName')"
                :error-messages="errors.firstName"
                autocomplete="given-name"
            />
            <VTextField
                v-model="lastName"
                name="lastName"
                :label="t('field.lastName')"
                :error-messages="errors.lastName"
                autocomplete="family-name"
            />
            <VTextField
                v-model="email"
                :label="t('field.email')"
                type="email"
                :error-messages="errors.email"
                autocomplete="email"
            />
            <VTextField
                v-model="password"
                :label="t('field.password')"
                type="password"
                :error-messages="errors.password"
                autocomplete="new-password"
            />
            <div class="d-flex justify-end">
                <VBtn type="submit" :text="t('cta.continue')" :loading="isPending" />
            </div>
        </form>
    </div>
</template>

<script lang="ts" setup>
    import { useForm } from 'vee-validate'
    import { toTypedSchema } from '@vee-validate/zod'
    import { zRegisterUserDto } from 'api'
    import { useI18n } from 'vue-i18n'
    import { useRegisterMutation } from '@/modules/onboarding/mutations/useRegisterMutation.ts'

    const emit = defineEmits<{
        completed: []
    }>()

    const { t } = useI18n()
    const { mutateAsync, isPending } = useRegisterMutation()

    const { handleSubmit, defineField, errors } = useForm({
        validationSchema: toTypedSchema(zRegisterUserDto),
    })

    const [firstName] = defineField('firstName')
    const [lastName] = defineField('lastName')
    const [email] = defineField('email')
    const [password] = defineField('password')

    const onSubmit = handleSubmit(async (values) => {
        await mutateAsync(values)
        emit('completed')
    })
</script>
```

```vue
<!-- apps/frontend/src/modules/onboarding/views/partials/OnboardingDomainStep.vue -->
<template>
    <div>
        <p class="mb-6">{{ t('module.onboarding.steps.domain.intro') }}</p>
        <SendingDomainForm :sending-domain="sendingDomain" />
        <template v-if="sendingDomain">
            <VDivider class="my-6" />
            <SendingDomainRecordsCard :sending-domain="sendingDomain" />
            <div class="d-flex justify-end mt-6">
                <VBtn :text="t('cta.finish')" @click="emit('completed')" />
            </div>
        </template>
    </div>
</template>

<script lang="ts" setup>
    import { computed } from 'vue'
    import { useQuery } from '@tanstack/vue-query'
    import { useI18n } from 'vue-i18n'
    import { useSettingsQuery } from '@/modules/settings/queries/useSettingsQuery.ts'
    import SendingDomainForm from '@/modules/settings/components/SendingDomainForm.vue'
    import SendingDomainRecordsCard from '@/modules/settings/components/SendingDomainRecordsCard.vue'

    const emit = defineEmits<{
        completed: []
    }>()

    const { t } = useI18n()
    const { data: settings } = useQuery(useSettingsQuery())

    const sendingDomain = computed(() => settings.value?.sendingDomain ?? null)
</script>
```

```vue
<!-- apps/frontend/src/modules/onboarding/views/OnboardingView.vue -->
<template>
    <VMain class="bg-primary d-flex align-center justify-center">
        <VCard elevation="1" width="800" max-width="calc(100% - 32px)">
            <VStepper v-model="step" flat>
                <VStepperHeader>
                    <template v-for="(item, index) in steps" :key="item.key">
                        <VDivider v-if="index > 0" />
                        <VStepperItem :value="index + 1" :title="t(item.title)" />
                    </template>
                </VStepperHeader>
                <VStepperWindow>
                    <VStepperWindowItem :value="1">
                        <OnboardingAccountStep @completed="step = 2" />
                    </VStepperWindowItem>
                    <VStepperWindowItem :value="2">
                        <OnboardingDomainStep @completed="finish" />
                    </VStepperWindowItem>
                </VStepperWindow>
            </VStepper>
        </VCard>
    </VMain>
</template>

<script lang="ts" setup>
    import { ref } from 'vue'
    import { useI18n } from 'vue-i18n'
    import { useRouter } from 'vue-router'
    import { RouteNames } from '@/router/RouteNames.ts'
    import OnboardingAccountStep from './partials/OnboardingAccountStep.vue'
    import OnboardingDomainStep from './partials/OnboardingDomainStep.vue'

    const { t } = useI18n()
    const router = useRouter()

    const step = ref(1)
    const steps = [
        { key: 'account', title: 'module.onboarding.steps.account.title' },
        { key: 'domain', title: 'module.onboarding.steps.domain.title' },
    ]

    function finish() {
        void router.push({ name: RouteNames.DASHBOARD })
    }
</script>
```

In `apps/frontend/src/router/index.ts` add `import OnboardingView from '@/modules/onboarding/views/OnboardingView.vue'` and a top-level route (before the `/` record):

```typescript
{
    path: '/onboarding',
    name: RouteNames.ONBOARDING,
    component: OnboardingView,
},
```

If the stepper's lazy window breaks the spec (fields of step 2 not found), add `eager` to the second `VStepperWindowItem` — but prefer the lazy default since the settings query must only run once authenticated.

- [ ] **Step 4: Run the spec and verify**

Run: `pnpm --filter frontend exec vitest run src/modules/onboarding/views/__tests__/OnboardingView.spec.ts && pnpm --filter frontend test && pnpm --filter frontend typecheck && pnpm --filter frontend lint`
Expected: all pass.

---

### Task 16: Full gate and manual end-to-end verification

- [ ] **Step 1: Format and run the full monorepo gate**

Run: `pnpm format:fix && pnpm check`
Expected: lint, typecheck, tests, and format all pass across backend, frontend, and api.

- [ ] **Step 2: Reset the dev database and migrate**

The dev Postgres volume carries model-sync drift from `autoLoadModels` — reset it so migration 008 runs against a clean schema:

Run: `docker compose -f dev/docker-compose.yml down -v && docker compose -f dev/docker-compose.yml up -d && pnpm --filter backend migrate up`
Expected: migrations 001–008 apply cleanly.

- [ ] **Step 3: Walk through onboarding manually**

Run: `pnpm dev`, open `http://localhost:5173` (or the Vite port printed).
Expected flow:

1. Any URL redirects to `/onboarding` (no users exist).
2. Step 1 registers an account and advances; the backend log shows no seeded admin.
3. Step 2 saves a sending domain (any real-looking fqdn + IP) and lists A/MX/SPF/DKIM/DMARC/PTR records with copy buttons; records show `invalid` until real DNS exists.
4. Finish lands on the dashboard; the Settings tab shows a warning icon (records unverified).
5. `/settings` shows the same form prefilled plus the records card; Refresh re-checks.
6. Creating a customer domain under Domains yields an SPF record that includes the configured sending domain.
7. Reloading the app skips onboarding (`needsSetup` is false); logging out and back in works.

- [ ] **Step 4: Confirm the e2e suite one final time**

Run: `pnpm --filter backend test:e2e`
Expected: PASS.

---

## Deviations & Notes

- The spec says `@Cron`; the plan uses `@Interval(DNS_CHECK_INTERVAL_MS)` with the same 15-minute cadence, matching the existing `BounceMailboxService` pattern in this codebase.
- The onboarding wizard's step content is intentionally two hardcoded `VStepperWindowItem`s driven by a `steps` array for headers; future steps (colors, logo) append an array entry plus a window item.
- `POST /setup/user` and `GET /setup/status` carry no auth guard at all (matching `POST /auth/login`); the registration path is closed by the zero-users check inside a `pg_advisory_xact_lock` transaction.
- The sending domain participates in `domains.rootDomain` uniqueness — configuring a sending domain whose root collides with an existing customer domain fails with a database error; accepted per spec.
- `BOUNCE_ADDRESS` is gone: the envelope sender is always `bounce@<sending fqdn>` once configured, otherwise unset (GreenMail dev flow: configure the sending domain through onboarding, then DSNs route to the bounce mailbox via the IMAP poller as before).
