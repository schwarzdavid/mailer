# Bounce Handling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track email bounces (IMAP-polled DSNs + synchronous SMTP 5xx rejections), auto-block repeatedly failing recipient addresses with an escalating duration, refuse sends to blocked addresses, and expose everything in a new "Bounces" UI page with manual unblock.

**Architecture:** A new backend `bounce` module (models `bounce` + `email_block`, services for blocking, recording, DSN parsing, and IMAP polling) hooked into `MailService`; a `BounceController` regenerated into the typed `api` client; a new frontend `bounces` module with a two-tab view. Multi-instance safety comes from a Postgres transaction-scoped advisory lock plus a unique `(messageId, emailAddress)` index.

**Tech Stack:** NestJS 11, Sequelize/sequelize-typescript, umzug migrations, nodemailer, imapflow (new), mailparser (new), Vitest, Vue 3 + Vuetify + TanStack Query, @hey-api/openapi-ts.

**Spec:** `docs/superpowers/specs/2026-07-13-bounce-handling-design.md`

## Global Constraints

- **NEVER touch git.** No `git add` / `commit` / `push` — the repository owner commits. Task boundaries end with verification commands instead of commits.
- **No comments in code.** Self-explanatory names only; this applies to every file below.
- Prettier owns formatting: 4-space indent, single quotes, no semicolons, trailing commas. Run `pnpm format:fix` if unsure; never hand-format against it.
- TypeScript is strict repo-wide, including `noUncheckedIndexedAccess` and `noUnusedLocals/Parameters`.
- Typed test doubles: every `vi.fn` bound to the real collaborator's signature (`vi.fn<DomainService['createDomain']>()`), inputs/outputs declared with domain interfaces, never `as` casts. Sequelize rows are modeled as `Interface & { get(options: { plain: true }): Interface }`.
- Package manager is `pnpm`. Backend unit tests run with `pnpm --filter backend exec vitest run <path>`.
- Block policy constants (from spec): ladder `[7, 30, 90, 365]` days, transient threshold `3` within `7` days.
- After any endpoint change: `pnpm --filter backend generate` then `pnpm --filter api build`.
- Every task ends green: `pnpm --filter backend typecheck && pnpm --filter backend lint` (backend tasks) or the frontend equivalents.

---

### Task 1: Bounce module skeleton — interfaces, constants, models, migration, module wiring

**Files:**

- Create: `apps/backend/src/modules/bounce/interfaces/bounce.interface.ts`
- Create: `apps/backend/src/modules/bounce/interfaces/email-block.interface.ts`
- Create: `apps/backend/src/modules/bounce/bounce.constants.ts`
- Create: `apps/backend/src/modules/bounce/models/bounce.model.ts`
- Create: `apps/backend/src/modules/bounce/models/email-block.model.ts`
- Create: `apps/backend/src/modules/bounce/bounce.module.ts`
- Create: `apps/backend/src/migrations/007-create-bounces.ts`
- Modify: `apps/backend/src/app.module.ts`

**Interfaces:**

- Consumes: nothing (first task).
- Produces: `Bounce`, `BounceCreate`, `BounceType` (enum `PERMANENT = 'permanent'`, `TRANSIENT = 'transient'`), `EmailBlock`, `EmailBlockCreate`, constants `BLOCK_LADDER_DAYS`, `TRANSIENT_THRESHOLD`, `TRANSIENT_WINDOW_DAYS`, `BOUNCE_POLL_LOCK_KEY`, `DAY_MS`, models `BounceModel`, `EmailBlockModel`, module `BounceModule`. All later backend tasks import these exact names.

- [ ] **Step 1: Create the interfaces**

`apps/backend/src/modules/bounce/interfaces/bounce.interface.ts`:

```typescript
export enum BounceType {
    PERMANENT = 'permanent',
    TRANSIENT = 'transient',
}

export interface Bounce {
    bounceId: number
    emailAddress: string
    type: BounceType
    statusCode: string | null
    reason: string
    messageId: string | null
    receivedAt: Date
    createdAt: Date
    updatedAt: Date
}

export type BounceCreate = Omit<Bounce, 'bounceId' | 'createdAt' | 'updatedAt'>
```

`apps/backend/src/modules/bounce/interfaces/email-block.interface.ts`:

```typescript
export interface EmailBlock {
    emailBlockId: number
    emailAddress: string
    blockCount: number
    blockedUntil: Date | null
    createdAt: Date
    updatedAt: Date
}

export type EmailBlockCreate = Pick<EmailBlock, 'emailAddress'>
```

- [ ] **Step 2: Create the constants**

`apps/backend/src/modules/bounce/bounce.constants.ts`:

```typescript
export const BLOCK_LADDER_DAYS = [7, 30, 90, 365]
export const TRANSIENT_THRESHOLD = 3
export const TRANSIENT_WINDOW_DAYS = 7
export const BOUNCE_POLL_LOCK_KEY = 815_001
export const DAY_MS = 24 * 60 * 60 * 1000
```

- [ ] **Step 3: Create the models**

`apps/backend/src/modules/bounce/models/bounce.model.ts`:

```typescript
import {
    AllowNull,
    AutoIncrement,
    Column,
    CreatedAt,
    DataType,
    Model,
    PrimaryKey,
    Table,
    UpdatedAt,
} from 'sequelize-typescript'
import { Bounce, BounceCreate, BounceType } from '../interfaces/bounce.interface'

@Table({
    tableName: 'bounce',
})
export class BounceModel extends Model<Bounce, BounceCreate> implements Bounce {
    @PrimaryKey
    @AutoIncrement
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare bounceId: number

    @AllowNull(false)
    @Column({ type: DataType.STRING(255), unique: 'bounce_message_id_email_address_unique' })
    declare emailAddress: string

    @AllowNull(false)
    @Column(DataType.STRING(255))
    declare type: BounceType

    @AllowNull
    @Column(DataType.STRING(16))
    declare statusCode: string | null

    @AllowNull(false)
    @Column(DataType.TEXT)
    declare reason: string

    @AllowNull
    @Column({ type: DataType.STRING(998), unique: 'bounce_message_id_email_address_unique' })
    declare messageId: string | null

    @AllowNull(false)
    @Column(DataType.DATE)
    declare receivedAt: Date

    @CreatedAt
    declare createdAt: Date

    @UpdatedAt
    declare updatedAt: Date
}
```

`apps/backend/src/modules/bounce/models/email-block.model.ts`:

```typescript
import {
    AllowNull,
    AutoIncrement,
    Column,
    CreatedAt,
    DataType,
    Default,
    Model,
    PrimaryKey,
    Table,
    Unique,
    UpdatedAt,
} from 'sequelize-typescript'
import { EmailBlock, EmailBlockCreate } from '../interfaces/email-block.interface'

@Table({
    tableName: 'email_block',
})
export class EmailBlockModel extends Model<EmailBlock, EmailBlockCreate> implements EmailBlock {
    @PrimaryKey
    @AutoIncrement
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare emailBlockId: number

    @Unique
    @AllowNull(false)
    @Column(DataType.STRING(255))
    declare emailAddress: string

    @Default(0)
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare blockCount: number

    @AllowNull
    @Column(DataType.DATE)
    declare blockedUntil: Date | null

    @CreatedAt
    declare createdAt: Date

    @UpdatedAt
    declare updatedAt: Date
}
```

- [ ] **Step 4: Create the migration**

`apps/backend/src/migrations/007-create-bounces.ts`:

```typescript
import type { MigrationFn } from 'umzug'
import { DataTypes, type QueryInterface } from 'sequelize'

export const up: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
    await queryInterface.createTable('bounce', {
        bounceId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true,
        },
        emailAddress: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        type: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        statusCode: {
            type: DataTypes.STRING(16),
            allowNull: true,
        },
        reason: {
            type: DataTypes.TEXT,
            allowNull: false,
        },
        messageId: {
            type: DataTypes.STRING(998),
            allowNull: true,
        },
        receivedAt: {
            type: DataTypes.DATE,
            allowNull: false,
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

    await queryInterface.addIndex('bounce', ['emailAddress'], {
        name: 'bounce_email_address',
    })

    await queryInterface.addIndex('bounce', ['messageId', 'emailAddress'], {
        name: 'bounce_message_id_email_address_unique',
        unique: true,
    })

    await queryInterface.createTable('email_block', {
        emailBlockId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true,
        },
        emailAddress: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        blockCount: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
        },
        blockedUntil: {
            type: DataTypes.DATE,
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

    await queryInterface.addIndex('email_block', ['emailAddress'], {
        name: 'email_block_email_address_unique',
        unique: true,
    })
}

export const down: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
    await queryInterface.dropTable('email_block')
    await queryInterface.dropTable('bounce')
}
```

- [ ] **Step 5: Create the module and register it**

`apps/backend/src/modules/bounce/bounce.module.ts` (services/controller come in later tasks; start with models only):

```typescript
import { Module } from '@nestjs/common'
import { SequelizeModule } from '@nestjs/sequelize'
import { BounceModel } from './models/bounce.model'
import { EmailBlockModel } from './models/email-block.model'

@Module({
    imports: [SequelizeModule.forFeature([BounceModel, EmailBlockModel])],
})
export class BounceModule {}
```

In `apps/backend/src/app.module.ts` add the import line with the other module imports:

```typescript
import { BounceModule } from './modules/bounce/bounce.module'
```

and add `BounceModule,` to the `imports` array directly after `MailModule`.

- [ ] **Step 6: Verify**

Run: `pnpm --filter backend typecheck && pnpm --filter backend lint`
Expected: both exit 0, no new errors.

Optional if the dev Postgres from `dev/docker-compose.yml` is running: `pnpm --filter backend migrate up` — expected output includes `007-create-bounces` migrated. (`pnpm --filter backend migrate down` reverts it if needed.)

---

### Task 2: EmailBlockService with escalation ladder (TDD)

**Files:**

- Create: `apps/backend/src/modules/bounce/exceptions/email-blocked.exception.ts`
- Create: `apps/backend/src/modules/bounce/services/email-block.service.ts`
- Test: `apps/backend/src/modules/bounce/services/email-block.service.spec.ts`
- Modify: `apps/backend/src/modules/bounce/bounce.module.ts`

**Interfaces:**

- Consumes: `EmailBlockModel`, `EmailBlock` interface, `BLOCK_LADDER_DAYS`, `DAY_MS` (Task 1).
- Produces: `EmailBlockedException` (fields `emailAddress: string`, `blockedUntil: Date`), `EmailBlockService` with `applyBlock(emailAddress: string): Promise<EmailBlock>`, `assertNotBlocked(emailAddress: string): Promise<void>`, `getBlockedAddresses(): Promise<EmailBlock[]>`, `unblock(emailBlockId: number): Promise<EmailBlock>`. Tasks 3, 6, 7 rely on these exact signatures.

- [ ] **Step 1: Create the exception** (trivial, no own test — behavior is covered via the service spec)

`apps/backend/src/modules/bounce/exceptions/email-blocked.exception.ts`:

```typescript
export class EmailBlockedException extends Error {
    constructor(
        readonly emailAddress: string,
        readonly blockedUntil: Date,
    ) {
        super(`Recipient ${emailAddress} is blocked until ${blockedUntil.toISOString()}`)
        this.name = 'EmailBlockedException'
    }
}
```

