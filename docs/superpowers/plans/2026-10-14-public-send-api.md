# Public Send API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let customers send email through `POST /api/v1/send` with a project-scoped API key, and record every outbound mail (API and inbound forms) in a central `mail_messages` log.

**Architecture:** A new `api-key` module owns key storage (SHA-256 hash + visible prefix), the `ApiKeyAuthGuard`, key management endpoints and the public send endpoint. The `mail` module gains a `MailMessageService` that `MailService.sendMail` uses to write a log row for every send; failures surface as `MailSendError` carrying the log row id. Inbound-form deliveries link to their log row through a new `mailMessageId` FK. The reworked ("Mail Admin") frontend gets an API keys card on the project page and a paged "Sent mail" page per project, built from the shared components in `apps/frontend/src/components/`.

**Tech Stack:** NestJS 12 (native ESM), sequelize-typescript, umzug migrations, `@nestjs/throttler` (Redis storage), `@nestjs/cache-manager`, nodemailer, class-validator/class-transformer, Vitest (SWC), supertest + Testcontainers e2e; Vue 3 + Vuetify + TanStack Query + vue-i18n frontend with Vitest (jsdom) and Playwright.

**Spec:** `docs/superpowers/specs/2026-10-14-public-send-api-design.md`

## Global Constraints

- **Never touch git.** No `git add`/commit/push. Steps that would normally commit are replaced by a verification step; the user handles version control.
- **No comments** in code (CLAUDE.md). Clear names instead.
- **Read before you write**: read each file before modifying it.
- ESM: relative imports end in `.js`. Singular model associations to classes in circular import chains use `Relation<T>` or `X | null`.
- Prettier: 4-space indent, single quotes, no semicolons, trailing commas. Run `pnpm format:fix` instead of hand-formatting.
- Test doubles: `vi.fn<Service['method']>()` held as `Mock<…>`; typed fixtures, no loose literals or `as` casts on domain data.
- Frontend follows `docs/handoff.md` (Mail Admin design): shared components only (SectionCard, ListRow, StatusBadge, TagLabel, CopyField, FormDialog, useConfirm, useNotify, EmptyState/ErrorState, skeletons, RelativeTime); what a user can't do is absent, not disabled; irreversible destructive actions use Confirm; i18n keys under `module.projects.*` in `src/locales/en.json` (no SFC i18n blocks); views go through query/mutation composables, never the SDK directly.
- Frontend tasks 10–14 were added on 2026-10-14 after the design rework landed; backend tasks 1–9 were revised the same day (migration 015, paged message log, no `@Public()` on the send route, route-access matrix entries).
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

- `apps/backend/src/migrations/015-create-api-keys-and-mail-messages.ts` — schema.
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

- Create: `apps/backend/src/migrations/015-create-api-keys-and-mail-messages.ts`
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
    - `MailMessageService.getProjectMessages(projectId: number, query: MailMessageQuery): Promise<MailMessagePage>` — `MailMessageQuery` / `MailMessagePage` are added to `mail-message.interface.ts` in this task:
        ```ts
        export interface MailMessageQuery {
            page: number
            itemsPerPage: number
            search?: string
            source?: MailMessageSource
            status?: MailMessageStatus
        }

        export interface MailMessagePage {
            items: MailMessage[]
            total: number
        }
        ```
        (Offset paging with a total mirrors `BounceService.getBounces` / `BouncePage`, which the reworked frontend drives with `VDataTableServer`.)
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
    let findAndCountAll: Mock<(options: object) => Promise<{ rows: MailMessageRow[]; count: number }>>

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
        findAndCountAll = vi.fn<typeof findAndCountAll>().mockResolvedValue({ rows: [row], count: 31 })

        const module = await Test.createTestingModule({
            providers: [
                MailMessageService,
                { provide: getModelToken(MailMessageModel), useValue: { create, update, findAndCountAll } },
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
            {
                status: MailMessageStatus.SENT,
                smtpMessageId: '<abc@mail.example.com>',
                sentAt: expect.any(Date) as Date,
            },
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

    it('pages project messages newest first with filters and a total', async () => {
        const result = await service.getProjectMessages(3, {
            page: 2,
            itemsPerPage: 10,
            source: MailMessageSource.INBOUND_FORM,
            status: MailMessageStatus.FAILED,
        })

        expect(findAndCountAll).toHaveBeenCalledWith({
            where: {
                [Op.and]: [
                    { projectId: 3 },
                    { source: MailMessageSource.INBOUND_FORM },
                    { status: MailMessageStatus.FAILED },
                ],
            },
            order: [['mailMessageId', 'DESC']],
            limit: 10,
            offset: 10,
        })
        expect(result).toEqual({ items: [message], total: 31 })
    })

    it('searches recipient and subject case-insensitively with LIKE wildcards escaped', async () => {
        await service.getProjectMessages(3, { page: 1, itemsPerPage: 25, search: ' 50%_off ' })

        expect(findAndCountAll).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    [Op.and]: [
                        { projectId: 3 },
                        {
                            [Op.or]: [
                                { emailTo: { [Op.iLike]: '%50\\%\\_off%' } },
                                { subject: { [Op.iLike]: '%50\\%\\_off%' } },
                            ],
                        },
                    ],
                },
                offset: 0,
            }),
        )
    })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter backend exec vitest run src/modules/mail/services/mail-message.service.spec.ts`
Expected: FAIL — cannot resolve `./mail-message.service.js`.

- [ ] **Step 3: Implement `MailMessageService`**

First append `MailMessageQuery` and `MailMessagePage` (exact code in this task's Interfaces block) to `mail/interfaces/mail-message.interface.ts`.

```ts
import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/sequelize'
import { Op, type WhereOptions } from 'sequelize'
import { MailMessageModel } from '../models/mail-message.model.js'
import {
    MailMessage,
    MailMessagePage,
    MailMessageQuery,
    MailMessageStatus,
} from '../interfaces/mail-message.interface.js'

export type MailMessagePending = Pick<
    MailMessage,
    'projectId' | 'source' | 'apiKeyId' | 'emailFrom' | 'emailTo' | 'subject'
>

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

    async getProjectMessages(projectId: number, query: MailMessageQuery): Promise<MailMessagePage> {
        const { rows, count } = await this.mailMessageModel.findAndCountAll({
            where: this.buildFilter(projectId, query),
            order: [['mailMessageId', 'DESC']],
            limit: query.itemsPerPage,
            offset: (query.page - 1) * query.itemsPerPage,
        })

        return { items: rows.map((row) => row.get({ plain: true })), total: count }
    }

    private buildFilter(projectId: number, query: MailMessageQuery): WhereOptions<MailMessage> {
        const conditions: WhereOptions<MailMessage>[] = [{ projectId }]

        const search = query.search?.trim()
        if (search) {
            const pattern = `%${search.replace(/[\\%_]/g, '\\$&')}%`
            conditions.push({
                [Op.or]: [{ emailTo: { [Op.iLike]: pattern } }, { subject: { [Op.iLike]: pattern } }],
            })
        }
        if (query.source) {
            conditions.push({ source: query.source })
        }
        if (query.status) {
            conditions.push({ status: query.status })
        }

        return { [Op.and]: conditions }
    }
}
```

The search escaping is the same as `BounceService.buildFilter`.

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
            const status = error instanceof EmailBlockedException ? MailMessageStatus.BLOCKED : MailMessageStatus.FAILED
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
        create = vi
            .fn<typeof create>()
            .mockImplementation((values) => Promise.resolve(rowFor({ ...record, ...values, apiKeyId: 12 })))
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
            expect(cacheSet).toHaveBeenCalledWith(
                `${API_KEY_LAST_USED_CACHE_PREFIX}11`,
                true,
                API_KEY_LAST_USED_INTERVAL_MS,
            )
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

- Consumes: `ApiKeyService.authenticate`, `ApiKeyService.touchLastUsed`, `parseApiKeyPrefix`, constants (Task 4)
- Produces:
    - `interface ApiKeyRequest { headers: { authorization?: string }; query: Record<string, unknown>; ip?: string; apiKey?: ApiKey }`
    - `extractApiKey(request: ApiKeyRequest): string | null`
    - `publicApiThrottleTracker(request: ApiKeyRequest): string`
    - `isApiKeyRoute(context: ExecutionContext): boolean`
    - `ApiKeyAuthGuard` (sets `request.apiKey`)
    - `@ApiKeyAuth()` — `SkipThrottle({ default: true })` + `UseGuards(ThrottlerGuard, ApiKeyAuthGuard)` + `SetMetadata(API_KEY_AUTH_KEY, true)` + Swagger `ApiSecurity('api-key')` + `ApiSecurity('api-key-query')`. No `@Public()`: there is no global JWT guard (JWT applies only through `@JwtAuth()`), and `route-access.spec.ts` would collapse a `@Public` route's guards to `['@Public']`, hiding the API key guard.
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

    it('marks the route as an api key route', () => {
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

`THROTTLER:SKIPdefault` is the key `route-access.spec.ts` already reads for `SetupController.getStatus`. Swagger stores `ApiSecurity` entries in decorator order — if the array comes back reversed, assert with `expect.arrayContaining` plus `toHaveLength(2)`.

`decorators/ApiKeyPrincipal.spec.ts` — mirror `Principal.spec.ts`: resolve the factory via `ROUTE_ARGS_METADATA`, assert it returns `request.apiKey` and throws `UnauthorizedException` when absent (use the `apiKey` fixture from the guard spec).

Run: `pnpm --filter backend exec vitest run src/modules/api-key/decorators` — Expected: FAIL.

- [ ] **Step 6: Implement the decorators**

`ApiKeyAuth.ts`:

```ts
import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common'
import { ApiSecurity } from '@nestjs/swagger'
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler'
import { ApiKeyAuthGuard } from '../guards/api-key-auth.guard.js'
import { API_KEY_AUTH_KEY } from '../api-key.constants.js'

