# Public Send API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let customers send email through `POST /api/v1/send` with a project-scoped API key, and record every outbound mail (API and inbound forms) in a central `mail_messages` log.

**Architecture:** A new `api-key` module owns key storage (SHA-256 hash + visible prefix), the `ApiKeyAuthGuard`, key management endpoints and the public send endpoint. The `mail` module gains a `MailMessageService` that `MailService.sendMail` uses to write a log row for every send; failures surface as `MailSendError` carrying the log row id. Inbound-form deliveries link to their log row through a new `mailMessageId` FK.

**Tech Stack:** NestJS 12 (native ESM), sequelize-typescript, umzug migrations, `@nestjs/throttler` (Redis storage), `@nestjs/cache-manager`, nodemailer, class-validator/class-transformer, Vitest (SWC), supertest + Testcontainers e2e.

**Spec:** `docs/superpowers/specs/2026-10-14-public-send-api-design.md`

## Global Constraints

- **Never touch git.** No `git add`/commit/push. Steps that would normally commit are replaced by a verification step; the user handles version control.
- **No comments** in code (CLAUDE.md). Clear names instead.
- **Read before you write**: read each file before modifying it.
- ESM: relative imports end in `.js`. Singular model associations to classes in circular import chains use `Relation<T>` or `X | null`.
- Prettier: 4-space indent, single quotes, no semicolons, trailing commas. Run `pnpm format:fix` instead of hand-formatting.
- Test doubles: `vi.fn<Service['method']>()` held as `Mock<…>`; typed fixtures, no loose literals or `as` casts on domain data.
- Backend + `packages/api` only. **No frontend changes** (UI deferred until the design rework lands).
- Key format: `sdm_<8 base62 chars>_<43 char base64url secret>`; stored: `prefix` (`sdm_<8>`) + hex SHA-256 `secretHash`.
- Rate limit env: `PUBLIC_API_RATE_LIMIT` default `60`, `PUBLIC_API_RATE_TTL` default `60000` (ms).
- Send payload limits: `subject` 1–998 chars, `html` 1–1 000 000 chars, `text` ≤ 1 000 000 chars.
- Error codes: `FROM_DOMAIN_NOT_ALLOWED` (403), `FROM_DOMAIN_NOT_READY` (422), `RECIPIENT_BLOCKED` (422), `DELIVERY_FAILED` (502, includes `mailMessageId`).
- operationIds are method names and must be unique across the API: use `sendMail`, `getApiKeys`, `createApiKey`, `revokeApiKey`, `getProjectMessages`.

### Spec clarifications made while planning

- "Enum" columns (`source`, `status`) are `STRING(32)` with a TS enum, matching the existing convention (`bounce.type`, `inbound_form_delivery.status`).
- The `(projectId, mailMessageId)` index is plain ascending; Postgres scans btree indexes backwards for `ORDER BY … DESC`, and the schema e2e test compares declared vs. actual indexes, so keeping it simple avoids a mismatch.
- "Verified sending domain" = the domain has an active DKIM key (what `DomainService.getSendingDomainByFqdn` returns). DNS verification status is not enforced, matching how inbound forms already send (and keeping e2e possible, since DNS stays pending locally).
- If inserting the `pending` log row itself fails (DB down), `sendMail` rejects with that DB error and nothing is sent.

## Review Focus

1. **Key in the query string with `_`/`-` in the secret** — base64url secrets contain `_`; parsing must not split on `_`. Expected: any generated key authenticates. Pinned in Task 4 (`parseApiKeyPrefix` round-trips 50 generated keys).
2. **Key for a soft-deleted project** — a project in the trash must not keep sending. Expected: 401. Pinned in Task 4 (`authenticate` uses `required: true` project include) and Task 9 e2e.
3. **`from` with mixed-case domain** (`News@Mail.Example.com`) — domains are stored lowercase. Expected: accepted like the lowercase form. Pinned in Task 7 (`PublicSendService` lowercases the FQDN).
4. **Garbage / missing key hammering the endpoint** — invalid keys must still be rate-limited. Expected: 429 after the limit, tracked per prefix or IP. Pinned in Task 5 (tracker unit test) and Task 9 e2e.
5. **Log write failure after a successful SMTP send** — must not turn a delivered mail into an error (a retrying client would double-send). Expected: `sendMail` resolves; the failure is logged. Pinned in Task 2.

---

## File Structure

**Create**
- `apps/backend/src/migrations/014-create-api-keys-and-mail-messages.ts` — schema.
- `apps/backend/src/modules/mail/interfaces/mail-message.interface.ts` — `MailMessage`, enums.
- `apps/backend/src/modules/mail/models/mail-message.model.ts`
- `apps/backend/src/modules/mail/services/mail-message.service.ts` (+ `.spec.ts`) — log writes + paginated reads.
- `apps/backend/src/modules/mail/exceptions/mail-send.error.ts` — `MailSendError`.
- `apps/backend/src/modules/mail/dtos/mail-message.dto.ts`
- `apps/backend/src/modules/mail/controller/mail-message.controller.ts` — `GET /project/:projectId/messages`.
- `apps/backend/src/modules/api-key/api-key.module.ts`
- `apps/backend/src/modules/api-key/api-key.constants.ts` — throttler name, metadata key, cache prefix.
- `apps/backend/src/modules/api-key/interfaces/api-key.interface.ts`
- `apps/backend/src/modules/api-key/models/api-key.model.ts`
- `apps/backend/src/modules/api-key/mappers/api-key.mapper.ts`
- `apps/backend/src/modules/api-key/helpers/api-key-format.ts` (+ `.spec.ts`) — generate/parse/hash/compare.
- `apps/backend/src/modules/api-key/helpers/extract-api-key.ts` (+ `.spec.ts`) — header/query extraction + throttle tracker.
- `apps/backend/src/modules/api-key/services/api-key.service.ts` (+ `.spec.ts`)
- `apps/backend/src/modules/api-key/guards/api-key-auth.guard.ts` (+ `.spec.ts`)
- `apps/backend/src/modules/api-key/decorators/ApiKeyAuth.ts` (+ `.spec.ts`)
- `apps/backend/src/modules/api-key/decorators/ApiKeyPrincipal.ts` (+ `.spec.ts`)
- `apps/backend/src/modules/api-key/dtos/api-key.dto.ts`, `api-key-create.dto.ts`, `public-send.dto.ts`
- `apps/backend/src/modules/api-key/exceptions/public-send.exception.ts`
- `apps/backend/src/modules/api-key/services/public-send.service.ts` (+ `.spec.ts`)
- `apps/backend/src/modules/api-key/controller/api-key.controller.ts`
- `apps/backend/src/modules/api-key/controller/public-send.controller.ts`
- `apps/backend/test/public-send.e2e-spec.ts`

**Modify**
- `apps/backend/src/modules/mail/services/mail.service.ts` (+ spec) — context arg, logging, `text`, `MailSendError`.
- `apps/backend/src/modules/mail/mail.module.ts` — register model, service, controller.
- `apps/backend/src/modules/inbound-form/interfaces/inbound-form-delivery.interface.ts`, `models/inbound-form-delivery.model.ts` — `mailMessageId`.
- `apps/backend/src/modules/inbound-form/services/inbound-form-submission.service.ts` (+ spec) — pass context, store id.
- `apps/backend/src/modules/domain/services/domain.service.ts` (+ spec) — `getDomainByFqdn`.
- `apps/backend/src/modules/project/services/project.service.ts` (+ spec) — `hasDomain`.
- `apps/backend/src/config/env.schema.ts` (+ spec), `.env.example`
- `apps/backend/src/app.module.ts` — `ApiKeyModule`, `publicApi` throttler.
- `apps/backend/src/factories/app.setup.ts` — header security scheme.
- `apps/backend/test/inbound-form-management.e2e-spec.ts` — assert `mailMessageId`.
- `README.md`

---

### Task 1: Schema — migration, models, interfaces

**Files:**
- Create: `apps/backend/src/migrations/014-create-api-keys-and-mail-messages.ts`
- Create: `apps/backend/src/modules/mail/interfaces/mail-message.interface.ts`
- Create: `apps/backend/src/modules/mail/models/mail-message.model.ts`
- Create: `apps/backend/src/modules/api-key/interfaces/api-key.interface.ts`
- Create: `apps/backend/src/modules/api-key/models/api-key.model.ts`
- Create: `apps/backend/src/modules/api-key/api-key.module.ts` (models only for now)
- Modify: `apps/backend/src/modules/inbound-form/interfaces/inbound-form-delivery.interface.ts`
- Modify: `apps/backend/src/modules/inbound-form/models/inbound-form-delivery.model.ts`
- Modify: `apps/backend/src/modules/mail/mail.module.ts`
- Modify: `apps/backend/src/app.module.ts`
- Test: existing `apps/backend/test/schema.e2e-spec.ts` and `test/migrations.e2e-spec.ts` (they compare every registered model to the migrated DB: columns, types, nullability, indexes, FKs, referential actions)

**Interfaces:**
- Produces:
  - `enum MailMessageSource { API = 'api', INBOUND_FORM = 'inbound_form' }`
  - `enum MailMessageStatus { PENDING = 'pending', SENT = 'sent', FAILED = 'failed', BLOCKED = 'blocked' }`
  - `interface MailMessage { mailMessageId; projectId: number | null; source; apiKeyId: number | null; emailFrom; emailTo; subject; status; error: string | null; smtpMessageId: string | null; sentAt: Date | null; createdAt; updatedAt }`
  - `type MailMessageCreate = Omit<MailMessage, 'mailMessageId' | 'createdAt' | 'updatedAt'>`
  - `interface ApiKey { apiKeyId; projectId; name; prefix; createdByUserId: number | null; lastUsedAt: Date | null; revokedAt: Date | null; createdAt; updatedAt }`
  - `interface ApiKeyRecord extends ApiKey { secretHash: string }`
  - `type ApiKeyCreate = Pick<ApiKeyRecord, 'projectId' | 'name' | 'prefix' | 'secretHash' | 'createdByUserId'>`
  - `MailMessageModel`, `ApiKeyModel`; `InboundFormDelivery.mailMessageId: number | null`

- [ ] **Step 1: Write the migration**

```ts
import type { MigrationFn } from 'umzug'
import { DataTypes, type QueryInterface } from 'sequelize'

export const up: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
    await queryInterface.createTable('api_keys', {
        apiKeyId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true,
        },
        projectId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'projects',
                key: 'projectId',
            },
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE',
        },
        name: {
            type: DataTypes.STRING(100),
            allowNull: false,
        },
        prefix: {
            type: DataTypes.STRING(16),
            allowNull: false,
        },
        secretHash: {
            type: DataTypes.CHAR(64),
            allowNull: false,
        },
        createdByUserId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'users',
                key: 'userId',
            },
            onDelete: 'SET NULL',
            onUpdate: 'CASCADE',
        },
        lastUsedAt: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        revokedAt: {
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

    await queryInterface.addIndex('api_keys', ['prefix'], {
        name: 'api_keys_prefix_unique',
        unique: true,
    })

    await queryInterface.addIndex('api_keys', ['projectId'], {
        name: 'api_keys_project_id',
    })

    await queryInterface.createTable('mail_messages', {
        mailMessageId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true,
        },
        projectId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'projects',
                key: 'projectId',
            },
            onDelete: 'SET NULL',
            onUpdate: 'CASCADE',
        },
        source: {
            type: DataTypes.STRING(32),
            allowNull: false,
        },
        apiKeyId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'api_keys',
                key: 'apiKeyId',
            },
            onDelete: 'SET NULL',
            onUpdate: 'CASCADE',
        },
        emailFrom: {
            type: DataTypes.STRING(320),
            allowNull: false,
        },
        emailTo: {
            type: DataTypes.STRING(320),
            allowNull: false,
        },
        subject: {
            type: DataTypes.STRING(998),
            allowNull: false,
        },
        status: {
            type: DataTypes.STRING(32),
            allowNull: false,
        },
        error: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        smtpMessageId: {
            type: DataTypes.STRING(998),
            allowNull: true,
        },
        sentAt: {
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

    await queryInterface.addIndex('mail_messages', ['projectId', 'mailMessageId'], {
        name: 'mail_messages_project_id_mail_message_id',
    })

    await queryInterface.addIndex('mail_messages', ['smtpMessageId'], {
        name: 'mail_messages_smtp_message_id',
    })

    await queryInterface.addColumn('inbound_form_delivery', 'mailMessageId', {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
            model: 'mail_messages',
            key: 'mailMessageId',
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
    })
}

export const down: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
    await queryInterface.removeColumn('inbound_form_delivery', 'mailMessageId')
    await queryInterface.dropTable('mail_messages')
    await queryInterface.dropTable('api_keys')
}
```

- [ ] **Step 2: Write `mail-message.interface.ts`**

```ts
export enum MailMessageSource {
    API = 'api',
    INBOUND_FORM = 'inbound_form',
}

export enum MailMessageStatus {
    PENDING = 'pending',
    SENT = 'sent',
    FAILED = 'failed',
    BLOCKED = 'blocked',
}

export interface MailMessage {
    mailMessageId: number
    projectId: number | null
    source: MailMessageSource
    apiKeyId: number | null
    emailFrom: string
    emailTo: string
    subject: string
    status: MailMessageStatus
    error: string | null
    smtpMessageId: string | null
    sentAt: Date | null
    createdAt: Date
    updatedAt: Date
}

export type MailMessageCreate = Omit<MailMessage, 'mailMessageId' | 'createdAt' | 'updatedAt'>
```

- [ ] **Step 3: Write `api-key.interface.ts`**

```ts
export interface ApiKey {
    apiKeyId: number
    projectId: number
    name: string
    prefix: string
    createdByUserId: number | null
    lastUsedAt: Date | null
    revokedAt: Date | null
    createdAt: Date
    updatedAt: Date
}

export interface ApiKeyRecord extends ApiKey {
    secretHash: string
}

export type ApiKeyCreate = Pick<ApiKeyRecord, 'projectId' | 'name' | 'prefix' | 'secretHash' | 'createdByUserId'>
```

- [ ] **Step 4: Write `api-key.model.ts`**

```ts
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
import { ApiKeyCreate, ApiKeyRecord } from '../interfaces/api-key.interface.js'
import { ProjectModel } from '../../project/models/project.model.js'
import { UserModel } from '../../user/models/user.model.js'

@Table({
    tableName: 'api_keys',
    indexes: [
        {
            name: 'api_keys_project_id',
            fields: ['projectId'],
        },
    ],
})
export class ApiKeyModel extends Model<ApiKeyRecord, ApiKeyCreate> implements ApiKeyRecord {
    @PrimaryKey
    @AutoIncrement
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare apiKeyId: number

    @ForeignKey(() => ProjectModel)
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare projectId: number

    @AllowNull(false)
    @Column(DataType.STRING(100))
    declare name: string

    @AllowNull(false)
    @Column({ type: DataType.STRING(16), unique: 'api_keys_prefix_unique' })
    declare prefix: string

    @AllowNull(false)
    @Column(DataType.CHAR(64))
    declare secretHash: string

    @ForeignKey(() => UserModel)
    @AllowNull
    @Column(DataType.INTEGER)
    declare createdByUserId: number | null

    @AllowNull
    @Column(DataType.DATE)
    declare lastUsedAt: Date | null

    @AllowNull
    @Column(DataType.DATE)
    declare revokedAt: Date | null

    @CreatedAt
    declare createdAt: Date

    @UpdatedAt
    declare updatedAt: Date

    @BelongsTo(() => ProjectModel, {
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
    })
    project: ProjectModel | null = null

    @BelongsTo(() => UserModel, {
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
    })
    createdBy: UserModel | null = null
}
```