- [ ] **Step 2: Write the failing spec**

`apps/backend/src/modules/bounce/services/email-block.service.spec.ts`:

```typescript
import { Logger, NotFoundException } from '@nestjs/common'
import { getModelToken } from '@nestjs/sequelize'
import { Test, TestingModule } from '@nestjs/testing'
import { Op } from 'sequelize'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { EmailBlockService } from './email-block.service'
import { EmailBlockModel } from '../models/email-block.model'
import { EmailBlock } from '../interfaces/email-block.interface'
import { EmailBlockedException } from '../exceptions/email-blocked.exception'
import { DAY_MS } from '../bounce.constants'

const now = new Date('2026-07-13T12:00:00.000Z')

type BlockRow = EmailBlock & {
    get: (options: { plain: true }) => EmailBlock
    update: Mock<(values: Partial<EmailBlock>) => Promise<BlockRow>>
}

function blockRow(partial: Partial<EmailBlock> = {}): BlockRow {
    let plain: EmailBlock = {
        emailBlockId: 5,
        emailAddress: 'user@example.com',
        blockCount: 0,
        blockedUntil: null,
        createdAt: now,
        updatedAt: now,
        ...partial,
    }
    const row: BlockRow = {
        ...plain,
        get: () => plain,
        update: vi.fn<BlockRow['update']>(),
    }
    row.update.mockImplementation((values) => {
        plain = { ...plain, ...values }
        return Promise.resolve(row)
    })
    return row
}

describe('EmailBlockService', () => {
    let service: EmailBlockService
    let findOrCreate: Mock<(typeof EmailBlockModel)['findOrCreate']>
    let findOne: Mock<(typeof EmailBlockModel)['findOne']>
    let findAll: Mock<(typeof EmailBlockModel)['findAll']>
    let findByPk: Mock<(typeof EmailBlockModel)['findByPk']>

    beforeEach(async () => {
        vi.useFakeTimers()
        vi.setSystemTime(now)
        vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)

        findOrCreate = vi.fn<typeof findOrCreate>()
        findOne = vi.fn<typeof findOne>().mockResolvedValue(null)
        findAll = vi.fn<typeof findAll>().mockResolvedValue([])
        findByPk = vi.fn<typeof findByPk>()

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                EmailBlockService,
                {
                    provide: getModelToken(EmailBlockModel),
                    useValue: { findOrCreate, findOne, findAll, findByPk },
                },
            ],
        }).compile()

        service = module.get(EmailBlockService)
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    describe('applyBlock', () => {
        it('blocks a first-time bouncer for 7 days', async () => {
            const row = blockRow()
            findOrCreate.mockResolvedValue([row, true])

            const result = await service.applyBlock('User@Example.com')

            expect(findOrCreate).toHaveBeenCalledWith({
                where: { emailAddress: 'user@example.com' },
                defaults: { emailAddress: 'user@example.com' },
            })
            expect(row.update).toHaveBeenCalledWith({
                blockCount: 1,
                blockedUntil: new Date(now.getTime() + 7 * DAY_MS),
            })
            expect(result.blockCount).toBe(1)
        })

        it('escalates along the ladder for repeat offenders', async () => {
            const row = blockRow({ blockCount: 2, blockedUntil: new Date(now.getTime() - DAY_MS) })
            findOrCreate.mockResolvedValue([row, false])

            await service.applyBlock('user@example.com')

            expect(row.update).toHaveBeenCalledWith({
                blockCount: 3,
                blockedUntil: new Date(now.getTime() + 90 * DAY_MS),
            })
        })

        it('caps the duration at the top of the ladder', async () => {
            const row = blockRow({ blockCount: 9, blockedUntil: new Date(now.getTime() - DAY_MS) })
            findOrCreate.mockResolvedValue([row, false])

            await service.applyBlock('user@example.com')

            expect(row.update).toHaveBeenCalledWith({
                blockCount: 10,
                blockedUntil: new Date(now.getTime() + 365 * DAY_MS),
            })
        })

        it('does not escalate while a block is still active', async () => {
            const blockedUntil = new Date(now.getTime() + DAY_MS)
            const row = blockRow({ blockCount: 1, blockedUntil })
            findOrCreate.mockResolvedValue([row, false])

            const result = await service.applyBlock('user@example.com')

            expect(row.update).not.toHaveBeenCalled()
            expect(result.blockedUntil).toEqual(blockedUntil)
        })
    })

    describe('assertNotBlocked', () => {
        it('throws for an actively blocked address', async () => {
            const blockedUntil = new Date(now.getTime() + DAY_MS)
            findOne.mockResolvedValue(blockRow({ blockCount: 1, blockedUntil }))

            await expect(service.assertNotBlocked('User@Example.com')).rejects.toThrow(EmailBlockedException)
            expect(findOne).toHaveBeenCalledWith({
                where: { emailAddress: 'user@example.com', blockedUntil: { [Op.gt]: now } },
            })
        })

        it('resolves when the address is not blocked', async () => {
            await expect(service.assertNotBlocked('user@example.com')).resolves.toBeUndefined()
        })
    })

    describe('getBlockedAddresses', () => {
        it('returns active blocks as plain rows', async () => {
            const blockedUntil = new Date(now.getTime() + DAY_MS)
            findAll.mockResolvedValue([blockRow({ blockCount: 2, blockedUntil })])

            const result = await service.getBlockedAddresses()

            expect(findAll).toHaveBeenCalledWith({
                where: { blockedUntil: { [Op.gt]: now } },
                order: [['blockedUntil', 'DESC']],
            })
            expect(result).toEqual([expect.objectContaining({ emailAddress: 'user@example.com', blockCount: 2 })])
        })
    })

    describe('unblock', () => {
        it('clears blockedUntil but keeps the block count', async () => {
            const row = blockRow({ blockCount: 3, blockedUntil: new Date(now.getTime() + DAY_MS) })
            findByPk.mockResolvedValue(row)

            const result = await service.unblock(5)

            expect(findByPk).toHaveBeenCalledWith(5)
            expect(row.update).toHaveBeenCalledWith({ blockedUntil: null })
            expect(result.blockCount).toBe(3)
            expect(result.blockedUntil).toBeNull()
        })

        it('throws NotFound for an unknown id', async () => {
            findByPk.mockResolvedValue(null)

            await expect(service.unblock(99)).rejects.toThrow(NotFoundException)
        })
    })
})
```

- [ ] **Step 3: Run the spec to verify it fails**

Run: `pnpm --filter backend exec vitest run src/modules/bounce/services/email-block.service.spec.ts`
Expected: FAIL — cannot resolve `./email-block.service`.

- [ ] **Step 4: Implement the service**

`apps/backend/src/modules/bounce/services/email-block.service.ts`:

```typescript
import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/sequelize'
import { Op } from 'sequelize'
import { EmailBlockModel } from '../models/email-block.model'
import { EmailBlock } from '../interfaces/email-block.interface'
import { EmailBlockedException } from '../exceptions/email-blocked.exception'
import { BLOCK_LADDER_DAYS, DAY_MS } from '../bounce.constants'

@Injectable()
export class EmailBlockService {
    private readonly logger = new Logger(EmailBlockService.name)

    constructor(@InjectModel(EmailBlockModel) private readonly emailBlockModel: typeof EmailBlockModel) {}

    async applyBlock(emailAddress: string): Promise<EmailBlock> {
        const address = emailAddress.toLowerCase()
        const [row] = await this.emailBlockModel.findOrCreate({
            where: { emailAddress: address },
            defaults: { emailAddress: address },
        })

        const block = row.get({ plain: true })
        if (block.blockedUntil && block.blockedUntil > new Date()) {
            return block
        }

        const blockCount = block.blockCount + 1
        const days = BLOCK_LADDER_DAYS[Math.min(blockCount, BLOCK_LADDER_DAYS.length) - 1] ?? 365
        const blockedUntil = new Date(Date.now() + days * DAY_MS)

        await row.update({ blockCount, blockedUntil })
        this.logger.log(`Blocked ${address} until ${blockedUntil.toISOString()} (block #${blockCount})`)

        return row.get({ plain: true })
    }

    async assertNotBlocked(emailAddress: string): Promise<void> {
        const row = await this.emailBlockModel.findOne({
            where: { emailAddress: emailAddress.toLowerCase(), blockedUntil: { [Op.gt]: new Date() } },
        })

        const block = row?.get({ plain: true })
        if (block?.blockedUntil) {
            throw new EmailBlockedException(block.emailAddress, block.blockedUntil)
        }
    }

    async getBlockedAddresses(): Promise<EmailBlock[]> {
        const rows = await this.emailBlockModel.findAll({
            where: { blockedUntil: { [Op.gt]: new Date() } },
            order: [['blockedUntil', 'DESC']],
        })

        return rows.map((row) => row.get({ plain: true }))
    }

    async unblock(emailBlockId: number): Promise<EmailBlock> {
        const row = await this.emailBlockModel.findByPk(emailBlockId)
        if (!row) {
            throw new NotFoundException('Unknown email block')
        }

        await row.update({ blockedUntil: null })
        this.logger.log(`Unblocked ${row.emailAddress}`)

        return row.get({ plain: true })
    }
}
```

Register in `apps/backend/src/modules/bounce/bounce.module.ts` — add to the `@Module` object:

```typescript
    providers: [EmailBlockService],
    exports: [EmailBlockService],
```

with import `import { EmailBlockService } from './services/email-block.service'`.

- [ ] **Step 5: Run the spec to verify it passes**

Run: `pnpm --filter backend exec vitest run src/modules/bounce/services/email-block.service.spec.ts`
Expected: PASS, 10 tests.

- [ ] **Step 6: Verify the build**

Run: `pnpm --filter backend typecheck && pnpm --filter backend lint`
Expected: exit 0.

---

### Task 3: BounceService — recording + block triggering (TDD)

**Files:**

- Create: `apps/backend/src/modules/bounce/services/bounce.service.ts`
- Test: `apps/backend/src/modules/bounce/services/bounce.service.spec.ts`
- Modify: `apps/backend/src/modules/bounce/bounce.module.ts`

**Interfaces:**

- Consumes: `BounceModel`, `Bounce`/`BounceCreate`/`BounceType`, `EmailBlockService.applyBlock`, constants (Tasks 1–2).
- Produces: `BounceService` with `recordBounce(bounce: BounceCreate): Promise<void>` and `getBounces(): Promise<Bounce[]>`. Tasks 5, 6, 7 rely on these exact signatures.

- [ ] **Step 1: Write the failing spec**

`apps/backend/src/modules/bounce/services/bounce.service.spec.ts`:

```typescript
import { Logger } from '@nestjs/common'
import { getModelToken } from '@nestjs/sequelize'
import { Test, TestingModule } from '@nestjs/testing'
import { Op, UniqueConstraintError } from 'sequelize'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { BounceService } from './bounce.service'
import { EmailBlockService } from './email-block.service'
import { BounceModel } from '../models/bounce.model'
import { Bounce, BounceCreate, BounceType } from '../interfaces/bounce.interface'
import { DAY_MS } from '../bounce.constants'

const now = new Date('2026-07-13T12:00:00.000Z')