export const ApiKeyAuth = () =>
    applyDecorators(
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

**Amendment (task review ruling, 2026-10-14):** prefix buckets let anyone who knows a key's (non-secret) prefix exhaust that key's budget, and rotating fake prefixes evades the limit per IP. Therefore:

- `publicApiThrottleTracker` returns `api-key:<hashApiKey(rawKey)>` for a well-formed key (each distinct secret has its own bucket; only the real secret reaches the real key's bucket) and `api-key-ip:<ip>` otherwise. Unit tests: two keys with the same prefix but different secrets get different trackers; the tracker never contains the raw secret; malformed/missing keys fall back to IP.
- A third throttler `{ name: PUBLIC_API_IP_THROTTLER /* 'publicApiIp' */, ttl: PUBLIC_API_RATE_TTL, limit: PUBLIC_API_RATE_LIMIT * PUBLIC_API_IP_LIMIT_FACTOR /* 10 */, skipIf: (context) => !isApiKeyRoute(context) }` (default IP tracker) caps per-client traffic on API-key routes. Constants live in `api-key.constants.ts`.
- `@ApiKeyAuth()` keeps `SkipThrottle({ default: true })` only; both public throttlers apply.

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
import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    ParseIntPipe,
    Post,
    SerializeOptions,
} from '@nestjs/common'
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

- [ ] **Step 3: Pin the route access**

In `src/route-access.spec.ts` import `ApiKeyController`, add it to `controllers`, and add to `expectedRoutes`:

```ts
    'GET /project/:projectId/api-keys': { guards: jwt, abilities: [], scopedByPrincipal: true },
    'POST /project/:projectId/api-keys': { guards: jwt, abilities: [], scopedByPrincipal: true },
    'DELETE /project/:projectId/api-keys/:apiKeyId': { guards: jwt, abilities: [], scopedByPrincipal: true },
```

Run: `pnpm --filter backend exec vitest run src/route-access.spec.ts` — Expected: PASS.

- [ ] **Step 4: Verify**

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

- [ ] **Step 8: Pin the route access**

In `src/route-access.spec.ts` import `PublicSendController`, add it to `controllers`, add `const apiKeyAuth = ['ThrottlerGuard', 'ApiKeyAuthGuard']` beside `jwt`/`throttled`, and add to `expectedRoutes`:

```ts
    'POST /v1/send': { guards: apiKeyAuth, abilities: [], scopedByPrincipal: true },
```

In the `route throttling` describe add:

```ts
it('moves the public send api off the default budget onto its per-key budget', () => {
    expect(throttleMetadata('SKIP', PublicSendController, 'sendMail')).toBe(true)
})
```

- [ ] **Step 9: Verify**

Run: `pnpm --filter backend exec vitest run src/modules/api-key src/modules/domain src/modules/project src/route-access.spec.ts`
Run: `pnpm --filter backend typecheck && pnpm --filter backend lint`
Expected: PASS. Do not commit.

---

### Task 8: Message log endpoint

**Files:**

- Modify: `apps/backend/src/modules/mail/mail.constants.ts` — page size constants
- Create: `apps/backend/src/modules/mail/dtos/mail-message.dto.ts`
- Create: `apps/backend/src/modules/mail/dtos/mail-message-page.dto.ts`
- Create: `apps/backend/src/modules/mail/dtos/mail-message-query.dto.ts` (+ `.spec.ts`)
- Create: `apps/backend/src/modules/mail/controller/mail-message.controller.ts`
- Modify: `apps/backend/src/modules/mail/services/mail-message.service.ts` (+ spec) — ability-checked wrapper
- Modify: `apps/backend/src/modules/mail/mail.module.ts`
- Modify: `apps/backend/src/route-access.spec.ts`

**Interfaces:**

- Consumes: `MailMessageService.getProjectMessages`, `MailMessageQuery`, `MailMessagePage` (Task 2); `assertProjectReadable`
- Produces:
    - `MailMessageService.listForProject(projectId: number, query: MailMessageQuery, ability: AppAbility): Promise<MailMessagePage>`
    - `GET /api/project/:projectId/messages?page&itemsPerPage&search&source&status` → `MailMessagePageDto { items: MailMessageDto[]; total: number }`
    - `MAIL_MESSAGE_PAGE_SIZE_DEFAULT = 25`, `MAIL_MESSAGE_PAGE_SIZE_MAX = 100` in `mail.constants.ts`

This mirrors the reworked bounce list (`BounceQueryDto`, `BouncePageDto`, `BounceService.getBounces`). Read those three files first and match them.

- [ ] **Step 1: Failing service tests**

Add to `mail-message.service.spec.ts` (import `createMongoAbility` from `@casl/ability`, `AppAbility`, `NotFoundException`):

```ts
describe('listForProject', () => {
    const reader = createMongoAbility<AppAbility>([
        { action: 'read', subject: 'Project', conditions: { projectId: { $in: [3] } } },
    ])

    it('pages the messages of a readable project', async () => {
        await expect(service.listForProject(3, { page: 1, itemsPerPage: 25 }, reader)).resolves.toEqual({
            items: [message],
            total: 31,
        })
    })

    it('hides projects the caller cannot read', async () => {
        await expect(service.listForProject(4, { page: 1, itemsPerPage: 25 }, reader)).rejects.toThrow(
            NotFoundException,
        )
        expect(findAndCountAll).not.toHaveBeenCalled()
    })
})
```

Run — Expected: FAIL. Implement in `MailMessageService` (import `assertProjectReadable` and `AppAbility`):

```ts
    async listForProject(projectId: number, query: MailMessageQuery, ability: AppAbility): Promise<MailMessagePage> {
        assertProjectReadable(ability, projectId)

        return this.getProjectMessages(projectId, query)
    }
```

Run — Expected: PASS.

- [ ] **Step 2: Query DTO (test first)**

Append to `mail.constants.ts`:

```ts
export const MAIL_MESSAGE_PAGE_SIZE_DEFAULT = 25

export const MAIL_MESSAGE_PAGE_SIZE_MAX = 100
```

`mail-message-query.dto.spec.ts`:

```ts
import 'reflect-metadata'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { describe, expect, it } from 'vitest'
import { MailMessageQueryDto } from './mail-message-query.dto.js'
import { MailMessageSource, MailMessageStatus } from '../interfaces/mail-message.interface.js'

function toQuery(plain: Record<string, string>): MailMessageQueryDto {
    return plainToInstance(MailMessageQueryDto, plain, { exposeDefaultValues: true })
}

async function violations(plain: Record<string, string>): Promise<string[]> {
    const errors = await validate(toQuery(plain))
    return [...new Set(errors.map((error) => error.property))]
}

describe('MailMessageQueryDto', () => {
    it('defaults to the first page of 25 messages', async () => {
        await expect(violations({})).resolves.toEqual([])
        expect(toQuery({})).toMatchObject({ page: 1, itemsPerPage: 25 })
    })

    it('accepts every supported filter', async () => {
        await expect(
            violations({
                page: '2',
                itemsPerPage: '100',
                search: 'reader@',
                source: MailMessageSource.API,
                status: MailMessageStatus.BLOCKED,
            }),
        ).resolves.toEqual([])
    })

    it.each([
        [{ page: '0' }, 'page'],
        [{ itemsPerPage: '101' }, 'itemsPerPage'],
        [{ source: 'smtp' }, 'source'],
        [{ status: 'queued' }, 'status'],
        [{ search: 'x'.repeat(256) }, 'search'],
    ])('rejects %j', async (plain, property) => {
        await expect(violations(plain)).resolves.toContain(property)
    })
})
```

Run: `pnpm --filter backend exec vitest run src/modules/mail/dtos` — Expected: FAIL. Then `mail-message-query.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger'
import { Expose, Type } from 'class-transformer'
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'
import { MailMessageSource, MailMessageStatus } from '../interfaces/mail-message.interface.js'
import { MAIL_MESSAGE_PAGE_SIZE_DEFAULT, MAIL_MESSAGE_PAGE_SIZE_MAX } from '../mail.constants.js'

export class MailMessageQueryDto {
    @Expose()
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @ApiProperty({ type: Number, required: false, default: 1, minimum: 1 })
    page: number = 1

    @Expose()
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(MAIL_MESSAGE_PAGE_SIZE_MAX)
    @ApiProperty({
        type: Number,
        required: false,
        default: MAIL_MESSAGE_PAGE_SIZE_DEFAULT,
        minimum: 1,
        maximum: MAIL_MESSAGE_PAGE_SIZE_MAX,
    })
    itemsPerPage: number = MAIL_MESSAGE_PAGE_SIZE_DEFAULT

    @Expose()
    @IsOptional()
    @IsString()
    @MaxLength(255)
    @ApiProperty({ type: String, required: false })
    search?: string

    @Expose()
    @IsOptional()
    @IsEnum(MailMessageSource)
    @ApiProperty({ enum: MailMessageSource, enumName: 'MailMessageSource', required: false })
    source?: MailMessageSource

    @Expose()
    @IsOptional()
    @IsEnum(MailMessageStatus)
    @ApiProperty({ enum: MailMessageStatus, enumName: 'MailMessageStatus', required: false })
    status?: MailMessageStatus
}
```

Run again — Expected: PASS.

- [ ] **Step 3: Response DTOs**

`mail-message.dto.ts`:

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

    static fromMailMessage(message: MailMessage): MailMessageDto {
        return {
            mailMessageId: message.mailMessageId,
            source: message.source,
            apiKeyId: message.apiKeyId,
            emailFrom: message.emailFrom,
            emailTo: message.emailTo,
            subject: message.subject,
            status: message.status,
            error: message.error,
            sentAt: message.sentAt,
            createdAt: message.createdAt,
        }
    }
}
```

`mail-message-page.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger'
import { Expose, Type } from 'class-transformer'
import { MailMessagePage } from '../interfaces/mail-message.interface.js'
import { MailMessageDto } from './mail-message.dto.js'

export class MailMessagePageDto {
    @Expose()
    @Type(() => MailMessageDto)
    @ApiProperty({ type: [MailMessageDto] })
    items!: MailMessageDto[]

    @Expose()
    @ApiProperty({ type: Number })
    total!: number

    static fromMailMessagePage(page: MailMessagePage): MailMessagePageDto {
        return {
            items: page.items.map((message) => MailMessageDto.fromMailMessage(message)),
            total: page.total,
        }
    }
}
```

- [ ] **Step 4: Controller**

```ts
import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { JwtAuth } from '../../auth/decorators/JwtAuth.js'
import { CurrentAbility } from '../../permission/decorators/CurrentAbility.js'
import type { AppAbility } from '../../permission/interfaces/app-ability.js'
import { ResponseDto } from '../../../decorators/ResponseDto.js'
import { MailMessageService } from '../services/mail-message.service.js'
import { MailMessagePageDto } from '../dtos/mail-message-page.dto.js'
import { MailMessageQueryDto } from '../dtos/mail-message-query.dto.js'