- [ ] **Step 5: Write `mail-message.model.ts`**

```ts
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
import {
    MailMessage,
    MailMessageCreate,
    MailMessageSource,
    MailMessageStatus,
} from '../interfaces/mail-message.interface.js'
import { ProjectModel } from '../../project/models/project.model.js'
import { ApiKeyModel } from '../../api-key/models/api-key.model.js'

@Table({
    tableName: 'mail_messages',
    indexes: [
        {
            name: 'mail_messages_project_id_mail_message_id',
            fields: ['projectId', 'mailMessageId'],
        },
        {
            name: 'mail_messages_smtp_message_id',
            fields: ['smtpMessageId'],
        },
    ],
})
export class MailMessageModel extends Model<MailMessage, MailMessageCreate> implements MailMessage {
    @PrimaryKey
    @AutoIncrement
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare mailMessageId: number

    @ForeignKey(() => ProjectModel)
    @AllowNull
    @Column(DataType.INTEGER)
    declare projectId: number | null

    @AllowNull(false)
    @Column(DataType.STRING(32))
    declare source: MailMessageSource

    @ForeignKey(() => ApiKeyModel)
    @AllowNull
    @Column(DataType.INTEGER)
    declare apiKeyId: number | null

    @AllowNull(false)
    @Column(DataType.STRING(320))
    declare emailFrom: string

    @AllowNull(false)
    @Column(DataType.STRING(320))
    declare emailTo: string

    @AllowNull(false)
    @Column(DataType.STRING(998))
    declare subject: string

    @AllowNull(false)
    @Column(DataType.STRING(32))
    declare status: MailMessageStatus

    @AllowNull
    @Column(DataType.TEXT)
    declare error: string | null

    @AllowNull
    @Column(DataType.STRING(998))
    declare smtpMessageId: string | null

    @AllowNull
    @Column(DataType.DATE)
    declare sentAt: Date | null

    @CreatedAt
    declare createdAt: Date

    @UpdatedAt
    declare updatedAt: Date

    @BelongsTo(() => ProjectModel, {
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
    })
    project: ProjectModel | null = null

    @BelongsTo(() => ApiKeyModel, {
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
    })
    apiKey: ApiKeyModel | null = null
}
```

- [ ] **Step 6: Add `mailMessageId` to the delivery interface and model**

In `inbound-form-delivery.interface.ts` add to `InboundFormDelivery` after `sentAt`:

```ts
    mailMessageId: number | null
```

`InboundFormDeliveryCreate` is derived via `Omit`, so `deliveryModel.create(...)` calls must now pass `mailMessageId: null` (Task 3 does this; for now add `mailMessageId: null` to the existing `create` call in `inbound-form-submission.service.ts` so it compiles).

In `inbound-form-delivery.model.ts` import `MailMessageModel` from `'../../mail/models/mail-message.model.js'` and add after `sentAt`:

```ts
    @ForeignKey(() => MailMessageModel)
    @AllowNull
    @Column(DataType.INTEGER)
    declare mailMessageId: number | null
```

and after the `template` association:

```ts
    @BelongsTo(() => MailMessageModel, {
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
    })
    mailMessage: MailMessageModel | null = null
```

- [ ] **Step 7: Register the models**

`api-key.module.ts`:

```ts
import { Module } from '@nestjs/common'
import { SequelizeModule } from '@nestjs/sequelize'
import { ApiKeyModel } from './models/api-key.model.js'

@Module({
    imports: [SequelizeModule.forFeature([ApiKeyModel])],
})
export class ApiKeyModule {}
```

In `mail.module.ts` add `SequelizeModule.forFeature([MailMessageModel])` to `imports` (import `SequelizeModule` from `@nestjs/sequelize`). In `app.module.ts` import `ApiKeyModule` and add it to `imports` after `PermissionModule`.

- [ ] **Step 8: Fix compile fallout in existing specs**

`inbound-form-submission.service.spec.ts` builds `InboundFormDelivery` rows from create values — they now carry `mailMessageId`, no change needed beyond type-checking. Run:

Run: `pnpm --filter backend typecheck`
Expected: PASS (fix any fixture typed as `InboundFormDelivery` that lacks `mailMessageId` by adding `mailMessageId: null`).

- [ ] **Step 9: Run schema + migration e2e**

Run: `pnpm --filter backend exec vitest run --config vitest.config.e2e.ts test/schema.e2e-spec.ts test/migrations.e2e-spec.ts`
Expected: PASS. A failure names the model/column/index/FK that diverges — fix the model or the migration until both agree.

- [ ] **Step 10: Verify, no commit**

Run: `pnpm --filter backend lint` — Expected: no new errors. Do not commit.

---

### Task 2: Message log service and MailService logging

**Files:**
- Create: `apps/backend/src/modules/mail/services/mail-message.service.ts`
- Create: `apps/backend/src/modules/mail/services/mail-message.service.spec.ts`
- Create: `apps/backend/src/modules/mail/exceptions/mail-send.error.ts`
- Modify: `apps/backend/src/modules/mail/services/mail.service.ts`
- Modify: `apps/backend/src/modules/mail/services/mail.service.spec.ts`
- Modify: `apps/backend/src/modules/mail/mail.module.ts`

**Interfaces:**
- Consumes: `MailMessageModel`, `MailMessage*` types (Task 1)
- Produces:
  - `MailMessageService.recordPending(values: MailMessagePending): Promise<MailMessage>` where `type MailMessagePending = Pick<MailMessage, 'projectId' | 'source' | 'apiKeyId' | 'emailFrom' | 'emailTo' | 'subject'>`
  - `MailMessageService.markSent(mailMessageId: number, smtpMessageId: string): Promise<void>`
  - `MailMessageService.markUnsent(mailMessageId: number, status: MailMessageStatus.FAILED | MailMessageStatus.BLOCKED, error: string): Promise<void>`
  - `MailMessageService.getProjectMessages(projectId: number, query: MailMessageQuery): Promise<MailMessage[]>` where `interface MailMessageQuery { limit: number; before?: number; source?: MailMessageSource; status?: MailMessageStatus }`
  - `class MailSendError extends Error { readonly mailMessageId: number; readonly cause: unknown }`
  - `SendMail` gains `text?: string`
  - `interface SendMailContext { projectId: number | null; source: MailMessageSource; apiKeyId?: number }`
  - `interface SentMail { mailMessageId: number; smtpMessageId: string }`
  - `MailService.sendMail(mail: SendMail, context: SendMailContext): Promise<SentMail>`

- [ ] **Step 1: Write the failing `MailMessageService` spec**

```ts
import { getModelToken } from '@nestjs/sequelize'
import { Test } from '@nestjs/testing'
import { Op } from 'sequelize'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { MailMessageService } from './mail-message.service.js'
import { MailMessageModel } from '../models/mail-message.model.js'
import { MailMessage, MailMessageSource, MailMessageStatus } from '../interfaces/mail-message.interface.js'

type MailMessageRow = MailMessage & { get(options: { plain: true }): MailMessage }

describe('MailMessageService', () => {
    let service: MailMessageService
    let create: Mock<(values: Partial<MailMessage>) => Promise<MailMessageRow>>
    let update: Mock<(values: Partial<MailMessage>, options: { where: { mailMessageId: number } }) => Promise<[number]>>
    let findAll: Mock<(options: object) => Promise<MailMessageRow[]>>

    const message: MailMessage = {
        mailMessageId: 5,
        projectId: 3,
        source: MailMessageSource.API,
        apiKeyId: 9,
        emailFrom: 'news@mail.example.com',
        emailTo: 'reader@example.org',
        subject: 'Hello',
        status: MailMessageStatus.PENDING,
        error: null,
        smtpMessageId: null,
        sentAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
    }
    const row: MailMessageRow = { ...message, get: () => message }

    beforeEach(async () => {
        create = vi.fn<typeof create>().mockResolvedValue(row)
        update = vi.fn<typeof update>().mockResolvedValue([1])
        findAll = vi.fn<typeof findAll>().mockResolvedValue([row])

        const module = await Test.createTestingModule({
            providers: [
                MailMessageService,
                { provide: getModelToken(MailMessageModel), useValue: { create, update, findAll } },
            ],
        }).compile()
        service = module.get(MailMessageService)
    })

    it('records a pending message without delivery details', async () => {
        const result = await service.recordPending({
            projectId: 3,
            source: MailMessageSource.API,
            apiKeyId: 9,
            emailFrom: 'news@mail.example.com',
            emailTo: 'reader@example.org',
            subject: 'Hello',
        })

        expect(create).toHaveBeenCalledWith({
            projectId: 3,
            source: MailMessageSource.API,
            apiKeyId: 9,
            emailFrom: 'news@mail.example.com',
            emailTo: 'reader@example.org',
            subject: 'Hello',
            status: MailMessageStatus.PENDING,
            error: null,
            smtpMessageId: null,
            sentAt: null,
        })
        expect(result).toEqual(message)
    })

    it('marks a message sent with its SMTP message id', async () => {
        await service.markSent(5, '<abc@mail.example.com>')

        expect(update).toHaveBeenCalledWith(
            { status: MailMessageStatus.SENT, smtpMessageId: '<abc@mail.example.com>', sentAt: expect.any(Date) as Date },
            { where: { mailMessageId: 5 } },
        )
    })

    it('marks a message blocked or failed with the error text', async () => {
        await service.markUnsent(5, MailMessageStatus.BLOCKED, 'Recipient blocked')

        expect(update).toHaveBeenCalledWith(
            { status: MailMessageStatus.BLOCKED, error: 'Recipient blocked' },
            { where: { mailMessageId: 5 } },
        )
    })

    it('lists project messages newest first with cursor and filters', async () => {
        const result = await service.getProjectMessages(3, {
            limit: 20,
            before: 100,
            source: MailMessageSource.INBOUND_FORM,
            status: MailMessageStatus.FAILED,
        })

        expect(findAll).toHaveBeenCalledWith({
            where: {
                projectId: 3,
                mailMessageId: { [Op.lt]: 100 },
                source: MailMessageSource.INBOUND_FORM,
                status: MailMessageStatus.FAILED,
            },
            order: [['mailMessageId', 'DESC']],
            limit: 20,
        })
        expect(result).toEqual([message])
    })

    it('omits cursor and filters that are not given', async () => {
        await service.getProjectMessages(3, { limit: 50 })

        expect(findAll).toHaveBeenCalledWith({
            where: { projectId: 3 },
            order: [['mailMessageId', 'DESC']],
            limit: 50,
        })
    })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter backend exec vitest run src/modules/mail/services/mail-message.service.spec.ts`
Expected: FAIL — cannot resolve `./mail-message.service.js`.

- [ ] **Step 3: Implement `MailMessageService`**

```ts
import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/sequelize'
import { Op, type WhereOptions } from 'sequelize'
import { MailMessageModel } from '../models/mail-message.model.js'
import { MailMessage, MailMessageSource, MailMessageStatus } from '../interfaces/mail-message.interface.js'

export type MailMessagePending = Pick<
    MailMessage,
    'projectId' | 'source' | 'apiKeyId' | 'emailFrom' | 'emailTo' | 'subject'
>

export interface MailMessageQuery {
    limit: number
    before?: number
    source?: MailMessageSource
    status?: MailMessageStatus
}

@Injectable()
export class MailMessageService {
    constructor(@InjectModel(MailMessageModel) private readonly mailMessageModel: typeof MailMessageModel) {}

    async recordPending(values: MailMessagePending): Promise<MailMessage> {
        const row = await this.mailMessageModel.create({
            ...values,
            status: MailMessageStatus.PENDING,
            error: null,
            smtpMessageId: null,
            sentAt: null,
        })

        return row.get({ plain: true })
    }

    async markSent(mailMessageId: number, smtpMessageId: string): Promise<void> {
        await this.mailMessageModel.update(
            { status: MailMessageStatus.SENT, smtpMessageId, sentAt: new Date() },
            { where: { mailMessageId } },
        )
    }

    async markUnsent(
        mailMessageId: number,
        status: MailMessageStatus.FAILED | MailMessageStatus.BLOCKED,
        error: string,
    ): Promise<void> {
        await this.mailMessageModel.update({ status, error }, { where: { mailMessageId } })
    }

    async getProjectMessages(projectId: number, query: MailMessageQuery): Promise<MailMessage[]> {
        const where: WhereOptions<MailMessage> = {
            projectId,
            ...(query.before !== undefined && { mailMessageId: { [Op.lt]: query.before } }),
            ...(query.source && { source: query.source }),
            ...(query.status && { status: query.status }),
        }

        const rows = await this.mailMessageModel.findAll({
            where,
            order: [['mailMessageId', 'DESC']],
            limit: query.limit,
        })

        return rows.map((row) => row.get({ plain: true }))
    }
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `pnpm --filter backend exec vitest run src/modules/mail/services/mail-message.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Write `MailSendError`**

```ts
export class MailSendError extends Error {
    constructor(
        readonly mailMessageId: number,
        override readonly cause: unknown,
    ) {
        super(cause instanceof Error ? cause.message : String(cause), { cause })
        this.name = 'MailSendError'
    }
}
```

- [ ] **Step 6: Update `mail.service.spec.ts` to the new contract (failing)**

Changes to the existing spec:
1. Imports: add
   ```ts
   import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js'
   import { MailMessageService } from './mail-message.service.js'
   import { MailSendError } from '../exceptions/mail-send.error.js'
   import { MailMessage, MailMessageSource, MailMessageStatus } from '../interfaces/mail-message.interface.js'
   import { SendMailContext } from './mail.service.js'
   ```
   (merge `SendMailContext` into the existing `./mail.service.js` import).
2. Type the transporter mock as `Mock<Transporter<SMTPTransport.SentMessageInfo>['sendMail']>` and resolve a typed info:
   ```ts
   const sentInfo: SMTPTransport.SentMessageInfo = {
       envelope: { from: 'bounce@mail.example.com', to: ['owner@business.com'] },
       messageId: '<m1@mail.example.com>',
       accepted: ['owner@business.com'],
       rejected: [],
       pending: [],
       response: '250 OK',
   }
   ```
   `sendMail = vi.fn<typeof sendMail>().mockResolvedValue(sentInfo)`.
3. Add mocks and a context fixture:
   ```ts
   let recordPending: Mock<MailMessageService['recordPending']>
   let markSent: Mock<MailMessageService['markSent']>
   let markUnsent: Mock<MailMessageService['markUnsent']>

   const context: SendMailContext = { projectId: 3, source: MailMessageSource.INBOUND_FORM }
   const pendingMessage: MailMessage = {
       mailMessageId: 41,
       projectId: 3,
       source: MailMessageSource.INBOUND_FORM,
       apiKeyId: null,
       emailFrom: 'noreply@mail.example.com',
       emailTo: 'owner@business.com',
       subject: 'New submission',
       status: MailMessageStatus.PENDING,
       error: null,
       smtpMessageId: null,
       sentAt: null,
       createdAt: new Date(),
       updatedAt: new Date(),
   }
   ```
   In `beforeEach`: `recordPending = vi.fn<typeof recordPending>().mockResolvedValue(pendingMessage)`, `markSent = vi.fn<typeof markSent>().mockResolvedValue(undefined)`, `markUnsent = vi.fn<typeof markUnsent>().mockResolvedValue(undefined)`; add provider `{ provide: MailMessageService, useValue: { recordPending, markSent, markUnsent } }`.
4. Every existing `service.sendMail(x)` call becomes `service.sendMail(x, context)`. Existing `rejects.toThrow('…message…')` assertions keep working because `MailSendError` copies the cause's message. The blocked-recipient test changes to `rejects.toThrow(MailSendError)` and additionally asserts `.cause` is an `EmailBlockedException` (see new test below).
5. Add these tests:

```ts
    it('logs a pending message before sending and marks it sent with the smtp message id', async () => {
        const result = await service.sendMail(mail, { projectId: 3, source: MailMessageSource.API, apiKeyId: 9 })

        expect(recordPending).toHaveBeenCalledWith({
            projectId: 3,
            source: MailMessageSource.API,
            apiKeyId: 9,
            emailFrom: 'noreply@mail.example.com',
            emailTo: 'owner@business.com',
            subject: 'New submission',
        })
        expect(recordPending.mock.invocationCallOrder[0]).toBeLessThan(sendMail.mock.invocationCallOrder[0]!)
        expect(markSent).toHaveBeenCalledWith(41, '<m1@mail.example.com>')
        expect(result).toEqual({ mailMessageId: 41, smtpMessageId: '<m1@mail.example.com>' })
    })

    it('logs inbound form sends without an api key', async () => {
        await service.sendMail(mail, context)

        expect(recordPending).toHaveBeenCalledWith(expect.objectContaining({ apiKeyId: null }))
    })

    it('passes the plain-text part through to the transporter', async () => {
        await service.sendMail({ ...mail, text: 'Hello' }, context)

        expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ text: 'Hello' }))
    })

    it('marks a blocked recipient as blocked and wraps the block in a MailSendError', async () => {
        const blocked = new EmailBlockedException('owner@business.com', new Date())
        assertNotBlocked.mockRejectedValue(blocked)

        const error = await service.sendMail(mail, context).catch((caught: unknown) => caught)

        expect(error).toBeInstanceOf(MailSendError)
        expect((error as MailSendError).mailMessageId).toBe(41)
        expect((error as MailSendError).cause).toBe(blocked)
        expect(markUnsent).toHaveBeenCalledWith(41, MailMessageStatus.BLOCKED, blocked.message)
        expect(sendMail).not.toHaveBeenCalled()
    })

    it('marks a transporter failure as failed', async () => {
        sendMail.mockRejectedValue(new Error('connect ECONNREFUSED'))

        await expect(service.sendMail(mail, context)).rejects.toThrow(MailSendError)
        expect(markUnsent).toHaveBeenCalledWith(41, MailMessageStatus.FAILED, 'connect ECONNREFUSED')
    })

    it('marks a missing sending domain as failed', async () => {
        getSendingDomainByFqdn.mockResolvedValue(null)

        await expect(service.sendMail(mail, context)).rejects.toThrow('No sending domain configured')
        expect(markUnsent).toHaveBeenCalledWith(
            41,
            MailMessageStatus.FAILED,
            'No sending domain configured for mail.example.com',
        )
    })

    it('still reports success when marking the message sent fails', async () => {
        markSent.mockRejectedValue(new Error('db down'))

        await expect(service.sendMail(mail, context)).resolves.toEqual({
            mailMessageId: 41,
            smtpMessageId: '<m1@mail.example.com>',
        })
    })

    it('still rejects with the send error when marking the message failed also fails', async () => {
        sendMail.mockRejectedValue(new Error('connect ECONNREFUSED'))
        markUnsent.mockRejectedValue(new Error('db down'))

        await expect(service.sendMail(mail, context)).rejects.toThrow('connect ECONNREFUSED')
    })

    it('sends nothing when the pending message cannot be recorded', async () => {
        recordPending.mockRejectedValue(new Error('db down'))

        await expect(service.sendMail(mail, context)).rejects.toThrow('db down')
        expect(sendMail).not.toHaveBeenCalled()
    })
```

Run: `pnpm --filter backend exec vitest run src/modules/mail/services/mail.service.spec.ts`
Expected: FAIL (no `MailMessageService` provider / new behavior missing).

- [ ] **Step 7: Implement the new `MailService`**

Replace `mail.service.ts` with:

```ts
import { Inject, Injectable, Logger } from '@nestjs/common'
import type { Transporter } from 'nodemailer'
import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js'
import { MAIL_TRANSPORTER } from '../mail.constants.js'
import { DomainService } from '../../domain/services/domain.service.js'
import { SecretEncryptionService } from '../../encryption/services/secret-encryption.service.js'
import { EmailBlockService } from '../../bounce/services/email-block.service.js'
import { BounceService } from '../../bounce/services/bounce.service.js'
import { BounceType } from '../../bounce/interfaces/bounce.interface.js'
import { EmailBlockedException } from '../../bounce/exceptions/email-blocked.exception.js'
import { MailMessageService } from './mail-message.service.js'
import { MailMessageSource, MailMessageStatus } from '../interfaces/mail-message.interface.js'
import { MailSendError } from '../exceptions/mail-send.error.js'

export interface SendMail {
    from: string
    to: string
    replyTo?: string
    subject: string
    html: string
    text?: string
}

export interface SendMailContext {
    projectId: number | null
    source: MailMessageSource
    apiKeyId?: number
}

export interface SentMail {
    mailMessageId: number
    smtpMessageId: string
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}

@Injectable()
export class MailService {
    private readonly logger = new Logger(MailService.name)

    constructor(
        @Inject(MAIL_TRANSPORTER) private readonly transporter: Transporter<SMTPTransport.SentMessageInfo>,
        private readonly domainService: DomainService,
        private readonly secretEncryptionService: SecretEncryptionService,
        private readonly emailBlockService: EmailBlockService,
        private readonly bounceService: BounceService,
        private readonly mailMessageService: MailMessageService,
    ) {}

    async sendMail(mail: SendMail, context: SendMailContext): Promise<SentMail> {
        const { mailMessageId } = await this.mailMessageService.recordPending({
            projectId: context.projectId,
            source: context.source,
            apiKeyId: context.apiKeyId ?? null,
            emailFrom: mail.from,
            emailTo: mail.to,
            subject: mail.subject,
        })

        let smtpMessageId: string
        try {
            smtpMessageId = await this.deliver(mail)
        } catch (error) {
            const status =
                error instanceof EmailBlockedException ? MailMessageStatus.BLOCKED : MailMessageStatus.FAILED
            await this.updateLog(mailMessageId, () =>
                this.mailMessageService.markUnsent(mailMessageId, status, errorMessage(error)),
            )
            throw new MailSendError(mailMessageId, error)
        }

        await this.updateLog(mailMessageId, () => this.mailMessageService.markSent(mailMessageId, smtpMessageId))

        return { mailMessageId, smtpMessageId }
    }

    private async deliver(mail: SendMail): Promise<string> {
        await this.emailBlockService.assertNotBlocked(mail.to)

        const [localPart, fqdn] = mail.from.split('@')
        if (!localPart || !fqdn) {
            throw new Error(`Invalid from address: ${mail.from}`)
        }

        const domain = await this.domainService.getSendingDomainByFqdn(fqdn)
        if (!domain) {
            throw new Error(`No sending domain configured for ${fqdn}`)
        }

        const privateKey = await this.secretEncryptionService.decrypt(domain.activeDkim.privateKey)
        const sendingDomain = await this.domainService.getConfiguredSendingDomain()

        let info: SMTPTransport.SentMessageInfo
        try {
            info = await this.transporter.sendMail({
                from: mail.from,
                to: mail.to,
                replyTo: mail.replyTo,
                subject: mail.subject,
                html: mail.html,
                text: mail.text,
                envelope: sendingDomain ? { from: `bounce@${sendingDomain.fqdn}`, to: mail.to } : undefined,
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
        return info.messageId
    }

    private async updateLog(mailMessageId: number, update: () => Promise<void>): Promise<void> {
        try {
            await update()
        } catch (error) {
            this.logger.error(`Failed to update mail message ${mailMessageId}: ${errorMessage(error)}`)
        }
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

If `nodemailer/lib/smtp-transport/index.js` does not resolve as a type import under `nodenext`, use `import type SMTPTransport from 'nodemailer/lib/smtp-transport'` — check with `pnpm --filter backend typecheck`.

In `mail.module.ts` add `MailMessageService` to `providers` and `exports`.

- [ ] **Step 8: Run mail tests**

Run: `pnpm --filter backend exec vitest run src/modules/mail`
Expected: PASS (all old tests updated to pass `context`, plus the new ones).

- [ ] **Step 9: Verify, no commit**

Run: `pnpm --filter backend typecheck` — Expected: errors only in `inbound-form-submission.service.ts` (missing `context` arg); Task 3 fixes those. Do not commit.

---

### Task 3: Inbound-form deliveries link to the message log

**Files:**
- Modify: `apps/backend/src/modules/inbound-form/services/inbound-form-submission.service.ts`
- Modify: `apps/backend/src/modules/inbound-form/services/inbound-form-submission.service.spec.ts`
- Modify: `apps/backend/test/inbound-form-management.e2e-spec.ts`

**Interfaces:**
- Consumes: `MailService.sendMail(mail, context): Promise<SentMail>`, `MailSendError`, `MailMessageSource.INBOUND_FORM` (Task 2)
- Produces: delivery rows carry `mailMessageId` (non-null whenever `sendMail` was reached)

- [ ] **Step 1: Update the spec (failing)**

In `inbound-form-submission.service.spec.ts`:
1. Imports: `import { MailSendError } from '../../mail/exceptions/mail-send.error.js'` and `import { MailMessageSource } from '../../mail/interfaces/mail-message.interface.js'`.
2. Default mock: `sendMail = vi.fn<typeof sendMail>().mockResolvedValue({ mailMessageId: 501, smtpMessageId: '<m@x>' })`.
3. In 'accepts a submission…' change the exact `sendMail` assertion to include the context:
   ```ts
        expect(sendMail).toHaveBeenCalledWith(
            {
                from: 'noreply@mail.example.com',
                to: 'owner@business.com',
                replyTo: 'max@example.com',
                subject: 'Message from Max',
                html: '<p>Max wrote in</p>',
            },
            { projectId: formFull.projectId, source: MailMessageSource.INBOUND_FORM },
        )
   ```
   and the delivery `create` assertion gains `mailMessageId: null`; the SENT update assertion gains `mailMessageId: 501`.
4. Add:
   ```ts
    it('links a failed delivery to the logged message of the failed attempt', async () => {
        mockForm({ ...formFull, inboundFormReceivers: [ownerReceiver] })
        sendMail.mockRejectedValue(new MailSendError(502, new Error('SMTP down')))

        await service.submitForm('contact', submission, {}, {})

        await vi.waitFor(() =>
            expect(deliveryRows[0]!.update).toHaveBeenCalledWith({
                status: InboundFormDeliveryStatus.FAILED,
                error: 'SMTP down',
                mailMessageId: 502,
            }),
        )
    })

    it('leaves the delivery unlinked when it fails before reaching the mail service', async () => {
        mockForm({ ...formFull, inboundFormReceivers: [ownerReceiver] })
        sendMail.mockRejectedValue(new Error('SMTP down'))

        await service.submitForm('contact', submission, {}, {})

        await vi.waitFor(() =>
            expect(deliveryRows[0]!.update).toHaveBeenCalledWith({
                status: InboundFormDeliveryStatus.FAILED,
                error: 'SMTP down',
                mailMessageId: null,
            }),
        )
    })
   ```

Run: `pnpm --filter backend exec vitest run src/modules/inbound-form/services/inbound-form-submission.service.spec.ts`
Expected: FAIL.

- [ ] **Step 2: Implement**

In `inbound-form-submission.service.ts`:
- Import `MailSendError` and `MailMessageSource`.
- `PendingDelivery` gains `projectId: number`; in the transaction push `{ delivery, receiver, template, projectId: form.projectId }`.
- The `deliveryModel.create` values gain `mailMessageId: null`.
- Replace the body of `processDelivery`:

```ts
    private async processDelivery(
        { delivery, receiver, template, projectId }: PendingDelivery,
        data: Record<string, unknown>,
    ): Promise<void> {
        try {
            const emailTo = this.resolveAddress(receiver.emailReceiver, data)
            const replyTo =
                receiver.emailReplyTo !== null ? this.resolveAddress(receiver.emailReplyTo, data) : undefined

            const { mailMessageId } = await this.mailService.sendMail(
                {
                    from: receiver.emailFrom,
                    to: emailTo,
                    replyTo,
                    subject: this.templateRendererService.renderSubject(template.subject, data),
                    html: this.templateRendererService.render(template.template, data),
                },
                { projectId, source: MailMessageSource.INBOUND_FORM },
            )

            await delivery.update({
                status: InboundFormDeliveryStatus.SENT,
                emailTo,
                sentAt: new Date(),
                mailMessageId,
            })
        } catch (error) {
            const message = errorMessage(error)
            this.logger.error(`Delivery ${delivery.inboundFormDeliveryId} failed: ${message}`)
            await delivery.update({
                status: InboundFormDeliveryStatus.FAILED,
                error: message,
                mailMessageId: error instanceof MailSendError ? error.mailMessageId : null,
            })
        }
    }
```

- [ ] **Step 3: Run the spec**

Run: `pnpm --filter backend exec vitest run src/modules/inbound-form`
Expected: PASS. Any other existing assertion that used exact `toHaveBeenCalledWith` on delivery `update` for FAILED needs `mailMessageId: null` (or switch to `expect.objectContaining` if it already used it — it does in most tests).

- [ ] **Step 4: Extend the inbound-form e2e**

In `test/inbound-form-management.e2e-spec.ts`, find the test that waits for a delivery to reach `sent` (search for `InboundFormDeliveryStatus.SENT` or `status: 'sent'` on `deliveryModel()`). After that assertion add:

```ts
        const deliveries = await deliveryModel().findAll({
            where: { inboundFormSubmissionId: submission!.inboundFormSubmissionId },
        })
        expect(deliveries.every((delivery) => delivery.mailMessageId !== null)).toBe(true)
```

Adapt the variable name `submission` to the one used in that test (it is the result of `latestSubmission(formId)`).

Run: `pnpm --filter backend exec vitest run --config vitest.config.e2e.ts test/inbound-form-management.e2e-spec.ts`
Expected: PASS.

- [ ] **Step 5: Verify, no commit**

Run: `pnpm --filter backend typecheck && pnpm --filter backend lint`
Expected: PASS. Do not commit.

---

### Task 4: API key format helpers and `ApiKeyService`

**Files:**
- Create: `apps/backend/src/modules/api-key/api-key.constants.ts`
- Create: `apps/backend/src/modules/api-key/helpers/api-key-format.ts` (+ `.spec.ts`)
- Create: `apps/backend/src/modules/api-key/mappers/api-key.mapper.ts`
- Create: `apps/backend/src/modules/api-key/services/api-key.service.ts` (+ `.spec.ts`)
- Modify: `apps/backend/src/modules/api-key/api-key.module.ts`

**Interfaces:**
- Consumes: `ApiKeyModel`, `ApiKey`, `ApiKeyRecord` (Task 1); `assertProjectReadable`, `assertProjectUpdatable` from `permission/helpers/project-access.js`; `AppAbility`; `User` (`modules/user/interfaces/user.interface.js`); `ProjectModel`
- Produces:
  - `generateApiKey(): { key: string; prefix: string; secretHash: string }`
  - `parseApiKeyPrefix(key: string): string | null`
  - `hashApiKey(key: string): string`
  - `matchesApiKeyHash(key: string, secretHash: string): boolean`
  - `toApiKey(record: ApiKeyRecord): ApiKey`
  - `ApiKeyService.createKey(projectId: number, name: string, principal: User, ability: AppAbility): Promise<{ apiKey: ApiKey; key: string }>`
  - `ApiKeyService.listKeys(projectId: number, ability: AppAbility): Promise<ApiKey[]>`
  - `ApiKeyService.revokeKey(projectId: number, apiKeyId: number, ability: AppAbility): Promise<void>`
  - `ApiKeyService.authenticate(rawKey: string): Promise<ApiKey | null>`
  - `ApiKeyService.touchLastUsed(apiKeyId: number): Promise<void>`
  - constants: `API_KEY_LAST_USED_CACHE_PREFIX = 'api-key:last-used:'`, `API_KEY_LAST_USED_INTERVAL_MS = 60_000`

- [ ] **Step 1: Write the failing format spec**

```ts
import { describe, expect, it } from 'vitest'
import { generateApiKey, hashApiKey, matchesApiKeyHash, parseApiKeyPrefix } from './api-key-format.js'