const permanentBounce: BounceCreate = {
    emailAddress: 'Missing@Example.org',
    type: BounceType.PERMANENT,
    statusCode: '5.1.1',
    reason: 'User unknown',
    messageId: '<dsn-1@relay.example.com>',
    receivedAt: now,
}

const transientBounce: BounceCreate = {
    ...permanentBounce,
    type: BounceType.TRANSIENT,
    statusCode: '4.2.2',
    reason: 'Mailbox full',
}

type BounceRow = Bounce & { get: (options: { plain: true }) => Bounce }

function bounceRow(partial: Partial<Bounce> = {}): BounceRow {
    const plain: Bounce = {
        bounceId: 1,
        emailAddress: 'missing@example.org',
        type: BounceType.PERMANENT,
        statusCode: '5.1.1',
        reason: 'User unknown',
        messageId: '<dsn-1@relay.example.com>',
        receivedAt: now,
        createdAt: now,
        updatedAt: now,
        ...partial,
    }
    return { ...plain, get: () => plain }
}

describe('BounceService', () => {
    let service: BounceService
    let create: Mock<(typeof BounceModel)['create']>
    let count: Mock<(typeof BounceModel)['count']>
    let findAll: Mock<(typeof BounceModel)['findAll']>
    let applyBlock: Mock<EmailBlockService['applyBlock']>

    beforeEach(async () => {
        vi.useFakeTimers()
        vi.setSystemTime(now)
        vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
        vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined)

        create = vi.fn<typeof create>().mockResolvedValue(bounceRow())
        count = vi.fn<typeof count>().mockResolvedValue(1)
        findAll = vi.fn<typeof findAll>().mockResolvedValue([])
        applyBlock = vi.fn<typeof applyBlock>()

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                BounceService,
                { provide: getModelToken(BounceModel), useValue: { create, count, findAll } },
                { provide: EmailBlockService, useValue: { applyBlock } },
            ],
        }).compile()

        service = module.get(BounceService)
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    describe('recordBounce', () => {
        it('stores the bounce with a lowercased address and blocks on permanent bounces', async () => {
            await service.recordBounce(permanentBounce)

            expect(create).toHaveBeenCalledWith({ ...permanentBounce, emailAddress: 'missing@example.org' })
            expect(applyBlock).toHaveBeenCalledWith('missing@example.org')
        })

        it('silently skips a bounce that was already recorded', async () => {
            create.mockRejectedValue(new UniqueConstraintError({}))

            await service.recordBounce(permanentBounce)

            expect(applyBlock).not.toHaveBeenCalled()
        })

        it('rethrows unexpected persistence errors', async () => {
            create.mockRejectedValue(new Error('connection lost'))

            await expect(service.recordBounce(permanentBounce)).rejects.toThrow('connection lost')
        })

        it('does not block below the transient threshold', async () => {
            count.mockResolvedValue(2)

            await service.recordBounce(transientBounce)

            expect(count).toHaveBeenCalledWith({
                where: {
                    emailAddress: 'missing@example.org',
                    type: BounceType.TRANSIENT,
                    receivedAt: { [Op.gte]: new Date(now.getTime() - 7 * DAY_MS) },
                },
            })
            expect(applyBlock).not.toHaveBeenCalled()
        })

        it('blocks once the transient threshold is reached', async () => {
            count.mockResolvedValue(3)

            await service.recordBounce(transientBounce)

            expect(applyBlock).toHaveBeenCalledWith('missing@example.org')
        })
    })

    describe('getBounces', () => {
        it('returns bounces as plain rows, newest first', async () => {
            findAll.mockResolvedValue([bounceRow()])

            const result = await service.getBounces()

            expect(findAll).toHaveBeenCalledWith({ order: [['receivedAt', 'DESC']] })
            expect(result).toEqual([expect.objectContaining({ emailAddress: 'missing@example.org' })])
        })
    })
})
```

- [ ] **Step 2: Run the spec to verify it fails**

Run: `pnpm --filter backend exec vitest run src/modules/bounce/services/bounce.service.spec.ts`
Expected: FAIL — cannot resolve `./bounce.service`.

- [ ] **Step 3: Implement the service**

`apps/backend/src/modules/bounce/services/bounce.service.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common'
import { InjectModel } from '@nestjs/sequelize'
import { Op, UniqueConstraintError } from 'sequelize'
import { BounceModel } from '../models/bounce.model'
import { Bounce, BounceCreate, BounceType } from '../interfaces/bounce.interface'
import { EmailBlockService } from './email-block.service'
import { DAY_MS, TRANSIENT_THRESHOLD, TRANSIENT_WINDOW_DAYS } from '../bounce.constants'

@Injectable()
export class BounceService {
    private readonly logger = new Logger(BounceService.name)

    constructor(
        @InjectModel(BounceModel) private readonly bounceModel: typeof BounceModel,
        private readonly emailBlockService: EmailBlockService,
    ) {}

    async recordBounce(bounce: BounceCreate): Promise<void> {
        const emailAddress = bounce.emailAddress.toLowerCase()

        try {
            await this.bounceModel.create({ ...bounce, emailAddress })
        } catch (error) {
            if (error instanceof UniqueConstraintError) {
                this.logger.debug(`Bounce for ${emailAddress} from ${bounce.messageId ?? 'unknown'} already recorded`)
                return
            }
            throw error
        }

        this.logger.log(`Recorded ${bounce.type} bounce for ${emailAddress}: ${bounce.reason}`)

        if (bounce.type === BounceType.PERMANENT) {
            await this.emailBlockService.applyBlock(emailAddress)
            return
        }

        const windowStart = new Date(Date.now() - TRANSIENT_WINDOW_DAYS * DAY_MS)
        const transientCount = await this.bounceModel.count({
            where: {
                emailAddress,
                type: BounceType.TRANSIENT,
                receivedAt: { [Op.gte]: windowStart },
            },
        })

        if (transientCount >= TRANSIENT_THRESHOLD) {
            await this.emailBlockService.applyBlock(emailAddress)
        }
    }

    async getBounces(): Promise<Bounce[]> {
        const bounces = await this.bounceModel.findAll({ order: [['receivedAt', 'DESC']] })

        return bounces.map((bounce) => bounce.get({ plain: true }))
    }
}
```

Register in `bounce.module.ts`: add `BounceService` to `providers` and `exports` (import `import { BounceService } from './services/bounce.service'`).

- [ ] **Step 4: Run the spec to verify it passes**

Run: `pnpm --filter backend exec vitest run src/modules/bounce/services/bounce.service.spec.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Verify the build**

Run: `pnpm --filter backend typecheck && pnpm --filter backend lint`
Expected: exit 0.

---

### Task 4: DsnParserService (TDD)

**Files:**

- Create: `apps/backend/src/modules/bounce/services/dsn-parser.service.ts`
- Test: `apps/backend/src/modules/bounce/services/dsn-parser.service.spec.ts`
- Modify: `apps/backend/package.json` (via pnpm add)
- Modify: `apps/backend/src/modules/bounce/bounce.module.ts`

**Interfaces:**

- Consumes: `BounceType` (Task 1).
- Produces:

```typescript
export interface ParsedDsnRecipient {
    emailAddress: string
    type: BounceType
    statusCode: string | null
    reason: string
}

export interface ParsedDsn {
    messageId: string | null
    receivedAt: Date
    recipients: ParsedDsnRecipient[]
}
```

and `DsnParserService.parse(source: Buffer | string): Promise<ParsedDsn | null>` (null when the message is not a DSN or reports no failed/delayed recipient). Task 5 relies on these.

- [ ] **Step 1: Install the parser dependency**

Run: `pnpm --filter backend add mailparser && pnpm --filter backend add -D @types/mailparser`
Expected: both appear in `apps/backend/package.json`.

- [ ] **Step 2: Write the failing spec**

`apps/backend/src/modules/bounce/services/dsn-parser.service.spec.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { DsnParserService } from './dsn-parser.service'
import { BounceType } from '../interfaces/bounce.interface'

function dsnMessage(deliveryStatusBody: string, messageId = '<dsn-1@relay.example.com>'): string {
    return [
        'From: MAILER-DAEMON@relay.example.com',
        'To: bounces@schwarzdavid.email',
        'Subject: Undelivered Mail Returned to Sender',
        'Date: Mon, 13 Jul 2026 10:00:00 +0000',
        `Message-ID: ${messageId}`,
        'MIME-Version: 1.0',
        'Content-Type: multipart/report; report-type=delivery-status; boundary="BOUND"',
        '',
        '--BOUND',
        'Content-Type: text/plain; charset=utf-8',
        '',
        'This is the mail system at host relay.example.com.',
        '',
        '--BOUND',
        'Content-Type: message/delivery-status',
        '',
        deliveryStatusBody,
        '',
        '--BOUND--',
        '',
    ].join('\r\n')
}

const service = new DsnParserService()

describe('DsnParserService', () => {
    it('parses a permanent failure DSN', async () => {
        const source = dsnMessage(
            [
                'Reporting-MTA: dns; relay.example.com',
                '',
                'Final-Recipient: rfc822; Missing@Example.org',
                'Action: failed',
                'Status: 5.1.1',
                'Diagnostic-Code: smtp; 550 5.1.1 <missing@example.org>: User unknown',
            ].join('\r\n'),
        )

        const result = await service.parse(source)

        expect(result).toEqual({
            messageId: '<dsn-1@relay.example.com>',
            receivedAt: new Date('2026-07-13T10:00:00.000Z'),
            recipients: [
                {
                    emailAddress: 'missing@example.org',
                    type: BounceType.PERMANENT,
                    statusCode: '5.1.1',
                    reason: '550 5.1.1 <missing@example.org>: User unknown',
                },
            ],
        })
    })

    it('classifies a 4.x.x failure as transient', async () => {
        const source = dsnMessage(
            [
                'Reporting-MTA: dns; relay.example.com',
                '',
                'Final-Recipient: rfc822; full@example.org',
                'Action: failed',
                'Status: 4.2.2',
                'Diagnostic-Code: smtp; 452 4.2.2 Mailbox full',
            ].join('\r\n'),
        )

        const result = await service.parse(source)

        expect(result?.recipients).toEqual([
            expect.objectContaining({ emailAddress: 'full@example.org', type: BounceType.TRANSIENT }),
        ])
    })

    it('classifies a delayed notification as transient', async () => {
        const source = dsnMessage(
            [
                'Reporting-MTA: dns; relay.example.com',
                '',
                'Final-Recipient: rfc822; slow@example.org',
                'Action: delayed',
                'Status: 4.4.1',
            ].join('\r\n'),
        )

        const result = await service.parse(source)

        expect(result?.recipients).toEqual([
            expect.objectContaining({
                emailAddress: 'slow@example.org',
                type: BounceType.TRANSIENT,
                reason: 'delayed (4.4.1)',
            }),
        ])
    })

    it('reports every failed recipient of a multi-recipient DSN', async () => {
        const source = dsnMessage(
            [
                'Reporting-MTA: dns; relay.example.com',
                '',
                'Final-Recipient: rfc822; first@example.org',
                'Action: failed',
                'Status: 5.1.1',
                '',
                'Final-Recipient: rfc822; second@example.org',
                'Action: failed',
                'Status: 5.2.1',
            ].join('\r\n'),
        )

        const result = await service.parse(source)

        expect(result?.recipients).toHaveLength(2)
        expect(result?.recipients[0]?.emailAddress).toBe('first@example.org')
        expect(result?.recipients[1]?.emailAddress).toBe('second@example.org')
    })

    it('ignores recipients that were delivered or relayed', async () => {
        const source = dsnMessage(
            [
                'Reporting-MTA: dns; relay.example.com',
                '',
                'Final-Recipient: rfc822; ok@example.org',
                'Action: relayed',
                'Status: 2.0.0',
            ].join('\r\n'),
        )

        await expect(service.parse(source)).resolves.toBeNull()
    })

    it('returns null for a regular non-DSN mail', async () => {
        const source = [
            'From: someone@example.org',
            'To: bounces@schwarzdavid.email',
            'Subject: Hello',
            'Date: Mon, 13 Jul 2026 10:00:00 +0000',
            'Message-ID: <plain-1@example.org>',
            'Content-Type: text/plain; charset=utf-8',
            '',
            'Just a regular mail.',
            '',
        ].join('\r\n')

        await expect(service.parse(source)).resolves.toBeNull()
    })
})
```