@JwtAuth()
@ApiTags('mail-message')
@Controller('project/:projectId/messages')
export class MailMessageController {
    constructor(private readonly mailMessageService: MailMessageService) {}

    @ResponseDto(MailMessagePageDto)
    @Get()
    async getProjectMessages(
        @Param('projectId', ParseIntPipe) projectId: number,
        @Query() query: MailMessageQueryDto,
        @CurrentAbility() ability: AppAbility,
    ): Promise<MailMessagePageDto> {
        const page = await this.mailMessageService.listForProject(
            projectId,
            {
                page: query.page,
                itemsPerPage: query.itemsPerPage,
                search: query.search,
                source: query.source,
                status: query.status,
            },
            ability,
        )

        return MailMessagePageDto.fromMailMessagePage(page)
    }
}
```

Add `controllers: [MailMessageController]` to `mail.module.ts`.

- [ ] **Step 5: Pin the route access**

In `src/route-access.spec.ts` import `MailMessageController`, add it to `controllers`, and add to `expectedRoutes`:

```ts
    'GET /project/:projectId/messages': { guards: jwt, abilities: [], scopedByPrincipal: true },
```

- [ ] **Step 6: Verify**

Run: `pnpm --filter backend exec vitest run src/modules/mail src/route-access.spec.ts`
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

    async function messagePage(query = ''): Promise<{ items: MessageBody[]; total: number }> {
        const response = await http()
            .get(`/api/project/${projectId}/messages${query}`)
            .set('Authorization', asOwner())
            .expect(200)
        return response.body as { items: MessageBody[]; total: number }
    }

    async function messages(query = ''): Promise<MessageBody[]> {
        return (await messagePage(query)).items
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

            const list = await http()
                .get(`/api/project/${projectId}/api-keys`)
                .set('Authorization', asOwner())
                .expect(200)
            const listed = (list.body as ApiKeyBody[]).find((apiKey) => apiKey.apiKeyId === apiKeyId)!
            expect(listed.prefix).toBe(key.slice(0, 12))
            expect(listed).not.toHaveProperty('key')
            expect(listed).not.toHaveProperty('secretHash')
        })

        it('lets readers list but not create or revoke keys', async () => {
            await http()
                .get(`/api/project/${projectId}/api-keys`)
                .set('Authorization', `Bearer ${readerToken}`)
                .expect(200)
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
            const response = await send({
                from,
                to: 'reader1@psa-e2e.test',
                subject: 'Hello',
                html: '<p>Hi</p>',
                text: 'Hi',
            }).expect(202)
            const { mailMessageId, status } = response.body as { mailMessageId: number; status: string }
            expect(status).toBe('sent')

            const [delivered] = await waitForMessagesTo(mailhogUrl, 'reader1@psa-e2e.test')
            expect(delivered).toBeDefined()

            const logged = (await messages()).find((message) => message.mailMessageId === mailMessageId)!
            expect(logged).toEqual(
                expect.objectContaining({ source: 'api', apiKeyId, emailTo: 'reader1@psa-e2e.test', status: 'sent' }),
            )

            const list = await http()
                .get(`/api/project/${projectId}/api-keys`)
                .set('Authorization', asOwner())
                .expect(200)
            expect(
                (list.body as ApiKeyBody[]).find((apiKey) => apiKey.apiKeyId === apiKeyId)!.lastUsedAt,
            ).not.toBeNull()
        })

        it('accepts the key as a query parameter', async () => {
            await http()
                .post(`/api/v1/send?key=${encodeURIComponent(key)}`)
                .send({ from, to: 'reader2@psa-e2e.test', subject: 'Hello', html: '<p>Hi</p>' })
                .expect(202)
        })

        it('accepts a mixed-case from domain', async () => {
            await send({
                from: 'News@Send.PSA-Example.com',
                to: 'reader3@psa-e2e.test',
                subject: 'Hi',
                html: '<p>x</p>',
            }).expect(202)
        })

        it('accepts an html body larger than the default json limit', async () => {
            await send({
                from,
                to: 'reader4@psa-e2e.test',
                subject: 'Big',
                html: `<p>${'x'.repeat(200_000)}</p>`,
            }).expect(202)
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

            const logged = (await messages('?status=blocked')).find(
                (message) => message.mailMessageId === body.mailMessageId,
            )
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
        it('pages newest first with a total', async () => {
            const first = await messagePage('?itemsPerPage=1')
            const second = await messagePage('?itemsPerPage=1&page=2')

            expect(first.items).toHaveLength(1)
            expect(first.total).toBeGreaterThan(1)
            expect(second.total).toBe(first.total)
            expect(second.items[0]!.mailMessageId).toBeLessThan(first.items[0]!.mailMessageId)
        })

        it('filters by source and searches the recipient', async () => {
            const found = await messages('?source=api&search=reader1%40psa')

            expect(found.map((message) => message.emailTo)).toEqual(['reader1@psa-e2e.test'])
        })

        it('rejects an oversized page', async () => {
            await http()
                .get(`/api/project/${projectId}/messages?itemsPerPage=101`)
                .set('Authorization', asOwner())
                .expect(400)
        })

        it('hides the log of projects the caller cannot read', async () => {
            await http()
                .get(`/api/project/${otherProjectId}/messages`)
                .set('Authorization', `Bearer ${readerToken}`)
                .expect(404)
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

        it('throttles a key after the configured limit without letting forged secrets of its prefix drain it', async () => {
            const limited = await createKey('Limited')
            const forged = `${limited.prefix}_${'A'.repeat(43)}`
            const invalidBody = { from, to: 'not-an-address', subject: 'x', html: 'x' }

            const forgedStatuses: number[] = []
            for (let attempt = 0; attempt <= 60; attempt++) {
                forgedStatuses.push((await send(invalidBody, forged)).status)
            }
            expect(forgedStatuses.slice(0, 60)).not.toContain(429)
            expect(forgedStatuses[60]).toBe(429)

            const realStatuses: number[] = []
            for (let attempt = 0; attempt <= 60; attempt++) {
                realStatuses.push((await send(invalidBody, limited.key!)).status)
            }
            expect(realStatuses.slice(0, 60)).toEqual(Array<number>(60).fill(400))
            expect(realStatuses[60]).toBe(429)
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

### Task 10: API client regeneration

**Files:**

- Modify: `packages/api/assets/openapi.json` (generated)
- Regenerated: `packages/api/dist/**`

**Interfaces:**

- Produces (names the frontend tasks rely on; verify them in `packages/api/dist/sdk.gen.ts` / `types.gen.ts` and report the exact names if any differ):
    - `ApiKeyApi.getApiKeys({ path: { projectId } }): Promise<ApiKeyDto[]>`
    - `ApiKeyApi.createApiKey({ path: { projectId }, body: { name } }): Promise<ApiKeyCreatedDto>`
    - `ApiKeyApi.revokeApiKey({ path: { projectId, apiKeyId } }): Promise<void>`
    - `MailMessageApi.getProjectMessages({ path: { projectId }, query }): Promise<MailMessagePageDto>`; `GetProjectMessagesData['query']`
    - `PublicSendApi.sendMail(...)`
    - types `ApiKeyDto`, `ApiKeyCreatedDto`, `MailMessageDto`, `MailMessagePageDto`, enums `MailMessageSource` / `MailMessageStatus` (as string-literal unions)

- [ ] **Step 1: Regenerate the client**

Run: `pnpm --filter backend generate && pnpm --filter api build`
Expected: the SDK classes and types above exist. Inspect `openapi.json`: `apiKeyId`, `createdByUserId`, `lastUsedAt`, `revokedAt`, `sentAt`, `error` must be nullable primitives, not `object` (add `@ApiProperty` in the DTO where they are, then regenerate). Dates must be transformed to `Date` by the generated transformers (check `transformers.gen.ts` has entries for `ApiKeyDto` and `MailMessageDto`).

- [ ] **Step 2: Frontend still compiles**

Run: `pnpm --filter frontend typecheck`
Expected: PASS. Do not commit.

---

### Task 11: Frontend data layer — API key and message composables

**Files:**

- Create: `apps/frontend/src/modules/projects/queries/useApiKeysQuery.ts`
- Create: `apps/frontend/src/modules/projects/queries/useProjectMessagesQuery.ts`
- Create: `apps/frontend/src/modules/projects/mutations/useApiKeyCreateMutation.ts`
- Create: `apps/frontend/src/modules/projects/mutations/useApiKeyRevokeMutation.ts`
- Create: `apps/frontend/src/modules/projects/queries/__tests__/useApiKeysQuery.spec.ts`
- Create: `apps/frontend/src/modules/projects/queries/__tests__/useProjectMessagesQuery.spec.ts`
- Create: `apps/frontend/src/modules/projects/mutations/__tests__/useApiKeyMutations.spec.ts`
- Modify: `apps/frontend/src/__tests__/fixtures.ts` — `apiKey()`, `apiKeyCreated()`, `mailMessage()` fixtures

**Interfaces:**

- Consumes: the SDK from Task 10.
- Produces:
    - `useApiKeysQuery(projectId: MaybeRefOrGetter<number>)` → `queryOptions`, key `['projects', projectId, 'apiKeys']`
    - `type ProjectMessageQuery = NonNullable<GetProjectMessagesData['query']>`
    - `useProjectMessagesQuery(projectId: MaybeRefOrGetter<number>, query: MaybeRefOrGetter<ProjectMessageQuery> = {})` → `queryOptions`, key `['projects', projectId, 'messages', query]`, `placeholderData: keepPreviousData`
    - `useApiKeyCreateMutation()` → `mutateAsync({ projectId, name }): Promise<ApiKeyCreatedDto>`; invalidates `['projects', projectId, 'apiKeys']`
    - `useApiKeyRevokeMutation()` → `mutateAsync({ projectId, apiKeyId }): Promise<void>`; invalidates `['projects', projectId, 'apiKeys']`
    - fixtures `apiKey(overrides?: Partial<ApiKeyDto>): ApiKeyDto`, `apiKeyCreated(overrides?: Partial<ApiKeyCreatedDto>): ApiKeyCreatedDto`, `mailMessage(overrides?: Partial<MailMessageDto>): MailMessageDto`

Follow `useProjectMembersQuery.ts`, `useBouncesQuery.ts`, `useProjectMemberRemoveMutation.ts` and `useProjectCreateMutation.ts` exactly (read them first).

- [ ] **Step 1: Fixtures**

Read `src/__tests__/fixtures.ts` and add, in its style:

```ts
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
```

The `key` above is 4 + 8 + 1 + 43 chars like a real key; adjust the literal if the generated `source`/`status` types are enums rather than string unions.

- [ ] **Step 2: Failing specs**

`queries/__tests__/useApiKeysQuery.spec.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useQuery } from '@tanstack/vue-query'
import { ApiKeyApi } from 'api'
import { useApiKeysQuery } from '../useApiKeysQuery.ts'
import { withVueQuery } from '@/__tests__/support.ts'
import { apiKey } from '@/__tests__/fixtures.ts'

afterEach(() => {
    vi.restoreAllMocks()
})

describe('useApiKeysQuery', () => {
    it('loads the keys nested under the project key', async () => {
        const keys = [apiKey()]
        const listSpy = vi.spyOn(ApiKeyApi, 'getApiKeys').mockResolvedValue(keys)
        const { result, queryClient, unmount } = withVueQuery(() => useQuery(useApiKeysQuery(1)))

        await vi.waitFor(() => expect(result.isSuccess.value).toBe(true))

        expect(listSpy).toHaveBeenCalledWith({ path: { projectId: 1 } })
        expect(queryClient.getQueryData(['projects', 1, 'apiKeys'])).toEqual(keys)
        unmount()
    })
})
```

`queries/__tests__/useProjectMessagesQuery.spec.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { MailMessageApi } from 'api'
import { useProjectMessagesQuery, type ProjectMessageQuery } from '../useProjectMessagesQuery.ts'
import { withVueQuery } from '@/__tests__/support.ts'
import { mailMessage } from '@/__tests__/fixtures.ts'

afterEach(() => {
    vi.restoreAllMocks()
})

describe('useProjectMessagesQuery', () => {
    it('requests the given page and filters for the project', async () => {
        const page = { items: [mailMessage()], total: 1 }
        const getSpy = vi.spyOn(MailMessageApi, 'getProjectMessages').mockResolvedValue(page)
        const query: ProjectMessageQuery = { page: 2, itemsPerPage: 25, status: 'failed' }
        const { result, unmount } = withVueQuery(() => useQuery(useProjectMessagesQuery(1, query)))

        await vi.waitFor(() => expect(result.data.value).toEqual(page))

        expect(getSpy).toHaveBeenCalledWith({ path: { projectId: 1 }, query })
        unmount()
    })

    it('keeps the previous page visible while the next one loads', async () => {
        const getSpy = vi
            .spyOn(MailMessageApi, 'getProjectMessages')
            .mockResolvedValueOnce({ items: [mailMessage()], total: 30 })
            .mockReturnValueOnce(new Promise(() => undefined))
        const query = ref<ProjectMessageQuery>({ page: 1, itemsPerPage: 25 })
        const { result, unmount } = withVueQuery(() => useQuery(useProjectMessagesQuery(1, query)))
        await vi.waitFor(() => expect(result.data.value?.total).toBe(30))

        query.value = { page: 2, itemsPerPage: 25 }

        await vi.waitFor(() => expect(getSpy).toHaveBeenCalledTimes(2))
        expect(result.data.value?.total).toBe(30)
        unmount()
    })
})
```

`mutations/__tests__/useApiKeyMutations.spec.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiKeyApi } from 'api'
import { useApiKeyCreateMutation } from '../useApiKeyCreateMutation.ts'
import { useApiKeyRevokeMutation } from '../useApiKeyRevokeMutation.ts'
import { withVueQuery } from '@/__tests__/support.ts'
import { apiKeyCreated } from '@/__tests__/fixtures.ts'

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

afterEach(() => {
    vi.restoreAllMocks()
})

describe('useApiKeyCreateMutation', () => {
    it('creates the key, returns it once and refreshes the key list', async () => {
        const created = apiKeyCreated()
        const createSpy = vi.spyOn(ApiKeyApi, 'createApiKey').mockResolvedValue(created)
        const { result, queryClient, unmount } = withVueQuery(() => useApiKeyCreateMutation())
        const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

        await expect(result.mutateAsync({ projectId: 1, name: 'Newsletter' })).resolves.toEqual(created)

        expect(createSpy).toHaveBeenCalledWith({ path: { projectId: 1 }, body: { name: 'Newsletter' } })
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['projects', 1, 'apiKeys'] })
        unmount()
    })

    it('does not refresh when creating fails', async () => {
        vi.spyOn(ApiKeyApi, 'createApiKey').mockRejectedValue(new Error('Forbidden'))
        const { result, queryClient, unmount } = withVueQuery(() => useApiKeyCreateMutation())
        const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

        await expect(result.mutateAsync({ projectId: 1, name: 'x' })).rejects.toThrow('Forbidden')

        expect(invalidateSpy).not.toHaveBeenCalled()
        unmount()
    })
})

describe('useApiKeyRevokeMutation', () => {
    it('revokes the key and refreshes the key list', async () => {
        const revokeSpy = vi.spyOn(ApiKeyApi, 'revokeApiKey').mockResolvedValue(undefined)
        const { result, queryClient, unmount } = withVueQuery(() => useApiKeyRevokeMutation())
        const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

        await result.mutateAsync({ projectId: 1, apiKeyId: 11 })

        expect(revokeSpy).toHaveBeenCalledWith({ path: { projectId: 1, apiKeyId: 11 } })
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['projects', 1, 'apiKeys'] })
        unmount()
    })
})
```

Run: `pnpm --filter frontend exec vitest run src/modules/projects/queries src/modules/projects/mutations`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`useApiKeysQuery.ts`:

```ts
import { type MaybeRefOrGetter, toValue } from 'vue'
import { queryOptions } from '@tanstack/vue-query'
import { ApiKeyApi } from 'api'

export function useApiKeysQuery(projectId: MaybeRefOrGetter<number>) {
    return queryOptions({
        queryKey: ['projects', projectId, 'apiKeys'],
        queryFn: () =>
            ApiKeyApi.getApiKeys({
                path: {
                    projectId: toValue(projectId),
                },
            }),
    })
}
```

`useProjectMessagesQuery.ts`:

```ts
import { type MaybeRefOrGetter, toValue } from 'vue'
import { keepPreviousData, queryOptions } from '@tanstack/vue-query'
import { MailMessageApi, type GetProjectMessagesData } from 'api'

export type ProjectMessageQuery = NonNullable<GetProjectMessagesData['query']>

export function useProjectMessagesQuery(
    projectId: MaybeRefOrGetter<number>,
    query: MaybeRefOrGetter<ProjectMessageQuery> = {},
) {
    return queryOptions({
        queryKey: ['projects', projectId, 'messages', query],
        queryFn: () =>
            MailMessageApi.getProjectMessages({
                path: { projectId: toValue(projectId) },
                query: toValue(query),
            }),
        placeholderData: keepPreviousData,
    })
}
```

`useApiKeyCreateMutation.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { ApiKeyApi } from 'api'
import { waitAtleast } from '@/helper/waitAtleast.ts'

export function useApiKeyCreateMutation() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: ({ projectId, name }: { projectId: number; name: string }) =>
            waitAtleast(ApiKeyApi.createApiKey({ path: { projectId }, body: { name } })),
        onSuccess(_, { projectId }) {
            return client.invalidateQueries({ queryKey: ['projects', projectId, 'apiKeys'] })
        },
    })
}
```

`useApiKeyRevokeMutation.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { ApiKeyApi } from 'api'

export function useApiKeyRevokeMutation() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: ({ projectId, apiKeyId }: { projectId: number; apiKeyId: number }) =>
            ApiKeyApi.revokeApiKey({ path: { projectId, apiKeyId } }),
        onSuccess(_, { projectId }) {
            return client.invalidateQueries({ queryKey: ['projects', projectId, 'apiKeys'] })
        },
    })
}
```

The member query key puts the raw ref/getter into the key (`['projects', projectId, 'members']`) — mirror that so the `['projects']` invalidation refreshes these lists too.

- [ ] **Step 4: Run**

Run: `pnpm --filter frontend exec vitest run src/modules/projects/queries src/modules/projects/mutations`
Expected: PASS.
Run: `pnpm --filter frontend typecheck && pnpm --filter frontend lint` — Expected: no new errors. Do not commit.

---

### Task 12: API keys card on the project page

**Files:**

- Create: `apps/frontend/src/modules/projects/views/details/partials/ProjectApiKeysCard.vue`
- Create: `apps/frontend/src/modules/projects/views/details/partials/ApiKeyCreateDialog.vue`
- Create: `apps/frontend/src/modules/projects/views/details/partials/ApiKeyRevealDialog.vue`
- Create: `apps/frontend/src/modules/projects/views/details/__tests__/ProjectApiKeysCard.spec.ts`
- Create: `apps/frontend/src/modules/projects/views/details/__tests__/ApiKeyCreateDialog.spec.ts`
- Modify: `apps/frontend/src/modules/projects/views/details/ProjectDetailView.vue` (+ its spec)
- Modify: `apps/frontend/src/locales/en.json` — `module.projects.apiKeys.*`

**Interfaces:**

- Consumes: Task 11 composables and fixtures; components `SectionCard`, `ListRow`, `StatusBadge`, `RelativeTime`, `IconButton`, `EmptyState`, `ErrorState`, `ListSkeleton`, `FormDialog`, `CopyField`, `InlineAlert`; composables `useConfirm`, `useNotify`, `useRequiredLabel`; helper `apiErrorMessage`.
- Produces: `<ProjectApiKeysCard :project="project" :can-update="canUpdate" />` rendered on the project page between Members and General.

**Design (Mail Admin rules applied):**

- Card title "API keys", description "Keys let your apps send mail from this project's sender domains." Count = active keys.
- Readers see the list; "New API key" (header action, `size="small"`, `mdiPlus`) and the revoke `IconButton` only render when `canUpdate` ("What the user can't do is absent").
- Row: `ListRow` with `icon` `mdiKeyVariant`, title = key name, subtitle = prefix in mono (`monoTitle` is for the title, so render the subtitle via `#subtitle` with `class="mono"`), `#meta` = `StatusBadge tone="neutral" :label="Revoked"` for revoked keys, otherwise "Last used" + `<RelativeTime>` or "Never used" in `ink-muted`.
- Revoked keys stay listed (audit trail) with no actions and `lead-tone="none"`; active keys first, then revoked, each newest first.
- Revoking cannot be undone, so it uses **Confirm** (not Undo): `useConfirm({ title: 'Revoke “{name}”?', body: 'Apps using this key stop sending immediately. This can't be undone.', confirmLabel: 'Revoke key', destructive: true, errorText, action })`, then `notify.success('“{name}” revoked')`.
- Create flow: `ApiKeyCreateDialog` (FormDialog, width `sm`, one required `name` field, max 100 chars, submit "Create key"). On success it closes and the card opens `ApiKeyRevealDialog` with the created key.
- `ApiKeyRevealDialog`: shows the key once — `InlineAlert tone="warning"` "Copy this key now. You won't be able to see it again.", `CopyField :value="key" label="API key"`, a short usage hint ("Send it as `Authorization: Bearer <key>` to `POST /api/v1/send`."), and a single primary "Done" button. It is `persistent` (no outside-click close) so the key isn't lost by accident; closing clears the key from memory. FormDialog's footer is fixed to Cancel + submit, so build this one on `VDialog` + `VCard` with the same width class and header/footer markup as `FormDialog.vue` (read it and copy its structure and classes; reuse its `dialog-sm` width).
- Empty state: `EmptyState` icon `mdiKeyOutline`, title "No API keys yet", text "Create a key to send mail from your own app." (for readers without update: same title, text "Ask someone with update access to create one.").

- [ ] **Step 1: i18n keys**

Add under `module.projects` (sibling of `members`), matching the plural format used elsewhere:

```json
"apiKeys": {
    "title": "API keys",
    "description": "Keys let your apps send mail from this project's sender domains.",
    "add": "New API key",
    "thing": "API keys",
    "prefix": "Key {prefix}…",
    "lastUsed": "Last used",
    "neverUsed": "Never used",
    "revoked": "Revoked",
    "revokeLabel": "Revoke {name}",
    "confirmTitle": "Revoke “{name}”?",
    "confirmBody": "Apps using this key stop sending immediately. This can't be undone.",
    "confirm": "Revoke key",
    "revokedDone": "“{name}” revoked",
    "revokeError": "Couldn't revoke “{name}”",
    "empty": {
        "title": "No API keys yet",
        "text": "Create a key to send mail from your own app.",
        "textReadOnly": "Ask someone with update access to create one."
    },
    "dialog": {
        "title": "New API key",
        "intro": "Name the key after the app that will use it.",
        "name": "Name",
        "nameRequired": "Enter a name",
        "submit": "Create key",
        "error": "Couldn't create the key"
    },
    "reveal": {
        "title": "Copy your API key",
        "warning": "Copy this key now. You won't be able to see it again.",
        "field": "API key",
        "usage": "Send it as Authorization: Bearer <key> to POST /api/v1/send.",
        "done": "Done"
    },
    "created": "“{name}” created"
}
```

Check whether `cta` already has a "Done" key and reuse it instead of `reveal.done` if so. Check vue-i18n escaping for `<key>` and `{`/`}`/`@`/`|` in messages (the usage string has `<`/`>` only, which are fine; avoid literal `{`).

- [ ] **Step 2: Failing card spec**

`__tests__/ProjectApiKeysCard.spec.ts` (mirror `ProjectMembersCard.spec.ts` / `ProjectDangerZone.spec.ts` / `ProjectDomainsCard.spec.ts` — read them first):

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiKeyApi } from 'api'
import ProjectApiKeysCard from '../partials/ProjectApiKeysCard.vue'
import { findButton, mountInApp, overlayButton, overlayText } from '@/__tests__/support.ts'
import { apiKey, apiKeyCreated, projectDetail } from '@/__tests__/fixtures.ts'
import { useNotificationHost } from '@/composables/useNotify.ts'

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))
vi.stubGlobal('visualViewport', null)

const notifications = useNotificationHost()

afterEach(() => {
    vi.restoreAllMocks()
    notifications.dismiss()
    document.body.innerHTML = ''
})

describe('ProjectApiKeysCard', () => {
    it('lists active keys before revoked ones with their prefix and usage', async () => {
        vi.spyOn(ApiKeyApi, 'getApiKeys').mockResolvedValue([
            apiKey({
                apiKeyId: 12,
                name: 'Old shop',
                prefix: 'sdm_OLDOLDOL',
                revokedAt: new Date('2026-10-02T10:00:00Z'),
            }),
            apiKey({ apiKeyId: 11, name: 'Newsletter', lastUsedAt: null }),
        ])
        const wrapper = mountInApp(ProjectApiKeysCard, { project: projectDetail(), canUpdate: true })

        await vi.waitFor(() => expect(wrapper.text()).toContain('Newsletter'))
        const text = wrapper.text()
        expect(text.indexOf('Newsletter')).toBeLessThan(text.indexOf('Old shop'))
        expect(text).toContain('sdm_a1B2c3D4')
        expect(text).toContain('Never used')
        expect(text).toContain('Revoked')
        expect(wrapper.find('button[aria-label="Revoke Old shop"]').exists()).toBe(false)
    })

    it('hides create and revoke for read-only members', async () => {
        vi.spyOn(ApiKeyApi, 'getApiKeys').mockResolvedValue([apiKey()])
        const wrapper = mountInApp(ProjectApiKeysCard, { project: projectDetail(), canUpdate: false })

        await vi.waitFor(() => expect(wrapper.text()).toContain('Newsletter'))
        expect(findButton(wrapper, 'New API key')).toBeUndefined()
        expect(wrapper.find('button[aria-label="Revoke Newsletter"]').exists()).toBe(false)
    })

    it('revokes a key after confirmation', async () => {
        vi.spyOn(ApiKeyApi, 'getApiKeys').mockResolvedValue([apiKey()])
        const revokeSpy = vi.spyOn(ApiKeyApi, 'revokeApiKey').mockResolvedValue(undefined)
        const wrapper = mountInApp(ProjectApiKeysCard, { project: projectDetail(), canUpdate: true })
        await vi.waitFor(() => expect(wrapper.text()).toContain('Newsletter'))

        await wrapper.get('button[aria-label="Revoke Newsletter"]').trigger('click')
        await vi.waitFor(() => expect(overlayText()).toContain('Revoke “Newsletter”?'))
        overlayButton('Revoke key').click()

        await vi.waitFor(() => expect(revokeSpy).toHaveBeenCalledWith({ path: { projectId: 1, apiKeyId: 11 } }))
        await vi.waitFor(() => expect(notifications.current.value?.text).toBe('“Newsletter” revoked'))
    })

    it('keeps the key when revoking is cancelled', async () => {
        vi.spyOn(ApiKeyApi, 'getApiKeys').mockResolvedValue([apiKey()])
        const revokeSpy = vi.spyOn(ApiKeyApi, 'revokeApiKey').mockResolvedValue(undefined)
        const wrapper = mountInApp(ProjectApiKeysCard, { project: projectDetail(), canUpdate: true })
        await vi.waitFor(() => expect(wrapper.text()).toContain('Newsletter'))

        await wrapper.get('button[aria-label="Revoke Newsletter"]').trigger('click')
        await vi.waitFor(() => expect(overlayText()).toContain('Revoke “Newsletter”?'))
        overlayButton('Cancel').click()

        await vi.waitFor(() => expect(document.body.querySelector('.confirm-dialog')).toBeNull())
        expect(revokeSpy).not.toHaveBeenCalled()
    })

    it('creates a key and shows it exactly once', async () => {
        vi.spyOn(ApiKeyApi, 'getApiKeys').mockResolvedValue([])
        const created = apiKeyCreated()
        vi.spyOn(ApiKeyApi, 'createApiKey').mockResolvedValue(created)
        const wrapper = mountInApp(ProjectApiKeysCard, { project: projectDetail(), canUpdate: true })
        await vi.waitFor(() => expect(wrapper.text()).toContain('No API keys yet'))

        await findButton(wrapper, 'New API key')!.trigger('click')
        await vi.waitFor(() => expect(overlayText()).toContain('Name the key'))
        await setOverlayInput('name', 'Newsletter')
        submitOverlayForm()

        await vi.waitFor(() => expect(overlayText()).toContain("You won't be able to see it again."))
        expect(overlayText()).toContain(created.key)
        overlayButton('Done').click()
        await vi.waitFor(() => expect(overlayText()).not.toContain(created.key))
    })

    it('explains an empty list', async () => {
        vi.spyOn(ApiKeyApi, 'getApiKeys').mockResolvedValue([])
        const wrapper = mountInApp(ProjectApiKeysCard, { project: projectDetail(), canUpdate: false })

        await vi.waitFor(() => expect(wrapper.text()).toContain('No API keys yet'))
        expect(wrapper.text()).toContain('Ask someone with update access to create one.')
    })
})
```

Add `setOverlayInput`, `submitOverlayForm` to the support import. `CopyField` may mask or clamp long values — if `overlayText()` does not contain the full key, assert on the `CopyField` value instead (read `CopyField.vue` and its spec for how its value is exposed) and do not pass `secret`.

`__tests__/ApiKeyCreateDialog.spec.ts` (mirror the dialog specs using `mountDialog`):

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiKeyApi } from 'api'
import ApiKeyCreateDialog from '../partials/ApiKeyCreateDialog.vue'
import { mountDialog, overlayText, setOverlayInput, submitOverlayForm } from '@/__tests__/support.ts'
import { apiKeyCreated, projectDetail } from '@/__tests__/fixtures.ts'

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))
vi.stubGlobal('visualViewport', null)

afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
})

describe('ApiKeyCreateDialog', () => {
    it('requires a name', async () => {
        const createSpy = vi.spyOn(ApiKeyApi, 'createApiKey')
        const { wrapper } = mountDialog(ApiKeyCreateDialog, { project: projectDetail() })
        await vi.waitFor(() => expect(overlayText()).toContain('New API key'))

        submitOverlayForm()

        await vi.waitFor(() => expect(overlayText()).toContain('Enter a name'))
        expect(createSpy).not.toHaveBeenCalled()
        wrapper.unmount()
    })

    it('emits the created key and closes', async () => {
        const created = apiKeyCreated()
        vi.spyOn(ApiKeyApi, 'createApiKey').mockResolvedValue(created)
        const { wrapper, open } = mountDialog(ApiKeyCreateDialog, { project: projectDetail() })
        await vi.waitFor(() => expect(overlayText()).toContain('New API key'))

        await setOverlayInput('name', '  Newsletter  ')
        submitOverlayForm()

        await vi.waitFor(() => expect(open.value).toBe(false))
        expect(ApiKeyApi.createApiKey).toHaveBeenCalledWith({ path: { projectId: 1 }, body: { name: 'Newsletter' } })
        expect(wrapper.findComponent(ApiKeyCreateDialog).emitted('created')).toEqual([[created]])
    })

    it('shows the server error inside the dialog', async () => {
        vi.spyOn(ApiKeyApi, 'createApiKey').mockRejectedValue({ message: 'Missing project permission' })
        const { open } = mountDialog(ApiKeyCreateDialog, { project: projectDetail() })
        await vi.waitFor(() => expect(overlayText()).toContain('New API key'))

        await setOverlayInput('name', 'Newsletter')
        submitOverlayForm()

        await vi.waitFor(() => expect(overlayText()).toContain('Missing project permission'))
        expect(open.value).toBe(true)
    })
})
```

Adjust to the exact `mountDialog` contract (read `support.ts`) — e.g. how emitted events are reached.

Run: `pnpm --filter frontend exec vitest run src/modules/projects/views/details` — Expected: FAIL (components missing).

- [ ] **Step 3: `ApiKeyCreateDialog.vue`**

```vue
<template>
    <FormDialog
        v-model="model"
        width="sm"
        :title="t('module.projects.apiKeys.dialog.title')"
        :submit-label="t('module.projects.apiKeys.dialog.submit')"
        :pending="isPending"
        :error="errorMessage"
        :dirty="name.trim() !== ''"
        @submit="onSubmit"
    >
        <p>{{ t('module.projects.apiKeys.dialog.intro') }}</p>
        <VTextField
            v-model="name"
            name="name"
            :label="requiredLabel(t('module.projects.apiKeys.dialog.name'))"
            :error-messages="fieldError"
            maxlength="100"
            aria-required="true"
        />
    </FormDialog>
</template>

<script setup lang="ts">
    import { ref, watch } from 'vue'
    import { useI18n } from 'vue-i18n'
    import type { ApiKeyCreatedDto, ProjectDetailDto } from 'api'
    import FormDialog from '@/components/FormDialog.vue'
    import { useRequiredLabel } from '@/composables/useRequiredLabel.ts'
    import { apiErrorMessage } from '@/helper/apiErrorMessage.ts'
    import { useApiKeyCreateMutation } from '@/modules/projects/mutations/useApiKeyCreateMutation.ts'

    const props = defineProps<{ project: ProjectDetailDto }>()
    const emit = defineEmits<{ created: [apiKey: ApiKeyCreatedDto] }>()
    const model = defineModel<boolean>({ required: true })

    const { t } = useI18n()
    const requiredLabel = useRequiredLabel()
    const { mutateAsync, isPending } = useApiKeyCreateMutation()

    const name = ref('')
    const fieldError = ref<string | undefined>()
    const errorMessage = ref<string | null>(null)

    watch(
        model,
        (open) => {
            if (open) {
                name.value = ''
                fieldError.value = undefined
                errorMessage.value = null
            }
        },
        { immediate: true },
    )

    async function onSubmit() {
        fieldError.value = undefined
        errorMessage.value = null
        const trimmed = name.value.trim()
        if (!trimmed) {
            fieldError.value = t('module.projects.apiKeys.dialog.nameRequired')
            return
        }
        try {
            const created = await mutateAsync({ projectId: props.project.projectId, name: trimmed })
            model.value = false
            emit('created', created)
        } catch (error) {
            errorMessage.value = apiErrorMessage(error, t('module.projects.apiKeys.dialog.error'))
        }
    }
</script>
```

Check the exact import paths of `useRequiredLabel` and `apiErrorMessage` (`src/composables/`, `src/helper/`) and the dialog-field conventions in `AssignDomainDialog.vue`.

- [ ] **Step 4: `ApiKeyRevealDialog.vue`**

Props/model: `defineProps<{ apiKey: ApiKeyCreatedDto | null }>()`, `const model = defineModel<boolean>({ required: true })`, emits nothing. Template, built from `FormDialog.vue`'s markup (copy its `VDialog` attributes — `persistent`, fullscreen on xs, width class for `sm` — and its card header/body/footer classes):

```vue
<template>
    <VDialog v-model="model" persistent :fullscreen="xs" :class="/* same width class FormDialog uses for sm */">
        <VCard v-if="apiKey">
            <!-- header: same title element/classes as FormDialog -->
            {{ t('module.projects.apiKeys.reveal.title') }}
            <!-- body -->
            <InlineAlert tone="warning" :text="t('module.projects.apiKeys.reveal.warning')" />
            <CopyField :value="apiKey.key" :label="t('module.projects.apiKeys.reveal.field')" />
            <p class="text-ink-muted">{{ t('module.projects.apiKeys.reveal.usage') }}</p>
            <!-- footer: single primary button -->
            <VBtn
                color="primary"
                variant="flat"
                :text="t('module.projects.apiKeys.reveal.done')"
                @click="model = false"
            />
        </VCard>
    </VDialog>