describe('api key format', () => {
    it('generates keys of the documented shape whose prefix matches the key', () => {
        const { key, prefix, secretHash } = generateApiKey()

        expect(key).toMatch(/^sdm_[0-9A-Za-z]{8}_[A-Za-z0-9_-]{43}$/)
        expect(key.startsWith(`${prefix}_`)).toBe(true)
        expect(secretHash).toBe(hashApiKey(key))
        expect(secretHash).toMatch(/^[0-9a-f]{64}$/)
    })

    it('parses the prefix of every generated key, even when the secret contains underscores', () => {
        for (let attempt = 0; attempt < 50; attempt++) {
            const { key, prefix } = generateApiKey()
            expect(parseApiKeyPrefix(key)).toBe(prefix)
        }
        expect(parseApiKeyPrefix(`sdm_abcdEFGH_${'_'.repeat(43)}`)).toBe('sdm_abcdEFGH')
    })

    it.each([
        '',
        'sdm_short_secret',
        'Bearer sdm_abcdEFGH_xxx',
        `abc_abcdEFGH_${'a'.repeat(43)}`,
        `sdm_abcdEFGH_${'a'.repeat(42)}`,
        `sdm_abcdEFGH_${'a'.repeat(44)}`,
        'eyJhbGciOiJIUzI1NiJ9.e30.sig',
    ])('rejects malformed key %j', (key) => {
        expect(parseApiKeyPrefix(key)).toBeNull()
    })

    it('matches only the key the hash was made from', () => {
        const { key, secretHash } = generateApiKey()
        const other = generateApiKey()

        expect(matchesApiKeyHash(key, secretHash)).toBe(true)
        expect(matchesApiKeyHash(other.key, secretHash)).toBe(false)
        expect(matchesApiKeyHash(key, 'not-hex')).toBe(false)
    })
})
```

Run: `pnpm --filter backend exec vitest run src/modules/api-key/helpers/api-key-format.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 2: Implement the format helpers**

```ts
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'

const KEY_PATTERN = /^(sdm_[0-9A-Za-z]{8})_[A-Za-z0-9_-]{43}$/
const PREFIX_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const PREFIX_LENGTH = 8
const SECRET_BYTES = 32

export interface GeneratedApiKey {
    key: string
    prefix: string
    secretHash: string
}

export function generateApiKey(): GeneratedApiKey {
    const randomPart = Array.from({ length: PREFIX_LENGTH }, () => PREFIX_ALPHABET[randomInt(PREFIX_ALPHABET.length)])
    const prefix = `sdm_${randomPart.join('')}`
    const key = `${prefix}_${randomBytes(SECRET_BYTES).toString('base64url')}`

    return { key, prefix, secretHash: hashApiKey(key) }
}

export function parseApiKeyPrefix(key: string): string | null {
    return KEY_PATTERN.exec(key)?.[1] ?? null
}

export function hashApiKey(key: string): string {
    return createHash('sha256').update(key).digest('hex')
}

export function matchesApiKeyHash(key: string, secretHash: string): boolean {
    const actual = Buffer.from(hashApiKey(key), 'hex')
    const expected = Buffer.from(secretHash, 'hex')

    return actual.length === expected.length && timingSafeEqual(actual, expected)
}
```

Run the spec again. Expected: PASS.

- [ ] **Step 3: Write constants and mapper**

`api-key.constants.ts`:

```ts
export const API_KEY_LAST_USED_CACHE_PREFIX = 'api-key:last-used:'

export const API_KEY_LAST_USED_INTERVAL_MS = 60_000

export const API_KEY_AUTH_KEY = Symbol('API_KEY_AUTH_KEY')

export const PUBLIC_API_THROTTLER = 'publicApi'
```

`mappers/api-key.mapper.ts`:

```ts
import type { ApiKey, ApiKeyRecord } from '../interfaces/api-key.interface.js'

export function toApiKey({
    apiKeyId,
    projectId,
    name,
    prefix,
    createdByUserId,
    lastUsedAt,
    revokedAt,
    createdAt,
    updatedAt,
}: ApiKeyRecord): ApiKey {
    return { apiKeyId, projectId, name, prefix, createdByUserId, lastUsedAt, revokedAt, createdAt, updatedAt }
}
```

- [ ] **Step 4: Write the failing `ApiKeyService` spec**

```ts
import { ForbiddenException, Logger, NotFoundException } from '@nestjs/common'
import { CACHE_MANAGER, type Cache } from '@nestjs/cache-manager'
import { getModelToken } from '@nestjs/sequelize'
import { Test } from '@nestjs/testing'
import { createMongoAbility } from '@casl/ability'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { ApiKeyService } from './api-key.service.js'
import { ApiKeyModel } from '../models/api-key.model.js'
import { ProjectModel } from '../../project/models/project.model.js'
import { ApiKeyCreate, ApiKeyRecord } from '../interfaces/api-key.interface.js'
import { generateApiKey } from '../helpers/api-key-format.js'
import { AppAbility } from '../../permission/interfaces/app-ability.js'
import { User } from '../../user/interfaces/user.interface.js'
import { API_KEY_LAST_USED_CACHE_PREFIX, API_KEY_LAST_USED_INTERVAL_MS } from '../api-key.constants.js'

type ApiKeyRow = ApiKeyRecord & {
    get(options: { plain: true }): ApiKeyRecord
    update: Mock<(values: Partial<ApiKeyRecord>) => Promise<unknown>>
}

const updater = createMongoAbility<AppAbility>([
    { action: 'read', subject: 'Project', conditions: { projectId: { $in: [3] } } },
    { action: 'update', subject: 'Project', conditions: { projectId: { $in: [3] } } },
])
const reader = createMongoAbility<AppAbility>([
    { action: 'read', subject: 'Project', conditions: { projectId: { $in: [3] } } },
])
const outsider = createMongoAbility<AppAbility>([])

const principal: User = {
    userId: 7,
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    roleId: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
}

function rowFor(record: ApiKeyRecord): ApiKeyRow {
    return {
        ...record,
        get: () => record,
        update: vi.fn<ApiKeyRow['update']>().mockResolvedValue(null),
    }
}

describe('ApiKeyService', () => {
    let service: ApiKeyService
    let create: Mock<(values: ApiKeyCreate) => Promise<ApiKeyRow>>
    let findAll: Mock<(options: object) => Promise<ApiKeyRow[]>>
    let findOne: Mock<(options: object) => Promise<ApiKeyRow | null>>
    let update: Mock<(values: Partial<ApiKeyRecord>, options: object) => Promise<[number]>>
    let cacheGet: Mock<Cache['get']>
    let cacheSet: Mock<Cache['set']>

    const generated = generateApiKey()
    const record: ApiKeyRecord = {
        apiKeyId: 11,
        projectId: 3,
        name: 'Newsletter',
        prefix: generated.prefix,
        secretHash: generated.secretHash,
        createdByUserId: 7,
        lastUsedAt: null,
        revokedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
    }

    beforeEach(async () => {
        vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
        create = vi.fn<typeof create>().mockImplementation((values) =>
            Promise.resolve(rowFor({ ...record, ...values, apiKeyId: 12 })),
        )
        findAll = vi.fn<typeof findAll>().mockResolvedValue([rowFor(record)])
        findOne = vi.fn<typeof findOne>().mockResolvedValue(rowFor(record))
        update = vi.fn<typeof update>().mockResolvedValue([1])
        cacheGet = vi.fn<Cache['get']>().mockResolvedValue(undefined)
        cacheSet = vi.fn<Cache['set']>().mockResolvedValue(true)

        const module = await Test.createTestingModule({
            providers: [
                ApiKeyService,
                { provide: getModelToken(ApiKeyModel), useValue: { create, findAll, findOne, update } },
                { provide: CACHE_MANAGER, useValue: { get: cacheGet, set: cacheSet } },
            ],
        }).compile()
        service = module.get(ApiKeyService)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    describe('createKey', () => {
        it('stores only the prefix and hash and returns the full key once', async () => {
            const { apiKey, key } = await service.createKey(3, 'Newsletter', principal, updater)

            const stored = create.mock.calls[0]![0]
            expect(stored).toEqual({
                projectId: 3,
                name: 'Newsletter',
                prefix: expect.stringMatching(/^sdm_[0-9A-Za-z]{8}$/) as string,
                secretHash: expect.stringMatching(/^[0-9a-f]{64}$/) as string,
                createdByUserId: 7,
            })
            expect(key.startsWith(`${stored.prefix}_`)).toBe(true)
            expect(apiKey).not.toHaveProperty('secretHash')
            expect(apiKey.apiKeyId).toBe(12)
        })

        it('requires the project update permission', async () => {
            await expect(service.createKey(3, 'x', principal, reader)).rejects.toThrow(ForbiddenException)
            await expect(service.createKey(3, 'x', principal, outsider)).rejects.toThrow(NotFoundException)
            expect(create).not.toHaveBeenCalled()
        })
    })

    describe('listKeys', () => {
        it('lists the project keys without hashes for readers', async () => {
            const keys = await service.listKeys(3, reader)

            expect(findAll).toHaveBeenCalledWith({ where: { projectId: 3 }, order: [['apiKeyId', 'DESC']] })
            expect(keys).toHaveLength(1)
            expect(keys[0]).not.toHaveProperty('secretHash')
        })

        it('hides projects the caller cannot read', async () => {
            await expect(service.listKeys(3, outsider)).rejects.toThrow(NotFoundException)
        })
    })

    describe('revokeKey', () => {
        it('sets revokedAt on an active key of the project', async () => {
            const row = rowFor(record)
            findOne.mockResolvedValue(row)

            await service.revokeKey(3, 11, updater)

            expect(findOne).toHaveBeenCalledWith({ where: { apiKeyId: 11, projectId: 3 } })
            expect(row.update).toHaveBeenCalledWith({ revokedAt: expect.any(Date) as Date })
        })

        it('is idempotent for an already revoked key', async () => {
            const row = rowFor({ ...record, revokedAt: new Date() })
            findOne.mockResolvedValue(row)

            await service.revokeKey(3, 11, updater)

            expect(row.update).not.toHaveBeenCalled()
        })

        it('404s for a key of another project', async () => {
            findOne.mockResolvedValue(null)

            await expect(service.revokeKey(3, 99, updater)).rejects.toThrow(NotFoundException)
        })

        it('requires the project update permission', async () => {
            await expect(service.revokeKey(3, 11, reader)).rejects.toThrow(ForbiddenException)
        })
    })

    describe('authenticate', () => {
        it('returns the key for a valid secret, looked up by prefix on a live project', async () => {
            const apiKey = await service.authenticate(generated.key)

            expect(findOne).toHaveBeenCalledWith({
                where: { prefix: generated.prefix, revokedAt: null },
                include: [{ model: ProjectModel, required: true, attributes: [] }],
            })
            expect(apiKey).toEqual(expect.objectContaining({ apiKeyId: 11, projectId: 3 }))
            expect(apiKey).not.toHaveProperty('secretHash')
        })

        it('rejects a wrong secret for a known prefix', async () => {
            const forged = `${generated.prefix}_${'A'.repeat(43)}`

            await expect(service.authenticate(forged)).resolves.toBeNull()
        })

        it('rejects a malformed key without querying', async () => {
            await expect(service.authenticate('not-a-key')).resolves.toBeNull()
            expect(findOne).not.toHaveBeenCalled()
        })

        it('rejects unknown, revoked or trashed-project keys', async () => {
            findOne.mockResolvedValue(null)

            await expect(service.authenticate(generated.key)).resolves.toBeNull()
        })
    })

    describe('touchLastUsed', () => {
        it('writes lastUsedAt and remembers the write for the interval', async () => {
            await service.touchLastUsed(11)

            expect(update).toHaveBeenCalledWith({ lastUsedAt: expect.any(Date) as Date }, { where: { apiKeyId: 11 } })
            expect(cacheSet).toHaveBeenCalledWith(`${API_KEY_LAST_USED_CACHE_PREFIX}11`, true, API_KEY_LAST_USED_INTERVAL_MS)
        })

        it('skips the write while a recent one is remembered', async () => {
            cacheGet.mockResolvedValue(true)

            await service.touchLastUsed(11)

            expect(update).not.toHaveBeenCalled()
        })

        it('logs instead of throwing when the write fails', async () => {
            update.mockRejectedValue(new Error('db down'))

            await expect(service.touchLastUsed(11)).resolves.toBeUndefined()
        })
    })
})
```

Run: `pnpm --filter backend exec vitest run src/modules/api-key/services/api-key.service.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 5: Implement `ApiKeyService`**

```ts
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { CACHE_MANAGER, type Cache } from '@nestjs/cache-manager'
import { InjectModel } from '@nestjs/sequelize'
import { ApiKeyModel } from '../models/api-key.model.js'
import { ProjectModel } from '../../project/models/project.model.js'
import { ApiKey } from '../interfaces/api-key.interface.js'
import { toApiKey } from '../mappers/api-key.mapper.js'
import { generateApiKey, matchesApiKeyHash, parseApiKeyPrefix } from '../helpers/api-key-format.js'
import { assertProjectReadable, assertProjectUpdatable } from '../../permission/helpers/project-access.js'
import { AppAbility } from '../../permission/interfaces/app-ability.js'
import { User } from '../../user/interfaces/user.interface.js'
import { API_KEY_LAST_USED_CACHE_PREFIX, API_KEY_LAST_USED_INTERVAL_MS } from '../api-key.constants.js'

export interface CreatedApiKey {
    apiKey: ApiKey
    key: string
}

@Injectable()
export class ApiKeyService {
    private readonly logger = new Logger(ApiKeyService.name)

    constructor(
        @InjectModel(ApiKeyModel) private readonly apiKeyModel: typeof ApiKeyModel,
        @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    ) {}

    async createKey(projectId: number, name: string, principal: User, ability: AppAbility): Promise<CreatedApiKey> {
        assertProjectUpdatable(ability, projectId)

        const { key, prefix, secretHash } = generateApiKey()
        const row = await this.apiKeyModel.create({
            projectId,
            name,
            prefix,
            secretHash,
            createdByUserId: principal.userId,
        })

        return { apiKey: toApiKey(row.get({ plain: true })), key }
    }

    async listKeys(projectId: number, ability: AppAbility): Promise<ApiKey[]> {
        assertProjectReadable(ability, projectId)

        const rows = await this.apiKeyModel.findAll({ where: { projectId }, order: [['apiKeyId', 'DESC']] })

        return rows.map((row) => toApiKey(row.get({ plain: true })))
    }

    async revokeKey(projectId: number, apiKeyId: number, ability: AppAbility): Promise<void> {
        assertProjectUpdatable(ability, projectId)

        const row = await this.apiKeyModel.findOne({ where: { apiKeyId, projectId } })
        if (!row) {
            throw new NotFoundException('Unknown API key')
        }
        if (row.revokedAt) {
            return
        }

        await row.update({ revokedAt: new Date() })
    }

    async authenticate(rawKey: string): Promise<ApiKey | null> {
        const prefix = parseApiKeyPrefix(rawKey)
        if (!prefix) {
            return null
        }

        const row = await this.apiKeyModel.findOne({
            where: { prefix, revokedAt: null },
            include: [{ model: ProjectModel, required: true, attributes: [] }],
        })
        if (!row) {
            return null
        }

        const record = row.get({ plain: true })
        return matchesApiKeyHash(rawKey, record.secretHash) ? toApiKey(record) : null
    }