- [ ] **Step 3: Run the spec to verify it fails**

Run: `pnpm --filter backend exec vitest run src/modules/bounce/services/dsn-parser.service.spec.ts`
Expected: FAIL — cannot resolve `./dsn-parser.service`.

- [ ] **Step 4: Implement the parser**

`apps/backend/src/modules/bounce/services/dsn-parser.service.ts`:

```typescript
import { Injectable } from '@nestjs/common'
import { simpleParser } from 'mailparser'
import { BounceType } from '../interfaces/bounce.interface'

export interface ParsedDsnRecipient {
    emailAddress: string
    type: BounceType
    statusCode: string | null
    reason: string
}

export interface ParsedDsn {
    messageId: string | null
    receivedAt: Date
    recipients: ParsedDsnRecipient[]
}

@Injectable()
export class DsnParserService {
    async parse(source: Buffer | string): Promise<ParsedDsn | null> {
        const mail = await simpleParser(source)
        const deliveryStatus = mail.attachments.find(
            (attachment) => attachment.contentType === 'message/delivery-status',
        )
        if (!deliveryStatus) {
            return null
        }

        const groups = this.parseFieldGroups(deliveryStatus.content.toString('utf8'))
        const recipients: ParsedDsnRecipient[] = []

        for (const group of groups) {
            const finalRecipient = group['final-recipient'] ?? group['original-recipient']
            const action = group['action']?.toLowerCase()
            if (!finalRecipient || !action) {
                continue
            }

            const emailAddress = this.extractAddress(finalRecipient)
            if (!emailAddress) {
                continue
            }

            const statusCode = group['status'] ?? null
            const type = this.classify(action, statusCode)
            if (!type) {
                continue
            }

            recipients.push({
                emailAddress,
                type,
                statusCode,
                reason: this.extractReason(group, action),
            })
        }

        if (recipients.length === 0) {
            return null
        }

        return {
            messageId: mail.messageId ?? null,
            receivedAt: mail.date ?? new Date(),
            recipients,
        }
    }

    private parseFieldGroups(content: string): Record<string, string>[] {
        return content
            .split(/\r?\n\r?\n/)
            .map((block) => {
                const fields: Record<string, string> = {}
                for (const line of block.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
                    const separator = line.indexOf(':')
                    if (separator === -1) {
                        continue
                    }
                    fields[line.slice(0, separator).trim().toLowerCase()] = line.slice(separator + 1).trim()
                }
                return fields
            })
            .filter((fields) => Object.keys(fields).length > 0)
    }

    private extractAddress(value: string): string | null {
        const address = (value.includes(';') ? value.slice(value.indexOf(';') + 1) : value).trim().toLowerCase()
        return address.includes('@') ? address : null
    }

    private classify(action: string, statusCode: string | null): BounceType | null {
        if (action === 'failed') {
            return statusCode?.startsWith('4') ? BounceType.TRANSIENT : BounceType.PERMANENT
        }
        if (action === 'delayed') {
            return BounceType.TRANSIENT
        }
        return null
    }

    private extractReason(fields: Record<string, string>, action: string): string {
        const diagnostic = fields['diagnostic-code']
        if (diagnostic) {
            return (diagnostic.includes(';') ? diagnostic.slice(diagnostic.indexOf(';') + 1) : diagnostic).trim()
        }
        const statusCode = fields['status']
        return statusCode ? `${action} (${statusCode})` : action
    }
}
```

Register in `bounce.module.ts`: add `DsnParserService` to `providers` (not exported — only the poller uses it).

- [ ] **Step 5: Run the spec to verify it passes**

Run: `pnpm --filter backend exec vitest run src/modules/bounce/services/dsn-parser.service.spec.ts`
Expected: PASS, 6 tests. If the `delivery-status` attachment lookup fails, debug by logging `mail.attachments.map((a) => a.contentType)` — mailparser exposes `message/delivery-status` parts as attachments; adjust the `find` predicate to `contentType.startsWith('message/delivery-status')` only if the assertion shows a parameterized content type.

- [ ] **Step 6: Verify the build**

Run: `pnpm --filter backend typecheck && pnpm --filter backend lint`
Expected: exit 0.

---

### Task 5: BounceMailboxService — IMAP poller with advisory lock (TDD)

**Files:**

- Create: `apps/backend/src/modules/bounce/services/bounce-mailbox.service.ts`
- Test: `apps/backend/src/modules/bounce/services/bounce-mailbox.service.spec.ts`
- Modify: `apps/backend/package.json` (via pnpm add)
- Modify: `apps/backend/src/modules/bounce/bounce.module.ts`

**Interfaces:**

- Consumes: `DsnParserService.parse`, `BounceService.recordBounce`, `BOUNCE_POLL_LOCK_KEY` (Tasks 1, 3, 4). Env keys: `IMAP_HOST`, `IMAP_PORT`, `IMAP_SECURE`, `IMAP_USER`, `IMAP_PASSWORD`, `IMAP_POLL_INTERVAL_SECONDS`.
- Produces: `BounceMailboxService` with lifecycle hooks and `pollRound(): Promise<void>` (public for tests). Nothing else consumes it.

- [ ] **Step 1: Install the IMAP dependency**

Run: `pnpm --filter backend add imapflow`
Expected: `imapflow` in `apps/backend/package.json` dependencies (it ships its own TypeScript types).

- [ ] **Step 2: Write the failing spec**

`apps/backend/src/modules/bounce/services/bounce-mailbox.service.spec.ts`:

```typescript
import { Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import { Sequelize } from 'sequelize-typescript'
import { ImapFlow } from 'imapflow'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { BounceMailboxService } from './bounce-mailbox.service'
import { DsnParserService, ParsedDsn } from './dsn-parser.service'
import { BounceService } from './bounce.service'
import { BounceType } from '../interfaces/bounce.interface'

const { imapClient } = vi.hoisted(() => ({
    imapClient: {
        connect: vi.fn(),
        logout: vi.fn(),
        getMailboxLock: vi.fn(),
        search: vi.fn(),
        fetchOne: vi.fn(),
        messageFlagsAdd: vi.fn(),
    },
}))

vi.mock('imapflow', () => ({
    ImapFlow: vi.fn(() => imapClient),
}))

const dsn: ParsedDsn = {
    messageId: '<dsn-1@relay.example.com>',
    receivedAt: new Date('2026-07-13T10:00:00.000Z'),
    recipients: [
        {
            emailAddress: 'missing@example.org',
            type: BounceType.PERMANENT,
            statusCode: '5.1.1',
            reason: 'User unknown',
        },
    ],
}

describe('BounceMailboxService', () => {
    let service: BounceMailboxService
    let parse: Mock<DsnParserService['parse']>
    let recordBounce: Mock<BounceService['recordBounce']>
    let query: Mock<(sql: string, options: unknown) => Promise<{ acquired: boolean }[]>>
    let transaction: Mock<(callback: (t: unknown) => PromiseLike<unknown>) => Promise<unknown>>
    let config: Record<string, string>

    beforeEach(async () => {
        vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
        vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
        vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)

        config = {
            IMAP_HOST: 'imap.example.com',
            IMAP_USER: 'bounces',
            IMAP_PASSWORD: 'secret',
        }

        parse = vi.fn<typeof parse>().mockResolvedValue(dsn)
        recordBounce = vi.fn<typeof recordBounce>().mockResolvedValue(undefined)
        query = vi.fn<typeof query>().mockResolvedValue([{ acquired: true }])
        transaction = vi
            .fn<typeof transaction>()
            .mockImplementation(async (callback: (t: unknown) => PromiseLike<unknown>) => callback(null))

        imapClient.connect.mockResolvedValue(undefined)
        imapClient.logout.mockResolvedValue(undefined)
        imapClient.getMailboxLock.mockResolvedValue({ release: vi.fn() })
        imapClient.search.mockResolvedValue([42])
        imapClient.fetchOne.mockResolvedValue({ source: Buffer.from('raw mail') })
        imapClient.messageFlagsAdd.mockResolvedValue(true)

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                BounceMailboxService,
                {
                    provide: ConfigService,
                    useValue: {
                        get: (key: string, fallback?: string) => config[key] ?? fallback,
                        getOrThrow: (key: string) => {
                            const value = config[key]
                            if (value === undefined) {
                                throw new Error(`Missing ${key}`)
                            }
                            return value
                        },
                    },
                },
                { provide: Sequelize, useValue: { query, transaction } },
                { provide: DsnParserService, useValue: { parse } },
                { provide: BounceService, useValue: { recordBounce } },
            ],
        }).compile()

        service = module.get(BounceMailboxService)
    })

    afterEach(() => {
        service.onApplicationShutdown()
        vi.clearAllMocks()
        vi.restoreAllMocks()
        vi.useRealTimers()
    })

    it('records every recipient of a fetched DSN and marks the message seen', async () => {
        await service.pollRound()

        expect(ImapFlow).toHaveBeenCalledWith(
            expect.objectContaining({ host: 'imap.example.com', port: 993, secure: true }),
        )
        expect(imapClient.search).toHaveBeenCalledWith({ seen: false }, { uid: true })
        expect(recordBounce).toHaveBeenCalledWith({
            emailAddress: 'missing@example.org',
            type: BounceType.PERMANENT,
            statusCode: '5.1.1',
            reason: 'User unknown',
            messageId: '<dsn-1@relay.example.com>',
            receivedAt: dsn.receivedAt,
        })
        expect(imapClient.messageFlagsAdd).toHaveBeenCalledWith('42', ['\\Seen'], { uid: true })
        expect(imapClient.logout).toHaveBeenCalled()
    })

    it('marks non-DSN messages seen without recording anything', async () => {
        parse.mockResolvedValue(null)

        await service.pollRound()

        expect(recordBounce).not.toHaveBeenCalled()
        expect(imapClient.messageFlagsAdd).toHaveBeenCalledWith('42', ['\\Seen'], { uid: true })
    })

    it('skips the round when another instance holds the advisory lock', async () => {
        query.mockResolvedValue([{ acquired: false }])

        await service.pollRound()

        expect(ImapFlow).not.toHaveBeenCalled()
        expect(recordBounce).not.toHaveBeenCalled()
    })

    it('does not start polling when IMAP_HOST is missing', () => {
        delete config.IMAP_HOST
        vi.useFakeTimers()
        const pollRound = vi.spyOn(service, 'pollRound')

        service.onApplicationBootstrap()
        vi.advanceTimersByTime(120_000)

        expect(pollRound).not.toHaveBeenCalled()
    })

    it('polls on the configured interval and stops on shutdown', () => {
        config.IMAP_POLL_INTERVAL_SECONDS = '30'
        vi.useFakeTimers()
        const pollRound = vi.spyOn(service, 'pollRound').mockResolvedValue(undefined)

        service.onApplicationBootstrap()
        vi.advanceTimersByTime(60_000)
        expect(pollRound).toHaveBeenCalledTimes(2)

        service.onApplicationShutdown()
        vi.advanceTimersByTime(60_000)
        expect(pollRound).toHaveBeenCalledTimes(2)
    })
})
```