</template>
```

The HTML comments above are placeholders for this plan only — the final file has none (repo rule: no comments). Use `useDisplay().xs`. Match how FormDialog styles its primary button (the "one yellow button per view" rule).

- [ ] **Step 5: `ProjectApiKeysCard.vue`**

```vue
<template>
    <SectionCard
        :title="t('module.projects.apiKeys.title')"
        :description="t('module.projects.apiKeys.description')"
        :count="activeCount"
        :refetching="isFetching && !isPending"
        flush
    >
        <template v-if="canUpdate" #actions>
            <VBtn
                size="small"
                :prepend-icon="mdiPlus"
                :text="t('module.projects.apiKeys.add')"
                @click="createOpen = true"
            />
        </template>
        <ListSkeleton v-if="isPending" :rows="2" />
        <ErrorState v-else-if="isError" :thing="t('module.projects.apiKeys.thing')" :error="error" @retry="refetch()" />
        <EmptyState
            v-else-if="sortedKeys.length === 0"
            :icon="mdiKeyOutline"
            :title="t('module.projects.apiKeys.empty.title')"
            :text="
                canUpdate ? t('module.projects.apiKeys.empty.text') : t('module.projects.apiKeys.empty.textReadOnly')
            "
        />
        <VExpandTransition v-else group>
            <ListRow
                v-for="key in sortedKeys"
                :key="key.apiKeyId"
                :title="key.name"
                :icon="mdiKeyVariant"
                :lead-tone="key.revokedAt ? 'none' : 'neutral'"
            >
                <template #subtitle>
                    <span class="mono">{{ key.prefix }}</span>
                </template>
                <template #meta>
                    <StatusBadge v-if="key.revokedAt" tone="neutral" :label="t('module.projects.apiKeys.revoked')" />
                    <span v-else-if="key.lastUsedAt" class="text-ink-muted">
                        {{ t('module.projects.apiKeys.lastUsed') }} <RelativeTime :value="key.lastUsedAt" />
                    </span>
                    <span v-else class="text-ink-muted">{{ t('module.projects.apiKeys.neverUsed') }}</span>
                </template>
                <template v-if="canUpdate && !key.revokedAt" #actions>
                    <IconButton
                        :icon="mdiKeyRemove"
                        :label="t('module.projects.apiKeys.revokeLabel', { name: key.name })"
                        danger
                        @click="revoke(key)"
                    />
                </template>
            </ListRow>
        </VExpandTransition>
    </SectionCard>
    <ApiKeyCreateDialog v-if="canUpdate" v-model="createOpen" :project="project" @created="onCreated" />
    <ApiKeyRevealDialog v-model="revealOpen" :api-key="createdKey" />