    async touchLastUsed(apiKeyId: number): Promise<void> {
        const cacheKey = `${API_KEY_LAST_USED_CACHE_PREFIX}${apiKeyId}`
        try {
            if (await this.cacheManager.get(cacheKey)) {
                return
            }
            await this.apiKeyModel.update({ lastUsedAt: new Date() }, { where: { apiKeyId } })
            await this.cacheManager.set(cacheKey, true, API_KEY_LAST_USED_INTERVAL_MS)
        } catch (error) {
            this.logger.error(
                `Failed to record usage of API key ${apiKeyId}: ${error instanceof Error ? error.message : String(error)}`,
            )
        }
    }
}
```

`ProjectModel` is `paranoid`, so `required: true` drops keys whose project is soft-deleted. If `row.get({ plain: true })` would include a `project` key because of the include, `toApiKey` strips it anyway.

Register in `api-key.module.ts`: `providers: [ApiKeyService]`, `exports: [ApiKeyService]`.

- [ ] **Step 6: Run the specs**

Run: `pnpm --filter backend exec vitest run src/modules/api-key`
Expected: PASS.

- [ ] **Step 7: Verify, no commit**

Run: `pnpm --filter backend typecheck && pnpm --filter backend lint` — Expected: no new errors. Do not commit.

---

### Task 5: Key extraction, guard, decorators, rate limiting config

**Files:**
- Create: `apps/backend/src/modules/api-key/helpers/extract-api-key.ts` (+ `.spec.ts`)
- Create: `apps/backend/src/modules/api-key/guards/api-key-auth.guard.ts` (+ `.spec.ts`)
- Create: `apps/backend/src/modules/api-key/decorators/ApiKeyAuth.ts` (+ `.spec.ts`)
- Create: `apps/backend/src/modules/api-key/decorators/ApiKeyPrincipal.ts` (+ `.spec.ts`)
- Modify: `apps/backend/src/config/env.schema.ts` (+ `env.schema.spec.ts`), `.env.example`
- Modify: `apps/backend/src/app.module.ts`
- Modify: `apps/backend/src/factories/app.setup.ts`
- Modify: `apps/backend/src/modules/api-key/api-key.module.ts`

**Interfaces:**
- Consumes: `ApiKeyService.authenticate`, `ApiKeyService.touchLastUsed`, `parseApiKeyPrefix`, constants (Task 4); `Public` decorator (`auth/decorators/Public.js`)
- Produces:
  - `interface ApiKeyRequest { headers: { authorization?: string }; query: Record<string, unknown>; ip?: string; apiKey?: ApiKey }`
  - `extractApiKey(request: ApiKeyRequest): string | null`
  - `publicApiThrottleTracker(request: ApiKeyRequest): string`
  - `isApiKeyRoute(context: ExecutionContext): boolean`
  - `ApiKeyAuthGuard` (sets `request.apiKey`)
  - `@ApiKeyAuth()` — `Public()` + `SkipThrottle({ default: true })` + `UseGuards(ThrottlerGuard, ApiKeyAuthGuard)` + `SetMetadata(API_KEY_AUTH_KEY, true)` + Swagger `ApiSecurity('api-key')` + `ApiSecurity('api-key-query')`
  - `@ApiKeyPrincipal()` param decorator → `ApiKey`
  - env: `PUBLIC_API_RATE_LIMIT: number`, `PUBLIC_API_RATE_TTL: number`

- [ ] **Step 1: Failing spec for extraction + tracker**

```ts
import { describe, expect, it } from 'vitest'
import { extractApiKey, publicApiThrottleTracker } from './extract-api-key.js'

const key = `sdm_abcdEFGH_${'a'.repeat(43)}`

describe('extractApiKey', () => {
    it('reads a bearer token from the authorization header', () => {
        expect(extractApiKey({ headers: { authorization: `Bearer ${key}` }, query: {} })).toBe(key)
    })

    it('reads the key query parameter', () => {
        expect(extractApiKey({ headers: {}, query: { key } })).toBe(key)
    })

    it('prefers the header when both are present', () => {
        expect(extractApiKey({ headers: { authorization: `Bearer ${key}` }, query: { key: 'other' } })).toBe(key)
    })

    it('ignores non-bearer authorization and non-string query values', () => {
        expect(extractApiKey({ headers: { authorization: `Basic ${key}` }, query: { key: ['a', 'b'] } })).toBeNull()
    })
})

describe('publicApiThrottleTracker', () => {
    it('tracks well-formed keys by prefix, valid or not', () => {
        expect(publicApiThrottleTracker({ headers: {}, query: { key }, ip: '198.51.100.1' })).toBe(
            'api-key:sdm_abcdEFGH',
        )
    })

    it('falls back to the client ip for missing or malformed keys', () => {
        expect(publicApiThrottleTracker({ headers: {}, query: { key: 'junk' }, ip: '198.51.100.1' })).toBe(
            'api-key-ip:198.51.100.1',
        )
        expect(publicApiThrottleTracker({ headers: {}, query: {} })).toBe('api-key-ip:unknown')
    })
})
```

Run: `pnpm --filter backend exec vitest run src/modules/api-key/helpers/extract-api-key.spec.ts` — Expected: FAIL.

- [ ] **Step 2: Implement extraction + tracker + route check**

```ts
import type { ExecutionContext } from '@nestjs/common'
import { parseApiKeyPrefix } from './api-key-format.js'
import { API_KEY_AUTH_KEY } from '../api-key.constants.js'
import type { ApiKey } from '../interfaces/api-key.interface.js'

export interface ApiKeyRequest {
    headers: { authorization?: string }
    query: Record<string, unknown>
    ip?: string
    apiKey?: ApiKey
}

const BEARER = 'Bearer '

export function extractApiKey(request: ApiKeyRequest): string | null {
    const authorization = request.headers.authorization
    if (authorization?.startsWith(BEARER)) {
        return authorization.slice(BEARER.length).trim()
    }

    const key = request.query.key
    return typeof key === 'string' ? key : null
}

export function publicApiThrottleTracker(request: ApiKeyRequest): string {
    const prefix = parseApiKeyPrefix(extractApiKey(request) ?? '')
    return prefix ? `api-key:${prefix}` : `api-key-ip:${request.ip ?? 'unknown'}`
}

export function isApiKeyRoute(context: ExecutionContext): boolean {
    return [context.getHandler(), context.getClass()].some(
        (target) => Reflect.getMetadata(API_KEY_AUTH_KEY, target) === true,
    )
}
```

Run the spec — Expected: PASS.

- [ ] **Step 3: Failing guard spec**

```ts
import { ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { ApiKeyAuthGuard } from './api-key-auth.guard.js'
import { ApiKeyService } from '../services/api-key.service.js'
import { ApiKey } from '../interfaces/api-key.interface.js'
import { ApiKeyRequest } from '../helpers/extract-api-key.js'

const apiKey: ApiKey = {
    apiKeyId: 11,
    projectId: 3,
    name: 'Newsletter',
    prefix: 'sdm_abcdEFGH',
    createdByUserId: 7,
    lastUsedAt: null,
    revokedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
}
const rawKey = `sdm_abcdEFGH_${'a'.repeat(43)}`

function contextFor(request: ApiKeyRequest): ExecutionContext {
    return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext
}

describe('ApiKeyAuthGuard', () => {
    let authenticate: Mock<ApiKeyService['authenticate']>
    let touchLastUsed: Mock<ApiKeyService['touchLastUsed']>
    let guard: ApiKeyAuthGuard

    beforeEach(() => {
        authenticate = vi.fn<ApiKeyService['authenticate']>().mockResolvedValue(apiKey)
        touchLastUsed = vi.fn<ApiKeyService['touchLastUsed']>().mockResolvedValue(undefined)
        guard = new ApiKeyAuthGuard({ authenticate, touchLastUsed } as unknown as ApiKeyService)
    })

    it('attaches the authenticated key and records its use', async () => {
        const request: ApiKeyRequest = { headers: { authorization: `Bearer ${rawKey}` }, query: {} }

        await expect(guard.canActivate(contextFor(request))).resolves.toBe(true)
        expect(authenticate).toHaveBeenCalledWith(rawKey)
        expect(request.apiKey).toEqual(apiKey)
        expect(touchLastUsed).toHaveBeenCalledWith(11)
    })

    it('accepts the key from the query string', async () => {
        await expect(guard.canActivate(contextFor({ headers: {}, query: { key: rawKey } }))).resolves.toBe(true)
    })

    it('rejects a request without a key', async () => {
        await expect(guard.canActivate(contextFor({ headers: {}, query: {} }))).rejects.toThrow(UnauthorizedException)
        expect(authenticate).not.toHaveBeenCalled()
    })

    it('rejects a key that does not authenticate', async () => {
        authenticate.mockResolvedValue(null)

        await expect(guard.canActivate(contextFor({ headers: {}, query: { key: rawKey } }))).rejects.toThrow(
            UnauthorizedException,
        )
    })
})
```

The single `as unknown as ApiKeyService` cast wraps typed `vi.fn`s bound to the real method signatures, which is the established way to hand a partial collaborator to a constructor; the `ExecutionContext` cast mirrors `Principal.spec.ts`.

Run: `pnpm --filter backend exec vitest run src/modules/api-key/guards` — Expected: FAIL.

- [ ] **Step 4: Implement the guard**

```ts
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { ApiKeyService } from '../services/api-key.service.js'
import { ApiKeyRequest, extractApiKey } from '../helpers/extract-api-key.js'

@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
    constructor(private readonly apiKeyService: ApiKeyService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<ApiKeyRequest>()
        const rawKey = extractApiKey(request)
        if (!rawKey) {
            throw new UnauthorizedException('Missing API key')
        }

        const apiKey = await this.apiKeyService.authenticate(rawKey)
        if (!apiKey) {
            throw new UnauthorizedException('Invalid API key')
        }

        request.apiKey = apiKey
        void this.apiKeyService.touchLastUsed(apiKey.apiKeyId)
        return true
    }
}
```

Add `ApiKeyAuthGuard` to `api-key.module.ts` `providers`. Run the spec — Expected: PASS.

- [ ] **Step 5: Failing decorator specs**

`decorators/ApiKeyAuth.spec.ts`:

```ts
import 'reflect-metadata'
import { GUARDS_METADATA } from '@nestjs/common/constants'
import { ThrottlerGuard } from '@nestjs/throttler'
import { describe, expect, it } from 'vitest'
import { ApiKeyAuth } from './ApiKeyAuth.js'
import { ApiKeyAuthGuard } from '../guards/api-key-auth.guard.js'
import { PUBLIC_KEY } from '../../auth/decorators/Public.js'
import { API_KEY_AUTH_KEY } from '../api-key.constants.js'

describe('ApiKeyAuth', () => {
    class Controller {
        @ApiKeyAuth()
        handler(this: void) {}
    }

    it('throttles before authenticating the api key', () => {
        expect(Reflect.getMetadata(GUARDS_METADATA, Controller.prototype.handler)).toEqual([
            ThrottlerGuard,
            ApiKeyAuthGuard,
        ])
    })

    it('opts out of JWT auth and marks the route as an api key route', () => {
        expect(Reflect.getMetadata(PUBLIC_KEY, Controller.prototype.handler)).toBe(true)
        expect(Reflect.getMetadata(API_KEY_AUTH_KEY, Controller.prototype.handler)).toBe(true)
    })

    it('skips the default throttler so only the public api budget applies', () => {
        expect(Reflect.getMetadata('THROTTLER:SKIPdefault', Controller.prototype.handler)).toBe(true)
    })

    it('documents both key transports in the OpenAPI spec', () => {
        expect(Reflect.getMetadata('swagger/apiSecurity', Controller.prototype.handler)).toEqual([
            { 'api-key': [] },
            { 'api-key-query': [] },
        ])
    })
})
```

Check the actual skip metadata key in `node_modules/@nestjs/throttler/dist/throttler.constants.js` (`THROTTLER_SKIP`, concatenated with the throttler name) and adjust the string if it differs. Swagger stores `ApiSecurity` entries in decorator order — if the array comes back reversed, assert with `expect.arrayContaining` plus `toHaveLength(2)`.

`decorators/ApiKeyPrincipal.spec.ts` — mirror `Principal.spec.ts`: resolve the factory via `ROUTE_ARGS_METADATA`, assert it returns `request.apiKey` and throws `UnauthorizedException` when absent (use the `apiKey` fixture from the guard spec).

Run: `pnpm --filter backend exec vitest run src/modules/api-key/decorators` — Expected: FAIL.

- [ ] **Step 6: Implement the decorators**

`ApiKeyAuth.ts`:

```ts
import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common'
import { ApiSecurity } from '@nestjs/swagger'
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler'
import { Public } from '../../auth/decorators/Public.js'
import { ApiKeyAuthGuard } from '../guards/api-key-auth.guard.js'
import { API_KEY_AUTH_KEY } from '../api-key.constants.js'

export const ApiKeyAuth = () =>
    applyDecorators(
        Public(),
        SetMetadata(API_KEY_AUTH_KEY, true),
        SkipThrottle({ default: true }),
        UseGuards(ThrottlerGuard, ApiKeyAuthGuard),
        ApiSecurity('api-key'),
        ApiSecurity('api-key-query'),
    )
```

`ApiKeyPrincipal.ts`:

```ts
import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common'
import type { ApiKey } from '../interfaces/api-key.interface.js'

export const ApiKeyPrincipal = createParamDecorator((_, ctx: ExecutionContext): ApiKey => {
    const request = ctx.switchToHttp().getRequest<{ apiKey?: ApiKey }>()
    if (!request.apiKey) {
        throw new UnauthorizedException()
    }
    return request.apiKey
})
```

Run the specs — Expected: PASS.

- [ ] **Step 7: Env keys (test first)**

In `env.schema.spec.ts`, extend the defaults test's `toMatchObject` with `PUBLIC_API_RATE_LIMIT: 60, PUBLIC_API_RATE_TTL: 60000` and add:

```ts
    it('coerces the public api rate limit settings', () => {
        const env = envSchema.parse({ ...requiredEnv, PUBLIC_API_RATE_LIMIT: '5', PUBLIC_API_RATE_TTL: '1000' })

        expect(env).toMatchObject({ PUBLIC_API_RATE_LIMIT: 5, PUBLIC_API_RATE_TTL: 1000 })
    })

    it('rejects a non-positive public api rate limit', () => {
        expect(envSchema.safeParse({ ...requiredEnv, PUBLIC_API_RATE_LIMIT: '0' }).success).toBe(false)
    })
```

Run: `pnpm --filter backend exec vitest run src/config` — Expected: FAIL. Then add to `envSchema` after `OPENAPI_PATH`:

```ts
        PUBLIC_API_RATE_LIMIT: z.coerce.number().int().positive().default(60),
        PUBLIC_API_RATE_TTL: z.coerce.number().int().positive().default(60_000),
```

Add to `.env.example` (read it first, follow its grouping):

```
PUBLIC_API_RATE_LIMIT=60
PUBLIC_API_RATE_TTL=60000
```

Run again — Expected: PASS.

- [ ] **Step 8: Register the `publicApi` throttler**

In `app.module.ts` change the `ThrottlerModule.forRootAsync` block to:

```ts
        ThrottlerModule.forRootAsync({
            imports: [ThrottlerStorageModule],
            inject: [FailOpenThrottlerStorage, ConfigService],
            useFactory(storage: FailOpenThrottlerStorage, configService: ConfigService<Env, true>) {
                return {
                    throttlers: [
                        {
                            ttl: 60_000,
                            limit: 10,
                            skipIf: isApiKeyRoute,
                        },
                        {
                            name: PUBLIC_API_THROTTLER,
                            ttl: configService.get('PUBLIC_API_RATE_TTL', { infer: true }),
                            limit: configService.get('PUBLIC_API_RATE_LIMIT', { infer: true }),
                            getTracker: publicApiThrottleTracker,
                            skipIf: (context) => !isApiKeyRoute(context),
                        },
                    ],
                    storage,
                }
            },
        }),