- [ ] **Step 3: Run the spec to verify it fails**

Run: `pnpm --filter backend exec vitest run src/modules/bounce/services/bounce-mailbox.service.spec.ts`
Expected: FAIL — cannot resolve `./bounce-mailbox.service`.

- [ ] **Step 4: Implement the poller**

`apps/backend/src/modules/bounce/services/bounce-mailbox.service.ts`:

```typescript
import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { QueryTypes } from 'sequelize'
import { Sequelize } from 'sequelize-typescript'
import { ImapFlow } from 'imapflow'
import { DsnParserService } from './dsn-parser.service'
import { BounceService } from './bounce.service'
import { BOUNCE_POLL_LOCK_KEY } from '../bounce.constants'

@Injectable()
export class BounceMailboxService implements OnApplicationBootstrap, OnApplicationShutdown {
    private readonly logger = new Logger(BounceMailboxService.name)
    private interval: NodeJS.Timeout | null = null
    private roundRunning = false

    constructor(
        private readonly configService: ConfigService,
        private readonly sequelize: Sequelize,
        private readonly dsnParserService: DsnParserService,
        private readonly bounceService: BounceService,
    ) {}

    onApplicationBootstrap(): void {
        if (!this.configService.get<string>('IMAP_HOST')) {
            this.logger.warn('IMAP_HOST is not configured, bounce mailbox polling is disabled')
            return
        }

        const intervalSeconds = Number(this.configService.get<string>('IMAP_POLL_INTERVAL_SECONDS', '60'))
        this.interval = setInterval(() => {
            void this.pollRound().catch((error: unknown) => {
                const message = error instanceof Error ? error.message : String(error)
                this.logger.error(`Bounce mailbox poll failed: ${message}`)
            })
        }, intervalSeconds * 1000)
        this.logger.log(`Polling bounce mailbox every ${intervalSeconds}s`)
    }

    onApplicationShutdown(): void {
        if (this.interval) {
            clearInterval(this.interval)
            this.interval = null
        }
    }

    async pollRound(): Promise<void> {
        if (this.roundRunning) {
            return
        }
        this.roundRunning = true

        try {
            await this.sequelize.transaction(async (transaction) => {
                const [lock] = await this.sequelize.query<{ acquired: boolean }>(
                    'SELECT pg_try_advisory_xact_lock(:key) AS "acquired"',
                    { replacements: { key: BOUNCE_POLL_LOCK_KEY }, type: QueryTypes.SELECT, transaction },
                )
                if (!lock?.acquired) {
                    return
                }

                await this.processMailbox()
            })
        } finally {
            this.roundRunning = false
        }
    }

    private async processMailbox(): Promise<void> {
        const client = new ImapFlow({
            host: this.configService.getOrThrow<string>('IMAP_HOST'),
            port: Number(this.configService.get<string>('IMAP_PORT', '993')),
            secure: this.configService.get<string>('IMAP_SECURE', 'true') === 'true',
            auth: {
                user: this.configService.getOrThrow<string>('IMAP_USER'),
                pass: this.configService.getOrThrow<string>('IMAP_PASSWORD'),
            },
            logger: false,
        })

        await client.connect()
        try {
            const mailbox = await client.getMailboxLock('INBOX')
            try {
                const uids = (await client.search({ seen: false }, { uid: true })) || []
                for (const uid of uids) {
                    const message = await client.fetchOne(String(uid), { source: true }, { uid: true })
                    if (!message || !message.source) {
                        continue
                    }

                    const dsn = await this.dsnParserService.parse(message.source)
                    for (const recipient of dsn?.recipients ?? []) {
                        await this.bounceService.recordBounce({
                            ...recipient,
                            messageId: dsn?.messageId ?? null,
                            receivedAt: dsn?.receivedAt ?? new Date(),
                        })
                    }

                    await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true })
                }
            } finally {
                mailbox.release()
            }
        } finally {
            await client.logout()
        }
    }
}
```

Register in `bounce.module.ts`: add `BounceMailboxService` to `providers`. The complete module at this point:

```typescript
import { Module } from '@nestjs/common'
import { SequelizeModule } from '@nestjs/sequelize'
import { BounceModel } from './models/bounce.model'
import { EmailBlockModel } from './models/email-block.model'
import { EmailBlockService } from './services/email-block.service'
import { BounceService } from './services/bounce.service'
import { DsnParserService } from './services/dsn-parser.service'
import { BounceMailboxService } from './services/bounce-mailbox.service'

@Module({
    imports: [SequelizeModule.forFeature([BounceModel, EmailBlockModel])],
    providers: [EmailBlockService, BounceService, DsnParserService, BounceMailboxService],
    exports: [EmailBlockService, BounceService],
})
export class BounceModule {}
```

- [ ] **Step 5: Run the spec to verify it passes**

Run: `pnpm --filter backend exec vitest run src/modules/bounce/services/bounce-mailbox.service.spec.ts`
Expected: PASS, 5 tests. If imapflow's `fetchOne`/`search` signatures differ from the mocked shapes, check `node_modules/imapflow/lib/types.d.ts` and align the implementation (not the behavior): `search` may return `false` when the mailbox is empty — the `|| []` guard covers it.

- [ ] **Step 6: Verify the build**

Run: `pnpm --filter backend typecheck && pnpm --filter backend lint`
Expected: exit 0.

---

### Task 6: MailService — block enforcement, bounce envelope, sync 5xx recording (TDD)

**Files:**

- Modify: `apps/backend/src/modules/mail/services/mail.service.ts`
- Modify: `apps/backend/src/modules/mail/mail.module.ts`
- Test: `apps/backend/src/modules/mail/services/mail.service.spec.ts` (extend)

**Interfaces:**

- Consumes: `EmailBlockService.assertNotBlocked`, `BounceService.recordBounce`, `BounceType`, `EmailBlockedException` (Tasks 1–3). Env key `BOUNCE_ADDRESS`.
- Produces: unchanged `MailService.sendMail(mail: SendMail): Promise<void>` contract — callers (`InboundFormSubmissionService`) need no changes; a blocked recipient now rejects with `EmailBlockedException` which the delivery loop already catches generically.

- [ ] **Step 1: Extend the spec — new collaborators + new behaviors**

Replace `apps/backend/src/modules/mail/services/mail.service.spec.ts` with:

```typescript
import { Test, TestingModule } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { Logger } from '@nestjs/common'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { Transporter } from 'nodemailer'
import { MailService, SendMail } from './mail.service'
import { MAIL_TRANSPORTER } from '../mail.constants'
import { DomainService } from '../../domain/services/domain.service'
import { DkimEncryptionService } from '../../domain/services/dkim-encryption.service'
import { DomainWithActiveDkim } from '../../domain/interfaces/domain.interface'
import { DomainDkimAlgorithm } from '../../domain/interfaces/domain-dkim.interface'
import { EmailBlockService } from '../../bounce/services/email-block.service'
import { BounceService } from '../../bounce/services/bounce.service'
import { BounceType } from '../../bounce/interfaces/bounce.interface'
import { EmailBlockedException } from '../../bounce/exceptions/email-blocked.exception'

describe('MailService', () => {
    let service: MailService
    let sendMail: Mock<Transporter['sendMail']>
    let getSendingDomainByFqdn: Mock<DomainService['getSendingDomainByFqdn']>
    let decryptDkimPrivateKey: Mock<DkimEncryptionService['decryptDkimPrivateKey']>
    let assertNotBlocked: Mock<EmailBlockService['assertNotBlocked']>
    let recordBounce: Mock<BounceService['recordBounce']>
    let config: Record<string, string>

    const sendingDomain: DomainWithActiveDkim = {
        domainId: 1,
        fqdn: 'mail.example.com',
        rootDomain: 'example.com',
        activeDkimId: 7,
        dnsRecords: [],
        lastCheckedAt: null,
        activeDkim: {
            dkimId: 7,
            domainId: 1,
            selector: 's1',
            publicKey: 'pub',
            privateKey: 'v1.encrypted-key',
            algorithm: DomainDkimAlgorithm.RSA,
            keyBits: 2048,
            createdAt: new Date(),
        },
    }

    const mail: SendMail = {
        from: 'noreply@mail.example.com',
        to: 'owner@business.com',
        subject: 'New submission',
        html: '<p>Hello</p>',
    }

    beforeEach(async () => {
        vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
        vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)

        config = {}
        sendMail = vi.fn<typeof sendMail>().mockResolvedValue({})
        getSendingDomainByFqdn = vi.fn<typeof getSendingDomainByFqdn>().mockResolvedValue(sendingDomain)
        decryptDkimPrivateKey = vi.fn<typeof decryptDkimPrivateKey>().mockResolvedValue('-----BEGIN PRIVATE KEY-----')
        assertNotBlocked = vi.fn<typeof assertNotBlocked>().mockResolvedValue(undefined)
        recordBounce = vi.fn<typeof recordBounce>().mockResolvedValue(undefined)

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                MailService,
                { provide: MAIL_TRANSPORTER, useValue: { sendMail } },
                { provide: DomainService, useValue: { getSendingDomainByFqdn } },
                { provide: DkimEncryptionService, useValue: { decryptDkimPrivateKey } },
                { provide: EmailBlockService, useValue: { assertNotBlocked } },
                { provide: BounceService, useValue: { recordBounce } },
                {
                    provide: ConfigService,
                    useValue: { get: (key: string, fallback?: string) => config[key] ?? fallback },
                },
            ],
        }).compile()

        service = module.get(MailService)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('signs with the sending domain dkim key and hands the mail to the transporter', async () => {
        await service.sendMail(mail)

        expect(getSendingDomainByFqdn).toHaveBeenCalledWith('mail.example.com')
        expect(decryptDkimPrivateKey).toHaveBeenCalledWith('v1.encrypted-key')
        expect(sendMail).toHaveBeenCalledWith({
            from: 'noreply@mail.example.com',
            to: 'owner@business.com',
            replyTo: undefined,
            subject: 'New submission',
            html: '<p>Hello</p>',
            envelope: undefined,
            dkim: {
                domainName: 'mail.example.com',
                keySelector: 's1',
                privateKey: '-----BEGIN PRIVATE KEY-----',
            },
        })
    })

    it('passes replyTo through when set', async () => {
        await service.sendMail({ ...mail, replyTo: 'visitor@example.org' })

        expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ replyTo: 'visitor@example.org' }))
    })

    it('rejects when no sending domain is configured for the from address', async () => {
        getSendingDomainByFqdn.mockResolvedValue(null)

        await expect(service.sendMail(mail)).rejects.toThrow('No sending domain configured for mail.example.com')
        expect(sendMail).not.toHaveBeenCalled()
    })

    it('rejects a from address without a domain part', async () => {
        await expect(service.sendMail({ ...mail, from: 'broken-address' })).rejects.toThrow('Invalid from address')
        expect(sendMail).not.toHaveBeenCalled()
    })

    it('refuses to send to a blocked recipient before touching the transporter', async () => {
        assertNotBlocked.mockRejectedValue(new EmailBlockedException('owner@business.com', new Date()))

        await expect(service.sendMail(mail)).rejects.toThrow(EmailBlockedException)
        expect(assertNotBlocked).toHaveBeenCalledWith('owner@business.com')
        expect(sendMail).not.toHaveBeenCalled()
    })

    it('routes the envelope through the bounce address when configured', async () => {
        config.BOUNCE_ADDRESS = 'bounces@schwarzdavid.email'

        await service.sendMail(mail)

        expect(sendMail).toHaveBeenCalledWith(
            expect.objectContaining({
                envelope: { from: 'bounces@schwarzdavid.email', to: 'owner@business.com' },
            }),
        )
    })

    it('records a permanent bounce when the relay rejects with a 5xx and rethrows', async () => {
        const rejection = Object.assign(new Error('550 5.1.1 User unknown'), { responseCode: 550 })
        sendMail.mockRejectedValue(rejection)

        await expect(service.sendMail(mail)).rejects.toThrow('550 5.1.1 User unknown')
        expect(recordBounce).toHaveBeenCalledWith({
            emailAddress: 'owner@business.com',
            type: BounceType.PERMANENT,
            statusCode: '550',
            reason: '550 5.1.1 User unknown',
            messageId: null,
            receivedAt: expect.any(Date),
        })
    })

    it('does not record a bounce for non-5xx transporter errors', async () => {
        const rejection = Object.assign(new Error('451 try again later'), { responseCode: 451 })
        sendMail.mockRejectedValue(rejection)

        await expect(service.sendMail(mail)).rejects.toThrow('451 try again later')
        expect(recordBounce).not.toHaveBeenCalled()
    })

    it('still rejects with the transporter error when bounce recording itself fails', async () => {
        const rejection = Object.assign(new Error('550 rejected'), { responseCode: 550 })
        sendMail.mockRejectedValue(rejection)
        recordBounce.mockRejectedValue(new Error('db down'))

        await expect(service.sendMail(mail)).rejects.toThrow('550 rejected')
    })
})
```