</template>

<script setup lang="ts">
    import { computed, ref, watch } from 'vue'
    import { useQuery } from '@tanstack/vue-query'
    import { useI18n } from 'vue-i18n'
    import { mdiKeyOutline, mdiKeyRemove, mdiKeyVariant, mdiPlus } from '@mdi/js'
    import type { ApiKeyCreatedDto, ApiKeyDto, ProjectDetailDto } from 'api'
    import EmptyState from '@/components/EmptyState.vue'
    import ErrorState from '@/components/ErrorState.vue'
    import IconButton from '@/components/IconButton.vue'
    import ListRow from '@/components/ListRow.vue'
    import RelativeTime from '@/components/RelativeTime.vue'
    import SectionCard from '@/components/SectionCard.vue'
    import StatusBadge from '@/components/StatusBadge.vue'
    import ListSkeleton from '@/components/skeletons/ListSkeleton.vue'
    import { useConfirm } from '@/composables/useConfirm.ts'
    import { useNotify } from '@/composables/useNotify.ts'
    import { useApiKeysQuery } from '@/modules/projects/queries/useApiKeysQuery.ts'
    import { useApiKeyRevokeMutation } from '@/modules/projects/mutations/useApiKeyRevokeMutation.ts'
    import ApiKeyCreateDialog from '@/modules/projects/views/details/partials/ApiKeyCreateDialog.vue'
    import ApiKeyRevealDialog from '@/modules/projects/views/details/partials/ApiKeyRevealDialog.vue'

    const props = defineProps<{ project: ProjectDetailDto; canUpdate: boolean }>()

    const { t } = useI18n()
    const confirm = useConfirm()
    const notify = useNotify()

    const {
        data: keys,
        isPending,
        isFetching,
        isError,
        error,
        refetch,
    } = useQuery(useApiKeysQuery(() => props.project.projectId))
    const { mutateAsync: revokeRequest } = useApiKeyRevokeMutation()

    const createOpen = ref(false)
    const revealOpen = ref(false)
    const createdKey = ref<ApiKeyCreatedDto | null>(null)

    const sortedKeys = computed(() =>
        [...(keys.value ?? [])].sort(
            (a, b) => Number(a.revokedAt !== null) - Number(b.revokedAt !== null) || b.apiKeyId - a.apiKeyId,
        ),
    )
    const activeCount = computed(() => sortedKeys.value.filter((key) => !key.revokedAt).length)

    watch(revealOpen, (open) => {
        if (!open) {
            createdKey.value = null
        }
    })

    function onCreated(created: ApiKeyCreatedDto) {
        createdKey.value = created
        revealOpen.value = true
        notify.success(t('module.projects.apiKeys.created', { name: created.name }))
    }

    async function revoke(key: ApiKeyDto) {
        const confirmed = await confirm({
            title: t('module.projects.apiKeys.confirmTitle', { name: key.name }),
            body: t('module.projects.apiKeys.confirmBody'),
            confirmLabel: t('module.projects.apiKeys.confirm'),
            destructive: true,
            errorText: t('module.projects.apiKeys.revokeError', { name: key.name }),
            action: () => revokeRequest({ projectId: props.project.projectId, apiKeyId: key.apiKeyId }),
        })
        if (confirmed) {
            notify.success(t('module.projects.apiKeys.revokedDone', { name: key.name }))
        }
    }