```

Imports: `isApiKeyRoute`, `publicApiThrottleTracker` from `./modules/api-key/helpers/extract-api-key.js`; `PUBLIC_API_THROTTLER` from `./modules/api-key/api-key.constants.js`. (`ConfigService`/`Env` are already imported for `JwtModule`.) The unnamed throttler is `default`; `skipIf: isApiKeyRoute` on it is belt-and-braces alongside `SkipThrottle({ default: true })`. `publicApiThrottleTracker` takes `ApiKeyRequest`; the throttler passes `Record<string, any>`, which is assignable.

- [ ] **Step 9: Swagger header scheme**

In `app.setup.ts` `createOpenApiDocument`, replace the `.addApiKey({...})` call with:

```ts
        .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'sdm_…' }, 'api-key')
        .addApiKey({ type: 'apiKey', name: 'key', in: 'query' }, 'api-key-query')
```

- [ ] **Step 10: Run the affected suites**

Run: `pnpm --filter backend exec vitest run src/modules/api-key src/config`
Expected: PASS.
Run: `pnpm --filter backend exec vitest run --config vitest.config.e2e.ts test/rate-limit.e2e-spec.ts test/openapi.e2e-spec.ts`
Expected: PASS — existing routes still use the `default` throttler.

- [ ] **Step 11: Verify, no commit**

Run: `pnpm --filter backend typecheck && pnpm --filter backend lint` — Expected: no new errors. Do not commit.

---

### Task 6: Key management endpoints

**Files:**
- Create: `apps/backend/src/modules/api-key/dtos/api-key.dto.ts`
- Create: `apps/backend/src/modules/api-key/dtos/api-key-create.dto.ts`
- Create: `apps/backend/src/modules/api-key/controller/api-key.controller.ts`
- Modify: `apps/backend/src/modules/api-key/api-key.module.ts`

**Interfaces:**
- Consumes: `ApiKeyService.createKey/listKeys/revokeKey` (Task 4); `JwtAuth`, `Principal`, `CurrentAbility`, `ResponseDto`
- Produces: `GET/POST /api/project/:projectId/api-keys`, `DELETE /api/project/:projectId/api-keys/:apiKeyId` (204); DTOs `ApiKeyDto`, `ApiKeyCreatedDto`, `ApiKeyCreateDto`

Controllers here are thin and covered end-to-end in Task 9 (the codebase has no controller unit specs).

- [ ] **Step 1: DTOs**

`api-key.dto.ts`:

```ts
import { Expose } from 'class-transformer'
import { ApiProperty } from '@nestjs/swagger'
import { ApiKey } from '../interfaces/api-key.interface.js'

export class ApiKeyDto implements Omit<ApiKey, 'projectId' | 'updatedAt'> {
    @Expose()
    apiKeyId!: number

    @Expose()
    name!: string

    @Expose()
    prefix!: string

    @Expose()
    @ApiProperty({ type: Number, nullable: true })
    createdByUserId: number | null = null

    @Expose()
    @ApiProperty({ type: Date, nullable: true })
    lastUsedAt: Date | null = null

    @Expose()
    @ApiProperty({ type: Date, nullable: true })
    revokedAt: Date | null = null

    @Expose()
    createdAt!: Date

    static fromApiKey(apiKey: ApiKey): ApiKeyDto {
        return Object.assign(new ApiKeyDto(), apiKey)
    }
}

export class ApiKeyCreatedDto extends ApiKeyDto {
    @Expose()
    key!: string

    static fromCreated(apiKey: ApiKey, key: string): ApiKeyCreatedDto {
        return Object.assign(new ApiKeyCreatedDto(), apiKey, { key })
    }
}
```

Check an existing `fromX` mapper (e.g. `DomainDto.fromDomain` in `modules/domain/dtos/`) and match its style if it differs from `Object.assign`. Explicit `@ApiProperty` on nullable primitives avoids them being generated as `object` (known swagger-plugin quirk).

`api-key-create.dto.ts`:

```ts
import { Expose } from 'class-transformer'
import { IsNotEmpty, IsString, MaxLength } from 'class-validator'

export class ApiKeyCreateDto {
    @Expose()
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    name!: string
}
```

- [ ] **Step 2: Controller**

```ts
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, SerializeOptions } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { JwtAuth } from '../../auth/decorators/JwtAuth.js'
import { Principal } from '../../auth/decorators/Principal.js'
import { CurrentAbility } from '../../permission/decorators/CurrentAbility.js'
import type { AppAbility } from '../../permission/interfaces/app-ability.js'
import type { UserWithRole } from '../../user/interfaces/user.interface.js'
import { ResponseDto } from '../../../decorators/ResponseDto.js'
import { ApiKeyService } from '../services/api-key.service.js'
import { ApiKeyCreatedDto, ApiKeyDto } from '../dtos/api-key.dto.js'
import { ApiKeyCreateDto } from '../dtos/api-key-create.dto.js'

@JwtAuth()
@ApiTags('api-key')
@Controller('project/:projectId/api-keys')
export class ApiKeyController {
    constructor(private readonly apiKeyService: ApiKeyService) {}

    @SerializeOptions({ type: ApiKeyDto })
    @Get()
    async getApiKeys(
        @Param('projectId', ParseIntPipe) projectId: number,
        @CurrentAbility() ability: AppAbility,
    ): Promise<ApiKeyDto[]> {
        const apiKeys = await this.apiKeyService.listKeys(projectId, ability)

        return apiKeys.map((apiKey) => ApiKeyDto.fromApiKey(apiKey))
    }

    @ResponseDto(ApiKeyCreatedDto)
    @Post()
    async createApiKey(
        @Param('projectId', ParseIntPipe) projectId: number,
        @Body() body: ApiKeyCreateDto,
        @Principal() principal: UserWithRole,
        @CurrentAbility() ability: AppAbility,
    ): Promise<ApiKeyCreatedDto> {
        const { apiKey, key } = await this.apiKeyService.createKey(projectId, body.name, principal, ability)

        return ApiKeyCreatedDto.fromCreated(apiKey, key)
    }

    @HttpCode(HttpStatus.NO_CONTENT)
    @Delete(':apiKeyId')
    async revokeApiKey(
        @Param('projectId', ParseIntPipe) projectId: number,
        @Param('apiKeyId', ParseIntPipe) apiKeyId: number,
        @CurrentAbility() ability: AppAbility,
    ): Promise<void> {
        await this.apiKeyService.revokeKey(projectId, apiKeyId, ability)
    }
}
```

Add `controllers: [ApiKeyController]` to `api-key.module.ts`. `@SerializeOptions` on the list endpoint mirrors `ProjectController.getProjects`; check whether `@ApiOkResponse({ type: ApiKeyDto, isArray: true })` is used elsewhere for list endpoints and match it.

- [ ] **Step 3: Verify**

Run: `pnpm --filter backend typecheck && pnpm --filter backend lint`
Run: `pnpm --filter backend exec vitest run --config vitest.config.e2e.ts test/openapi.e2e-spec.ts`
Expected: PASS (unique operationIds, every operation tagged). Do not commit.

---

### Task 7: Public send service and endpoint

**Files:**
- Modify: `apps/backend/src/modules/domain/services/domain.service.ts` (+ spec) — `getDomainByFqdn`
- Modify: `apps/backend/src/modules/project/services/project.service.ts` (+ spec) — `hasDomain`
- Create: `apps/backend/src/modules/api-key/exceptions/public-send.exception.ts`
- Create: `apps/backend/src/modules/api-key/dtos/public-send.dto.ts`
- Create: `apps/backend/src/modules/api-key/services/public-send.service.ts` (+ `.spec.ts`)
- Create: `apps/backend/src/modules/api-key/controller/public-send.controller.ts`
- Modify: `apps/backend/src/modules/api-key/api-key.module.ts`

**Interfaces:**
- Consumes: `MailService.sendMail`, `MailSendError`, `MailMessageSource.API` (Task 2); `ApiKey`, `ApiKeyAuth`, `ApiKeyPrincipal` (Tasks 4–5); `EmailBlockedException`
- Produces:
  - `DomainService.getDomainByFqdn(fqdn: string): Promise<Domain | null>`
  - `ProjectService.hasDomain(projectId: number, domainId: number): Promise<boolean>`
  - `enum PublicSendErrorCode { FROM_DOMAIN_NOT_ALLOWED, FROM_DOMAIN_NOT_READY, RECIPIENT_BLOCKED, DELIVERY_FAILED }` (string values equal to names)
  - `class PublicSendException extends HttpException` — body `{ statusCode, error, message, code, mailMessageId? }`
  - `PublicSendService.send(apiKey: ApiKey, mail: PublicSendDto): Promise<{ mailMessageId: number }>`
  - `POST /api/v1/send` → 202 `PublicSendResultDto { mailMessageId: number; status: 'sent' }`

- [ ] **Step 1: `getDomainByFqdn` (test first)**

In `domain.service.spec.ts` add (reuse the spec's existing `findOne` mock on the domain model token and its `Domain` fixture — read the spec first to get their names):

```ts
    describe('getDomainByFqdn', () => {
        it('returns the plain domain for a known fqdn', async () => {
            domainFindOne.mockResolvedValue(domainRow)

            await expect(service.getDomainByFqdn('mail.example.com')).resolves.toEqual(domain)
            expect(domainFindOne).toHaveBeenCalledWith({ where: { fqdn: 'mail.example.com' } })
        })

        it('returns null for an unknown fqdn', async () => {
            domainFindOne.mockResolvedValue(null)

            await expect(service.getDomainByFqdn('nope.example.com')).resolves.toBeNull()
        })
    })
```

Implement in `DomainService` (next to `getSendingDomainByFqdn`):

```ts
    async getDomainByFqdn(fqdn: string): Promise<Domain | null> {
        const domain = await this.domainModel.findOne({ where: { fqdn } })

        return domain ? domain.get({ plain: true }) : null
    }
```

Run: `pnpm --filter backend exec vitest run src/modules/domain/services/domain.service.spec.ts` — Expected: PASS.

- [ ] **Step 2: `hasDomain` (test first)**

In `project.service.spec.ts`, next to `describe('assertDomainInProject')`, add (use the existing `projectDomainModel` mock — add a `count` mock to its `useValue` if absent: `projectDomainCount = vi.fn<(options: object) => Promise<number>>()`):

```ts
    describe('hasDomain', () => {
        it('is true when the domain is assigned to the project', async () => {
            projectDomainCount.mockResolvedValue(1)

            await expect(service.hasDomain(3, 8)).resolves.toBe(true)
            expect(projectDomainCount).toHaveBeenCalledWith({ where: { projectId: 3, domainId: 8 } })
        })

        it('is false otherwise', async () => {
            projectDomainCount.mockResolvedValue(0)

            await expect(service.hasDomain(3, 8)).resolves.toBe(false)
        })
    })
```

Implement in `ProjectService`:

```ts
    async hasDomain(projectId: number, domainId: number): Promise<boolean> {
        return (await this.projectDomainModel.count({ where: { projectId, domainId } })) > 0
    }
```

Run: `pnpm --filter backend exec vitest run src/modules/project/services/project.service.spec.ts` — Expected: PASS.

- [ ] **Step 3: Exception**

```ts
import { HttpException, HttpStatus } from '@nestjs/common'

export enum PublicSendErrorCode {
    FROM_DOMAIN_NOT_ALLOWED = 'FROM_DOMAIN_NOT_ALLOWED',
    FROM_DOMAIN_NOT_READY = 'FROM_DOMAIN_NOT_READY',
    RECIPIENT_BLOCKED = 'RECIPIENT_BLOCKED',
    DELIVERY_FAILED = 'DELIVERY_FAILED',
}

const RESPONSE_BY_CODE: Record<PublicSendErrorCode, { status: HttpStatus; error: string }> = {
    [PublicSendErrorCode.FROM_DOMAIN_NOT_ALLOWED]: { status: HttpStatus.FORBIDDEN, error: 'Forbidden' },
    [PublicSendErrorCode.FROM_DOMAIN_NOT_READY]: {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        error: 'Unprocessable Entity',
    },
    [PublicSendErrorCode.RECIPIENT_BLOCKED]: { status: HttpStatus.UNPROCESSABLE_ENTITY, error: 'Unprocessable Entity' },
    [PublicSendErrorCode.DELIVERY_FAILED]: { status: HttpStatus.BAD_GATEWAY, error: 'Bad Gateway' },
}