- [ ] **Step 2: Run the spec to verify the new cases fail**

Run: `pnpm --filter backend exec vitest run src/modules/mail/services/mail.service.spec.ts`
Expected: FAIL — Nest cannot resolve the new `EmailBlockService`/`BounceService`/`ConfigService` constructor parameters (or the new assertions fail).

- [ ] **Step 3: Implement the changes**

Replace `apps/backend/src/modules/mail/services/mail.service.ts` with:

```typescript
import { Inject, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Transporter } from 'nodemailer'
import { MAIL_TRANSPORTER } from '../mail.constants'
import { DomainService } from '../../domain/services/domain.service'
import { DkimEncryptionService } from '../../domain/services/dkim-encryption.service'
import { EmailBlockService } from '../../bounce/services/email-block.service'
import { BounceService } from '../../bounce/services/bounce.service'
import { BounceType } from '../../bounce/interfaces/bounce.interface'

export interface SendMail {
    from: string
    to: string
    replyTo?: string
    subject: string
    html: string
}

@Injectable()
export class MailService {
    private readonly logger = new Logger(MailService.name)

    constructor(
        @Inject(MAIL_TRANSPORTER) private readonly transporter: Transporter,
        private readonly domainService: DomainService,
        private readonly dkimEncryptionService: DkimEncryptionService,
        private readonly emailBlockService: EmailBlockService,
        private readonly bounceService: BounceService,
        private readonly configService: ConfigService,
    ) {}

    async sendMail(mail: SendMail): Promise<void> {
        await this.emailBlockService.assertNotBlocked(mail.to)

        const [localPart, fqdn] = mail.from.split('@')
        if (!localPart || !fqdn) {
            throw new Error(`Invalid from address: ${mail.from}`)
        }

        const domain = await this.domainService.getSendingDomainByFqdn(fqdn)
        if (!domain) {
            throw new Error(`No sending domain configured for ${fqdn}`)
        }

        const privateKey = await this.dkimEncryptionService.decryptDkimPrivateKey(domain.activeDkim.privateKey)
        const bounceAddress = this.configService.get<string>('BOUNCE_ADDRESS')

        try {
            await this.transporter.sendMail({
                from: mail.from,
                to: mail.to,
                replyTo: mail.replyTo,
                subject: mail.subject,
                html: mail.html,
                envelope: bounceAddress ? { from: bounceAddress, to: mail.to } : undefined,
                dkim: {
                    domainName: domain.fqdn,
                    keySelector: domain.activeDkim.selector,
                    privateKey,
                },
            })
        } catch (error) {
            await this.recordRejection(mail.to, error)
            throw error
        }

        this.logger.log(`Sent mail from ${mail.from} to ${mail.to}`)
    }

    private async recordRejection(emailAddress: string, error: unknown): Promise<void> {
        const responseCode =
            error instanceof Error ? (error as Error & { responseCode?: number }).responseCode : undefined
        if (!responseCode || responseCode < 500) {
            return
        }

        try {
            await this.bounceService.recordBounce({
                emailAddress,
                type: BounceType.PERMANENT,
                statusCode: String(responseCode),
                reason: error instanceof Error ? error.message : String(error),
                messageId: null,
                receivedAt: new Date(),
            })
        } catch (recordError) {
            const message = recordError instanceof Error ? recordError.message : String(recordError)
            this.logger.error(`Failed to record rejection bounce for ${emailAddress}: ${message}`)
        }
    }
}
```

In `apps/backend/src/modules/mail/mail.module.ts` add `BounceModule` to imports:

```typescript
import { BounceModule } from '../bounce/bounce.module'
```

and change the imports array to `imports: [DomainModule, BounceModule],`.

- [ ] **Step 4: Run the spec to verify it passes**