</script>
```

Check that `mdiKeyRemove`, `mdiKeyVariant`, `mdiKeyOutline` exist in `@mdi/js` (they do in current versions; otherwise pick the nearest key icon). If the snackbar for "created" competes with the reveal dialog visually, keep it — it confirms creation per the handoff ("Creating … confirms with a snackbar"). Check whether a utility class for muted text exists (search `main.scss` for `ink-muted`) and use it; if none, use the class the members card uses for secondary text.

- [ ] **Step 6: Place the card on the project page**

In `ProjectDetailView.vue`, after `<ProjectMembersCard … />` and before `<ProjectGeneralCard … />`:

```vue
<ProjectApiKeysCard :project="project" :can-update="canUpdate" />
```

Import it. In `ProjectDetailView.spec.ts` add a stub/mock for `ApiKeyApi.getApiKeys` wherever the view is mounted (read how the spec mocks other card queries), and add:

```ts
it('shows the API keys card to every project reader', async () => {
    // mount as in the existing tests with read-only rules
    // expect the "API keys" section heading to be present
})
```

written out in the spec's existing style (no comments in the final code).

- [ ] **Step 7: Run**

Run: `pnpm --filter frontend exec vitest run src/modules/projects`
Expected: PASS.
Run: `pnpm --filter frontend typecheck && pnpm --filter frontend lint` — Expected: no new errors. Do not commit.

---

### Task 13: Project message log page

**Files:**

- Create: `apps/frontend/src/modules/projects/views/messages/ProjectMessagesView.vue`
- Create: `apps/frontend/src/modules/projects/views/messages/partials/MessageTable.vue`
- Create: `apps/frontend/src/modules/projects/views/messages/__tests__/ProjectMessagesView.spec.ts`
- Modify: `apps/frontend/src/router/RouteNames.ts`, `apps/frontend/src/router/index.ts`, `apps/frontend/src/router/__tests__/routes.spec.ts`
- Modify: `apps/frontend/src/modules/projects/views/details/ProjectDetailView.vue` (+ spec) — header link
- Modify: `apps/frontend/src/locales/en.json` — `module.projects.messages.*`

**Interfaces:**

- Consumes: `useProjectMessagesQuery`, `ProjectMessageQuery`, `mailMessage()` fixture (Task 11); `useProjectQuery` (for the page title/breadcrumb); `BounceTable.vue` as the template for the table.
- Produces: route `RouteNames.PROJECT_MESSAGES = 'projects::messages'` at `/projects/:projectId/messages`, `meta: { section: 'projects' }`.

**Design:**

- PageHeader: title "Sent mail", breadcrumbs `Projects › {project name}` (second crumb links to the project), description "Every mail this project sent, from forms and the API."
- One table card built exactly like `BounceTable.vue` (copy its structure, toolbar, skeleton, error, footer paging and classes): search (recipient or subject, debounced 300 ms), two `VChipGroup`s — source (All / API / Forms) and status (All / Sent / Failed / Blocked) — and the count `{count} messages`.
- Columns: Recipient (`emailTo`, mono), Subject (subject; when `error` is set, the error text below it in muted small text), Source (`TagLabel` "API" / "Form"), Status (`StatusBadge`: sent → success "Sent", failed → error "Failed", blocked → warning "Blocked", pending → pending "Sending"), Sent (`RelativeTime` of `createdAt`). Not sortable (the API orders newest first).
- Empty: `EmptyState` icon `mdiEmailOutline`, "No mail sent yet", "Mail from this project's forms and API keys shows up here." Filtered empty: same as bounces' noMatch with "Clear filters".
- Project page header gets a "Sent mail" text button (`#actions` slot of `PageHeader`, `variant="text"`, `:prepend-icon="mdiEmailFastOutline"`, `:to` the new route) visible to every reader.