export class PublicSendException extends HttpException {
    constructor(
        readonly code: PublicSendErrorCode,
        message: string,
        readonly mailMessageId?: number,
    ) {
        const { status, error } = RESPONSE_BY_CODE[code]
        super(
            {
                statusCode: status,
                error,
                message,
                code,
                ...(mailMessageId !== undefined && { mailMessageId }),
            },
            status,
        )
    }
}
```

The body keeps Nest's default shape (`statusCode`, `error` reason phrase, `message`) plus `code`.

- [ ] **Step 4: Request/response DTOs**

```ts
import { Expose } from 'class-transformer'
import { ApiProperty } from '@nestjs/swagger'
import { IsEmail, IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator'

const MAX_BODY_LENGTH = 1_000_000

export class PublicSendDto {
    @Expose()
    @IsEmail()
    from!: string

    @Expose()
    @IsEmail()
    to!: string

    @Expose()
    @IsOptional()
    @IsEmail()
    replyTo?: string

    @Expose()
    @IsString()
    @Length(1, 998)
    subject!: string

    @Expose()
    @IsString()
    @Length(1, MAX_BODY_LENGTH)
    html!: string

    @Expose()
    @IsOptional()
    @IsString()
    @MaxLength(MAX_BODY_LENGTH)
    text?: string
}

export class PublicSendResultDto {
    @Expose()
    mailMessageId!: number

    @Expose()
    @ApiProperty({ enum: ['sent'] })
    status!: 'sent'
}
```

(Remove `IsIn` from the `class-validator` import.) A 1 MB body also needs Express's JSON limit to allow it: check `appOptions` (`src/factories/app.options.ts`) for `bodyParser`/`rawBody` settings. If the default 100 kb limit applies, add `app.useBodyParser('json', { limit: '2mb' })` in `configureApp` (it must come before routes are registered; `configureApp` runs before `app.init()`, so it does) and cover it in Task 9's e2e with a 200 kb html body.

- [ ] **Step 5: Failing `PublicSendService` spec**

```ts
import { Logger } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { PublicSendService } from './public-send.service.js'
import { PublicSendErrorCode, PublicSendException } from '../exceptions/public-send.exception.js'
import { DomainService } from '../../domain/services/domain.service.js'
import { ProjectService } from '../../project/services/project.service.js'
import { MailService } from '../../mail/services/mail.service.js'
import { MailSendError } from '../../mail/exceptions/mail-send.error.js'
import { MailMessageSource } from '../../mail/interfaces/mail-message.interface.js'
import { EmailBlockedException } from '../../bounce/exceptions/email-blocked.exception.js'
import { Domain, DomainWithActiveDkim } from '../../domain/interfaces/domain.interface.js'
import { DomainDkimAlgorithm } from '../../domain/interfaces/domain-dkim.interface.js'
import { ApiKey } from '../interfaces/api-key.interface.js'
import { PublicSendDto } from '../dtos/public-send.dto.js'

const apiKey: ApiKey = {
    apiKeyId: 11,
    projectId: 3,
    name: 'Newsletter',
    prefix: 'sdm_abcdEFGH',
    createdByUserId: 7,
    lastUsedAt: null,
    revokedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
}

const domain: Domain = {
    domainId: 8,
    fqdn: 'mail.example.com',
    rootDomain: 'example.com',
    activeDkimId: 4,
    dnsRecords: [],
    lastCheckedAt: null,
}

const sendingDomain: DomainWithActiveDkim = {
    ...domain,
    activeDkim: {
        dkimId: 4,
        domainId: 8,
        selector: 's1',
        publicKey: 'pub',
        privateKey: 'v1.key',
        algorithm: DomainDkimAlgorithm.RSA,
        keyBits: 2048,
        createdAt: new Date(),
    },
}

const mail: PublicSendDto = {
    from: 'news@mail.example.com',
    to: 'reader@example.org',
    subject: 'Hello',
    html: '<p>Hi</p>',
}

describe('PublicSendService', () => {
    let service: PublicSendService
    let getDomainByFqdn: Mock<DomainService['getDomainByFqdn']>
    let getSendingDomainByFqdn: Mock<DomainService['getSendingDomainByFqdn']>
    let hasDomain: Mock<ProjectService['hasDomain']>
    let sendMail: Mock<MailService['sendMail']>

    beforeEach(async () => {
        vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
        getDomainByFqdn = vi.fn<typeof getDomainByFqdn>().mockResolvedValue(domain)
        getSendingDomainByFqdn = vi.fn<typeof getSendingDomainByFqdn>().mockResolvedValue(sendingDomain)
        hasDomain = vi.fn<typeof hasDomain>().mockResolvedValue(true)
        sendMail = vi.fn<typeof sendMail>().mockResolvedValue({ mailMessageId: 70, smtpMessageId: '<m@x>' })

        const module = await Test.createTestingModule({
            providers: [
                PublicSendService,
                { provide: DomainService, useValue: { getDomainByFqdn, getSendingDomainByFqdn } },
                { provide: ProjectService, useValue: { hasDomain } },
                { provide: MailService, useValue: { sendMail } },
            ],
        }).compile()
        service = module.get(PublicSendService)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    async function sendError(dto: PublicSendDto = mail): Promise<PublicSendException> {
        const error = await service.send(apiKey, dto).catch((caught: unknown) => caught)
        expect(error).toBeInstanceOf(PublicSendException)
        return error as PublicSendException
    }

    it('sends through the mail service as an api message of the key project', async () => {
        await expect(service.send(apiKey, { ...mail, replyTo: 'support@example.com', text: 'Hi' })).resolves.toEqual({
            mailMessageId: 70,
        })

        expect(sendMail).toHaveBeenCalledWith(
            {
                from: 'news@mail.example.com',
                to: 'reader@example.org',
                replyTo: 'support@example.com',
                subject: 'Hello',
                html: '<p>Hi</p>',
                text: 'Hi',
            },
            { projectId: 3, source: MailMessageSource.API, apiKeyId: 11 },
        )
    })

    it('matches the from domain case-insensitively and sends with the normalized domain', async () => {
        await service.send(apiKey, { ...mail, from: 'News@Mail.Example.COM' })

        expect(getDomainByFqdn).toHaveBeenCalledWith('mail.example.com')
        expect(getSendingDomainByFqdn).toHaveBeenCalledWith('mail.example.com')
        expect(sendMail).toHaveBeenCalledWith(
            expect.objectContaining({ from: 'News@mail.example.com' }),
            expect.anything(),
        )
    })

    it('forbids an unknown from domain without revealing that it is unknown', async () => {
        getDomainByFqdn.mockResolvedValue(null)

        const error = await sendError()
        expect(error.code).toBe(PublicSendErrorCode.FROM_DOMAIN_NOT_ALLOWED)
        expect(error.getStatus()).toBe(403)
        expect(sendMail).not.toHaveBeenCalled()
    })

    it('forbids a from domain of another project', async () => {
        hasDomain.mockResolvedValue(false)

        const error = await sendError()
        expect(hasDomain).toHaveBeenCalledWith(3, 8)
        expect(error.code).toBe(PublicSendErrorCode.FROM_DOMAIN_NOT_ALLOWED)
    })

    it('rejects a project domain without an active dkim key', async () => {
        getSendingDomainByFqdn.mockResolvedValue(null)

        const error = await sendError()
        expect(error.code).toBe(PublicSendErrorCode.FROM_DOMAIN_NOT_READY)
        expect(error.getStatus()).toBe(422)
        expect(sendMail).not.toHaveBeenCalled()
    })

    it('reports a blocked recipient', async () => {
        sendMail.mockRejectedValue(
            new MailSendError(71, new EmailBlockedException('reader@example.org', new Date('2026-11-01'))),
        )

        const error = await sendError()
        expect(error.code).toBe(PublicSendErrorCode.RECIPIENT_BLOCKED)
        expect(error.getStatus()).toBe(422)
        expect(error.mailMessageId).toBe(71)
    })

    it('reports a delivery failure with the logged message id', async () => {
        sendMail.mockRejectedValue(new MailSendError(72, new Error('connect ECONNREFUSED')))

        const error = await sendError()
        expect(error.code).toBe(PublicSendErrorCode.DELIVERY_FAILED)
        expect(error.getStatus()).toBe(502)
        expect(error.getResponse()).toEqual(expect.objectContaining({ mailMessageId: 72 }))
    })

    it('rethrows errors that happen before a message was logged', async () => {
        sendMail.mockRejectedValue(new Error('db down'))

        await expect(service.send(apiKey, mail)).rejects.toThrow('db down')
    })
})
```

Run: `pnpm --filter backend exec vitest run src/modules/api-key/services/public-send.service.spec.ts` — Expected: FAIL.

- [ ] **Step 6: Implement `PublicSendService`**

```ts
import { Injectable, Logger } from '@nestjs/common'
import { DomainService } from '../../domain/services/domain.service.js'
import { ProjectService } from '../../project/services/project.service.js'
import { MailService } from '../../mail/services/mail.service.js'
import { MailSendError } from '../../mail/exceptions/mail-send.error.js'
import { MailMessageSource } from '../../mail/interfaces/mail-message.interface.js'
import { EmailBlockedException } from '../../bounce/exceptions/email-blocked.exception.js'
import { ApiKey } from '../interfaces/api-key.interface.js'
import { PublicSendDto } from '../dtos/public-send.dto.js'
import { PublicSendErrorCode, PublicSendException } from '../exceptions/public-send.exception.js'

@Injectable()
export class PublicSendService {
    private readonly logger = new Logger(PublicSendService.name)

    constructor(
        private readonly domainService: DomainService,
        private readonly projectService: ProjectService,
        private readonly mailService: MailService,
    ) {}

    async send(apiKey: ApiKey, mail: PublicSendDto): Promise<{ mailMessageId: number }> {
        const separator = mail.from.lastIndexOf('@')
        const fqdn = mail.from.slice(separator + 1).toLowerCase()
        const from = `${mail.from.slice(0, separator)}@${fqdn}`

        await this.assertFromDomainUsable(apiKey.projectId, fqdn)

        try {
            const { mailMessageId } = await this.mailService.sendMail(
                {
                    from,
                    to: mail.to,
                    replyTo: mail.replyTo,
                    subject: mail.subject,
                    html: mail.html,
                    text: mail.text,
                },
                { projectId: apiKey.projectId, source: MailMessageSource.API, apiKeyId: apiKey.apiKeyId },
            )
            return { mailMessageId }
        } catch (error) {
            if (!(error instanceof MailSendError)) {
                throw error
            }
            if (error.cause instanceof EmailBlockedException) {
                throw new PublicSendException(
                    PublicSendErrorCode.RECIPIENT_BLOCKED,
                    'The recipient is blocked after previous bounces',
                    error.mailMessageId,
                )
            }
            this.logger.warn(`API key ${apiKey.prefix} delivery ${error.mailMessageId} failed: ${error.message}`)
            throw new PublicSendException(
                PublicSendErrorCode.DELIVERY_FAILED,
                'The mail could not be delivered to the relay',
                error.mailMessageId,
            )
        }
    }

    private async assertFromDomainUsable(projectId: number, fqdn: string): Promise<void> {
        const domain = await this.domainService.getDomainByFqdn(fqdn)
        if (!domain || !(await this.projectService.hasDomain(projectId, domain.domainId))) {
            throw new PublicSendException(
                PublicSendErrorCode.FROM_DOMAIN_NOT_ALLOWED,
                'The from address must use a domain of this project',
            )
        }

        if (!(await this.domainService.getSendingDomainByFqdn(fqdn))) {
            throw new PublicSendException(
                PublicSendErrorCode.FROM_DOMAIN_NOT_READY,
                'The from domain has no active DKIM key',
            )
        }
    }
}
```

`MailService.deliver` looks up the FQDN exactly as written in `from`, which is why `send` passes the address with its domain part lowercased. `@IsEmail()` guarantees an `@` is present.

Run the spec — Expected: PASS.

- [ ] **Step 7: Controller and wiring**

```ts
import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common'
import { ApiAcceptedResponse, ApiTags } from '@nestjs/swagger'
import { SerializeOptions } from '@nestjs/common'
import { ApiKeyAuth } from '../decorators/ApiKeyAuth.js'
import { ApiKeyPrincipal } from '../decorators/ApiKeyPrincipal.js'
import type { ApiKey } from '../interfaces/api-key.interface.js'
import { PublicSendService } from '../services/public-send.service.js'
import { PublicSendDto, PublicSendResultDto } from '../dtos/public-send.dto.js'

@ApiTags('public-send')
@Controller('v1')
export class PublicSendController {
    constructor(private readonly publicSendService: PublicSendService) {}

    @ApiKeyAuth()
    @HttpCode(HttpStatus.ACCEPTED)
    @SerializeOptions({ type: PublicSendResultDto })
    @ApiAcceptedResponse({ type: PublicSendResultDto })
    @Post('send')
    async sendMail(@Body() body: PublicSendDto, @ApiKeyPrincipal() apiKey: ApiKey): Promise<PublicSendResultDto> {
        const { mailMessageId } = await this.publicSendService.send(apiKey, body)

        return { mailMessageId, status: 'sent' }
    }
}
```

Merge the two `@nestjs/common` imports. `api-key.module.ts` final shape:

```ts
@Module({
    imports: [SequelizeModule.forFeature([ApiKeyModel]), DomainModule, ProjectModule, MailModule],
    controllers: [ApiKeyController, PublicSendController],
    providers: [ApiKeyService, ApiKeyAuthGuard, PublicSendService],
    exports: [ApiKeyService],
})
export class ApiKeyModule {}
```

- [ ] **Step 8: Verify**

Run: `pnpm --filter backend exec vitest run src/modules/api-key src/modules/domain src/modules/project`
Run: `pnpm --filter backend typecheck && pnpm --filter backend lint`
Expected: PASS. Do not commit.

---

### Task 8: Message log endpoint

**Files:**
- Create: `apps/backend/src/modules/mail/dtos/mail-message.dto.ts`
- Create: `apps/backend/src/modules/mail/controller/mail-message.controller.ts`
- Modify: `apps/backend/src/modules/mail/services/mail-message.service.ts` (+ spec) — ability-checked wrapper
- Modify: `apps/backend/src/modules/mail/mail.module.ts`

**Interfaces:**
- Consumes: `MailMessageService.getProjectMessages` (Task 2); `assertProjectReadable`
- Produces: `MailMessageService.listForProject(projectId: number, query: MailMessageQuery, ability: AppAbility): Promise<MailMessage[]>`; `GET /api/project/:projectId/messages?limit&before&source&status` → `MailMessageDto[]`; constant `MAIL_MESSAGES_MAX_LIMIT = 100`

- [ ] **Step 1: Failing service tests**

Add to `mail-message.service.spec.ts` (import `createMongoAbility` from `@casl/ability`, `AppAbility`, `NotFoundException`):

```ts
    describe('listForProject', () => {
        const reader = createMongoAbility<AppAbility>([
            { action: 'read', subject: 'Project', conditions: { projectId: { $in: [3] } } },
        ])

        it('lists messages of a readable project, capping the page size', async () => {
            await service.listForProject(3, { limit: 500 }, reader)

            expect(findAll).toHaveBeenCalledWith(expect.objectContaining({ limit: 100 }))
        })

        it('hides projects the caller cannot read', async () => {
            await expect(service.listForProject(4, { limit: 10 }, reader)).rejects.toThrow(NotFoundException)
            expect(findAll).not.toHaveBeenCalled()
        })
    })
```

Run — Expected: FAIL. Implement in `MailMessageService`:

```ts
export const MAIL_MESSAGES_MAX_LIMIT = 100

    async listForProject(projectId: number, query: MailMessageQuery, ability: AppAbility): Promise<MailMessage[]> {
        assertProjectReadable(ability, projectId)

        return this.getProjectMessages(projectId, { ...query, limit: Math.min(query.limit, MAIL_MESSAGES_MAX_LIMIT) })
    }
```

(place the constant at module level, the method in the class; import `assertProjectReadable` and `AppAbility`). Run — Expected: PASS.

- [ ] **Step 2: DTO**

```ts
import { Expose } from 'class-transformer'
import { ApiProperty } from '@nestjs/swagger'
import { MailMessage, MailMessageSource, MailMessageStatus } from '../interfaces/mail-message.interface.js'

export class MailMessageDto implements Omit<MailMessage, 'projectId' | 'smtpMessageId' | 'updatedAt'> {
    @Expose()
    mailMessageId!: number

    @Expose()
    @ApiProperty({ enum: MailMessageSource, enumName: 'MailMessageSource' })
    source!: MailMessageSource

    @Expose()
    @ApiProperty({ type: Number, nullable: true })
    apiKeyId: number | null = null

    @Expose()
    emailFrom!: string

    @Expose()
    emailTo!: string

    @Expose()
    subject!: string

    @Expose()
    @ApiProperty({ enum: MailMessageStatus, enumName: 'MailMessageStatus' })
    status!: MailMessageStatus

    @Expose()
    @ApiProperty({ type: String, nullable: true })
    error: string | null = null

    @Expose()
    @ApiProperty({ type: Date, nullable: true })
    sentAt: Date | null = null

    @Expose()
    createdAt!: Date
}
```

- [ ] **Step 3: Controller**

```ts
import { Controller, DefaultValuePipe, Get, Param, ParseEnumPipe, ParseIntPipe, Query, SerializeOptions } from '@nestjs/common'
import { ApiQuery, ApiTags } from '@nestjs/swagger'
import { JwtAuth } from '../../auth/decorators/JwtAuth.js'
import { CurrentAbility } from '../../permission/decorators/CurrentAbility.js'
import type { AppAbility } from '../../permission/interfaces/app-ability.js'
import { MailMessageService } from '../services/mail-message.service.js'
import { MailMessageDto } from '../dtos/mail-message.dto.js'
import { MailMessageSource, MailMessageStatus } from '../interfaces/mail-message.interface.js'

@JwtAuth()
@ApiTags('mail-message')
@Controller('project/:projectId/messages')
export class MailMessageController {
    constructor(private readonly mailMessageService: MailMessageService) {}

    @ApiQuery({ name: 'limit', required: false, type: Number })
    @ApiQuery({ name: 'before', required: false, type: Number })
    @ApiQuery({ name: 'source', required: false, enum: MailMessageSource, enumName: 'MailMessageSource' })
    @ApiQuery({ name: 'status', required: false, enum: MailMessageStatus, enumName: 'MailMessageStatus' })
    @SerializeOptions({ type: MailMessageDto })
    @Get()
    async getProjectMessages(
        @Param('projectId', ParseIntPipe) projectId: number,
        @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
        @Query('before', new ParseIntPipe({ optional: true })) before: number | undefined,
        @Query('source', new ParseEnumPipe(MailMessageSource, { optional: true })) source: MailMessageSource | undefined,
        @Query('status', new ParseEnumPipe(MailMessageStatus, { optional: true })) status: MailMessageStatus | undefined,
        @CurrentAbility() ability: AppAbility,
    ): Promise<MailMessageDto[]> {
        return await this.mailMessageService.listForProject(projectId, { limit, before, source, status }, ability)
    }
}
```

A `limit` below 1 must be rejected: add `if (limit < 1) throw new BadRequestException('limit must be at least 1')` at the top of `listForProject` and a unit test for it.

Add `controllers: [MailMessageController]` to `mail.module.ts`.

- [ ] **Step 4: Verify**

Run: `pnpm --filter backend exec vitest run src/modules/mail`
Run: `pnpm --filter backend typecheck && pnpm --filter backend lint`
Run: `pnpm --filter backend exec vitest run --config vitest.config.e2e.ts test/openapi.e2e-spec.ts`
Expected: PASS. Do not commit.

---

### Task 9: Public send e2e suite

**Files:**
- Create: `apps/backend/test/public-send.e2e-spec.ts`

**Interfaces:**
- Consumes: all endpoints from Tasks 6–8; `createTestApp`, `seedUser`, `login`, `configureSendingDomain`, `waitForMessagesTo` helpers; `EmailBlockService.applyBlock`

- [ ] **Step 1: Write the suite**

```ts
import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { createTestApp } from './support/app.js'
import { login, seedUser, type Credentials } from './support/session.js'
import { configureSendingDomain } from './support/sending-domain.js'
import { waitForMessagesTo } from './support/mailhog.js'
import { EmailBlockService } from '../src/modules/bounce/services/email-block.service.js'

interface ApiKeyBody {
    apiKeyId: number
    name: string
    prefix: string
    lastUsedAt: string | null
    revokedAt: string | null
    key?: string
}

interface MessageBody {
    mailMessageId: number
    source: string
    apiKeyId: number | null
    emailTo: string
    status: string
}

describe('Public send API (e2e)', () => {
    let app: INestApplication<App>
    let ownerToken: string
    let readerToken: string
    let projectId: number
    let otherProjectId: number
    let key: string
    let apiKeyId: number

    const mailhogUrl = inject('e2eEnv').MAILHOG_URL
    const password = 'correct-horse-battery-staple'
    const ownerCredentials: Credentials = { email: 'psa-e2e.owner@example.com', password }
    const readerCredentials: Credentials = { email: 'psa-e2e.reader@example.com', password }
    const from = 'news@send.psa-example.com'

    const http = () => request(app.getHttpServer())
    const asOwner = () => `Bearer ${ownerToken}`
    const send = (body: Record<string, unknown>, apiKey = key) =>
        http().post('/api/v1/send').set('Authorization', `Bearer ${apiKey}`).send(body)

    async function createProjectWithDomain(name: string, fqdn: string): Promise<number> {
        const domain = await http().post('/api/domain').set('Authorization', asOwner()).send({ fqdn }).expect(201)
        const project = await http().post('/api/project').set('Authorization', asOwner()).send({ name }).expect(201)
        const id = (project.body as { projectId: number }).projectId
        await http()
            .post(`/api/project/${id}/domains`)
            .set('Authorization', asOwner())
            .send({ domainId: (domain.body as { domainId: number }).domainId })
            .expect(201)
        return id
    }

    async function createKey(name: string): Promise<ApiKeyBody> {
        const response = await http()
            .post(`/api/project/${projectId}/api-keys`)
            .set('Authorization', asOwner())
            .send({ name })
            .expect(201)
        return response.body as ApiKeyBody
    }

    async function messages(query = ''): Promise<MessageBody[]> {
        const response = await http()
            .get(`/api/project/${projectId}/messages${query}`)
            .set('Authorization', asOwner())
            .expect(200)
        return response.body as MessageBody[]
    }

    beforeAll(async () => {
        app = await createTestApp()
        await seedUser(app, ownerCredentials)
        await seedUser(app, readerCredentials, 'user')
        ownerToken = await login(app, ownerCredentials)
        readerToken = await login(app, readerCredentials)
        await configureSendingDomain(app, ownerToken, 'mail.psa-sending.org')

        projectId = await createProjectWithDomain('E2E Public Send', 'send.psa-example.com')
        otherProjectId = await createProjectWithDomain('E2E Public Send Other', 'other.psa-example.com')

        const users = await http().get('/api/user').set('Authorization', asOwner()).expect(200)
        const reader = (users.body as { userId: number; email: string }[]).find(
            (user) => user.email === readerCredentials.email,
        )!
        await http()
            .put(`/api/project/${projectId}/members/${reader.userId}`)
            .set('Authorization', asOwner())
            .send({ permissions: ['read'] })
            .expect(200)

        const created = await createKey('Newsletter')
        key = created.key!
        apiKeyId = created.apiKeyId
    })

    afterAll(async () => {
        await app?.close()
    })

    describe('key management', () => {
        it('returns the full key only on creation', async () => {
            expect(key).toMatch(/^sdm_[0-9A-Za-z]{8}_[A-Za-z0-9_-]{43}$/)

            const list = await http().get(`/api/project/${projectId}/api-keys`).set('Authorization', asOwner()).expect(200)
            const listed = (list.body as ApiKeyBody[]).find((apiKey) => apiKey.apiKeyId === apiKeyId)!
            expect(listed.prefix).toBe(key.slice(0, 12))
            expect(listed).not.toHaveProperty('key')
            expect(listed).not.toHaveProperty('secretHash')
        })

        it('lets readers list but not create or revoke keys', async () => {
            await http().get(`/api/project/${projectId}/api-keys`).set('Authorization', `Bearer ${readerToken}`).expect(200)
            await http()
                .post(`/api/project/${projectId}/api-keys`)
                .set('Authorization', `Bearer ${readerToken}`)
                .send({ name: 'nope' })
                .expect(403)
            await http()
                .delete(`/api/project/${projectId}/api-keys/${apiKeyId}`)
                .set('Authorization', `Bearer ${readerToken}`)
                .expect(403)
        })
    })

    describe('sending', () => {
        it('sends with a header key, logs the message and records key usage', async () => {
            const response = await send({ from, to: 'reader1@psa-e2e.test', subject: 'Hello', html: '<p>Hi</p>', text: 'Hi' })
                .expect(202)
            const { mailMessageId, status } = response.body as { mailMessageId: number; status: string }
            expect(status).toBe('sent')

            const [delivered] = await waitForMessagesTo(mailhogUrl, 'reader1@psa-e2e.test')
            expect(delivered).toBeDefined()

            const logged = (await messages()).find((message) => message.mailMessageId === mailMessageId)!
            expect(logged).toEqual(
                expect.objectContaining({ source: 'api', apiKeyId, emailTo: 'reader1@psa-e2e.test', status: 'sent' }),
            )

            const list = await http().get(`/api/project/${projectId}/api-keys`).set('Authorization', asOwner()).expect(200)
            expect((list.body as ApiKeyBody[]).find((apiKey) => apiKey.apiKeyId === apiKeyId)!.lastUsedAt).not.toBeNull()
        })

        it('accepts the key as a query parameter', async () => {
            await http()
                .post(`/api/v1/send?key=${encodeURIComponent(key)}`)
                .send({ from, to: 'reader2@psa-e2e.test', subject: 'Hello', html: '<p>Hi</p>' })
                .expect(202)
        })

        it('accepts a mixed-case from domain', async () => {
            await send({ from: 'News@Send.PSA-Example.com', to: 'reader3@psa-e2e.test', subject: 'Hi', html: '<p>x</p>' })
                .expect(202)
        })

        it('accepts an html body larger than the default json limit', async () => {
            await send({ from, to: 'reader4@psa-e2e.test', subject: 'Big', html: `<p>${'x'.repeat(200_000)}</p>` })
                .expect(202)
        })

        it('rejects missing and malformed keys', async () => {
            await http().post('/api/v1/send').send({ from, to: 'x@psa-e2e.test', subject: 'x', html: 'x' }).expect(401)
            await send({ from, to: 'x@psa-e2e.test', subject: 'x', html: 'x' }, 'not-a-key').expect(401)
        })

        it('does not accept a JWT in place of an api key', async () => {
            await send({ from, to: 'x@psa-e2e.test', subject: 'x', html: 'x' }, ownerToken).expect(401)
        })

        it('validates the payload', async () => {
            await send({ from: 'not-an-address', to: 'x@psa-e2e.test', subject: 'x', html: 'x' }).expect(400)
            await send({ from, to: 'x@psa-e2e.test', subject: '', html: 'x' }).expect(400)
        })

        it('forbids a from domain of another project', async () => {
            const response = await send({
                from: 'news@other.psa-example.com',
                to: 'x@psa-e2e.test',
                subject: 'x',
                html: 'x',
            }).expect(403)
            expect((response.body as { code: string }).code).toBe('FROM_DOMAIN_NOT_ALLOWED')
            expect(otherProjectId).toBeGreaterThan(0)
        })

        it('reports a blocked recipient and logs it as blocked', async () => {
            await app.get(EmailBlockService).applyBlock('blocked@psa-e2e.test')

            const response = await send({ from, to: 'blocked@psa-e2e.test', subject: 'x', html: 'x' }).expect(422)
            const body = response.body as { code: string; mailMessageId: number }
            expect(body.code).toBe('RECIPIENT_BLOCKED')

            const logged = (await messages('?status=blocked')).find((message) => message.mailMessageId === body.mailMessageId)
            expect(logged).toBeDefined()
        })

        it('rejects keys of a trashed project', async () => {
            const trashed = await createProjectWithDomain('E2E Public Send Trash', 'trash.psa-example.com')
            const trashedKey = await http()
                .post(`/api/project/${trashed}/api-keys`)
                .set('Authorization', asOwner())
                .send({ name: 'Trash' })
                .expect(201)
            await http().delete(`/api/project/${trashed}`).set('Authorization', asOwner()).expect(200)

            await send(
                { from: 'news@trash.psa-example.com', to: 'x@psa-e2e.test', subject: 'x', html: 'x' },
                (trashedKey.body as ApiKeyBody).key!,
            ).expect(401)
        })
    })

    describe('message log', () => {
        it('pages with a cursor', async () => {
            const [first, second] = await messages('?limit=1')
            expect(second).toBeUndefined()
            const next = await messages(`?limit=1&before=${first!.mailMessageId}`)
            expect(next[0]!.mailMessageId).toBeLessThan(first!.mailMessageId)
        })

        it('hides the log of projects the caller cannot read', async () => {
            await http().get(`/api/project/${otherProjectId}/messages`).set('Authorization', `Bearer ${readerToken}`).expect(404)
        })
    })

    describe('revocation and rate limiting', () => {
        it('rejects a revoked key', async () => {
            const revocable = await createKey('Revocable')
            await http()
                .delete(`/api/project/${projectId}/api-keys/${revocable.apiKeyId}`)
                .set('Authorization', asOwner())
                .expect(204)

            await send({ from, to: 'x@psa-e2e.test', subject: 'x', html: 'x' }, revocable.key!).expect(401)
        })

        it('throttles a key after the configured limit, including invalid secrets of its prefix', async () => {
            const limited = await createKey('Limited')
            const forged = `${limited.prefix}_${'A'.repeat(43)}`
            const statuses: number[] = []
            for (let attempt = 0; attempt <= 60; attempt++) {
                const response = await send({ from, to: 'x@psa-e2e.test', subject: 'x', html: 'x' }, forged)
                statuses.push(response.status)
            }

            expect(statuses.slice(0, 60)).not.toContain(429)
            expect(statuses[60]).toBe(429)
            await send({ from, to: 'x@psa-e2e.test', subject: 'x', html: 'x' }, limited.key!).expect(429)
        })
    })
})
```

Notes for the implementer:
- Check the project delete status code in `project.e2e-spec.ts` (`DELETE /api/project/:id` currently returns 200 — no `@HttpCode`). Adjust if different.
- The rate-limit test relies on `PUBLIC_API_RATE_LIMIT` defaulting to 60 in the e2e env (`test/support/env.ts` must not override it). It uses forged secrets so it does not depend on SMTP throughput.
- If the 200 kb body test fails with 413, apply the body-limit change described in Task 7 Step 4.

- [ ] **Step 2: Run the suite**

Run: `pnpm --filter backend exec vitest run --config vitest.config.e2e.ts test/public-send.e2e-spec.ts`
Expected: PASS. A failure here is a real bug in Tasks 2–8 — fix the production code (not the assertion) unless the assertion contradicts the spec.

- [ ] **Step 3: Full backend e2e**

Run: `pnpm --filter backend test:e2e`
Expected: PASS (in particular `schema`, `openapi`, `rate-limit`, `inbound-form*`, `bounce`). Do not commit.

---

### Task 10: API client regeneration, docs, full gate

**Files:**
- Modify: `packages/api/assets/openapi.json` (generated)
- Modify: `README.md`

- [ ] **Step 1: Regenerate the client**

Run: `pnpm --filter backend generate && pnpm --filter api build`
Expected: `packages/api/dist` contains `ApiKeyApi` (`getApiKeys`, `createApiKey`, `revokeApiKey`), `PublicSendApi.sendMail`, `MailMessageApi.getProjectMessages`, and Zod schemas for `PublicSendDto`, `ApiKeyDto`, `ApiKeyCreatedDto`, `MailMessageDto`. Inspect `openapi.json`: `apiKeyId`, `lastUsedAt`, `sentAt` etc. must not be typed `object` (add `@ApiProperty` where they are).

- [ ] **Step 2: Frontend still compiles**

Run: `pnpm --filter frontend typecheck`
Expected: PASS (no frontend code uses the new endpoints; this guards against generated-name collisions).

- [ ] **Step 3: README**

Read `README.md`. Under "Open todos" replace the "Public send API" bullet with:

```md
- [ ] **Public send API UI** The backend (`POST /api/v1/send`, API keys per project, message log) is done. Key management and the message log still need UI, planned after the design rework.
```

Add a section before "Open todos":

````md
## Public send API

Create an API key on a project (`POST /api/project/:projectId/api-keys`); the full key is returned once. Send with it from any domain assigned to that project:

```bash
curl -X POST http://localhost:8000/api/v1/send \
  -H "Authorization: Bearer sdm_xxxxxxxx_…" \
  -H "Content-Type: application/json" \
  -d '{"from":"news@mail.example.com","to":"reader@example.org","subject":"Hello","html":"<p>Hi</p>"}'
```

The key may also be passed as `?key=…`, but query strings tend to end up in logs, so prefer the header. Responses: `202 { mailMessageId, status }`; errors carry a `code` (`FROM_DOMAIN_NOT_ALLOWED`, `FROM_DOMAIN_NOT_READY`, `RECIPIENT_BLOCKED`, `DELIVERY_FAILED`). Each key is limited to `PUBLIC_API_RATE_LIMIT` requests per `PUBLIC_API_RATE_TTL` ms. Every sent mail (API and inbound forms) is listed at `GET /api/project/:projectId/messages`.
````

- [ ] **Step 4: Full gate**

Run: `pnpm format:fix && pnpm check`
Expected: lint, typecheck, unit tests and format all PASS across workspaces. Then re-run `pnpm --filter backend test:e2e` if any backend file changed during formatting fixes.

- [ ] **Step 5: Hand off**

Report to the user: files changed, test results (unit + e2e counts), and that nothing was committed. Do not commit.