Run: `pnpm --filter backend exec vitest run src/modules/mail/services/mail.service.spec.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Run the whole backend suite** (the delivery flow touches MailService)

Run: `pnpm --filter backend test`
Expected: all suites pass — in particular `inbound-form-submission.service.spec.ts` still passes because its `MailService` is mocked at the service boundary.

- [ ] **Step 6: Verify the build**

Run: `pnpm --filter backend typecheck && pnpm --filter backend lint`
Expected: exit 0.

---

### Task 7: DTOs, BounceController, env keys, OpenAPI + api client regeneration

**Files:**

- Create: `apps/backend/src/modules/bounce/dtos/bounce.dto.ts`
- Create: `apps/backend/src/modules/bounce/dtos/email-block.dto.ts`
- Create: `apps/backend/src/modules/bounce/controller/bounce.controller.ts`
- Test: `apps/backend/src/modules/bounce/controller/bounce.controller.spec.ts`
- Modify: `apps/backend/src/modules/bounce/bounce.module.ts`
- Modify: `.env.example`
- Generated: `packages/api/assets/openapi.json`, `packages/api/dist/**`

**Interfaces:**

- Consumes: `BounceService.getBounces`, `EmailBlockService.getBlockedAddresses` / `unblock` (Tasks 2–3).
- Produces: HTTP routes `GET /bounce`, `GET /bounce/blocked`, `DELETE /bounce/blocked/:emailBlockId`; regenerated SDK `BounceApi.getBounces()`, `BounceApi.getBlockedAddresses()`, `BounceApi.unblock({ path: { emailBlockId } })` plus types `BounceDto`, `EmailBlockDto` from `api`. Tasks 8–9 rely on these.

- [ ] **Step 1: Create the DTOs**

`apps/backend/src/modules/bounce/dtos/bounce.dto.ts`:

```typescript
import { Expose } from 'class-transformer'
import { Bounce, BounceType } from '../interfaces/bounce.interface'

export class BounceDto implements Omit<Bounce, 'messageId' | 'createdAt' | 'updatedAt'> {
    @Expose()
    bounceId!: number

    @Expose()
    emailAddress!: string

    @Expose()
    type!: BounceType

    @Expose()
    statusCode: string | null = null

    @Expose()
    reason!: string

    @Expose()
    receivedAt!: Date
}
```

`apps/backend/src/modules/bounce/dtos/email-block.dto.ts`:

```typescript
import { Expose } from 'class-transformer'
import { EmailBlock } from '../interfaces/email-block.interface'

export class EmailBlockDto implements Omit<EmailBlock, 'createdAt' | 'updatedAt'> {
    @Expose()
    emailBlockId!: number

    @Expose()
    emailAddress!: string

    @Expose()
    blockCount!: number

    @Expose()
    blockedUntil: Date | null = null
}
```

- [ ] **Step 2: Write the failing controller spec**

`apps/backend/src/modules/bounce/controller/bounce.controller.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { BounceController } from './bounce.controller'
import { BounceService } from '../services/bounce.service'
import { EmailBlockService } from '../services/email-block.service'
import { Bounce, BounceType } from '../interfaces/bounce.interface'
import { EmailBlock } from '../interfaces/email-block.interface'

const bounce: Bounce = {
    bounceId: 1,
    emailAddress: 'missing@example.org',
    type: BounceType.PERMANENT,
    statusCode: '5.1.1',
    reason: 'User unknown',
    messageId: '<dsn-1@relay.example.com>',
    receivedAt: new Date('2026-07-13T10:00:00.000Z'),
    createdAt: new Date('2026-07-13T10:00:00.000Z'),
    updatedAt: new Date('2026-07-13T10:00:00.000Z'),
}

const block: EmailBlock = {
    emailBlockId: 5,
    emailAddress: 'missing@example.org',
    blockCount: 2,
    blockedUntil: new Date('2026-08-13T10:00:00.000Z'),
    createdAt: new Date('2026-07-13T10:00:00.000Z'),
    updatedAt: new Date('2026-07-13T10:00:00.000Z'),
}

describe('BounceController', () => {
    let controller: BounceController
    let getBounces: Mock<BounceService['getBounces']>
    let getBlockedAddresses: Mock<EmailBlockService['getBlockedAddresses']>
    let unblock: Mock<EmailBlockService['unblock']>

    beforeEach(async () => {
        getBounces = vi.fn<typeof getBounces>().mockResolvedValue([bounce])
        getBlockedAddresses = vi.fn<typeof getBlockedAddresses>().mockResolvedValue([block])
        unblock = vi.fn<typeof unblock>().mockResolvedValue({ ...block, blockedUntil: null })

        const module: TestingModule = await Test.createTestingModule({
            controllers: [BounceController],
            providers: [
                { provide: BounceService, useValue: { getBounces } },
                { provide: EmailBlockService, useValue: { getBlockedAddresses, unblock } },
            ],
        }).compile()

        controller = module.get(BounceController)
    })

    it('lists bounce events', async () => {
        const result = await controller.getBounces()

        expect(getBounces).toHaveBeenCalledOnce()
        expect(result).toEqual([expect.objectContaining({ emailAddress: 'missing@example.org' })])
    })

    it('lists blocked addresses', async () => {
        const result = await controller.getBlockedAddresses()

        expect(getBlockedAddresses).toHaveBeenCalledOnce()
        expect(result).toEqual([expect.objectContaining({ blockCount: 2 })])
    })

    it('unblocks by id', async () => {
        const result = await controller.unblock(5)

        expect(unblock).toHaveBeenCalledWith(5)
        expect(result.blockedUntil).toBeNull()
    })
})
```

- [ ] **Step 3: Run the spec to verify it fails**

Run: `pnpm --filter backend exec vitest run src/modules/bounce/controller/bounce.controller.spec.ts`
Expected: FAIL — cannot resolve `./bounce.controller`.

- [ ] **Step 4: Implement the controller and register it**

`apps/backend/src/modules/bounce/controller/bounce.controller.ts`:

```typescript
import { Controller, Delete, Get, Param, SerializeOptions } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { JwtAuth } from '../../auth/decorators/JwtAuth'
import { ResponseDto } from '../../../decorators/ResponseDto'
import { BounceService } from '../services/bounce.service'
import { EmailBlockService } from '../services/email-block.service'
import { BounceDto } from '../dtos/bounce.dto'
import { EmailBlockDto } from '../dtos/email-block.dto'

@JwtAuth()
@ApiTags('bounce')
@Controller('bounce')
export class BounceController {
    constructor(
        private readonly bounceService: BounceService,
        private readonly emailBlockService: EmailBlockService,
    ) {}

    @SerializeOptions({ type: BounceDto })
    @Get()
    async getBounces(): Promise<BounceDto[]> {
        return await this.bounceService.getBounces()
    }

    @SerializeOptions({ type: EmailBlockDto })
    @Get('blocked')
    async getBlockedAddresses(): Promise<EmailBlockDto[]> {
        return await this.emailBlockService.getBlockedAddresses()
    }

    @ResponseDto(EmailBlockDto)
    @Delete('blocked/:emailBlockId')
    async unblock(@Param('emailBlockId') emailBlockId: number): Promise<EmailBlockDto> {
        return await this.emailBlockService.unblock(emailBlockId)
    }
}
```

In `bounce.module.ts` add `controllers: [BounceController]` (import `import { BounceController } from './controller/bounce.controller'`).

- [ ] **Step 5: Run the spec to verify it passes**

Run: `pnpm --filter backend exec vitest run src/modules/bounce/controller/bounce.controller.spec.ts`
Expected: PASS, 3 tests.

- [ ] **Step 6: Add the new env keys**

Append to `.env.example` (after the `ADMIN_EMAIL` line, separated by a blank line):

```
BOUNCE_ADDRESS=
IMAP_HOST=
IMAP_PORT=993
IMAP_SECURE=true
IMAP_USER=
IMAP_PASSWORD=
IMAP_POLL_INTERVAL_SECONDS=60
```

Do not edit `.env` (gitignored, owner-managed) — mention the new keys in the final report instead.

- [ ] **Step 7: Regenerate the OpenAPI spec and the typed client**

Run: `pnpm --filter backend generate && pnpm --filter api build`
Expected: `packages/api/assets/openapi.json` now contains the `/bounce` paths; the api build exits 0. Verify the SDK surface:

Run: `grep -l "BounceApi" packages/api/dist -r`
Expected: at least one hit (SDK class emitted, grouped by the `bounce` tag).

- [ ] **Step 8: Verify the build**

Run: `pnpm --filter backend typecheck && pnpm --filter backend lint && pnpm --filter backend test`
Expected: exit 0, all tests pass.

---

### Task 8: Frontend plumbing — route, nav, i18n, queries, mutation (TDD for composables)

**Files:**

- Modify: `apps/frontend/src/router/RouteNames.ts`
- Modify: `apps/frontend/src/router/index.ts`
- Modify: `apps/frontend/src/modules/dashboard/layouts/AppLayout.vue`
- Modify: `apps/frontend/src/locales/en.json`
- Create: `apps/frontend/src/modules/bounces/queries/useBouncesQuery.ts`
- Create: `apps/frontend/src/modules/bounces/queries/useBlockedAddressesQuery.ts`
- Create: `apps/frontend/src/modules/bounces/mutations/useUnblockMutation.ts`
- Test: `apps/frontend/src/modules/bounces/queries/__tests__/useBouncesQuery.spec.ts`
- Test: `apps/frontend/src/modules/bounces/mutations/__tests__/useUnblockMutation.spec.ts`
- Create (placeholder for the route import, filled in Task 9): `apps/frontend/src/modules/bounces/views/list/BounceListView.vue`

**Interfaces:**

- Consumes: `BounceApi`, `BounceDto`, `EmailBlockDto` from `api` (Task 7); `waitAtleast` from `@/helper/waitAtleast.ts`; `withVueQuery` from `@/__tests__/support.ts`.
- Produces: `RouteNames.BOUNCE_LIST = 'bounces::list'`, route `/bounces`, query keys `['bounces']` and `['bounces.blocked']`, composables `useBouncesQuery()`, `useBlockedAddressesQuery()`, `useUnblockMutation()` (mutation input: `emailBlockId: number`), i18n keys under `module.bounces.*`. Task 9 relies on all of these.

- [ ] **Step 1: Add the route name and route**

In `apps/frontend/src/router/RouteNames.ts` add to the enum:

```typescript
    BOUNCE_LIST = 'bounces::list',
```

In `apps/frontend/src/router/index.ts` add the import:

```typescript
import BounceListView from '@/modules/bounces/views/list/BounceListView.vue'
```

and inside the `AppLayout` children array, after the template route entry:

```typescript
                {
                    path: '/bounces',
                    name: RouteNames.BOUNCE_LIST,
                    component: BounceListView,
                },
```

- [ ] **Step 2: Create a minimal view placeholder so the router import resolves** (real view in Task 9)

`apps/frontend/src/modules/bounces/views/list/BounceListView.vue`:

```vue
<template>
    <VContainer>
        <h1>{{ t('module.bounces.title') }}</h1>
    </VContainer>
</template>

<script setup lang="ts">
    import { useI18n } from 'vue-i18n'

    const { t } = useI18n()
</script>
```

- [ ] **Step 3: Add the nav tab**

In `apps/frontend/src/modules/dashboard/layouts/AppLayout.vue`, after the inbound-forms `VTab`:

```vue
<VTab :to="{ name: RouteNames.BOUNCE_LIST }" :text="t('module.bounces.nav')" />
```

- [ ] **Step 4: Add the i18n copy**

In `apps/frontend/src/locales/en.json`, inside `"module"` after the `"inboundForms"` object, add:

```json
        "bounces": {
            "nav": "Bounces",
            "title": "Bounces",
            "tabs": {
                "bounces": "Bounces",
                "blocked": "Blocked addresses"
            },
            "list": {
                "empty": "No bounces recorded yet.",
                "fields": {
                    "email": "Recipient",
                    "type": "Type",
                    "statusCode": "Status",
                    "reason": "Reason",
                    "receivedAt": "Received"
                },
                "typeOptions": {
                    "permanent": "Permanent",
                    "transient": "Transient"
                }
            },
            "blocked": {
                "empty": "No addresses are currently blocked.",
                "unblock": "Unblock",
                "fields": {
                    "email": "Recipient",
                    "blockedUntil": "Blocked until",
                    "blockCount": "Times blocked"
                }
            }
        }
```

- [ ] **Step 5: Write the failing composable specs**

`apps/frontend/src/modules/bounces/queries/__tests__/useBouncesQuery.spec.ts`:

```typescript
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BounceApi, type BounceDto } from 'api'
import { useQuery } from '@tanstack/vue-query'
import { useBouncesQuery } from '../useBouncesQuery.ts'
import { useBlockedAddressesQuery } from '../useBlockedAddressesQuery.ts'
import { withVueQuery } from '@/__tests__/support.ts'

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

const bounces: BounceDto[] = [
    {
        bounceId: 1,
        emailAddress: 'missing@example.org',
        type: 'permanent',
        statusCode: '5.1.1',
        reason: 'User unknown',
        receivedAt: new Date('2026-07-13T10:00:00.000Z'),
    },
]

afterEach(() => {
    vi.restoreAllMocks()
})

describe('useBouncesQuery', () => {
    it('loads the bounces and exposes them under the bounces key', async () => {
        const listSpy = vi.spyOn(BounceApi, 'getBounces').mockResolvedValue(bounces)
        const { result, queryClient, unmount } = withVueQuery(() => useQuery(useBouncesQuery()))

        await vi.waitFor(() => expect(result.isSuccess.value).toBe(true))

        expect(listSpy).toHaveBeenCalledOnce()
        expect(result.data.value).toEqual(bounces)
        expect(queryClient.getQueryData(['bounces'])).toEqual(bounces)
        unmount()
    })
})

describe('useBlockedAddressesQuery', () => {
    it('loads the blocked addresses under the bounces.blocked key', async () => {
        const listSpy = vi.spyOn(BounceApi, 'getBlockedAddresses').mockResolvedValue([])
        const { result, queryClient, unmount } = withVueQuery(() => useQuery(useBlockedAddressesQuery()))

        await vi.waitFor(() => expect(result.isSuccess.value).toBe(true))

        expect(listSpy).toHaveBeenCalledOnce()
        expect(queryClient.getQueryData(['bounces.blocked'])).toEqual([])
        unmount()
    })
})
```

`apps/frontend/src/modules/bounces/mutations/__tests__/useUnblockMutation.spec.ts`:

```typescript
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BounceApi, type EmailBlockDto } from 'api'
import { useUnblockMutation } from '../useUnblockMutation.ts'
import { withVueQuery } from '@/__tests__/support.ts'

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

const unblocked: EmailBlockDto = {
    emailBlockId: 5,
    emailAddress: 'missing@example.org',
    blockCount: 2,
    blockedUntil: null,
}

afterEach(() => {
    vi.restoreAllMocks()
})

describe('useUnblockMutation', () => {
    it('unblocks by id and invalidates the blocked list', async () => {
        const unblock = vi.spyOn(BounceApi, 'unblock').mockResolvedValue(unblocked)
        const { result, queryClient, unmount } = withVueQuery(() => useUnblockMutation())
        const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

        await result.mutateAsync(5)

        expect(unblock).toHaveBeenCalledWith({ path: { emailBlockId: 5 } })
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['bounces.blocked'] })
        unmount()
    })
})
```

- [ ] **Step 6: Run the specs to verify they fail**

Run: `pnpm --filter frontend exec vitest run src/modules/bounces`
Expected: FAIL — cannot resolve the composable modules.

- [ ] **Step 7: Implement the composables**

`apps/frontend/src/modules/bounces/queries/useBouncesQuery.ts`:

```typescript
import { queryOptions } from '@tanstack/vue-query'
import { BounceApi } from 'api'
import { waitAtleast } from '@/helper/waitAtleast.ts'

export function useBouncesQuery() {
    return queryOptions({
        queryKey: ['bounces'],
        queryFn: () => waitAtleast(BounceApi.getBounces()),
    })
}
```

`apps/frontend/src/modules/bounces/queries/useBlockedAddressesQuery.ts`:

```typescript
import { queryOptions } from '@tanstack/vue-query'
import { BounceApi } from 'api'
import { waitAtleast } from '@/helper/waitAtleast.ts'

export function useBlockedAddressesQuery() {
    return queryOptions({
        queryKey: ['bounces.blocked'],
        queryFn: () => waitAtleast(BounceApi.getBlockedAddresses()),
    })
}
```

`apps/frontend/src/modules/bounces/mutations/useUnblockMutation.ts`:

```typescript
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { BounceApi } from 'api'
import { waitAtleast } from '@/helper/waitAtleast.ts'

export function useUnblockMutation() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: (emailBlockId: number) => waitAtleast(BounceApi.unblock({ path: { emailBlockId } })),
        onSuccess() {
            void client.invalidateQueries({ queryKey: ['bounces.blocked'] })
        },
    })
}
```

If the generated SDK method names differ (check `packages/api/assets/openapi.json` `operationId`s or the generated `dist` types), align the composables to the generated names — the controller method names in Task 7 drive them.

- [ ] **Step 8: Run the specs to verify they pass**

Run: `pnpm --filter frontend exec vitest run src/modules/bounces`
Expected: PASS, 3 tests.

- [ ] **Step 9: Verify the build**

Run: `pnpm --filter frontend typecheck && pnpm --filter frontend lint`
Expected: exit 0.

---

### Task 9: Frontend views — two-tab Bounces page (TDD)

**Files:**

- Modify: `apps/frontend/src/modules/bounces/views/list/BounceListView.vue` (replace the Task 8 placeholder)
- Create: `apps/frontend/src/modules/bounces/views/list/partials/BounceTable.vue`
- Create: `apps/frontend/src/modules/bounces/views/list/partials/BlockedTable.vue`
- Test: `apps/frontend/src/modules/bounces/views/list/__tests__/BounceListView.spec.ts`

**Interfaces:**

- Consumes: composables and i18n keys from Task 8; `mountView` from `@/__tests__/support.ts`.
- Produces: the final UI; nothing downstream.

- [ ] **Step 1: Write the failing view spec**

`apps/frontend/src/modules/bounces/views/list/__tests__/BounceListView.spec.ts`:

```typescript
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BounceApi, type BounceDto, type EmailBlockDto } from 'api'
import BounceListView from '../BounceListView.vue'
import { mountView } from '@/__tests__/support.ts'

const bounces: BounceDto[] = [
    {
        bounceId: 1,
        emailAddress: 'missing@example.org',
        type: 'permanent',
        statusCode: '5.1.1',
        reason: 'User unknown',
        receivedAt: new Date('2026-07-13T10:00:00.000Z'),
    },
    {
        bounceId: 2,
        emailAddress: 'full@example.org',
        type: 'transient',
        statusCode: '4.2.2',
        reason: 'Mailbox full',
        receivedAt: new Date('2026-07-12T10:00:00.000Z'),
    },
]

const blocked: EmailBlockDto[] = [
    {
        emailBlockId: 5,
        emailAddress: 'missing@example.org',
        blockCount: 2,
        blockedUntil: new Date('2026-08-13T10:00:00.000Z'),
    },
]

afterEach(() => {
    vi.restoreAllMocks()
})

describe('BounceListView', () => {
    it('lists bounce events with type and reason', async () => {
        vi.spyOn(BounceApi, 'getBounces').mockResolvedValue(bounces)
        vi.spyOn(BounceApi, 'getBlockedAddresses').mockResolvedValue(blocked)
        const wrapper = mountView(BounceListView)

        await vi.waitFor(() => {
            expect(wrapper.text()).toContain('missing@example.org')
        })
        expect(wrapper.text()).toContain('User unknown')
        expect(wrapper.text()).toContain('Permanent')
        expect(wrapper.text()).toContain('Transient')
        expect(wrapper.get('h1').text()).toBe('Bounces')
    })

    it('unblocks an address from the blocked tab', async () => {
        vi.spyOn(BounceApi, 'getBounces').mockResolvedValue(bounces)
        vi.spyOn(BounceApi, 'getBlockedAddresses').mockResolvedValue(blocked)
        const unblock = vi.spyOn(BounceApi, 'unblock').mockResolvedValue({ ...blocked[0]!, blockedUntil: null })
        const wrapper = mountView(BounceListView)

        const blockedTab = wrapper.findAll('.v-tab').find((tab) => tab.text().includes('Blocked addresses'))
        expect(blockedTab).toBeDefined()
        await blockedTab!.trigger('click')

        await vi.waitFor(() => {
            expect(wrapper.text()).toContain('Unblock')
        })

        const unblockButton = wrapper.findAll('button').find((button) => button.text() === 'Unblock')
        expect(unblockButton).toBeDefined()
        await unblockButton!.trigger('click')

        await vi.waitFor(() => {
            expect(unblock).toHaveBeenCalledWith({ path: { emailBlockId: 5 } })
        })
    })
})
```

- [ ] **Step 2: Run the spec to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/modules/bounces/views/list/__tests__/BounceListView.spec.ts`
Expected: FAIL — the placeholder view has no tabs/tables yet.

- [ ] **Step 3: Implement the view and partials**

`apps/frontend/src/modules/bounces/views/list/BounceListView.vue`:

```vue
<template>
    <VContainer>
        <h1>{{ t('module.bounces.title') }}</h1>
        <VTabs v-model="tab">
            <VTab value="bounces" :text="t('module.bounces.tabs.bounces')" />
            <VTab value="blocked" :text="t('module.bounces.tabs.blocked')" />
        </VTabs>
        <VDivider />
        <VTabsWindow v-model="tab">
            <VTabsWindowItem value="bounces">
                <BounceTable />
            </VTabsWindowItem>
            <VTabsWindowItem value="blocked">
                <BlockedTable />
            </VTabsWindowItem>
        </VTabsWindow>
    </VContainer>
</template>

<script setup lang="ts">
    import { ref } from 'vue'
    import { useI18n } from 'vue-i18n'
    import BounceTable from '@/modules/bounces/views/list/partials/BounceTable.vue'
    import BlockedTable from '@/modules/bounces/views/list/partials/BlockedTable.vue'

    const { t } = useI18n()
    const tab = ref('bounces')
</script>
```

`apps/frontend/src/modules/bounces/views/list/partials/BounceTable.vue`:

```vue
<template>
    <VFadeTransition leave-absolute>
        <div class="d-flex flex-column gr-3 pt-6" v-if="isPending">
            <VSkeletonLoader v-for="i in 3" :key="i" type="table-heading" />
        </div>
        <p class="pt-6" v-else-if="!bounces?.length">{{ t('module.bounces.list.empty') }}</p>
        <VTable v-else>
            <thead>
                <tr>
                    <th>{{ t('module.bounces.list.fields.email') }}</th>
                    <th>{{ t('module.bounces.list.fields.type') }}</th>
                    <th>{{ t('module.bounces.list.fields.statusCode') }}</th>
                    <th>{{ t('module.bounces.list.fields.reason') }}</th>
                    <th>{{ t('module.bounces.list.fields.receivedAt') }}</th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="bounce in bounces" :key="bounce.bounceId">
                    <td>{{ bounce.emailAddress }}</td>
                    <td>
                        <VChip
                            :color="bounce.type === 'permanent' ? 'error' : 'warning'"
                            :text="t(`module.bounces.list.typeOptions.${bounce.type}`)"
                            size="small"
                        />
                    </td>
                    <td>{{ bounce.statusCode }}</td>
                    <td>{{ bounce.reason }}</td>
                    <td>{{ bounce.receivedAt.toLocaleString() }}</td>
                </tr>
            </tbody>
        </VTable>
    </VFadeTransition>
</template>

<script setup lang="ts">
    import { useQuery } from '@tanstack/vue-query'
    import { useI18n } from 'vue-i18n'
    import { useBouncesQuery } from '@/modules/bounces/queries/useBouncesQuery.ts'

    const { data: bounces, isPending } = useQuery(useBouncesQuery())
    const { t } = useI18n()
</script>
```

`apps/frontend/src/modules/bounces/views/list/partials/BlockedTable.vue`:

```vue
<template>
    <VFadeTransition leave-absolute>
        <div class="d-flex flex-column gr-3 pt-6" v-if="isPending">
            <VSkeletonLoader v-for="i in 3" :key="i" type="table-heading" />
        </div>
        <p class="pt-6" v-else-if="!blocked?.length">{{ t('module.bounces.blocked.empty') }}</p>
        <VTable v-else>
            <thead>
                <tr>
                    <th>{{ t('module.bounces.blocked.fields.email') }}</th>
                    <th>{{ t('module.bounces.blocked.fields.blockedUntil') }}</th>
                    <th>{{ t('module.bounces.blocked.fields.blockCount') }}</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="block in blocked" :key="block.emailBlockId">
                    <td>{{ block.emailAddress }}</td>
                    <td>{{ block.blockedUntil?.toLocaleString() }}</td>
                    <td>{{ block.blockCount }}</td>
                    <td class="text-right">
                        <VBtn
                            size="small"
                            variant="tonal"
                            :loading="isUnblocking"
                            :text="t('module.bounces.blocked.unblock')"
                            @click="unblock(block.emailBlockId)"
                        />
                    </td>
                </tr>
            </tbody>
        </VTable>
    </VFadeTransition>
</template>

<script setup lang="ts">
    import { useQuery } from '@tanstack/vue-query'
    import { useI18n } from 'vue-i18n'
    import { useBlockedAddressesQuery } from '@/modules/bounces/queries/useBlockedAddressesQuery.ts'
    import { useUnblockMutation } from '@/modules/bounces/mutations/useUnblockMutation.ts'

    const { data: blocked, isPending } = useQuery(useBlockedAddressesQuery())
    const { mutate: unblock, isPending: isUnblocking } = useUnblockMutation()
    const { t } = useI18n()
</script>
```

- [ ] **Step 4: Run the spec to verify it passes**

Run: `pnpm --filter frontend exec vitest run src/modules/bounces/views/list/__tests__/BounceListView.spec.ts`
Expected: PASS, 2 tests. If the tab click doesn't reveal the blocked table, Vuetify may need a tick — the `vi.waitFor` blocks already cover async settling; check that `VTabsWindowItem` values match the `VTab` values exactly.

- [ ] **Step 5: Run the full frontend suite and build checks**

Run: `pnpm --filter frontend test && pnpm --filter frontend typecheck && pnpm --filter frontend lint`
Expected: exit 0, all tests pass.

---

### Task 10: Full gate

**Files:** none (verification only; fix regressions where they surface).

- [ ] **Step 1: Format everything the plan touched**

Run: `pnpm format:fix`
Expected: exit 0 (some files may be rewritten — that is Prettier's prerogative).

- [ ] **Step 2: Run the full repo gate**

Run: `pnpm check`
Expected: lint, typecheck, tests, and the format check all pass across backend, frontend, and api. Fix any failure at its source before finishing; re-run until green.

- [ ] **Step 3: Report**

Summarize for the owner: new env keys (`BOUNCE_ADDRESS`, `IMAP_*`) to add to the real `.env`, migration `007-create-bounces` to run (`pnpm --filter backend migrate up`), and that git commits are theirs to make.