- [ ] **Step 1: i18n keys**

Under `module.projects`:

```json
"messages": {
    "title": "Sent mail",
    "description": "Every mail this project sent, from forms and the API.",
    "open": "Sent mail",
    "thing": "sent mail",
    "loading": "Loading sent mail",
    "search": "Search recipient or subject",
    "count": "No messages | 1 message | {count} messages",
    "range": "{from}–{to} of {total}",
    "previous": "Previous page",
    "next": "Next page",
    "sources": { "all": "All sources", "api": "API", "inbound_form": "Forms" },
    "statuses": { "all": "All statuses", "sent": "Sent", "failed": "Failed", "blocked": "Blocked", "pending": "Sending" },
    "sourceTag": { "api": "API", "inbound_form": "Form" },
    "columns": { "recipient": "Recipient", "subject": "Subject", "source": "Source", "status": "Status", "sent": "Sent" },
    "empty": { "title": "No mail sent yet", "text": "Mail from this project's forms and API keys shows up here." },
    "noMatch": { "title": "No messages match “{search}”", "titleFilter": "No messages match these filters", "text": "Try another search or clear the filters.", "clear": "Clear filters" }
}
```

- [ ] **Step 2: Route (test first)**

Read `src/router/__tests__/routes.spec.ts` and add the new route to its per-route `meta.section`/`meta.ability` expectations (`section: 'projects'`, no `ability`). Add `PROJECT_MESSAGES = 'projects::messages',` to `RouteNames` (after `PROJECT_DETAILS`) and in `router/index.ts`, right after the project details route:

```ts
        {
            path: '/projects/:projectId/messages',
            name: RouteNames.PROJECT_MESSAGES,
            component: ProjectMessagesView,
            meta: { section: 'projects' },
        },
```

with a static import like the other views. `createTestRouter()` in `src/__tests__/support.ts` stubs every `RouteNames` entry — check it picks the new one up automatically.

- [ ] **Step 3: Failing view spec**

`views/messages/__tests__/ProjectMessagesView.spec.ts` (mirror `BounceListView.spec.ts` — read it for how it fakes `useRoute` and mounts):

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MailMessageApi, ProjectApi } from 'api'
import ProjectMessagesView from '../ProjectMessagesView.vue'
import { findButton, mountInApp } from '@/__tests__/support.ts'
import { mailMessage, projectDetail } from '@/__tests__/fixtures.ts'

const route = vi.hoisted(() => ({ params: { projectId: '1' }, name: 'projects::messages', query: {} }))
vi.mock('vue-router', async (importOriginal) => ({
    ...(await importOriginal<typeof import('vue-router')>()),
    useRoute: () => route,
}))
vi.stubGlobal('visualViewport', null)

afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
})

function mockProject() {
    vi.spyOn(ProjectApi, 'getProject').mockResolvedValue(projectDetail())
}

describe('ProjectMessagesView', () => {
    it('lists sent mail with status, source and recipient', async () => {
        mockProject()
        vi.spyOn(MailMessageApi, 'getProjectMessages').mockResolvedValue({
            items: [
                mailMessage(),
                mailMessage({
                    mailMessageId: 71,
                    source: 'inbound_form',
                    apiKeyId: null,
                    emailTo: 'owner@acme.com',
                    status: 'failed',
                    error: 'connect ECONNREFUSED',
                }),
            ],
            total: 2,
        })
        const wrapper = mountInApp(ProjectMessagesView)

        await vi.waitFor(() => expect(wrapper.text()).toContain('reader@example.org'))
        const text = wrapper.text()
        expect(text).toContain('Acme Website')
        expect(text).toContain('Sent')
        expect(text).toContain('Failed')
        expect(text).toContain('connect ECONNREFUSED')
        expect(text).toContain('API')
        expect(text).toContain('Form')
        expect(text).toContain('2 messages')
    })

    it('requests the first page of the project log', async () => {
        mockProject()
        const getSpy = vi.spyOn(MailMessageApi, 'getProjectMessages').mockResolvedValue({ items: [], total: 0 })
        mountInApp(ProjectMessagesView)

        await vi.waitFor(() =>
            expect(getSpy).toHaveBeenCalledWith({
                path: { projectId: 1 },
                query: { page: 1, itemsPerPage: 25, search: undefined, source: undefined, status: undefined },
            }),
        )
    })

    it('filters by status', async () => {
        mockProject()
        const getSpy = vi
            .spyOn(MailMessageApi, 'getProjectMessages')
            .mockResolvedValue({ items: [mailMessage()], total: 1 })
        const wrapper = mountInApp(ProjectMessagesView)
        await vi.waitFor(() => expect(wrapper.text()).toContain('reader@example.org'))

        await findButton(wrapper, 'Failed')!.trigger('click')

        await vi.waitFor(() =>
            expect(getSpy).toHaveBeenLastCalledWith(
                expect.objectContaining({ query: expect.objectContaining({ status: 'failed', page: 1 }) as object }),
            ),
        )
    })

    it('explains an empty log', async () => {
        mockProject()
        vi.spyOn(MailMessageApi, 'getProjectMessages').mockResolvedValue({ items: [], total: 0 })
        const wrapper = mountInApp(ProjectMessagesView)

        await vi.waitFor(() => expect(wrapper.text()).toContain('No mail sent yet'))
    })
})
```

`findButton` matches `button|a` by exact text; `VChip`s with `filter` may render differently — check how `BounceListView.spec.ts` clicks a type chip and do the same. Adjust `ProjectApi.getProject` to the real SDK method name used by `useProjectQuery`.

Run: `pnpm --filter frontend exec vitest run src/modules/projects/views/messages` — Expected: FAIL.

- [ ] **Step 4: Implement the view and table**

`ProjectMessagesView.vue`:

```vue
<template>
    <PageHeader
        :title="t('module.projects.messages.title')"
        :description="t('module.projects.messages.description')"
        :breadcrumbs="breadcrumbs"
    />
    <MessageTable :project-id="projectId" />
</template>

<script setup lang="ts">
    import { computed } from 'vue'
    import { useRoute } from 'vue-router'
    import { useQuery } from '@tanstack/vue-query'
    import { useI18n } from 'vue-i18n'
    import PageHeader from '@/components/PageHeader.vue'
    import type { Breadcrumb } from '@/components/breadcrumb.ts'
    import { useProjectQuery } from '@/modules/projects/queries/useProjectQuery.ts'
    import MessageTable from '@/modules/projects/views/messages/partials/MessageTable.vue'
    import { RouteNames } from '@/router/RouteNames.ts'

    const { t } = useI18n()
    const route = useRoute()

    const projectId = computed(() => Number(route.params.projectId))
    const { data: project } = useQuery(useProjectQuery(projectId))

    const breadcrumbs = computed<Breadcrumb[]>(() => [
        { title: t('nav.projects'), to: { name: RouteNames.PROJECT_LIST } },
        {
            title: project.value?.name ?? '…',
            to: { name: RouteNames.PROJECT_DETAILS, params: { projectId: projectId.value } },
        },
    ])
</script>
```

A project the user cannot read returns 404 from both endpoints; `MessageTable`'s `ErrorState` handles it — pass `:kind="apiErrorStatus(error) === 404 ? 'notFound' : 'load'"` like `ProjectDetailView` does.

`partials/MessageTable.vue`: copy `BounceTable.vue`'s template and script, then change:

- props: `defineProps<{ projectId: number }>()`
- state: `search`, `debouncedSearch`, `source = ref<'all' | 'api' | 'inbound_form'>('all')`, `status = ref<'all' | 'sent' | 'failed' | 'blocked'>('all')`, `page = ref(1)`; no `sortBy`
- query:
    ```ts
    const query = computed<ProjectMessageQuery>(() => ({
        page: page.value,
        itemsPerPage: ITEMS_PER_PAGE,
        search: debouncedSearch.value?.trim() || undefined,
        source: source.value === 'all' ? undefined : source.value,
        status: status.value === 'all' ? undefined : status.value,
    }))
    const { data, isPending, isFetching, isError, error, refetch } = useQuery(
        useProjectMessagesQuery(() => props.projectId, query),
    )
    ```
- two chip groups (source, status) with options built from `module.projects.messages.sources.*` / `statuses.*`
- headers: recipient (`emailTo`), subject, source, status, sent (`createdAt`, `nowrap`), all `sortable: false`; `item-value="mailMessageId"`; drop `must-sort` / `v-model:sort-by`
- cells:
    ```vue
    <template #[`item.emailTo`]="{ item }">
        <span class="mono">{{ item.emailTo }}</span>
    </template>
    <template #[`item.subject`]="{ item }">
        <span>{{ item.subject }}</span>
        <span v-if="item.error" class="message-table__error">{{ item.error }}</span>
    </template>
    <template #[`item.source`]="{ item }">
        <TagLabel :label="t(`module.projects.messages.sourceTag.${item.source}`)" />
    </template>
    <template #[`item.status`]="{ item }">
        <StatusBadge :tone="STATUS_TONES[item.status]" :label="t(`module.projects.messages.statuses.${item.status}`)" />
    </template>
    <template #[`item.createdAt`]="{ item }"><RelativeTime :value="item.createdAt" /></template>
    ```
    with
    ```ts
    const STATUS_TONES: Record<MailMessageDto['status'], StatusTone> = {
        sent: 'success',
        failed: 'error',
        blocked: 'warning',
        pending: 'pending',
    }
    ```
    and `.message-table__error { display: block; color: rgb(var(--v-theme-ink-muted)); font-size: …; }` using the same token-based styling approach as `BounceTable.vue`'s scoped styles (no raw hex values).
- `watch([debouncedSearch, source, status], () => { page.value = 1 })`; `clearFilters` resets all three.
- empty/noMatch states and `range`/paging footer as in `BounceTable.vue` with the `module.projects.messages.*` keys.

If copying leaves `BounceTable.vue` and `MessageTable.vue` with a large verbatim shared block (toolbar + footer paging), do not extract a shared component in this task; note it as a concern in the report for the final review.

- [ ] **Step 5: Link from the project page (test first)**

In `ProjectDetailView.spec.ts` add a test that the header shows a "Sent mail" link to `/projects/1/messages` (read how the spec resolves `RouterLink` hrefs with `createTestRouter`). Then in `ProjectDetailView.vue` add to `PageHeader`:

```vue
<template v-if="project" #actions>
    <VBtn
        variant="text"
        :prepend-icon="mdiEmailFastOutline"
        :text="t('module.projects.messages.open')"
        :to="{ name: RouteNames.PROJECT_MESSAGES, params: { projectId } }"
    />
</template>
```

- [ ] **Step 6: Run**

Run: `pnpm --filter frontend exec vitest run src/modules/projects src/router`
Expected: PASS.
Run: `pnpm --filter frontend typecheck && pnpm --filter frontend lint` — Expected: no new errors. Do not commit.

---

### Task 14: Playwright end-to-end flow

**Files:**

- Create: `apps/frontend/e2e/08-api-keys.spec.ts`

**Interfaces:**

- Consumes: `e2e/support/fixtures.ts` (`admin`, `login`, `navigation`, `card`, `dialog`, `input`, `projectName`, `senderDomain`, `requireEnv`); state from earlier specs (04 creates the project "Acme Website" with sender domain `forms.acme-e2e.com`; check 05/06 for what else exists).

- [ ] **Step 1: Write the spec**

```ts
import { expect, test } from '@playwright/test'
import {
    admin,
    card,
    dialog,
    input,
    login,
    navigation,
    projectName,
    requireEnv,
    senderDomain,
} from './support/fixtures.ts'

const recipient = 'api-reader@acme-e2e.com'

test('an administrator creates an API key, sends mail with it and sees it in the log', async ({ page, request }) => {
    await login(page, admin)
    await navigation(page).getByRole('link', { name: 'Projects' }).click()
    await page.getByRole('link', { name: projectName }).click()

    const keys = card(page, 'API keys')
    await expect(keys.getByText('No API keys yet')).toBeVisible()
    await keys.getByRole('button', { name: 'New API key' }).click()
    const create = dialog(page)
    await input(create, 'name').fill('E2E shop')
    await create.getByRole('button', { name: 'Create key' }).click()

    const reveal = dialog(page)
    await expect(reveal.getByText("You won't be able to see it again.")).toBeVisible()
    const key = (await reveal.getByText(/^sdm_[0-9A-Za-z]{8}_/).textContent())!.trim()
    await reveal.getByRole('button', { name: 'Done' }).click()
    await expect(keys.getByText('E2E shop')).toBeVisible()
    await expect(keys.getByText('Never used')).toBeVisible()

    const response = await request.post(`${requireEnv('E2E_API_URL')}/api/v1/send`, {
        headers: { Authorization: `Bearer ${key}` },
        data: { from: `shop@${senderDomain}`, to: recipient, subject: 'Order confirmed', html: '<p>Thanks!</p>' },
    })
    expect(response.status()).toBe(202)

    await page.getByRole('link', { name: 'Sent mail' }).click()
    await expect(page).toHaveURL(/\/projects\/\d+\/messages$/)
    await expect(page.getByText(recipient)).toBeVisible()
    await expect(page.getByText('Order confirmed')).toBeVisible()

    await page.goBack()
    await keys.getByRole('button', { name: 'Revoke E2E shop' }).click()
    await dialog(page).getByRole('button', { name: 'Revoke key' }).click()
    await expect(keys.getByText('Revoked')).toBeVisible()

    const rejected = await request.post(`${requireEnv('E2E_API_URL')}/api/v1/send`, {
        headers: { Authorization: `Bearer ${key}` },
        data: { from: `shop@${senderDomain}`, to: recipient, subject: 'x', html: 'x' },
    })
    expect(rejected.status()).toBe(401)
})
```

Check: whether `E2E_API_URL` already includes `/api`; how `CopyField` renders the value (if it is clamped or in an `<input>`, read the key from there instead of `getByText`); the exact `card()` matching (`^title`); whether "Sent mail" is a link or button role (`VBtn :to` renders an `<a>`).

- [ ] **Step 2: Run**

Run: `pnpm --filter frontend exec playwright test e2e/08-api-keys.spec.ts` (check `package.json` for the e2e script name; the suite's global setup starts containers and needs Docker; earlier numbered specs may have to run first for the shared state — if so, run the whole suite: `pnpm --filter frontend test:e2e` or the script that exists).
Expected: PASS. Do not commit.

---

### Task 15: Docs and full gate

**Files:**

- Modify: `README.md`

- [ ] **Step 1: README**

Read `README.md`. Remove the "Public send API" bullet from "Open todos" (it is done). Add a section before "Open todos":

````md
## Public send API

Create an API key on a project page (API keys → New API key); the full key is shown once. Send with it from any sender domain assigned to that project:

```bash
curl -X POST http://localhost:8000/api/v1/send \
  -H "Authorization: Bearer sdm_xxxxxxxx_…" \
  -H "Content-Type: application/json" \
  -d '{"from":"news@mail.example.com","to":"reader@example.org","subject":"Hello","html":"<p>Hi</p>"}'
```

The key may also be passed as `?key=…`, but query strings tend to end up in logs, so prefer the header. Responses: `202 { mailMessageId, status }`; errors carry a `code` (`FROM_DOMAIN_NOT_ALLOWED`, `FROM_DOMAIN_NOT_READY`, `RECIPIENT_BLOCKED`, `DELIVERY_FAILED`). Each key is limited to `PUBLIC_API_RATE_LIMIT` requests per `PUBLIC_API_RATE_TTL` ms. Every sent mail (API and inbound forms) is listed on the project's "Sent mail" page.
````

If README documents env keys elsewhere, add `PUBLIC_API_RATE_LIMIT` / `PUBLIC_API_RATE_TTL` there too.

- [ ] **Step 2: Full gate**

Run: `pnpm format:fix && pnpm check`
Expected: lint, typecheck, unit tests and format all PASS across workspaces. Then `pnpm --filter backend test:e2e`.

- [ ] **Step 3: Hand off**

Report files changed and test results (unit, backend e2e, Playwright). Do not commit.
