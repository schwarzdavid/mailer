# Inbound Form Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the inbound-form feature end to end: a public form-submission endpoint with per-form fields/security/receivers, DKIM-signed email fan-out through a new mail module, and a frontend setup page with a Monaco-based template editor.

**Architecture:** Two new backend concerns — `MailModule` (SMTP transport via env config, per-domain DKIM signing, Handlebars rendering) and an extended `InboundFormModule` (management CRUD + public submission endpoint + async delivery with persisted submissions). Frontend gets a new `inbound-forms` module following the house views/queries/mutations pattern. Spec: `docs/superpowers/specs/2026-07-10-inbound-form-design.md`.

**Tech Stack:** NestJS 11, Sequelize/Postgres (umzug migrations), Nodemailer, Handlebars, Zod v4, @nestjs/throttler, Vue 3 + Vuetify 4, TanStack Query, Monaco editor, Vitest (+ Testcontainers/MailHog for e2e).

---

## Repository rules that OVERRIDE the usual plan template

- **NEVER touch git.** No `git add`, no commits, no staging — the repository owner handles all version control. Tasks therefore end with a verification step instead of a commit step.
- **No comments in code.** All code below is intentionally comment-free; keep it that way unless documenting a non-obvious workaround.
- **Prettier owns formatting** (4-space indent, single quotes, no semicolons). If in doubt run `pnpm format:fix`.
- **Type-safe test doubles:** every `vi.fn` is typed against the real collaborator (`vi.fn<DomainService['createDomain']>()`), mock data is declared with domain interfaces, no `as` casts for test inputs.
- Run commands from the repo root. Docker (for dev Postgres and Testcontainers) must be running for migration and e2e tasks.

## Verification commands

```bash
pnpm --filter backend exec vitest run <path>     # single backend test file
pnpm --filter frontend exec vitest run <path>    # single frontend test file
pnpm --filter backend typecheck
pnpm --filter frontend typecheck
pnpm --filter backend lint
pnpm --filter frontend lint
pnpm check                                       # full gate: lint + typecheck + test + format
```

## File structure

Backend (`apps/backend/src`):

```
migrations/006-extend-inbound-forms.ts                     create
modules/domain/interfaces/domain.interface.ts              modify (DomainWithActiveDkim)
modules/domain/services/domain.service.ts                  modify (getSendingDomainByFqdn)
modules/domain/services/domain.service.spec.ts             modify
modules/domain/domain.module.ts                            modify (exports)
modules/mail/mail.module.ts                                create
modules/mail/mail.constants.ts                             create (MAIL_TRANSPORTER token)
modules/mail/services/mail.service.ts                      create
modules/mail/services/mail.service.spec.ts                 create
modules/mail/services/template-renderer.service.ts         create
modules/mail/services/template-renderer.service.spec.ts    create
modules/inbound-form/interfaces/*.ts                       modify (all 5) + 2 new
modules/inbound-form/models/*.ts                           modify (4) + 2 new
modules/inbound-form/helpers/placeholder.ts                create
modules/inbound-form/helpers/placeholder.spec.ts           create
modules/inbound-form/helpers/field-schema.ts               create
modules/inbound-form/helpers/field-schema.spec.ts          create
modules/inbound-form/services/inbound-form.service.ts      create (+spec)
modules/inbound-form/services/inbound-form-template.service.ts    create (+spec)
modules/inbound-form/services/inbound-form-security.service.ts    create (+spec)
modules/inbound-form/services/inbound-form-submission.service.ts  create (+spec)
modules/inbound-form/dtos/*.ts                             create (request + response DTOs)
modules/inbound-form/controller/inbound-form.controller.ts        create (+spec)
modules/inbound-form/controller/public-inbound-form.controller.ts create (+spec)
modules/inbound-form/inbound-form.module.ts                modify
app.module.ts                                              modify (MailModule, ThrottlerModule)
main.ts                                                    modify (enableCors)
```

Backend e2e (`apps/backend/test`):

```
support/infrastructure.ts        modify (MailHog container + SMTP env)
inbound-form.e2e-spec.ts         create
```

Frontend (`apps/frontend/src`):

```
router/RouteNames.ts                                        modify
router/index.ts                                             modify
locales/en.json                                             modify
modules/dashboard/layouts/AppLayout.vue                     modify (nav tab)
modules/inbound-forms/queries/useInboundFormsQuery.ts       create (+spec)
modules/inbound-forms/queries/useInboundFormQuery.ts        create
modules/inbound-forms/queries/useInboundFormTemplatesQuery.ts create
modules/inbound-forms/mutations/*.ts                        create (10 files, specs for 2)
modules/inbound-forms/helpers/sampleData.ts                 create (+spec)
modules/inbound-forms/helpers/formEndpointUrl.ts            create
modules/inbound-forms/views/list/InboundFormListView.vue    create (+spec)
modules/inbound-forms/views/list/partials/AddInboundFormDialog.vue   create
modules/inbound-forms/views/list/partials/InboundFormListEntry.vue   create
modules/inbound-forms/views/details/InboundFormDetailView.vue        create (+spec)
modules/inbound-forms/views/details/partials/GeneralCard.vue         create
modules/inbound-forms/views/details/partials/FieldsCard.vue          create
modules/inbound-forms/views/details/partials/FieldDialog.vue         create
modules/inbound-forms/views/details/partials/SecurityCard.vue        create
modules/inbound-forms/views/details/partials/SecurityDialog.vue      create
modules/inbound-forms/views/details/partials/ReceiversCard.vue       create
modules/inbound-forms/views/details/partials/ReceiverDialog.vue      create
modules/inbound-forms/views/template/InboundFormTemplateView.vue     create (+spec)
modules/inbound-forms/views/template/partials/MonacoEditor.vue       create
modules/inbound-forms/views/template/partials/TemplatePreview.vue    create
```

---

### Task 1: Backend dependencies

**Files:** modify `apps/backend/package.json` (via pnpm)

- [ ] **Step 1: Install runtime and dev dependencies**

```bash
pnpm --filter backend add nodemailer handlebars zod @nestjs/throttler
pnpm --filter backend add -D @types/nodemailer
```

- [ ] **Step 2: Verify install**

Run: `pnpm --filter backend typecheck`
Expected: PASS (no source uses the new deps yet)

---

### Task 2: Migration 006 — schema changes + new tables

**Files:**

- Create: `apps/backend/src/migrations/006-extend-inbound-forms.ts`

- [ ] **Step 1: Write the migration**

```ts
import type { MigrationFn } from 'umzug'
import { DataTypes, type QueryInterface } from 'sequelize'

export const up: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
    await queryInterface.addColumn('inbound_form_fields', 'type', {
        type: DataTypes.STRING(255),
        allowNull: false,
        defaultValue: 'text',
    })

    await queryInterface.addColumn('inbound_form_security', 'config', {
        type: DataTypes.JSONB,
        allowNull: true,
    })

    await queryInterface.addIndex('inbound_form_security', ['inboundFormId', 'type'], {
        name: 'form_security_type_unique',
        unique: true,
    })

    await queryInterface.addColumn('inbound_form_receiver', 'emailReplyTo', {
        type: DataTypes.STRING(255),
        allowNull: true,
    })

    await queryInterface.addColumn('inbound_form_template', 'subject', {
        type: DataTypes.STRING(255),
        allowNull: false,
        defaultValue: '',
    })

    await queryInterface.addColumn('inbound_form_template', 'updatedAt', {
        type: DataTypes.DATE,
        allowNull: true,
    })
    await queryInterface.sequelize.query('UPDATE "inbound_form_template" SET "updatedAt" = "createdAt"')
    await queryInterface.changeColumn('inbound_form_template', 'updatedAt', {
        type: DataTypes.DATE,
        allowNull: false,
    })

    await queryInterface.addIndex('inbound_form_template', ['inboundFormReceiverId'], {
        name: 'template_single_draft',
        unique: true,
        where: { status: 'draft' },
    })

    await queryInterface.createTable('inbound_form_submission', {
        inboundFormSubmissionId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true,
        },
        inboundFormId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'inbound_form',
                key: 'inboundFormId',
            },
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE',
        },
        data: {
            type: DataTypes.JSONB,
            allowNull: false,
        },
        status: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        createdAt: {
            type: DataTypes.DATE,
            allowNull: false,
        },
    })

    await queryInterface.createTable('inbound_form_delivery', {
        inboundFormDeliveryId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true,
        },
        inboundFormSubmissionId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'inbound_form_submission',
                key: 'inboundFormSubmissionId',
            },
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE',
        },
        inboundFormReceiverId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'inbound_form_receiver',
                key: 'inboundFormReceiverId',
            },
            onDelete: 'SET NULL',
            onUpdate: 'CASCADE',
        },
        inboundFormTemplateId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'inbound_form_template',
                key: 'inboundFormTemplateId',
            },
            onDelete: 'SET NULL',
            onUpdate: 'CASCADE',
        },
        emailFrom: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        emailTo: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        status: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        error: {
            type: DataTypes.TEXT,
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
}

export const down: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
    await queryInterface.dropTable('inbound_form_delivery')
    await queryInterface.dropTable('inbound_form_submission')
    await queryInterface.removeIndex('inbound_form_template', 'template_single_draft')
    await queryInterface.removeColumn('inbound_form_template', 'updatedAt')
    await queryInterface.removeColumn('inbound_form_template', 'subject')
    await queryInterface.removeColumn('inbound_form_receiver', 'emailReplyTo')
    await queryInterface.removeIndex('inbound_form_security', 'form_security_type_unique')
    await queryInterface.removeColumn('inbound_form_security', 'config')
    await queryInterface.removeColumn('inbound_form_fields', 'type')
}
```

- [ ] **Step 2: Run the migration against the dev database**

Requires `docker compose -f dev/docker-compose.yml up -d` and a root `.env` with `DB_*` keys.

Run: `pnpm --filter backend migrate up`
Expected: `006-extend-inbound-forms` listed as executed, exit code 0.

- [ ] **Step 3: Verify rollback works, then re-apply**

Run: `pnpm --filter backend migrate down` then `pnpm --filter backend migrate up`
Expected: both succeed.

---

### Task 3: Update inbound-form and domain interfaces

**Files:**

- Modify: `apps/backend/src/modules/inbound-form/interfaces/inbound-form.interface.ts`
- Modify: `apps/backend/src/modules/inbound-form/interfaces/inbound-form-field.interface.ts`
- Modify: `apps/backend/src/modules/inbound-form/interfaces/inbound-form-security.interface.ts`
- Modify: `apps/backend/src/modules/inbound-form/interfaces/inbound-form-receiver.interface.ts`
- Modify: `apps/backend/src/modules/inbound-form/interfaces/inbound-form-template.interface.ts`
- Create: `apps/backend/src/modules/inbound-form/interfaces/inbound-form-submission.interface.ts`
- Create: `apps/backend/src/modules/inbound-form/interfaces/inbound-form-delivery.interface.ts`
- Modify: `apps/backend/src/modules/domain/interfaces/domain.interface.ts`

Note: every `Create` type now also omits `createdAt`/`updatedAt` — Sequelize fills them, and requiring them in creation attributes would force services to pass timestamps.

- [ ] **Step 1: Replace `inbound-form-field.interface.ts`**

```ts
export enum InboundFormFieldType {
    TEXT = 'text',
    EMAIL = 'email',
    NUMBER = 'number',
    BOOLEAN = 'boolean',
}

export interface InboundFormFieldValidation {
    required?: boolean
    minLength?: number
    maxLength?: number
    pattern?: string
    min?: number
    max?: number
}

export interface InboundFormField {
    inboundFormFieldId: number
    inboundFormId: number
    key: string
    label: string
    type: InboundFormFieldType
    defaultValue: string | null
    validation: InboundFormFieldValidation | null
    createdAt: Date
    updatedAt: Date
}

export type InboundFormFieldCreate = Omit<InboundFormField, 'inboundFormFieldId' | 'createdAt' | 'updatedAt'>

export type InboundFormFieldUpsert = Omit<InboundFormFieldCreate, 'inboundFormId'>
```

- [ ] **Step 2: Replace `inbound-form-security.interface.ts`**

```ts
export enum InboundFormSecurityType {
    RECAPTCHA = 'google-recaptcha',
    CSRF = 'csrf',
    HONEYPOT = 'honeypot',
}

export enum InboundFormSecurityLocation {
    BODY = 'body',
    HEADER = 'header',
    QUERY = 'query',
}

export interface InboundFormRecaptchaConfig {
    secret: string
    minScore?: number
}

export interface InboundFormSecurity {
    inboundFormSecurityId: number
    inboundFormId: number
    type: InboundFormSecurityType
    location: InboundFormSecurityLocation
    key: string
    config: InboundFormRecaptchaConfig | null
    createdAt: Date
    updatedAt: Date
}

export type InboundFormSecurityCreate = Omit<InboundFormSecurity, 'inboundFormSecurityId' | 'createdAt' | 'updatedAt'>

export type InboundFormSecurityUpsert = Omit<InboundFormSecurityCreate, 'inboundFormId'>
```

- [ ] **Step 3: Replace `inbound-form-receiver.interface.ts`**

```ts
export interface InboundFormReceiver {
    inboundFormReceiverId: number
    inboundFormId: number
    emailReceiver: string
    emailReplyTo: string | null
    emailFrom: string
    isActive: boolean
    createdAt: Date
    updatedAt: Date
}

export type InboundFormReceiverCreate = Omit<InboundFormReceiver, 'inboundFormReceiverId' | 'createdAt' | 'updatedAt'>

export type InboundFormReceiverUpsert = Omit<InboundFormReceiverCreate, 'inboundFormId'>
```

- [ ] **Step 4: Replace `inbound-form-template.interface.ts`**

```ts
export enum InboundFormTemplateStatus {
    DRAFT = 'draft',
    PUBLISHED = 'published',
}

export interface InboundFormTemplate {
    inboundFormTemplateId: number
    inboundFormReceiverId: number
    subject: string
    template: string
    status: InboundFormTemplateStatus
    version: number
    createdAt: Date
    updatedAt: Date
}

export type InboundFormTemplateCreate = Omit<InboundFormTemplate, 'inboundFormTemplateId' | 'createdAt' | 'updatedAt'>

export interface InboundFormTemplateDraft {
    subject: string
    template: string
}

export interface InboundFormTemplateSummary {
    draftVersion: number | null
    publishedVersion: number | null
}
```

- [ ] **Step 5: Create `inbound-form-submission.interface.ts`**

```ts
export enum InboundFormSubmissionStatus {
    ACCEPTED = 'accepted',
    SPAM = 'spam',
}

export interface InboundFormSubmission {
    inboundFormSubmissionId: number
    inboundFormId: number
    data: Record<string, unknown>
    status: InboundFormSubmissionStatus
    createdAt: Date
}

export type InboundFormSubmissionCreate = Omit<InboundFormSubmission, 'inboundFormSubmissionId' | 'createdAt'>
```

- [ ] **Step 6: Create `inbound-form-delivery.interface.ts`**

```ts
export enum InboundFormDeliveryStatus {
    PENDING = 'pending',
    SENT = 'sent',
    FAILED = 'failed',
}

export interface InboundFormDelivery {
    inboundFormDeliveryId: number
    inboundFormSubmissionId: number
    inboundFormReceiverId: number | null
    inboundFormTemplateId: number | null
    emailFrom: string
    emailTo: string
    status: InboundFormDeliveryStatus
    error: string | null
    sentAt: Date | null
    createdAt: Date
    updatedAt: Date
}

export type InboundFormDeliveryCreate = Omit<InboundFormDelivery, 'inboundFormDeliveryId' | 'createdAt' | 'updatedAt'>
```

- [ ] **Step 7: Update `inbound-form.interface.ts` Create type**

Replace the last line so timestamps are omitted:

```ts
export type InboundFormCreate = Omit<InboundForm, 'inboundFormId' | 'createdAt' | 'updatedAt'>
```

- [ ] **Step 8: Add `DomainWithActiveDkim` to `domain.interface.ts`**

Append after `DomainWithDkim`:

```ts
export interface DomainWithActiveDkim extends Domain {
    activeDkim: DomainDkim
}
```

- [ ] **Step 9: Typecheck**

Run: `pnpm --filter backend typecheck`
Expected: PASS (models still satisfy the old shapes via `declare`; if the field model errors on `validation`/`type`, that is fixed in Task 4 — in that case run typecheck again after Task 4).

---

### Task 4: Update models, add submission/delivery models, register in module

**Files:**

- Modify: `apps/backend/src/modules/inbound-form/models/inbound-form-field.model.ts`
- Modify: `apps/backend/src/modules/inbound-form/models/inbound-form-security.model.ts`
- Modify: `apps/backend/src/modules/inbound-form/models/inbound-form-receiver.model.ts`
- Modify: `apps/backend/src/modules/inbound-form/models/inbound-form-template.model.ts`
- Create: `apps/backend/src/modules/inbound-form/models/inbound-form-submission.model.ts`
- Create: `apps/backend/src/modules/inbound-form/models/inbound-form-delivery.model.ts`
- Modify: `apps/backend/src/modules/inbound-form/inbound-form.module.ts`

- [ ] **Step 1: Field model — add `type` column, retype `validation`**

In `inbound-form-field.model.ts`, add to the imports from the interface file: `InboundFormFieldType`, `InboundFormFieldValidation`. Insert after the `label` column:

```ts
    @AllowNull(false)
    @Default(InboundFormFieldType.TEXT)
    @Column(DataType.STRING(255))
    declare type: InboundFormFieldType
```

(`Default` must be added to the `sequelize-typescript` import list.) Replace the `validation` column declaration with:

```ts
    @AllowNull
    @Column(DataType.JSON)
    declare validation: InboundFormFieldValidation | null
```

- [ ] **Step 2: Security model — add `config` column**

In `inbound-form-security.model.ts`, import `InboundFormRecaptchaConfig` from the interface file and insert after the `type` column:

```ts
    @AllowNull
    @Column(DataType.JSONB)
    declare config: InboundFormRecaptchaConfig | null
```

- [ ] **Step 3: Receiver model — add `emailReplyTo` column**

In `inbound-form-receiver.model.ts`, insert after `emailReceiver`:

```ts
    @AllowNull
    @Column(DataType.STRING(255))
    declare emailReplyTo: string | null
```

- [ ] **Step 4: Template model — add `subject`, enable `updatedAt`**

In `inbound-form-template.model.ts`: remove `updatedAt: false` from the `@Table` options, add `UpdatedAt` to the `sequelize-typescript` imports, insert after `inboundFormReceiverId`:

```ts
    @AllowNull(false)
    @Column(DataType.STRING(255))
    declare subject: string
```

and after `@CreatedAt declare createdAt: Date`:

```ts
    @UpdatedAt
    declare updatedAt: Date
```

- [ ] **Step 5: Create `inbound-form-submission.model.ts`**

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
} from 'sequelize-typescript'
import {
    InboundFormSubmission,
    InboundFormSubmissionCreate,
    InboundFormSubmissionStatus,
} from '../interfaces/inbound-form-submission.interface'
import { InboundFormModel } from './inbound-form.model'

@Table({
    tableName: 'inbound_form_submission',
    updatedAt: false,
})
export class InboundFormSubmissionModel
    extends Model<InboundFormSubmission, InboundFormSubmissionCreate>
    implements InboundFormSubmission
{
    @PrimaryKey
    @AutoIncrement
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare inboundFormSubmissionId: number

    @ForeignKey(() => InboundFormModel)
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare inboundFormId: number

    @AllowNull(false)
    @Column(DataType.JSONB)
    declare data: Record<string, unknown>

    @AllowNull(false)
    @Column(DataType.STRING(255))
    declare status: InboundFormSubmissionStatus

    @CreatedAt
    declare createdAt: Date

    @BelongsTo(() => InboundFormModel, {
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
    })
    inboundForm: InboundFormModel | null = null
}
```

- [ ] **Step 6: Create `inbound-form-delivery.model.ts`**

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
    InboundFormDelivery,
    InboundFormDeliveryCreate,
    InboundFormDeliveryStatus,
} from '../interfaces/inbound-form-delivery.interface'
import { InboundFormSubmissionModel } from './inbound-form-submission.model'
import { InboundFormReceiverModel } from './inbound-form-receiver.model'
import { InboundFormTemplateModel } from './inbound-form-template.model'

@Table({
    tableName: 'inbound_form_delivery',
})
export class InboundFormDeliveryModel
    extends Model<InboundFormDelivery, InboundFormDeliveryCreate>
    implements InboundFormDelivery
{
    @PrimaryKey
    @AutoIncrement
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare inboundFormDeliveryId: number

    @ForeignKey(() => InboundFormSubmissionModel)
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare inboundFormSubmissionId: number

    @ForeignKey(() => InboundFormReceiverModel)
    @AllowNull
    @Column(DataType.INTEGER)
    declare inboundFormReceiverId: number | null

    @ForeignKey(() => InboundFormTemplateModel)
    @AllowNull
    @Column(DataType.INTEGER)
    declare inboundFormTemplateId: number | null

    @AllowNull(false)
    @Column(DataType.STRING(255))
    declare emailFrom: string

    @AllowNull(false)
    @Column(DataType.STRING(255))
    declare emailTo: string

    @AllowNull(false)
    @Column(DataType.STRING(255))
    declare status: InboundFormDeliveryStatus

    @AllowNull
    @Column(DataType.TEXT)
    declare error: string | null

    @AllowNull
    @Column(DataType.DATE)
    declare sentAt: Date | null

    @CreatedAt
    declare createdAt: Date

    @UpdatedAt
    declare updatedAt: Date

    @BelongsTo(() => InboundFormSubmissionModel, {
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
    })
    submission: InboundFormSubmissionModel | null = null

    @BelongsTo(() => InboundFormReceiverModel, {
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
    })
    receiver: InboundFormReceiverModel | null = null

    @BelongsTo(() => InboundFormTemplateModel, {
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
    })
    template: InboundFormTemplateModel | null = null
}
```

- [ ] **Step 7: Register the new models in `inbound-form.module.ts`**

```ts
import { Module } from '@nestjs/common'
import { SequelizeModule } from '@nestjs/sequelize'
import { InboundFormModel } from './models/inbound-form.model'
import { InboundFormFieldModel } from './models/inbound-form-field.model'
import { InboundFormSecurityModel } from './models/inbound-form-security.model'
import { InboundFormReceiverModel } from './models/inbound-form-receiver.model'
import { InboundFormTemplateModel } from './models/inbound-form-template.model'
import { InboundFormSubmissionModel } from './models/inbound-form-submission.model'
import { InboundFormDeliveryModel } from './models/inbound-form-delivery.model'

@Module({
    imports: [
        SequelizeModule.forFeature([
            InboundFormModel,
            InboundFormFieldModel,
            InboundFormSecurityModel,
            InboundFormReceiverModel,
            InboundFormTemplateModel,
            InboundFormSubmissionModel,
            InboundFormDeliveryModel,
        ]),
    ],
})
export class InboundFormModule {}
```

- [ ] **Step 8: Verify**

Run: `pnpm --filter backend typecheck && pnpm --filter backend lint`
Expected: both PASS.

---

### Task 5: Mail module — TemplateRendererService (TDD)

**Files:**

- Create: `apps/backend/src/modules/mail/services/template-renderer.service.ts`
- Test: `apps/backend/src/modules/mail/services/template-renderer.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { TemplateRendererService, TemplateRenderError } from './template-renderer.service'

describe('TemplateRendererService', () => {
    const service = new TemplateRendererService()

    describe('render', () => {
        it('replaces placeholders with context values', () => {
            const result = service.render('<p>Hello {{firstName}}!</p>', { firstName: 'Max' })

            expect(result).toBe('<p>Hello Max!</p>')
        })

        it('escapes html in context values', () => {
            const result = service.render('{{comment}}', { comment: '<script>alert(1)</script>' })

            expect(result).not.toContain('<script>')
            expect(result).toContain('&lt;script&gt;')
        })

        it('renders missing values as empty strings', () => {
            const result = service.render('Hello {{missing}}!', {})

            expect(result).toBe('Hello !')
        })

        it('throws a TemplateRenderError for a broken template', () => {
            expect(() => service.render('{{#if}}', {})).toThrow(TemplateRenderError)
        })
    })

    describe('assertValid', () => {
        it('accepts a valid template', () => {
            expect(() => service.assertValid('Hi {{name}}')).not.toThrow()
        })

        it('throws a TemplateRenderError for unbalanced braces', () => {
            expect(() => service.assertValid('{{#each items}}')).toThrow(TemplateRenderError)
        })
    })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter backend exec vitest run src/modules/mail/services/template-renderer.service.spec.ts`
Expected: FAIL — cannot resolve `./template-renderer.service`.

- [ ] **Step 3: Implement the service**

```ts
import { Injectable } from '@nestjs/common'
import Handlebars from 'handlebars'

export class TemplateRenderError extends Error {}

@Injectable()
export class TemplateRendererService {
    render(template: string, context: Record<string, unknown>): string {
        try {
            return Handlebars.compile(template)(context)
        } catch (error) {
            throw new TemplateRenderError(error instanceof Error ? error.message : 'Template rendering failed')
        }
    }

    assertValid(template: string): void {
        try {
            Handlebars.parse(template)
        } catch (error) {
            throw new TemplateRenderError(error instanceof Error ? error.message : 'Invalid template')
        }
    }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm --filter backend exec vitest run src/modules/mail/services/template-renderer.service.spec.ts`
Expected: PASS (6 tests).

---

### Task 6: Domain module — sending-domain lookup + exports (TDD)

**Files:**

- Modify: `apps/backend/src/modules/domain/services/domain.service.ts`
- Modify: `apps/backend/src/modules/domain/services/domain.service.spec.ts`
- Modify: `apps/backend/src/modules/domain/domain.module.ts`

- [ ] **Step 1: Add failing tests to the existing `domain.service.spec.ts`**

Add a `findOne` mock next to the existing model mocks in that spec (follow the file's existing setup — the model is provided via `getModelToken(DomainModel)`), then append this describe block:

```ts
describe('getSendingDomainByFqdn', () => {
    it('returns the domain with its active dkim as a plain object', async () => {
        const activeDkim: DomainDkim = {
            dkimId: 7,
            domainId: 1,
            selector: 's1',
            publicKey: 'pub',
            privateKey: 'v1.encrypted',
            algorithm: DomainDkimAlgorithm.RSA,
            keyBits: 2048,
            createdAt: new Date(),
        }
        const sendingDomain: DomainWithActiveDkim = {
            domainId: 1,
            fqdn: 'mail.example.com',
            rootDomain: 'example.com',
            activeDkimId: 7,
            dnsRecords: [],
            lastCheckedAt: null,
            activeDkim,
        }
        findOne.mockResolvedValue({
            activeDkim,
            get: () => sendingDomain,
        } as unknown as DomainModel)

        const result = await service.getSendingDomainByFqdn('mail.example.com')

        expect(findOne).toHaveBeenCalledWith({
            where: { fqdn: 'mail.example.com' },
            include: [{ model: DomainDkimModel, as: 'activeDkim' }],
        })
        expect(result).toEqual(sendingDomain)
    })

    it('returns null when the domain does not exist', async () => {
        findOne.mockResolvedValue(null)

        await expect(service.getSendingDomainByFqdn('unknown.example.com')).resolves.toBeNull()
    })

    it('returns null when the domain has no active dkim key', async () => {
        findOne.mockResolvedValue({ activeDkim: null, get: () => ({}) } as unknown as DomainModel)

        await expect(service.getSendingDomainByFqdn('mail.example.com')).resolves.toBeNull()
    })
})
```

Declare the mock alongside the others: `let findOne: Mock<(typeof DomainModel)['findOne']>` initialized in `beforeEach` with `findOne = vi.fn<typeof findOne>()` and included in the model mock object passed for `getModelToken(DomainModel)`.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter backend exec vitest run src/modules/domain/services/domain.service.spec.ts`
Expected: FAIL — `getSendingDomainByFqdn is not a function`.

- [ ] **Step 3: Implement the lookup in `domain.service.ts`**

Add imports:

```ts
import { DomainWithActiveDkim } from '../interfaces/domain.interface'
import { DomainDkimModel } from '../models/domain-dkim.model'
```

Append the method to `DomainService`:

```ts
    async getSendingDomainByFqdn(fqdn: string): Promise<DomainWithActiveDkim | null> {
        const domain = await this.domainModel.findOne({
            where: { fqdn },
            include: [{ model: DomainDkimModel, as: 'activeDkim' }],
        })

        if (!domain?.activeDkim) {
            return null
        }

        return domain.get({ plain: true }) as DomainWithActiveDkim
    }
```

- [ ] **Step 4: Export the services other modules need from `domain.module.ts`**

```ts
@Module({
    imports: [SequelizeModule.forFeature([DomainModel, DomainDkimModel, DomainDnsModel])],
    controllers: [DomainController],
    providers: [DomainService, DomainDkimService, DkimEncryptionService, DomainDnsService],
    exports: [DomainService, DkimEncryptionService],
})
export class DomainModule {}
```

- [ ] **Step 5: Verify**

Run: `pnpm --filter backend exec vitest run src/modules/domain/services/domain.service.spec.ts && pnpm --filter backend typecheck`
Expected: PASS.

---

### Task 7: Mail module — MailService, transporter provider, module wiring (TDD)

**Files:**

- Create: `apps/backend/src/modules/mail/mail.constants.ts`
- Create: `apps/backend/src/modules/mail/services/mail.service.ts`
- Test: `apps/backend/src/modules/mail/services/mail.service.spec.ts`
- Create: `apps/backend/src/modules/mail/mail.module.ts`
- Modify: `apps/backend/src/app.module.ts`

- [ ] **Step 1: Create the injection token in `mail.constants.ts`**

```ts
export const MAIL_TRANSPORTER = 'MAIL_TRANSPORTER'
```

- [ ] **Step 2: Write the failing tests**

```ts
import { Test, TestingModule } from '@nestjs/testing'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { Transporter } from 'nodemailer'
import { MailService, SendMail } from './mail.service'
import { MAIL_TRANSPORTER } from '../mail.constants'
import { DomainService } from '../../domain/services/domain.service'
import { DkimEncryptionService } from '../../domain/services/dkim-encryption.service'
import { DomainWithActiveDkim } from '../../domain/interfaces/domain.interface'
import { DomainDkimAlgorithm } from '../../domain/interfaces/domain-dkim.interface'

describe('MailService', () => {
    let service: MailService
    let sendMail: Mock<Transporter['sendMail']>
    let getSendingDomainByFqdn: Mock<DomainService['getSendingDomainByFqdn']>
    let decryptDkimPrivateKey: Mock<DkimEncryptionService['decryptDkimPrivateKey']>

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
        sendMail = vi.fn<typeof sendMail>().mockResolvedValue({})
        getSendingDomainByFqdn = vi.fn<typeof getSendingDomainByFqdn>().mockResolvedValue(sendingDomain)
        decryptDkimPrivateKey = vi.fn<typeof decryptDkimPrivateKey>().mockResolvedValue('-----BEGIN PRIVATE KEY-----')

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                MailService,
                { provide: MAIL_TRANSPORTER, useValue: { sendMail } },
                { provide: DomainService, useValue: { getSendingDomainByFqdn } },
                { provide: DkimEncryptionService, useValue: { decryptDkimPrivateKey } },
            ],
        }).compile()

        service = module.get(MailService)
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
})
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm --filter backend exec vitest run src/modules/mail/services/mail.service.spec.ts`
Expected: FAIL — cannot resolve `./mail.service`.

- [ ] **Step 4: Implement `mail.service.ts`**

```ts
import { Inject, Injectable, Logger } from '@nestjs/common'
import type { Transporter } from 'nodemailer'
import { MAIL_TRANSPORTER } from '../mail.constants'
import { DomainService } from '../../domain/services/domain.service'
import { DkimEncryptionService } from '../../domain/services/dkim-encryption.service'

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
    ) {}

    async sendMail(mail: SendMail): Promise<void> {
        const [localPart, fqdn] = mail.from.split('@')
        if (!localPart || !fqdn) {
            throw new Error(`Invalid from address: ${mail.from}`)
        }

        const domain = await this.domainService.getSendingDomainByFqdn(fqdn)
        if (!domain) {
            throw new Error(`No sending domain configured for ${fqdn}`)
        }

        const privateKey = await this.dkimEncryptionService.decryptDkimPrivateKey(domain.activeDkim.privateKey)

        await this.transporter.sendMail({
            from: mail.from,
            to: mail.to,
            replyTo: mail.replyTo,
            subject: mail.subject,
            html: mail.html,
            dkim: {
                domainName: domain.fqdn,
                keySelector: domain.activeDkim.selector,
                privateKey,
            },
        })

        this.logger.log(`Sent mail from ${mail.from} to ${mail.to}`)
    }
}
```

- [ ] **Step 5: Run tests to verify pass**

Run: `pnpm --filter backend exec vitest run src/modules/mail/services/mail.service.spec.ts`
Expected: PASS (4 tests). If the logger pollutes output, silence it like the domain controller spec does (`vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)`).

- [ ] **Step 6: Create `mail.module.ts`**

```ts
import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createTransport } from 'nodemailer'
import { MAIL_TRANSPORTER } from './mail.constants'
import { MailService } from './services/mail.service'
import { TemplateRendererService } from './services/template-renderer.service'
import { DomainModule } from '../domain/domain.module'

@Module({
    imports: [DomainModule],
    providers: [
        {
            provide: MAIL_TRANSPORTER,
            inject: [ConfigService],
            useFactory(configService: ConfigService) {
                const user = configService.get<string>('SMTP_USER', '')
                const pass = configService.get<string>('SMTP_PASSWORD', '')

                return createTransport({
                    host: configService.getOrThrow<string>('SMTP_HOST'),
                    port: Number(configService.getOrThrow<string>('SMTP_PORT')),
                    secure: configService.get<string>('SMTP_SECURE', 'false') === 'true',
                    auth: user ? { user, pass } : undefined,
                })
            },
        },
        MailService,
        TemplateRendererService,
    ],
    exports: [MailService, TemplateRendererService],
})
export class MailModule {}
```

- [ ] **Step 7: Register `MailModule` in `app.module.ts`**

Add `import { MailModule } from './modules/mail/mail.module'` and append `MailModule` to the `imports` array (after `InboundFormModule`).

- [ ] **Step 8: Tell the user to extend the root `.env`** (gitignored — the executor cannot do it):

```
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_SECURE=false
SMTP_USER=
SMTP_PASSWORD=
```

Also update the env-key parenthetical in `CLAUDE.md` (Repository layout section) to mention `SMTP_*`.

- [ ] **Step 9: Verify**

Run: `pnpm --filter backend typecheck && pnpm --filter backend lint && pnpm --filter backend test`
Expected: all PASS.

---

### Task 8: Inbound form — placeholder helper + field schema builder (TDD)

**Files:**

- Create: `apps/backend/src/modules/inbound-form/helpers/placeholder.ts`
- Test: `apps/backend/src/modules/inbound-form/helpers/placeholder.spec.ts`
- Create: `apps/backend/src/modules/inbound-form/helpers/field-schema.ts`
- Test: `apps/backend/src/modules/inbound-form/helpers/field-schema.spec.ts`

- [ ] **Step 1: Write the failing placeholder tests**

```ts
import { describe, expect, it } from 'vitest'
import { parsePlaceholder } from './placeholder'

describe('parsePlaceholder', () => {
    it('extracts the field key from a placeholder', () => {
        expect(parsePlaceholder('{{email}}')).toBe('email')
    })

    it('tolerates inner whitespace', () => {
        expect(parsePlaceholder('{{ email }}')).toBe('email')
    })

    it('returns null for a literal email address', () => {
        expect(parsePlaceholder('owner@business.com')).toBeNull()
    })

    it('returns null when the placeholder is embedded in other text', () => {
        expect(parsePlaceholder('prefix {{email}}')).toBeNull()
    })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter backend exec vitest run src/modules/inbound-form/helpers/placeholder.spec.ts`
Expected: FAIL — cannot resolve `./placeholder`.

- [ ] **Step 3: Implement `placeholder.ts`**

```ts
const PLACEHOLDER_PATTERN = /^\{\{\s*([\w-]+)\s*\}\}$/

export function parsePlaceholder(value: string): string | null {
    const match = PLACEHOLDER_PATTERN.exec(value)
    return match?.[1] ?? null
}
```

- [ ] **Step 4: Run to verify pass, then write the failing field-schema tests**

```ts
import { describe, expect, it } from 'vitest'
import { buildDataSchema } from './field-schema'
import {
    InboundFormField,
    InboundFormFieldType,
    InboundFormFieldValidation,
} from '../interfaces/inbound-form-field.interface'

function field(
    key: string,
    type: InboundFormFieldType,
    validation: InboundFormFieldValidation | null = null,
    defaultValue: string | null = null,
): InboundFormField {
    return {
        inboundFormFieldId: 1,
        inboundFormId: 1,
        key,
        label: key,
        type,
        defaultValue,
        validation,
        createdAt: new Date(),
        updatedAt: new Date(),
    }
}

describe('buildDataSchema', () => {
    it('accepts a valid payload and strips unknown keys', () => {
        const schema = buildDataSchema([
            field('firstName', InboundFormFieldType.TEXT, { required: true }),
            field('email', InboundFormFieldType.EMAIL, { required: true }),
        ])

        const result = schema.parse({ firstName: 'Max', email: 'max@example.com', hacker: 'x' })

        expect(result).toEqual({ firstName: 'Max', email: 'max@example.com' })
    })

    it('rejects a missing required field', () => {
        const schema = buildDataSchema([field('email', InboundFormFieldType.EMAIL, { required: true })])

        expect(schema.safeParse({}).success).toBe(false)
    })

    it('allows omitting optional fields', () => {
        const schema = buildDataSchema([field('phone', InboundFormFieldType.TEXT)])

        expect(schema.safeParse({}).success).toBe(true)
    })

    it('rejects an invalid email', () => {
        const schema = buildDataSchema([field('email', InboundFormFieldType.EMAIL, { required: true })])

        expect(schema.safeParse({ email: 'not-an-email' }).success).toBe(false)
    })

    it('enforces string length and pattern constraints', () => {
        const schema = buildDataSchema([
            field('code', InboundFormFieldType.TEXT, {
                required: true,
                minLength: 2,
                maxLength: 4,
                pattern: '^[A-Z]+$',
            }),
        ])

        expect(schema.safeParse({ code: 'AB' }).success).toBe(true)
        expect(schema.safeParse({ code: 'A' }).success).toBe(false)
        expect(schema.safeParse({ code: 'ABCDE' }).success).toBe(false)
        expect(schema.safeParse({ code: 'ab' }).success).toBe(false)
    })

    it('enforces number bounds and boolean types', () => {
        const schema = buildDataSchema([
            field('guests', InboundFormFieldType.NUMBER, { required: true, min: 1, max: 10 }),
            field('newsletter', InboundFormFieldType.BOOLEAN, { required: true }),
        ])

        expect(schema.safeParse({ guests: 5, newsletter: true }).success).toBe(true)
        expect(schema.safeParse({ guests: 0, newsletter: true }).success).toBe(false)
        expect(schema.safeParse({ guests: 5, newsletter: 'yes' }).success).toBe(false)
    })

    it('applies typed default values for omitted fields', () => {
        const schema = buildDataSchema([
            field('source', InboundFormFieldType.TEXT, null, 'website'),
            field('guests', InboundFormFieldType.NUMBER, null, '2'),
            field('newsletter', InboundFormFieldType.BOOLEAN, null, 'true'),
        ])

        const result = schema.parse({})

        expect(result).toEqual({ source: 'website', guests: 2, newsletter: true })
    })
})
```

- [ ] **Step 5: Run to verify failure**

Run: `pnpm --filter backend exec vitest run src/modules/inbound-form/helpers/field-schema.spec.ts`
Expected: FAIL — cannot resolve `./field-schema`.

- [ ] **Step 6: Implement `field-schema.ts`**

```ts
import { z } from 'zod'
import { InboundFormField, InboundFormFieldType } from '../interfaces/inbound-form-field.interface'

export function buildDataSchema(fields: InboundFormField[]) {
    const shape: Record<string, z.ZodType> = {}
    for (const field of fields) {
        shape[field.key] = buildFieldSchema(field)
    }
    return z.object(shape)
}

function buildFieldSchema(field: InboundFormField): z.ZodType {
    const validation = field.validation ?? {}
    let schema: z.ZodType

    switch (field.type) {
        case InboundFormFieldType.EMAIL: {
            schema = z.email()
            break
        }
        case InboundFormFieldType.NUMBER: {
            let numberSchema = z.number()
            if (validation.min !== undefined) {
                numberSchema = numberSchema.min(validation.min)
            }
            if (validation.max !== undefined) {
                numberSchema = numberSchema.max(validation.max)
            }
            schema = numberSchema
            break
        }
        case InboundFormFieldType.BOOLEAN: {
            schema = z.boolean()
            break
        }
        default: {
            let stringSchema = z.string()
            if (validation.minLength !== undefined) {
                stringSchema = stringSchema.min(validation.minLength)
            }
            if (validation.maxLength !== undefined) {
                stringSchema = stringSchema.max(validation.maxLength)
            }
            if (validation.pattern !== undefined) {
                stringSchema = stringSchema.regex(new RegExp(validation.pattern))
            }
            schema = stringSchema
        }
    }

    if (field.defaultValue !== null) {
        return schema.default(castDefaultValue(field))
    }
    if (!validation.required) {
        return schema.optional()
    }
    return schema
}

function castDefaultValue(field: InboundFormField): unknown {
    if (field.type === InboundFormFieldType.NUMBER) {
        return Number(field.defaultValue)
    }
    if (field.type === InboundFormFieldType.BOOLEAN) {
        return field.defaultValue === 'true'
    }
    return field.defaultValue
}
```

- [ ] **Step 7: Run all four helper specs to verify pass**

Run: `pnpm --filter backend exec vitest run src/modules/inbound-form/helpers`
Expected: PASS.

---

### Task 9: Inbound form — security service (TDD)

**Files:**

- Create: `apps/backend/src/modules/inbound-form/services/inbound-form-security.service.ts`
- Test: `apps/backend/src/modules/inbound-form/services/inbound-form-security.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { ForbiddenException } from '@nestjs/common'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    InboundFormSecurityService,
    SecurityCheckResult,
    SecurityRequestContext,
} from './inbound-form-security.service'
import {
    InboundFormRecaptchaConfig,
    InboundFormSecurity,
    InboundFormSecurityLocation,
    InboundFormSecurityType,
} from '../interfaces/inbound-form-security.interface'

function scheme(
    type: InboundFormSecurityType,
    location: InboundFormSecurityLocation,
    key: string,
    config: InboundFormRecaptchaConfig | null = null,
): InboundFormSecurity {
    return {
        inboundFormSecurityId: 1,
        inboundFormId: 1,
        type,
        location,
        key,
        config,
        createdAt: new Date(),
        updatedAt: new Date(),
    }
}

function context(partial: Partial<SecurityRequestContext> = {}): SecurityRequestContext {
    return { security: {}, headers: {}, query: {}, ...partial }
}

describe('InboundFormSecurityService', () => {
    let service: InboundFormSecurityService
    let fetchSpy: ReturnType<typeof vi.spyOn<typeof globalThis, 'fetch'>>

    beforeEach(() => {
        service = new InboundFormSecurityService()
        fetchSpy = vi.spyOn(globalThis, 'fetch')
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    describe('honeypot', () => {
        const honeypot = scheme(InboundFormSecurityType.HONEYPOT, InboundFormSecurityLocation.BODY, 'website')

        it('passes when the honeypot value is empty', async () => {
            await expect(service.checkSubmission([honeypot], context({ security: { website: null } }))).resolves.toBe(
                SecurityCheckResult.PASSED,
            )
        })

        it('flags spam when the honeypot is filled', async () => {
            await expect(
                service.checkSubmission([honeypot], context({ security: { website: 'http://spam.example' } })),
            ).resolves.toBe(SecurityCheckResult.SPAM)
        })
    })

    describe('recaptcha', () => {
        const recaptcha = scheme(
            InboundFormSecurityType.RECAPTCHA,
            InboundFormSecurityLocation.BODY,
            'recaptcha-token',
            { secret: 'secret-key', minScore: 0.5 },
        )

        function mockVerification(payload: { success: boolean; score?: number }) {
            fetchSpy.mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }))
        }

        it('passes a successful verification with a sufficient score', async () => {
            mockVerification({ success: true, score: 0.9 })

            const result = await service.checkSubmission(
                [recaptcha],
                context({ security: { 'recaptcha-token': 'token-123' } }),
            )

            expect(result).toBe(SecurityCheckResult.PASSED)
            const [url, init] = fetchSpy.mock.calls[0]!
            expect(url).toBe('https://www.google.com/recaptcha/api/siteverify')
            expect(String(init?.body)).toContain('secret=secret-key')
            expect(String(init?.body)).toContain('response=token-123')
        })

        it('rejects when the token is missing', async () => {
            await expect(service.checkSubmission([recaptcha], context())).rejects.toThrow(ForbiddenException)
            expect(fetchSpy).not.toHaveBeenCalled()
        })

        it('rejects a failed verification', async () => {
            mockVerification({ success: false })

            await expect(
                service.checkSubmission([recaptcha], context({ security: { 'recaptcha-token': 'bad' } })),
            ).rejects.toThrow(ForbiddenException)
        })

        it('rejects a score below minScore', async () => {
            mockVerification({ success: true, score: 0.2 })

            await expect(
                service.checkSubmission([recaptcha], context({ security: { 'recaptcha-token': 'low' } })),
            ).rejects.toThrow(ForbiddenException)
        })

        it('reads the token from a header when configured', async () => {
            mockVerification({ success: true, score: 0.9 })
            const headerScheme = { ...recaptcha, location: InboundFormSecurityLocation.HEADER, key: 'X-Captcha' }

            const result = await service.checkSubmission(
                [headerScheme],
                context({ headers: { 'x-captcha': 'header-token' } }),
            )

            expect(result).toBe(SecurityCheckResult.PASSED)
        })

        it('reads the token from the query when configured', async () => {
            mockVerification({ success: true, score: 0.9 })
            const queryScheme = { ...recaptcha, location: InboundFormSecurityLocation.QUERY, key: 'captcha' }

            const result = await service.checkSubmission([queryScheme], context({ query: { captcha: 'query-token' } }))

            expect(result).toBe(SecurityCheckResult.PASSED)
        })
    })

    it('rejects unsupported scheme types', async () => {
        const csrf = scheme(InboundFormSecurityType.CSRF, InboundFormSecurityLocation.HEADER, 'x-csrf')

        await expect(service.checkSubmission([csrf], context())).rejects.toThrow(ForbiddenException)
    })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter backend exec vitest run src/modules/inbound-form/services/inbound-form-security.service.spec.ts`
Expected: FAIL — cannot resolve `./inbound-form-security.service`.

- [ ] **Step 3: Implement the service**

```ts
import { ForbiddenException, Injectable, Logger } from '@nestjs/common'
import {
    InboundFormSecurity,
    InboundFormSecurityLocation,
    InboundFormSecurityType,
} from '../interfaces/inbound-form-security.interface'

export interface SecurityRequestContext {
    security: Record<string, unknown>
    headers: Record<string, unknown>
    query: Record<string, unknown>
}

export enum SecurityCheckResult {
    PASSED = 'passed',
    SPAM = 'spam',
}

interface RecaptchaVerification {
    success: boolean
    score?: number
}

@Injectable()
export class InboundFormSecurityService {
    private static readonly RECAPTCHA_VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify'

    private readonly logger = new Logger(InboundFormSecurityService.name)

    async checkSubmission(
        schemes: InboundFormSecurity[],
        context: SecurityRequestContext,
    ): Promise<SecurityCheckResult> {
        let result = SecurityCheckResult.PASSED

        for (const scheme of schemes) {
            const value = this.extractValue(scheme, context)

            switch (scheme.type) {
                case InboundFormSecurityType.HONEYPOT:
                    if (value !== undefined && value !== null && value !== '') {
                        this.logger.warn(`Honeypot "${scheme.key}" triggered for form ${scheme.inboundFormId}`)
                        result = SecurityCheckResult.SPAM
                    }
                    break
                case InboundFormSecurityType.RECAPTCHA:
                    await this.verifyRecaptcha(scheme, value)
                    break
                default:
                    throw new ForbiddenException(`Unsupported security scheme: ${scheme.type}`)
            }
        }

        return result
    }

    private extractValue(scheme: InboundFormSecurity, context: SecurityRequestContext): unknown {
        switch (scheme.location) {
            case InboundFormSecurityLocation.BODY:
                return context.security[scheme.key]
            case InboundFormSecurityLocation.HEADER:
                return context.headers[scheme.key.toLowerCase()]
            case InboundFormSecurityLocation.QUERY:
                return context.query[scheme.key]
        }
    }

    private async verifyRecaptcha(scheme: InboundFormSecurity, value: unknown): Promise<void> {
        if (typeof value !== 'string' || value === '') {
            throw new ForbiddenException('Missing captcha token')
        }
        if (!scheme.config?.secret) {
            throw new ForbiddenException('Captcha is not configured')
        }

        const response = await fetch(InboundFormSecurityService.RECAPTCHA_VERIFY_URL, {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ secret: scheme.config.secret, response: value }),
        })

        if (!response.ok) {
            throw new ForbiddenException('Captcha verification unavailable')
        }

        const verification = (await response.json()) as RecaptchaVerification

        if (!verification.success) {
            throw new ForbiddenException('Captcha verification failed')
        }

        const minScore = scheme.config.minScore
        if (minScore !== undefined && (verification.score ?? 0) < minScore) {
            throw new ForbiddenException('Captcha score too low')
        }
    }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm --filter backend exec vitest run src/modules/inbound-form/services/inbound-form-security.service.spec.ts`
Expected: PASS (9 tests). Silence the warn logger in the spec if output is noisy.

---

### Task 10: Inbound form — template service (TDD)

**Files:**

- Create: `apps/backend/src/modules/inbound-form/services/inbound-form-template.service.ts`
- Test: `apps/backend/src/modules/inbound-form/services/inbound-form-template.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { getModelToken } from '@nestjs/sequelize'
import { Test, TestingModule } from '@nestjs/testing'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { InboundFormTemplateService } from './inbound-form-template.service'
import { InboundFormTemplateModel } from '../models/inbound-form-template.model'
import { InboundFormTemplate, InboundFormTemplateStatus } from '../interfaces/inbound-form-template.interface'
import { TemplateRendererService } from '../../mail/services/template-renderer.service'

type TemplateRow = InboundFormTemplate & {
    get: (options: { plain: true }) => InboundFormTemplate
    update: Mock<(values: Partial<InboundFormTemplate>) => Promise<TemplateRow>>
}

function templateRow(partial: Partial<InboundFormTemplate>): TemplateRow {
    const template: InboundFormTemplate = {
        inboundFormTemplateId: 1,
        inboundFormReceiverId: 5,
        subject: 'Hello {{firstName}}',
        template: '<p>Hi {{firstName}}</p>',
        status: InboundFormTemplateStatus.DRAFT,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...partial,
    }
    const row = {
        ...template,
        get: () => template,
        update: vi.fn<TemplateRow['update']>(),
    }
    row.update.mockResolvedValue(row)
    return row
}

describe('InboundFormTemplateService', () => {
    let service: InboundFormTemplateService
    let findOne: Mock<(typeof InboundFormTemplateModel)['findOne']>
    let findAll: Mock<(typeof InboundFormTemplateModel)['findAll']>
    let create: Mock<(typeof InboundFormTemplateModel)['create']>
    let max: Mock<(typeof InboundFormTemplateModel)['max']>

    beforeEach(async () => {
        findOne = vi.fn<typeof findOne>()
        findAll = vi.fn<typeof findAll>().mockResolvedValue([])
        create = vi.fn<typeof create>()
        max = vi.fn<typeof max>()

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                InboundFormTemplateService,
                TemplateRendererService,
                {
                    provide: getModelToken(InboundFormTemplateModel),
                    useValue: { findOne, findAll, create, max },
                },
            ],
        }).compile()

        service = module.get(InboundFormTemplateService)
    })

    describe('saveDraft', () => {
        it('updates the existing draft in place', async () => {
            const draft = templateRow({ status: InboundFormTemplateStatus.DRAFT, version: 3 })
            findOne.mockResolvedValue(draft as unknown as InboundFormTemplateModel)

            await service.saveDraft(5, { subject: 'New subject', template: '<p>New</p>' })

            expect(draft.update).toHaveBeenCalledWith({ subject: 'New subject', template: '<p>New</p>' })
            expect(create).not.toHaveBeenCalled()
        })

        it('creates a new draft at maxVersion + 1 when none exists', async () => {
            findOne.mockResolvedValue(null)
            max.mockResolvedValue(4)
            const created = templateRow({ version: 5 })
            create.mockResolvedValue(created as unknown as InboundFormTemplateModel)

            await service.saveDraft(5, { subject: 'S', template: 'T' })

            expect(create).toHaveBeenCalledWith(
                {
                    inboundFormReceiverId: 5,
                    subject: 'S',
                    template: 'T',
                    status: InboundFormTemplateStatus.DRAFT,
                    version: 5,
                },
                { returning: true },
            )
        })

        it('starts at version 1 for a receiver without templates', async () => {
            findOne.mockResolvedValue(null)
            max.mockResolvedValue(null)
            const created = templateRow({ version: 1 })
            create.mockResolvedValue(created as unknown as InboundFormTemplateModel)

            await service.saveDraft(5, { subject: 'S', template: 'T' })

            expect(create).toHaveBeenCalledWith(expect.objectContaining({ version: 1 }), { returning: true })
        })
    })

    describe('publishDraft', () => {
        it('publishes a valid draft', async () => {
            const draft = templateRow({ status: InboundFormTemplateStatus.DRAFT })
            findOne.mockResolvedValue(draft as unknown as InboundFormTemplateModel)

            await service.publishDraft(5)

            expect(draft.update).toHaveBeenCalledWith({ status: InboundFormTemplateStatus.PUBLISHED })
        })

        it('throws NotFoundException without a draft', async () => {
            findOne.mockResolvedValue(null)

            await expect(service.publishDraft(5)).rejects.toThrow(NotFoundException)
        })

        it('rejects publishing with an empty subject', async () => {
            const draft = templateRow({ subject: '   ' })
            findOne.mockResolvedValue(draft as unknown as InboundFormTemplateModel)

            await expect(service.publishDraft(5)).rejects.toThrow(BadRequestException)
        })

        it('rejects publishing a syntactically broken template', async () => {
            const draft = templateRow({ template: '{{#if}}' })
            findOne.mockResolvedValue(draft as unknown as InboundFormTemplateModel)

            await expect(service.publishDraft(5)).rejects.toThrow(BadRequestException)
        })
    })

    describe('getPublished', () => {
        it('returns the newest published version', async () => {
            const published = templateRow({ status: InboundFormTemplateStatus.PUBLISHED, version: 2 })
            findOne.mockResolvedValue(published as unknown as InboundFormTemplateModel)

            const result = await service.getPublished(5)

            expect(findOne).toHaveBeenCalledWith({
                where: { inboundFormReceiverId: 5, status: InboundFormTemplateStatus.PUBLISHED },
                order: [['version', 'DESC']],
            })
            expect(result?.version).toBe(2)
        })

        it('returns null when nothing is published', async () => {
            findOne.mockResolvedValue(null)

            await expect(service.getPublished(5)).resolves.toBeNull()
        })
    })

    describe('getVersionSummaries', () => {
        it('maps draft and published versions per receiver', async () => {
            findAll.mockResolvedValue([
                templateRow({ inboundFormReceiverId: 5, status: InboundFormTemplateStatus.DRAFT, version: 3 }),
                templateRow({ inboundFormReceiverId: 5, status: InboundFormTemplateStatus.PUBLISHED, version: 2 }),
                templateRow({ inboundFormReceiverId: 6, status: InboundFormTemplateStatus.PUBLISHED, version: 1 }),
            ] as unknown as InboundFormTemplateModel[])

            const result = await service.getVersionSummaries([5, 6, 7])

            expect(result[5]).toEqual({ draftVersion: 3, publishedVersion: 2 })
            expect(result[6]).toEqual({ draftVersion: null, publishedVersion: 1 })
            expect(result[7]).toEqual({ draftVersion: null, publishedVersion: null })
        })
    })
})
```

Note for this spec and the ones in Tasks 11–14: if `Mock<...>` over an overloaded Sequelize static (`findOne`, `create`, `max`, `transaction`) does not typecheck cleanly, mirror how `src/modules/domain/services/domain.service.spec.ts` types its model mocks — that file is the house pattern for mocking `sequelize-typescript` statics.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter backend exec vitest run src/modules/inbound-form/services/inbound-form-template.service.spec.ts`
Expected: FAIL — cannot resolve `./inbound-form-template.service`.

- [ ] **Step 3: Implement the service**

```ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/sequelize'
import { Op } from 'sequelize'
import { InboundFormTemplateModel } from '../models/inbound-form-template.model'
import {
    InboundFormTemplate,
    InboundFormTemplateDraft,
    InboundFormTemplateStatus,
    InboundFormTemplateSummary,
} from '../interfaces/inbound-form-template.interface'
import { TemplateRendererService, TemplateRenderError } from '../../mail/services/template-renderer.service'

@Injectable()
export class InboundFormTemplateService {
    constructor(
        @InjectModel(InboundFormTemplateModel) private readonly templateModel: typeof InboundFormTemplateModel,
        private readonly templateRendererService: TemplateRendererService,
    ) {}

    async listVersions(receiverId: number): Promise<InboundFormTemplate[]> {
        const templates = await this.templateModel.findAll({
            where: { inboundFormReceiverId: receiverId },
            order: [['version', 'DESC']],
        })

        return templates.map((template) => template.get({ plain: true }))
    }

    async saveDraft(receiverId: number, draft: InboundFormTemplateDraft): Promise<InboundFormTemplate> {
        const existingDraft = await this.templateModel.findOne({
            where: { inboundFormReceiverId: receiverId, status: InboundFormTemplateStatus.DRAFT },
        })

        if (existingDraft) {
            await existingDraft.update({ subject: draft.subject, template: draft.template })
            return existingDraft.get({ plain: true })
        }

        const latestVersion = await this.templateModel.max<number | null, InboundFormTemplateModel>('version', {
            where: { inboundFormReceiverId: receiverId },
        })

        const created = await this.templateModel.create(
            {
                inboundFormReceiverId: receiverId,
                subject: draft.subject,
                template: draft.template,
                status: InboundFormTemplateStatus.DRAFT,
                version: (latestVersion ?? 0) + 1,
            },
            { returning: true },
        )

        return created.get({ plain: true })
    }

    async publishDraft(receiverId: number): Promise<InboundFormTemplate> {
        const draft = await this.templateModel.findOne({
            where: { inboundFormReceiverId: receiverId, status: InboundFormTemplateStatus.DRAFT },
        })

        if (!draft) {
            throw new NotFoundException('There is no draft to publish')
        }
        if (!draft.subject.trim() || !draft.template.trim()) {
            throw new BadRequestException('Subject and template must not be empty')
        }

        try {
            this.templateRendererService.assertValid(draft.subject)
            this.templateRendererService.assertValid(draft.template)
        } catch (error) {
            if (error instanceof TemplateRenderError) {
                throw new BadRequestException(error.message)
            }
            throw error
        }

        await draft.update({ status: InboundFormTemplateStatus.PUBLISHED })

        return draft.get({ plain: true })
    }

    async getPublished(receiverId: number): Promise<InboundFormTemplate | null> {
        const template = await this.templateModel.findOne({
            where: { inboundFormReceiverId: receiverId, status: InboundFormTemplateStatus.PUBLISHED },
            order: [['version', 'DESC']],
        })

        return template?.get({ plain: true }) ?? null
    }

    async getVersionSummaries(receiverIds: number[]): Promise<Record<number, InboundFormTemplateSummary>> {
        const summaries: Record<number, InboundFormTemplateSummary> = {}
        for (const receiverId of receiverIds) {
            summaries[receiverId] = { draftVersion: null, publishedVersion: null }
        }

        if (receiverIds.length === 0) {
            return summaries
        }

        const templates = await this.templateModel.findAll({
            where: { inboundFormReceiverId: { [Op.in]: receiverIds } },
            order: [['version', 'ASC']],
        })

        for (const template of templates) {
            const summary = summaries[template.inboundFormReceiverId]
            if (!summary) {
                continue
            }
            if (template.status === InboundFormTemplateStatus.DRAFT) {
                summary.draftVersion = template.version
            } else {
                summary.publishedVersion = template.version
            }
        }

        return summaries
    }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm --filter backend exec vitest run src/modules/inbound-form/services/inbound-form-template.service.spec.ts`
Expected: PASS (10 tests).

---

### Task 11: Inbound form — form service: CRUD (TDD)

**Files:**

- Create: `apps/backend/src/modules/inbound-form/services/inbound-form.service.ts`
- Test: `apps/backend/src/modules/inbound-form/services/inbound-form.service.spec.ts`

The service depends on `DomainService` (exported in Task 6) for domain checks and `Sequelize` for transactions in the later tasks. The spec builds one shared test-bed used by Tasks 11–13; write it once here and extend it.

- [ ] **Step 1: Write the failing tests (shared test-bed + CRUD describe blocks)**

```ts
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { getModelToken } from '@nestjs/sequelize'
import { Test, TestingModule } from '@nestjs/testing'
import { Sequelize } from 'sequelize-typescript'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { InboundFormService } from './inbound-form.service'
import { InboundFormModel } from '../models/inbound-form.model'
import { InboundFormFieldModel } from '../models/inbound-form-field.model'
import { InboundFormSecurityModel } from '../models/inbound-form-security.model'
import { InboundFormReceiverModel } from '../models/inbound-form-receiver.model'
import { DomainService } from '../../domain/services/domain.service'
import { Domain } from '../../domain/interfaces/domain.interface'
import { InboundForm, InboundFormFull } from '../interfaces/inbound-form.interface'
import {
    InboundFormField,
    InboundFormFieldType,
    InboundFormFieldUpsert,
} from '../interfaces/inbound-form-field.interface'
import { InboundFormReceiver, InboundFormReceiverUpsert } from '../interfaces/inbound-form-receiver.interface'
import {
    InboundFormSecurityLocation,
    InboundFormSecurityType,
    InboundFormSecurityUpsert,
} from '../interfaces/inbound-form-security.interface'

const domain: Domain = {
    domainId: 3,
    fqdn: 'mail.example.com',
    rootDomain: 'example.com',
    activeDkimId: 7,
    dnsRecords: [],
    lastCheckedAt: null,
}

const emailField: InboundFormField = {
    inboundFormFieldId: 21,
    inboundFormId: 1,
    key: 'email',
    label: 'Email',
    type: InboundFormFieldType.EMAIL,
    defaultValue: null,
    validation: { required: true },
    createdAt: new Date(),
    updatedAt: new Date(),
}

const textField: InboundFormField = {
    ...emailField,
    inboundFormFieldId: 22,
    key: 'firstName',
    label: 'First name',
    type: InboundFormFieldType.TEXT,
}

const receiver: InboundFormReceiver = {
    inboundFormReceiverId: 31,
    inboundFormId: 1,
    emailFrom: 'noreply@mail.example.com',
    emailReceiver: 'owner@business.com',
    emailReplyTo: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
}

const form: InboundForm = {
    inboundFormId: 1,
    domainId: 3,
    name: 'Contact',
    slug: 'contact',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
}

const formFull: InboundFormFull = {
    ...form,
    inboundFormFields: [emailField, textField],
    inboundFormReceivers: [receiver],
    inboundFormSecurity: [],
}

type FormRow = InboundFormFull & {
    get: (options: { plain: true }) => InboundFormFull
    update: Mock<(values: Partial<InboundForm>) => Promise<FormRow>>
    destroy: Mock<() => Promise<void>>
}

function formRow(partial: Partial<InboundFormFull> = {}): FormRow {
    const plain: InboundFormFull = { ...formFull, ...partial }
    const row = {
        ...plain,
        get: () => plain,
        update: vi.fn<FormRow['update']>(),
        destroy: vi.fn<FormRow['destroy']>().mockResolvedValue(undefined),
    }
    row.update.mockResolvedValue(row)
    return row
}

describe('InboundFormService', () => {
    let service: InboundFormService
    let formFindAll: Mock<(typeof InboundFormModel)['findAll']>
    let formFindByPk: Mock<(typeof InboundFormModel)['findByPk']>
    let formCreate: Mock<(typeof InboundFormModel)['create']>
    let fieldFindAll: Mock<(typeof InboundFormFieldModel)['findAll']>
    let fieldDestroy: Mock<(typeof InboundFormFieldModel)['destroy']>
    let fieldUpsertCreate: Mock<(typeof InboundFormFieldModel)['create']>
    let fieldUpdate: Mock<(typeof InboundFormFieldModel)['update']>
    let securityDestroy: Mock<(typeof InboundFormSecurityModel)['destroy']>
    let securityBulkCreate: Mock<(typeof InboundFormSecurityModel)['bulkCreate']>
    let receiverFindOne: Mock<(typeof InboundFormReceiverModel)['findOne']>
    let receiverCreate: Mock<(typeof InboundFormReceiverModel)['create']>
    let getDomainById: Mock<DomainService['getDomainById']>
    let transaction: Mock<Sequelize['transaction']>

    beforeEach(async () => {
        formFindAll = vi.fn<typeof formFindAll>().mockResolvedValue([])
        formFindByPk = vi.fn<typeof formFindByPk>()
        formCreate = vi.fn<typeof formCreate>()
        fieldFindAll = vi.fn<typeof fieldFindAll>().mockResolvedValue([])
        fieldDestroy = vi.fn<typeof fieldDestroy>().mockResolvedValue(0)
        fieldUpsertCreate = vi.fn<typeof fieldUpsertCreate>()
        fieldUpdate = vi.fn<typeof fieldUpdate>().mockResolvedValue([0])
        securityDestroy = vi.fn<typeof securityDestroy>().mockResolvedValue(0)
        securityBulkCreate = vi.fn<typeof securityBulkCreate>().mockResolvedValue([])
        receiverFindOne = vi.fn<typeof receiverFindOne>()
        receiverCreate = vi.fn<typeof receiverCreate>()
        getDomainById = vi.fn<typeof getDomainById>().mockResolvedValue(domain)
        transaction = vi
            .fn<typeof transaction>()
            .mockImplementation(async <T>(callback?: (t: unknown) => PromiseLike<T>): Promise<T> => callback!(null))

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                InboundFormService,
                {
                    provide: getModelToken(InboundFormModel),
                    useValue: { findAll: formFindAll, findByPk: formFindByPk, create: formCreate },
                },
                {
                    provide: getModelToken(InboundFormFieldModel),
                    useValue: {
                        findAll: fieldFindAll,
                        destroy: fieldDestroy,
                        create: fieldUpsertCreate,
                        update: fieldUpdate,
                    },
                },
                {
                    provide: getModelToken(InboundFormSecurityModel),
                    useValue: { destroy: securityDestroy, bulkCreate: securityBulkCreate },
                },
                {
                    provide: getModelToken(InboundFormReceiverModel),
                    useValue: { findOne: receiverFindOne, create: receiverCreate },
                },
                { provide: DomainService, useValue: { getDomainById } },
                { provide: Sequelize, useValue: { transaction } },
            ],
        }).compile()

        service = module.get(InboundFormService)
    })

    describe('createForm', () => {
        it('verifies the domain and creates the form', async () => {
            const row = formRow()
            formCreate.mockResolvedValue(row as unknown as InboundFormModel)

            const result = await service.createForm({ name: 'Contact', slug: 'contact', domainId: 3 })

            expect(getDomainById).toHaveBeenCalledWith(3)
            expect(formCreate).toHaveBeenCalledWith(
                { name: 'Contact', slug: 'contact', domainId: 3, isActive: true },
                { returning: true },
            )
            expect(result.slug).toBe('contact')
        })

        it('creates a form without a domain', async () => {
            formCreate.mockResolvedValue(formRow({ domainId: null }) as unknown as InboundFormModel)

            await service.createForm({ name: 'Contact', slug: 'contact', domainId: null })

            expect(getDomainById).not.toHaveBeenCalled()
        })

        it('rejects an unknown domain with a BadRequestException', async () => {
            getDomainById.mockRejectedValue(new Error('empty result'))

            await expect(service.createForm({ name: 'X', slug: 'x', domainId: 99 })).rejects.toThrow(
                BadRequestException,
            )
        })
    })

    describe('getFormById', () => {
        it('returns the full form as plain object', async () => {
            formFindByPk.mockResolvedValue(formRow() as unknown as InboundFormModel)

            const result = await service.getFormById(1)

            expect(result.inboundFormFields).toHaveLength(2)
        })

        it('throws NotFoundException for an unknown id', async () => {
            formFindByPk.mockResolvedValue(null)

            await expect(service.getFormById(404)).rejects.toThrow(NotFoundException)
        })
    })

    describe('updateForm', () => {
        it('re-validates receiver senders when the domain changes', async () => {
            formFindByPk.mockResolvedValue(formRow() as unknown as InboundFormModel)
            getDomainById.mockResolvedValue({ ...domain, domainId: 4, fqdn: 'other.example.com' })

            await expect(service.updateForm(1, { domainId: 4 })).rejects.toThrow(BadRequestException)
        })

        it('rejects removing the domain while receivers exist', async () => {
            formFindByPk.mockResolvedValue(formRow() as unknown as InboundFormModel)

            await expect(service.updateForm(1, { domainId: null })).rejects.toThrow(BadRequestException)
        })

        it('applies a simple rename', async () => {
            const row = formRow()
            formFindByPk.mockResolvedValue(row as unknown as InboundFormModel)

            await service.updateForm(1, { name: 'New name' })

            expect(row.update).toHaveBeenCalledWith({ name: 'New name' })
        })
    })

    describe('deleteForm', () => {
        it('destroys the form', async () => {
            const row = formRow()
            formFindByPk.mockResolvedValue(row as unknown as InboundFormModel)

            await service.deleteForm(1)

            expect(row.destroy).toHaveBeenCalled()
        })
    })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter backend exec vitest run src/modules/inbound-form/services/inbound-form.service.spec.ts`
Expected: FAIL — cannot resolve `./inbound-form.service`.

- [ ] **Step 3: Implement the CRUD part of `inbound-form.service.ts`**

```ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/sequelize'
import { Sequelize } from 'sequelize-typescript'
import { Op, UniqueConstraintError } from 'sequelize'
import { InboundFormModel } from '../models/inbound-form.model'
import { InboundFormFieldModel } from '../models/inbound-form-field.model'
import { InboundFormSecurityModel } from '../models/inbound-form-security.model'
import { InboundFormReceiverModel } from '../models/inbound-form-receiver.model'
import { DomainService } from '../../domain/services/domain.service'
import { Domain } from '../../domain/interfaces/domain.interface'
import { InboundForm, InboundFormFull } from '../interfaces/inbound-form.interface'
import {
    InboundFormField,
    InboundFormFieldType,
    InboundFormFieldUpsert,
} from '../interfaces/inbound-form-field.interface'
import { InboundFormReceiver, InboundFormReceiverUpsert } from '../interfaces/inbound-form-receiver.interface'
import {
    InboundFormSecurity,
    InboundFormSecurityType,
    InboundFormSecurityUpsert,
} from '../interfaces/inbound-form-security.interface'
import { parsePlaceholder } from '../helpers/placeholder'

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export interface InboundFormCreateRequest {
    name: string
    slug: string
    domainId: number | null
}

export type InboundFormUpdateRequest = Partial<InboundFormCreateRequest & { isActive: boolean }>

@Injectable()
export class InboundFormService {
    constructor(
        @InjectModel(InboundFormModel) private readonly formModel: typeof InboundFormModel,
        @InjectModel(InboundFormFieldModel) private readonly fieldModel: typeof InboundFormFieldModel,
        @InjectModel(InboundFormSecurityModel) private readonly securityModel: typeof InboundFormSecurityModel,
        @InjectModel(InboundFormReceiverModel) private readonly receiverModel: typeof InboundFormReceiverModel,
        private readonly domainService: DomainService,
        private readonly sequelize: Sequelize,
    ) {}

    async createForm(create: InboundFormCreateRequest): Promise<InboundForm> {
        if (create.domainId !== null) {
            await this.assertDomainExists(create.domainId)
        }

        try {
            const created = await this.formModel.create({ ...create, isActive: true }, { returning: true })
            return created.get({ plain: true })
        } catch (error) {
            if (error instanceof UniqueConstraintError) {
                throw new BadRequestException('Slug is already in use')
            }
            throw error
        }
    }

    async getForms(): Promise<InboundForm[]> {
        const forms = await this.formModel.findAll()

        return forms.map((form) => form.get({ plain: true }))
    }

    async getFormById(inboundFormId: number): Promise<InboundFormFull> {
        const form = await this.loadForm(inboundFormId)

        return form.get({ plain: true })
    }

    async updateForm(inboundFormId: number, update: InboundFormUpdateRequest): Promise<InboundFormFull> {
        const form = await this.loadForm(inboundFormId)

        if (update.domainId !== undefined && update.domainId !== form.domainId) {
            if (update.domainId === null) {
                if (form.inboundFormReceivers.length > 0) {
                    throw new BadRequestException('The domain cannot be removed while receivers exist')
                }
            } else {
                const domain = await this.assertDomainExists(update.domainId)
                for (const receiver of form.inboundFormReceivers) {
                    this.assertEmailFrom(receiver.emailFrom, domain)
                }
            }
        }

        try {
            await form.update(update)
        } catch (error) {
            if (error instanceof UniqueConstraintError) {
                throw new BadRequestException('Slug is already in use')
            }
            throw error
        }

        return this.getFormById(inboundFormId)
    }

    async deleteForm(inboundFormId: number): Promise<void> {
        const form = await this.loadForm(inboundFormId)

        await form.destroy()
    }

    private async loadForm(inboundFormId: number): Promise<InboundFormModel> {
        const form = await this.formModel.findByPk(inboundFormId, {
            include: [InboundFormFieldModel, InboundFormSecurityModel, InboundFormReceiverModel],
        })

        if (!form) {
            throw new NotFoundException('Unknown form')
        }

        return form
    }

    private async assertDomainExists(domainId: number): Promise<Domain> {
        try {
            return await this.domainService.getDomainById(domainId)
        } catch {
            throw new BadRequestException('Unknown domain')
        }
    }

    private assertEmailFrom(emailFrom: string, domain: Domain): void {
        if (!emailFrom.toLowerCase().endsWith(`@${domain.fqdn.toLowerCase()}`)) {
            throw new BadRequestException(`Sender address must use the form domain ${domain.fqdn}`)
        }
    }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm --filter backend exec vitest run src/modules/inbound-form/services/inbound-form.service.spec.ts`
Expected: PASS. Some imports (`Op`, upsert types, `parsePlaceholder`, `EMAIL_PATTERN`, field/security models) are used by Tasks 12–13 — if `noUnusedLocals` complains, add the imports in the task that uses them instead.

---

### Task 12: Inbound form — form service: fields & security replace (TDD)

**Files:**

- Modify: `apps/backend/src/modules/inbound-form/services/inbound-form.service.ts`
- Modify: `apps/backend/src/modules/inbound-form/services/inbound-form.service.spec.ts`

- [ ] **Step 1: Add failing describe blocks to the existing spec**

```ts
describe('replaceFields', () => {
    const upsert = (partial: Partial<InboundFormFieldUpsert>): InboundFormFieldUpsert => ({
        key: 'email',
        label: 'Email',
        type: InboundFormFieldType.EMAIL,
        defaultValue: null,
        validation: null,
        ...partial,
    })

    it('rejects duplicate keys in the payload', async () => {
        formFindByPk.mockResolvedValue(formRow() as unknown as InboundFormModel)

        await expect(service.replaceFields(1, [upsert({ key: 'email' }), upsert({ key: 'email' })])).rejects.toThrow(
            BadRequestException,
        )
    })

    it('rejects removing a field that a receiver placeholder references', async () => {
        const referencing = { ...receiver, emailReceiver: '{{email}}' }
        formFindByPk.mockResolvedValue(formRow({ inboundFormReceivers: [referencing] }) as unknown as InboundFormModel)

        await expect(
            service.replaceFields(1, [upsert({ key: 'firstName', type: InboundFormFieldType.TEXT })]),
        ).rejects.toThrow(BadRequestException)
    })

    it('rejects re-typing a referenced field away from EMAIL', async () => {
        const referencing = { ...receiver, emailReplyTo: '{{email}}' }
        formFindByPk.mockResolvedValue(formRow({ inboundFormReceivers: [referencing] }) as unknown as InboundFormModel)

        await expect(
            service.replaceFields(1, [upsert({ key: 'email', type: InboundFormFieldType.TEXT })]),
        ).rejects.toThrow(BadRequestException)
    })

    it('deletes removed fields, updates existing ones, creates new ones', async () => {
        formFindByPk.mockResolvedValue(formRow() as unknown as InboundFormModel)
        fieldFindAll.mockResolvedValue([])

        await service.replaceFields(1, [
            upsert({ key: 'email' }),
            upsert({ key: 'message', type: InboundFormFieldType.TEXT, label: 'Message' }),
        ])

        expect(fieldDestroy).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { inboundFormId: 1, key: { [Op.notIn]: ['email', 'message'] } },
            }),
        )
        expect(fieldUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ label: 'Email', type: InboundFormFieldType.EMAIL }),
            expect.objectContaining({ where: { inboundFormId: 1, key: 'email' } }),
        )
        expect(fieldUpsertCreate).toHaveBeenCalledWith(
            expect.objectContaining({ inboundFormId: 1, key: 'message' }),
            expect.anything(),
        )
    })
})

describe('replaceSecurity', () => {
    const scheme = (partial: Partial<InboundFormSecurityUpsert>): InboundFormSecurityUpsert => ({
        type: InboundFormSecurityType.HONEYPOT,
        location: InboundFormSecurityLocation.BODY,
        key: 'website',
        config: null,
        ...partial,
    })

    it('rejects duplicate scheme types', async () => {
        formFindByPk.mockResolvedValue(formRow() as unknown as InboundFormModel)

        await expect(service.replaceSecurity(1, [scheme({}), scheme({ key: 'other' })])).rejects.toThrow(
            BadRequestException,
        )
    })

    it('rejects the csrf type', async () => {
        formFindByPk.mockResolvedValue(formRow() as unknown as InboundFormModel)

        await expect(service.replaceSecurity(1, [scheme({ type: InboundFormSecurityType.CSRF })])).rejects.toThrow(
            BadRequestException,
        )
    })

    it('rejects recaptcha without a secret', async () => {
        formFindByPk.mockResolvedValue(formRow() as unknown as InboundFormModel)

        await expect(
            service.replaceSecurity(1, [scheme({ type: InboundFormSecurityType.RECAPTCHA, config: null })]),
        ).rejects.toThrow(BadRequestException)
    })

    it('replaces all schemes in a transaction', async () => {
        formFindByPk.mockResolvedValue(formRow() as unknown as InboundFormModel)

        await service.replaceSecurity(1, [
            scheme({}),
            scheme({
                type: InboundFormSecurityType.RECAPTCHA,
                key: 'recaptcha-token',
                config: { secret: 's3cret', minScore: 0.5 },
            }),
        ])

        expect(securityDestroy).toHaveBeenCalledWith(expect.objectContaining({ where: { inboundFormId: 1 } }))
        expect(securityBulkCreate).toHaveBeenCalledWith(
            [
                expect.objectContaining({ inboundFormId: 1, type: InboundFormSecurityType.HONEYPOT }),
                expect.objectContaining({ inboundFormId: 1, type: InboundFormSecurityType.RECAPTCHA }),
            ],
            expect.anything(),
        )
    })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter backend exec vitest run src/modules/inbound-form/services/inbound-form.service.spec.ts`
Expected: FAIL — `replaceFields is not a function`.

- [ ] **Step 3: Add the methods to `InboundFormService`**

```ts
    async replaceFields(inboundFormId: number, fields: InboundFormFieldUpsert[]): Promise<InboundFormField[]> {
        const form = await this.loadForm(inboundFormId)

        const keys = fields.map((field) => field.key)
        if (new Set(keys).size !== keys.length) {
            throw new BadRequestException('Field keys must be unique')
        }

        const fieldsByKey = new Map(fields.map((field) => [field.key, field]))
        for (const receiver of form.inboundFormReceivers) {
            for (const value of [receiver.emailReceiver, receiver.emailReplyTo]) {
                if (value === null) {
                    continue
                }
                const referencedKey = parsePlaceholder(value)
                if (referencedKey === null) {
                    continue
                }
                const referenced = fieldsByKey.get(referencedKey)
                if (!referenced || referenced.type !== InboundFormFieldType.EMAIL) {
                    throw new BadRequestException(
                        `Field "${referencedKey}" is referenced by a receiver and must stay an email field`,
                    )
                }
            }
        }

        const existingKeys = new Set(form.inboundFormFields.map((field) => field.key))

        await this.sequelize.transaction(async (transaction) => {
            await this.fieldModel.destroy({
                where: { inboundFormId, key: { [Op.notIn]: keys } },
                transaction,
            })

            for (const field of fields) {
                if (existingKeys.has(field.key)) {
                    await this.fieldModel.update(
                        {
                            label: field.label,
                            type: field.type,
                            defaultValue: field.defaultValue,
                            validation: field.validation,
                        },
                        { where: { inboundFormId, key: field.key }, transaction },
                    )
                } else {
                    await this.fieldModel.create({ ...field, inboundFormId }, { transaction })
                }
            }
        })

        const result = await this.fieldModel.findAll({
            where: { inboundFormId },
            order: [['inboundFormFieldId', 'ASC']],
        })

        return result.map((field) => field.get({ plain: true }))
    }

    async replaceSecurity(
        inboundFormId: number,
        schemes: InboundFormSecurityUpsert[],
    ): Promise<InboundFormSecurity[]> {
        await this.loadForm(inboundFormId)

        const types = schemes.map((scheme) => scheme.type)
        if (new Set(types).size !== types.length) {
            throw new BadRequestException('Only one scheme per type is allowed')
        }

        for (const scheme of schemes) {
            if (scheme.type === InboundFormSecurityType.CSRF) {
                throw new BadRequestException('The csrf scheme is not supported yet')
            }
            if (scheme.type === InboundFormSecurityType.RECAPTCHA && !scheme.config?.secret) {
                throw new BadRequestException('Recaptcha requires a secret')
            }
        }

        const created = await this.sequelize.transaction(async (transaction) => {
            await this.securityModel.destroy({ where: { inboundFormId }, transaction })

            return this.securityModel.bulkCreate(
                schemes.map((scheme) => ({ ...scheme, inboundFormId })),
                { transaction, returning: true },
            )
        })

        return created.map((scheme) => scheme.get({ plain: true }))
    }
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm --filter backend exec vitest run src/modules/inbound-form/services/inbound-form.service.spec.ts`
Expected: PASS.

---

### Task 13: Inbound form — form service: receivers (TDD)

**Files:**

- Modify: `apps/backend/src/modules/inbound-form/services/inbound-form.service.ts`
- Modify: `apps/backend/src/modules/inbound-form/services/inbound-form.service.spec.ts`

- [ ] **Step 1: Add failing describe blocks**

```ts
describe('createReceiver', () => {
    const upsert = (partial: Partial<InboundFormReceiverUpsert>): InboundFormReceiverUpsert => ({
        emailFrom: 'noreply@mail.example.com',
        emailReceiver: 'owner@business.com',
        emailReplyTo: null,
        isActive: true,
        ...partial,
    })

    it('creates a receiver with a literal recipient', async () => {
        formFindByPk.mockResolvedValue(formRow() as unknown as InboundFormModel)
        receiverCreate.mockResolvedValue({
            get: () => receiver,
        } as unknown as InboundFormReceiverModel)

        const result = await service.createReceiver(1, upsert({}))

        expect(receiverCreate).toHaveBeenCalledWith(
            expect.objectContaining({ inboundFormId: 1, emailFrom: 'noreply@mail.example.com' }),
            { returning: true },
        )
        expect(result.emailReceiver).toBe('owner@business.com')
    })

    it('accepts a placeholder recipient referencing an email field', async () => {
        formFindByPk.mockResolvedValue(formRow() as unknown as InboundFormModel)
        receiverCreate.mockResolvedValue({ get: () => receiver } as unknown as InboundFormReceiverModel)

        await service.createReceiver(1, upsert({ emailReceiver: '{{email}}' }))

        expect(receiverCreate).toHaveBeenCalled()
    })

    it('rejects a placeholder referencing a non-email field', async () => {
        formFindByPk.mockResolvedValue(formRow() as unknown as InboundFormModel)

        await expect(service.createReceiver(1, upsert({ emailReceiver: '{{firstName}}' }))).rejects.toThrow(
            BadRequestException,
        )
    })

    it('rejects a recipient that is neither placeholder nor email', async () => {
        formFindByPk.mockResolvedValue(formRow() as unknown as InboundFormModel)

        await expect(service.createReceiver(1, upsert({ emailReceiver: 'not-an-address' }))).rejects.toThrow(
            BadRequestException,
        )
    })

    it('rejects a sender outside the form domain', async () => {
        formFindByPk.mockResolvedValue(formRow() as unknown as InboundFormModel)

        await expect(service.createReceiver(1, upsert({ emailFrom: 'noreply@evil.example.com' }))).rejects.toThrow(
            BadRequestException,
        )
    })

    it('rejects receivers on a form without a domain', async () => {
        formFindByPk.mockResolvedValue(formRow({ domainId: null }) as unknown as InboundFormModel)

        await expect(service.createReceiver(1, upsert({}))).rejects.toThrow(BadRequestException)
    })
})

describe('updateReceiver', () => {
    it('validates and applies the update', async () => {
        formFindByPk.mockResolvedValue(formRow() as unknown as InboundFormModel)
        const update = vi.fn<(values: Partial<InboundFormReceiver>) => Promise<unknown>>().mockResolvedValue(null)
        receiverFindOne.mockResolvedValue({
            ...receiver,
            get: () => receiver,
            update,
        } as unknown as InboundFormReceiverModel)

        await service.updateReceiver(1, 31, { emailReplyTo: '{{email}}' })

        expect(update).toHaveBeenCalledWith({ emailReplyTo: '{{email}}' })
    })

    it('throws NotFoundException for a receiver of another form', async () => {
        formFindByPk.mockResolvedValue(formRow() as unknown as InboundFormModel)
        receiverFindOne.mockResolvedValue(null)

        await expect(service.updateReceiver(1, 999, { isActive: false })).rejects.toThrow(NotFoundException)
    })
})

describe('deleteReceiver', () => {
    it('destroys the receiver', async () => {
        formFindByPk.mockResolvedValue(formRow() as unknown as InboundFormModel)
        const destroy = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
        receiverFindOne.mockResolvedValue({ get: () => receiver, destroy } as unknown as InboundFormReceiverModel)

        await service.deleteReceiver(1, 31)

        expect(destroy).toHaveBeenCalled()
    })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter backend exec vitest run src/modules/inbound-form/services/inbound-form.service.spec.ts`
Expected: FAIL — `createReceiver is not a function`.

- [ ] **Step 3: Add the receiver methods to `InboundFormService`**

```ts
    async createReceiver(inboundFormId: number, create: InboundFormReceiverUpsert): Promise<InboundFormReceiver> {
        const form = await this.loadForm(inboundFormId)
        await this.assertReceiverValid(form, create)

        const created = await this.receiverModel.create({ ...create, inboundFormId }, { returning: true })

        return created.get({ plain: true })
    }

    async updateReceiver(
        inboundFormId: number,
        inboundFormReceiverId: number,
        update: Partial<InboundFormReceiverUpsert>,
    ): Promise<InboundFormReceiver> {
        const form = await this.loadForm(inboundFormId)
        const receiver = await this.loadReceiver(inboundFormId, inboundFormReceiverId)

        await this.assertReceiverValid(form, { ...receiver.get({ plain: true }), ...update })
        await receiver.update(update)

        return receiver.get({ plain: true })
    }

    async deleteReceiver(inboundFormId: number, inboundFormReceiverId: number): Promise<void> {
        await this.loadForm(inboundFormId)
        const receiver = await this.loadReceiver(inboundFormId, inboundFormReceiverId)

        await receiver.destroy()
    }

    private async loadReceiver(inboundFormId: number, inboundFormReceiverId: number): Promise<InboundFormReceiverModel> {
        const receiver = await this.receiverModel.findOne({
            where: { inboundFormId, inboundFormReceiverId },
        })

        if (!receiver) {
            throw new NotFoundException('Unknown receiver')
        }

        return receiver
    }

    private async assertReceiverValid(form: InboundFormModel, receiver: InboundFormReceiverUpsert): Promise<void> {
        if (form.domainId === null) {
            throw new BadRequestException('The form needs a domain before receivers can be configured')
        }

        const domain = await this.assertDomainExists(form.domainId)
        this.assertEmailFrom(receiver.emailFrom, domain)

        this.assertRecipient(form, receiver.emailReceiver)
        if (receiver.emailReplyTo !== null) {
            this.assertRecipient(form, receiver.emailReplyTo)
        }
    }

    private assertRecipient(form: InboundFormModel, value: string): void {
        const referencedKey = parsePlaceholder(value)

        if (referencedKey === null) {
            if (!EMAIL_PATTERN.test(value)) {
                throw new BadRequestException(`"${value}" is neither an email address nor a field placeholder`)
            }
            return
        }

        const field = form.inboundFormFields.find((formField) => formField.key === referencedKey)
        if (!field || field.type !== InboundFormFieldType.EMAIL) {
            throw new BadRequestException(`Placeholder "${value}" must reference an email field of this form`)
        }
    }
```

- [ ] **Step 4: Run the whole service spec + typecheck**

Run: `pnpm --filter backend exec vitest run src/modules/inbound-form/services/inbound-form.service.spec.ts && pnpm --filter backend typecheck`
Expected: PASS.

---

### Task 14: Inbound form — submission service (TDD)

**Files:**

- Create: `apps/backend/src/modules/inbound-form/services/inbound-form-submission.service.ts`
- Test: `apps/backend/src/modules/inbound-form/services/inbound-form-submission.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { getModelToken } from '@nestjs/sequelize'
import { Test, TestingModule } from '@nestjs/testing'
import { Logger } from '@nestjs/common'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { InboundFormSubmissionService, PublicSubmission } from './inbound-form-submission.service'
import { InboundFormModel } from '../models/inbound-form.model'
import { InboundFormSubmissionModel } from '../models/inbound-form-submission.model'
import { InboundFormDeliveryModel } from '../models/inbound-form-delivery.model'
import { InboundFormSecurityService, SecurityCheckResult } from './inbound-form-security.service'
import { InboundFormTemplateService } from './inbound-form-template.service'
import { TemplateRendererService } from '../../mail/services/template-renderer.service'
import { MailService } from '../../mail/services/mail.service'
import { InboundFormFull } from '../interfaces/inbound-form.interface'
import { InboundFormField, InboundFormFieldType } from '../interfaces/inbound-form-field.interface'
import { InboundFormReceiver } from '../interfaces/inbound-form-receiver.interface'
import { InboundFormSubmission, InboundFormSubmissionStatus } from '../interfaces/inbound-form-submission.interface'
import { InboundFormDelivery, InboundFormDeliveryStatus } from '../interfaces/inbound-form-delivery.interface'
import { InboundFormTemplate, InboundFormTemplateStatus } from '../interfaces/inbound-form-template.interface'

const emailField: InboundFormField = {
    inboundFormFieldId: 21,
    inboundFormId: 1,
    key: 'email',
    label: 'Email',
    type: InboundFormFieldType.EMAIL,
    defaultValue: null,
    validation: { required: true },
    createdAt: new Date(),
    updatedAt: new Date(),
}

const nameField: InboundFormField = {
    ...emailField,
    inboundFormFieldId: 22,
    key: 'firstName',
    label: 'First name',
    type: InboundFormFieldType.TEXT,
}

const ownerReceiver: InboundFormReceiver = {
    inboundFormReceiverId: 31,
    inboundFormId: 1,
    emailFrom: 'noreply@mail.example.com',
    emailReceiver: 'owner@business.com',
    emailReplyTo: '{{email}}',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
}

const confirmationReceiver: InboundFormReceiver = {
    ...ownerReceiver,
    inboundFormReceiverId: 32,
    emailReceiver: '{{email}}',
    emailReplyTo: null,
}

const publishedTemplate: InboundFormTemplate = {
    inboundFormTemplateId: 41,
    inboundFormReceiverId: 31,
    subject: 'Message from {{firstName}}',
    template: '<p>{{firstName}} wrote in</p>',
    status: InboundFormTemplateStatus.PUBLISHED,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
}

const formFull: InboundFormFull = {
    inboundFormId: 1,
    domainId: 3,
    name: 'Contact',
    slug: 'contact',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    inboundFormFields: [emailField, nameField],
    inboundFormReceivers: [ownerReceiver, confirmationReceiver],
    inboundFormSecurity: [],
}

const submission: PublicSubmission = {
    security: {},
    data: { email: 'max@example.com', firstName: 'Max' },
}

type DeliveryRow = InboundFormDelivery & {
    update: Mock<(values: Partial<InboundFormDelivery>) => Promise<unknown>>
}

describe('InboundFormSubmissionService', () => {
    let service: InboundFormSubmissionService
    let formFindOne: Mock<(typeof InboundFormModel)['findOne']>
    let submissionCreate: Mock<(typeof InboundFormSubmissionModel)['create']>
    let deliveryCreate: Mock<(typeof InboundFormDeliveryModel)['create']>
    let checkSubmission: Mock<InboundFormSecurityService['checkSubmission']>
    let getPublished: Mock<InboundFormTemplateService['getPublished']>
    let sendMail: Mock<MailService['sendMail']>
    let deliveryRows: DeliveryRow[]

    function mockForm(form: InboundFormFull | null) {
        formFindOne.mockResolvedValue(
            form
                ? ({
                      ...form,
                      inboundFormFields: form.inboundFormFields.map((field) => ({
                          ...field,
                          get: () => field,
                      })),
                      inboundFormSecurity: [],
                      inboundFormReceivers: form.inboundFormReceivers.map((receiver) => ({
                          ...receiver,
                          get: () => receiver,
                      })),
                      get: () => form,
                  } as unknown as InboundFormModel)
                : null,
        )
    }

    beforeEach(async () => {
        vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
        vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)

        deliveryRows = []
        formFindOne = vi.fn<typeof formFindOne>()
        submissionCreate = vi.fn<typeof submissionCreate>().mockImplementation((values) => {
            const row: InboundFormSubmission = {
                inboundFormSubmissionId: 91,
                createdAt: new Date(),
                ...(values as Omit<InboundFormSubmission, 'inboundFormSubmissionId' | 'createdAt'>),
            }
            return Promise.resolve({ ...row, get: () => row } as unknown as InboundFormSubmissionModel)
        })
        deliveryCreate = vi.fn<typeof deliveryCreate>().mockImplementation((values) => {
            const row = {
                inboundFormDeliveryId: deliveryRows.length + 1,
                createdAt: new Date(),
                updatedAt: new Date(),
                ...(values as Omit<InboundFormDelivery, 'inboundFormDeliveryId' | 'createdAt' | 'updatedAt'>),
                update: vi.fn<DeliveryRow['update']>().mockResolvedValue(null),
            } as DeliveryRow
            deliveryRows.push(row)
            return Promise.resolve(row as unknown as InboundFormDeliveryModel)
        })
        checkSubmission = vi.fn<typeof checkSubmission>().mockResolvedValue(SecurityCheckResult.PASSED)
        getPublished = vi.fn<typeof getPublished>().mockResolvedValue(publishedTemplate)
        sendMail = vi.fn<typeof sendMail>().mockResolvedValue(undefined)

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                InboundFormSubmissionService,
                TemplateRendererService,
                { provide: getModelToken(InboundFormModel), useValue: { findOne: formFindOne } },
                { provide: getModelToken(InboundFormSubmissionModel), useValue: { create: submissionCreate } },
                { provide: getModelToken(InboundFormDeliveryModel), useValue: { create: deliveryCreate } },
                { provide: InboundFormSecurityService, useValue: { checkSubmission } },
                { provide: InboundFormTemplateService, useValue: { getPublished } },
                { provide: MailService, useValue: { sendMail } },
            ],
        }).compile()

        service = module.get(InboundFormSubmissionService)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('throws NotFoundException for an unknown or inactive slug', async () => {
        mockForm(null)

        await expect(service.submitForm('nope', submission, {}, {})).rejects.toThrow(NotFoundException)
        expect(formFindOne).toHaveBeenCalledWith(expect.objectContaining({ where: { slug: 'nope', isActive: true } }))
    })

    it('rejects invalid data with a BadRequestException and stores nothing', async () => {
        mockForm(formFull)

        await expect(service.submitForm('contact', { data: { email: 'broken' } }, {}, {})).rejects.toThrow(
            BadRequestException,
        )
        expect(submissionCreate).not.toHaveBeenCalled()
    })

    it('stores a spam submission without deliveries and sends nothing', async () => {
        mockForm(formFull)
        checkSubmission.mockResolvedValue(SecurityCheckResult.SPAM)

        await service.submitForm('contact', submission, {}, {})

        expect(submissionCreate).toHaveBeenCalledWith(
            expect.objectContaining({ status: InboundFormSubmissionStatus.SPAM }),
            expect.anything(),
        )
        expect(deliveryCreate).not.toHaveBeenCalled()
        expect(sendMail).not.toHaveBeenCalled()
    })

    it('accepts a submission, renders templates and sends one mail per receiver', async () => {
        mockForm(formFull)

        await service.submitForm('contact', submission, {}, {})
        await vi.waitFor(() => expect(sendMail).toHaveBeenCalledTimes(2))

        expect(submissionCreate).toHaveBeenCalledWith(
            expect.objectContaining({
                status: InboundFormSubmissionStatus.ACCEPTED,
                data: { email: 'max@example.com', firstName: 'Max' },
            }),
            expect.anything(),
        )
        expect(sendMail).toHaveBeenCalledWith({
            from: 'noreply@mail.example.com',
            to: 'owner@business.com',
            replyTo: 'max@example.com',
            subject: 'Message from Max',
            html: '<p>Max wrote in</p>',
        })
        expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'max@example.com', replyTo: undefined }))
        await vi.waitFor(() =>
            expect(deliveryRows[0]!.update).toHaveBeenCalledWith(
                expect.objectContaining({ status: InboundFormDeliveryStatus.SENT, emailTo: 'owner@business.com' }),
            ),
        )
    })

    it('skips receivers without a published template', async () => {
        mockForm(formFull)
        getPublished.mockImplementation((receiverId) => Promise.resolve(receiverId === 31 ? publishedTemplate : null))

        await service.submitForm('contact', submission, {}, {})
        await vi.waitFor(() => expect(sendMail).toHaveBeenCalledTimes(1))

        expect(deliveryCreate).toHaveBeenCalledTimes(1)
    })

    it('skips inactive receivers', async () => {
        mockForm({
            ...formFull,
            inboundFormReceivers: [ownerReceiver, { ...confirmationReceiver, isActive: false }],
        })

        await service.submitForm('contact', submission, {}, {})
        await vi.waitFor(() => expect(sendMail).toHaveBeenCalledTimes(1))
    })

    it('marks a delivery failed when sending throws', async () => {
        mockForm({ ...formFull, inboundFormReceivers: [ownerReceiver] })
        sendMail.mockRejectedValue(new Error('SMTP down'))

        await service.submitForm('contact', submission, {}, {})

        await vi.waitFor(() =>
            expect(deliveryRows[0]!.update).toHaveBeenCalledWith(
                expect.objectContaining({ status: InboundFormDeliveryStatus.FAILED, error: 'SMTP down' }),
            ),
        )
    })

    it('marks a delivery failed when a placeholder recipient is empty', async () => {
        mockForm({
            ...formFull,
            inboundFormFields: [{ ...emailField, validation: null }, nameField],
            inboundFormReceivers: [confirmationReceiver],
        })

        await service.submitForm('contact', { data: { firstName: 'Max' } }, {}, {})

        await vi.waitFor(() =>
            expect(deliveryRows[0]!.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    status: InboundFormDeliveryStatus.FAILED,
                    error: 'Recipient field "email" is empty',
                }),
            ),
        )
        expect(sendMail).not.toHaveBeenCalled()
    })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter backend exec vitest run src/modules/inbound-form/services/inbound-form-submission.service.spec.ts`
Expected: FAIL — cannot resolve `./inbound-form-submission.service`.

- [ ] **Step 3: Implement the service**

```ts
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/sequelize'
import { InboundFormModel } from '../models/inbound-form.model'
import { InboundFormFieldModel } from '../models/inbound-form-field.model'
import { InboundFormSecurityModel } from '../models/inbound-form-security.model'
import { InboundFormReceiverModel } from '../models/inbound-form-receiver.model'
import { InboundFormSubmissionModel } from '../models/inbound-form-submission.model'
import { InboundFormDeliveryModel } from '../models/inbound-form-delivery.model'
import { InboundFormSecurityService, SecurityCheckResult } from './inbound-form-security.service'
import { InboundFormTemplateService } from './inbound-form-template.service'
import { TemplateRendererService } from '../../mail/services/template-renderer.service'
import { MailService } from '../../mail/services/mail.service'
import { InboundFormSubmissionStatus } from '../interfaces/inbound-form-submission.interface'
import { InboundFormDeliveryStatus } from '../interfaces/inbound-form-delivery.interface'
import { InboundFormReceiver } from '../interfaces/inbound-form-receiver.interface'
import { InboundFormTemplate } from '../interfaces/inbound-form-template.interface'
import { buildDataSchema } from '../helpers/field-schema'
import { parsePlaceholder } from '../helpers/placeholder'

export interface PublicSubmission {
    security?: Record<string, unknown>
    data?: Record<string, unknown>
}

interface PendingDelivery {
    delivery: InboundFormDeliveryModel
    receiver: InboundFormReceiver
    template: InboundFormTemplate
}

@Injectable()
export class InboundFormSubmissionService {
    private readonly logger = new Logger(InboundFormSubmissionService.name)

    constructor(
        @InjectModel(InboundFormModel) private readonly formModel: typeof InboundFormModel,
        @InjectModel(InboundFormSubmissionModel)
        private readonly submissionModel: typeof InboundFormSubmissionModel,
        @InjectModel(InboundFormDeliveryModel)
        private readonly deliveryModel: typeof InboundFormDeliveryModel,
        private readonly securityService: InboundFormSecurityService,
        private readonly templateService: InboundFormTemplateService,
        private readonly templateRendererService: TemplateRendererService,
        private readonly mailService: MailService,
    ) {}

    async submitForm(
        slug: string,
        submission: PublicSubmission,
        headers: Record<string, unknown>,
        query: Record<string, unknown>,
    ): Promise<void> {
        const form = await this.formModel.findOne({
            where: { slug, isActive: true },
            include: [InboundFormFieldModel, InboundFormSecurityModel, InboundFormReceiverModel],
        })

        if (!form) {
            throw new NotFoundException('Unknown form')
        }

        const securityResult = await this.securityService.checkSubmission(
            form.inboundFormSecurity.map((scheme) => scheme.get({ plain: true })),
            { security: submission.security ?? {}, headers, query },
        )

        const fields = form.inboundFormFields.map((field) => field.get({ plain: true }))
        const parsed = buildDataSchema(fields).safeParse(submission.data ?? {})
        if (!parsed.success) {
            throw new BadRequestException(
                parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
            )
        }
        const data = parsed.data as Record<string, unknown>

        if (securityResult === SecurityCheckResult.SPAM) {
            await this.submissionModel.create(
                { inboundFormId: form.inboundFormId, data, status: InboundFormSubmissionStatus.SPAM },
                { returning: true },
            )
            return
        }

        const submissionRow = await this.submissionModel.create(
            { inboundFormId: form.inboundFormId, data, status: InboundFormSubmissionStatus.ACCEPTED },
            { returning: true },
        )

        const pendingDeliveries: PendingDelivery[] = []
        for (const receiverModel of form.inboundFormReceivers) {
            const receiver = receiverModel.get({ plain: true })
            if (!receiver.isActive) {
                continue
            }
            const template = await this.templateService.getPublished(receiver.inboundFormReceiverId)
            if (!template) {
                continue
            }
            const delivery = await this.deliveryModel.create(
                {
                    inboundFormSubmissionId: submissionRow.inboundFormSubmissionId,
                    inboundFormReceiverId: receiver.inboundFormReceiverId,
                    inboundFormTemplateId: template.inboundFormTemplateId,
                    emailFrom: receiver.emailFrom,
                    emailTo: receiver.emailReceiver,
                    status: InboundFormDeliveryStatus.PENDING,
                    error: null,
                    sentAt: null,
                },
                { returning: true },
            )
            pendingDeliveries.push({ delivery, receiver, template })
        }

        void this.processDeliveries(pendingDeliveries, data).catch((error: unknown) => {
            const message = error instanceof Error ? error.message : String(error)
            this.logger.error(
                `Processing deliveries for submission ${submissionRow.inboundFormSubmissionId} failed: ${message}`,
            )
        })
    }

    private async processDeliveries(deliveries: PendingDelivery[], data: Record<string, unknown>): Promise<void> {
        for (const { delivery, receiver, template } of deliveries) {
            try {
                const emailTo = this.resolveAddress(receiver.emailReceiver, data)
                const replyTo =
                    receiver.emailReplyTo !== null ? this.resolveAddress(receiver.emailReplyTo, data) : undefined

                await this.mailService.sendMail({
                    from: receiver.emailFrom,
                    to: emailTo,
                    replyTo,
                    subject: this.templateRendererService.render(template.subject, data),
                    html: this.templateRendererService.render(template.template, data),
                })

                await delivery.update({
                    status: InboundFormDeliveryStatus.SENT,
                    emailTo,
                    sentAt: new Date(),
                })
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error)
                this.logger.error(`Delivery ${delivery.inboundFormDeliveryId} failed: ${message}`)
                await delivery.update({ status: InboundFormDeliveryStatus.FAILED, error: message })
            }
        }
    }

    private resolveAddress(value: string, data: Record<string, unknown>): string {
        const fieldKey = parsePlaceholder(value)
        if (fieldKey === null) {
            return value
        }

        const resolved = data[fieldKey]
        if (typeof resolved !== 'string' || resolved === '') {
            throw new Error(`Recipient field "${fieldKey}" is empty`)
        }

        return resolved
    }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm --filter backend exec vitest run src/modules/inbound-form/services/inbound-form-submission.service.spec.ts`
Expected: PASS (8 tests).

---

### Task 15: Management DTOs + InboundFormController (TDD)

**Files:**

- Create: `apps/backend/src/modules/inbound-form/dtos/inbound-form-create.dto.ts`
- Create: `apps/backend/src/modules/inbound-form/dtos/inbound-form-field.dto.ts`
- Create: `apps/backend/src/modules/inbound-form/dtos/inbound-form-security.dto.ts`
- Create: `apps/backend/src/modules/inbound-form/dtos/inbound-form-receiver.dto.ts`
- Create: `apps/backend/src/modules/inbound-form/dtos/inbound-form-template.dto.ts`
- Create: `apps/backend/src/modules/inbound-form/dtos/inbound-form.dto.ts`
- Modify: `apps/backend/src/modules/inbound-form/services/inbound-form.service.ts` (public `getReceiver`)
- Create: `apps/backend/src/modules/inbound-form/controller/inbound-form.controller.ts`
- Test: `apps/backend/src/modules/inbound-form/controller/inbound-form.controller.spec.ts`
- Modify: `apps/backend/src/modules/inbound-form/inbound-form.module.ts`

- [ ] **Step 1: Create the request DTOs — `inbound-form-create.dto.ts`**

```ts
import { Expose } from 'class-transformer'
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator'

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export class InboundFormCreateDto {
    @Expose()
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    name!: string

    @Expose()
    @IsString()
    @Matches(SLUG_PATTERN)
    @MaxLength(255)
    slug!: string

    @Expose()
    @IsOptional()
    @IsInt()
    domainId: number | null = null
}

export class InboundFormUpdateDto {
    @Expose()
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    name?: string

    @Expose()
    @IsOptional()
    @IsString()
    @Matches(SLUG_PATTERN)
    @MaxLength(255)
    slug?: string

    @Expose()
    @IsOptional()
    @IsInt()
    domainId?: number | null

    @Expose()
    @IsOptional()
    @IsBoolean()
    isActive?: boolean
}
```

- [ ] **Step 2: Create `inbound-form-field.dto.ts`**

```ts
import { Expose, Type } from 'class-transformer'
import {
    IsBoolean,
    IsEnum,
    IsInt,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
    Min,
    ValidateNested,
} from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'
import {
    InboundFormField,
    InboundFormFieldType,
    InboundFormFieldValidation,
} from '../interfaces/inbound-form-field.interface'

export class InboundFormFieldValidationDto implements InboundFormFieldValidation {
    @Expose()
    @IsOptional()
    @IsBoolean()
    required?: boolean

    @Expose()
    @IsOptional()
    @IsInt()
    @Min(0)
    minLength?: number

    @Expose()
    @IsOptional()
    @IsInt()
    @Min(0)
    maxLength?: number

    @Expose()
    @IsOptional()
    @IsString()
    pattern?: string

    @Expose()
    @IsOptional()
    @IsNumber()
    min?: number

    @Expose()
    @IsOptional()
    @IsNumber()
    max?: number
}

export class InboundFormFieldUpsertDto {
    @Expose()
    @IsString()
    @Matches(/^[\w-]+$/)
    @MaxLength(255)
    key!: string

    @Expose()
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    label!: string

    @Expose()
    @ApiProperty({ enum: InboundFormFieldType })
    @IsEnum(InboundFormFieldType)
    type!: InboundFormFieldType

    @Expose()
    @IsOptional()
    @IsString()
    @MaxLength(255)
    defaultValue: string | null = null

    @Expose()
    @IsOptional()
    @ValidateNested()
    @Type(() => InboundFormFieldValidationDto)
    validation: InboundFormFieldValidationDto | null = null
}

export class InboundFormFieldsPutDto {
    @Expose()
    @ValidateNested({ each: true })
    @Type(() => InboundFormFieldUpsertDto)
    fields!: InboundFormFieldUpsertDto[]
}

export class InboundFormFieldDto {
    @Expose()
    inboundFormFieldId!: number

    @Expose()
    key!: string

    @Expose()
    label!: string

    @Expose()
    @ApiProperty({ enum: InboundFormFieldType })
    type!: InboundFormFieldType

    @Expose()
    defaultValue: string | null = null

    @Expose()
    @Type(() => InboundFormFieldValidationDto)
    validation: InboundFormFieldValidationDto | null = null

    static fromField(field: InboundFormField): InboundFormFieldDto {
        return {
            inboundFormFieldId: field.inboundFormFieldId,
            key: field.key,
            label: field.label,
            type: field.type,
            defaultValue: field.defaultValue,
            validation: field.validation,
        }
    }
}
```

- [ ] **Step 3: Create `inbound-form-security.dto.ts`**

```ts
import { Expose, Type } from 'class-transformer'
import {
    IsEnum,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
    ValidateNested,
} from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'
import {
    InboundFormRecaptchaConfig,
    InboundFormSecurity,
    InboundFormSecurityLocation,
    InboundFormSecurityType,
} from '../interfaces/inbound-form-security.interface'

export class InboundFormRecaptchaConfigDto implements InboundFormRecaptchaConfig {
    @Expose()
    @IsString()
    @IsNotEmpty()
    secret!: string

    @Expose()
    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(1)
    minScore?: number
}

export class InboundFormSecurityUpsertDto {
    @Expose()
    @ApiProperty({ enum: InboundFormSecurityType })
    @IsEnum(InboundFormSecurityType)
    type!: InboundFormSecurityType

    @Expose()
    @ApiProperty({ enum: InboundFormSecurityLocation })
    @IsEnum(InboundFormSecurityLocation)
    location!: InboundFormSecurityLocation

    @Expose()
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    key!: string

    @Expose()
    @IsOptional()
    @ValidateNested()
    @Type(() => InboundFormRecaptchaConfigDto)
    config: InboundFormRecaptchaConfigDto | null = null
}

export class InboundFormSecurityPutDto {
    @Expose()
    @ValidateNested({ each: true })
    @Type(() => InboundFormSecurityUpsertDto)
    security!: InboundFormSecurityUpsertDto[]
}

export class InboundFormSecurityDto {
    @Expose()
    inboundFormSecurityId!: number

    @Expose()
    @ApiProperty({ enum: InboundFormSecurityType })
    type!: InboundFormSecurityType

    @Expose()
    @ApiProperty({ enum: InboundFormSecurityLocation })
    location!: InboundFormSecurityLocation

    @Expose()
    key!: string

    @Expose()
    @Type(() => InboundFormRecaptchaConfigDto)
    config: InboundFormRecaptchaConfigDto | null = null

    static fromSecurity(security: InboundFormSecurity): InboundFormSecurityDto {
        return {
            inboundFormSecurityId: security.inboundFormSecurityId,
            type: security.type,
            location: security.location,
            key: security.key,
            config: security.config,
        }
    }
}
```

- [ ] **Step 4: Create `inbound-form-receiver.dto.ts`**

```ts
import { Expose } from 'class-transformer'
import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator'
import { InboundFormReceiver } from '../interfaces/inbound-form-receiver.interface'
import { InboundFormTemplateSummary } from '../interfaces/inbound-form-template.interface'

export class InboundFormReceiverCreateDto {
    @Expose()
    @IsEmail()
    @MaxLength(255)
    emailFrom!: string

    @Expose()
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    emailReceiver!: string

    @Expose()
    @IsOptional()
    @IsString()
    @MaxLength(255)
    emailReplyTo: string | null = null

    @Expose()
    @IsOptional()
    @IsBoolean()
    isActive: boolean = true
}

export class InboundFormReceiverUpdateDto {
    @Expose()
    @IsOptional()
    @IsEmail()
    @MaxLength(255)
    emailFrom?: string

    @Expose()
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    emailReceiver?: string

    @Expose()
    @IsOptional()
    @IsString()
    @MaxLength(255)
    emailReplyTo?: string | null

    @Expose()
    @IsOptional()
    @IsBoolean()
    isActive?: boolean
}

export class InboundFormReceiverDto {
    @Expose()
    inboundFormReceiverId!: number

    @Expose()
    emailFrom!: string

    @Expose()
    emailReceiver!: string

    @Expose()
    emailReplyTo: string | null = null

    @Expose()
    isActive!: boolean

    @Expose()
    draftVersion: number | null = null

    @Expose()
    publishedVersion: number | null = null

    static fromReceiver(
        receiver: InboundFormReceiver,
        summary: InboundFormTemplateSummary = { draftVersion: null, publishedVersion: null },
    ): InboundFormReceiverDto {
        return {
            inboundFormReceiverId: receiver.inboundFormReceiverId,
            emailFrom: receiver.emailFrom,
            emailReceiver: receiver.emailReceiver,
            emailReplyTo: receiver.emailReplyTo,
            isActive: receiver.isActive,
            draftVersion: summary.draftVersion,
            publishedVersion: summary.publishedVersion,
        }
    }
}
```

- [ ] **Step 5: Create `inbound-form-template.dto.ts`**

```ts
import { Expose } from 'class-transformer'
import { IsString, MaxLength } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'
import { InboundFormTemplate, InboundFormTemplateStatus } from '../interfaces/inbound-form-template.interface'

export class InboundFormTemplateDraftDto {
    @Expose()
    @IsString()
    @MaxLength(255)
    subject!: string

    @Expose()
    @IsString()
    template!: string
}

export class InboundFormTemplateDto {
    @Expose()
    inboundFormTemplateId!: number

    @Expose()
    inboundFormReceiverId!: number

    @Expose()
    subject!: string

    @Expose()
    template!: string

    @Expose()
    @ApiProperty({ enum: InboundFormTemplateStatus })
    status!: InboundFormTemplateStatus

    @Expose()
    version!: number

    @Expose()
    updatedAt!: Date

    static fromTemplate(template: InboundFormTemplate): InboundFormTemplateDto {
        return {
            inboundFormTemplateId: template.inboundFormTemplateId,
            inboundFormReceiverId: template.inboundFormReceiverId,
            subject: template.subject,
            template: template.template,
            status: template.status,
            version: template.version,
            updatedAt: template.updatedAt,
        }
    }
}
```

- [ ] **Step 6: Create `inbound-form.dto.ts`**

```ts
import { Expose, Type } from 'class-transformer'
import { InboundForm, InboundFormFull } from '../interfaces/inbound-form.interface'
import { InboundFormTemplateSummary } from '../interfaces/inbound-form-template.interface'
import { InboundFormFieldDto } from './inbound-form-field.dto'
import { InboundFormSecurityDto } from './inbound-form-security.dto'
import { InboundFormReceiverDto } from './inbound-form-receiver.dto'

export class InboundFormDto {
    @Expose()
    inboundFormId!: number

    @Expose()
    domainId: number | null = null

    @Expose()
    name!: string

    @Expose()
    slug!: string

    @Expose()
    isActive!: boolean

    @Expose()
    createdAt!: Date

    static fromInboundForm(form: InboundForm): InboundFormDto {
        return {
            inboundFormId: form.inboundFormId,
            domainId: form.domainId,
            name: form.name,
            slug: form.slug,
            isActive: form.isActive,
            createdAt: form.createdAt,
        }
    }
}

export class InboundFormDetailDto extends InboundFormDto {
    @Expose()
    @Type(() => InboundFormFieldDto)
    fields!: InboundFormFieldDto[]

    @Expose()
    @Type(() => InboundFormSecurityDto)
    security!: InboundFormSecurityDto[]

    @Expose()
    @Type(() => InboundFormReceiverDto)
    receivers!: InboundFormReceiverDto[]

    static fromInboundFormFull(
        form: InboundFormFull,
        summaries: Record<number, InboundFormTemplateSummary>,
    ): InboundFormDetailDto {
        return {
            ...InboundFormDto.fromInboundForm(form),
            fields: form.inboundFormFields.map(InboundFormFieldDto.fromField),
            security: form.inboundFormSecurity.map(InboundFormSecurityDto.fromSecurity),
            receivers: form.inboundFormReceivers.map((receiver) =>
                InboundFormReceiverDto.fromReceiver(receiver, summaries[receiver.inboundFormReceiverId]),
            ),
        }
    }
}
```

- [ ] **Step 7: Add `getReceiver` to `InboundFormService`** (the controller needs it to scope template routes to the form)

```ts
    async getReceiver(inboundFormId: number, inboundFormReceiverId: number): Promise<InboundFormReceiver> {
        const receiver = await this.loadReceiver(inboundFormId, inboundFormReceiverId)

        return receiver.get({ plain: true })
    }
```

- [ ] **Step 8: Write the failing controller tests**

```ts
import { Test, TestingModule } from '@nestjs/testing'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { InboundFormController } from './inbound-form.controller'
import { InboundFormService } from '../services/inbound-form.service'
import { InboundFormTemplateService } from '../services/inbound-form-template.service'
import { InboundForm, InboundFormFull } from '../interfaces/inbound-form.interface'
import { InboundFormReceiver } from '../interfaces/inbound-form-receiver.interface'
import { InboundFormTemplate, InboundFormTemplateStatus } from '../interfaces/inbound-form-template.interface'

const form: InboundForm = {
    inboundFormId: 1,
    domainId: 3,
    name: 'Contact',
    slug: 'contact',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
}

const receiver: InboundFormReceiver = {
    inboundFormReceiverId: 31,
    inboundFormId: 1,
    emailFrom: 'noreply@mail.example.com',
    emailReceiver: 'owner@business.com',
    emailReplyTo: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
}

const formFull: InboundFormFull = {
    ...form,
    inboundFormFields: [],
    inboundFormSecurity: [],
    inboundFormReceivers: [receiver],
}

const template: InboundFormTemplate = {
    inboundFormTemplateId: 41,
    inboundFormReceiverId: 31,
    subject: 'Subject',
    template: '<p>Body</p>',
    status: InboundFormTemplateStatus.DRAFT,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
}

describe('InboundFormController', () => {
    let controller: InboundFormController
    let createForm: Mock<InboundFormService['createForm']>
    let getForms: Mock<InboundFormService['getForms']>
    let getFormById: Mock<InboundFormService['getFormById']>
    let updateForm: Mock<InboundFormService['updateForm']>
    let deleteForm: Mock<InboundFormService['deleteForm']>
    let replaceFields: Mock<InboundFormService['replaceFields']>
    let replaceSecurity: Mock<InboundFormService['replaceSecurity']>
    let createReceiver: Mock<InboundFormService['createReceiver']>
    let updateReceiver: Mock<InboundFormService['updateReceiver']>
    let deleteReceiver: Mock<InboundFormService['deleteReceiver']>
    let getReceiver: Mock<InboundFormService['getReceiver']>
    let listVersions: Mock<InboundFormTemplateService['listVersions']>
    let saveDraft: Mock<InboundFormTemplateService['saveDraft']>
    let publishDraft: Mock<InboundFormTemplateService['publishDraft']>
    let getVersionSummaries: Mock<InboundFormTemplateService['getVersionSummaries']>

    beforeEach(async () => {
        createForm = vi.fn<typeof createForm>().mockResolvedValue(form)
        getForms = vi.fn<typeof getForms>().mockResolvedValue([form])
        getFormById = vi.fn<typeof getFormById>().mockResolvedValue(formFull)
        updateForm = vi.fn<typeof updateForm>().mockResolvedValue(formFull)
        deleteForm = vi.fn<typeof deleteForm>().mockResolvedValue(undefined)
        replaceFields = vi.fn<typeof replaceFields>().mockResolvedValue([])
        replaceSecurity = vi.fn<typeof replaceSecurity>().mockResolvedValue([])
        createReceiver = vi.fn<typeof createReceiver>().mockResolvedValue(receiver)
        updateReceiver = vi.fn<typeof updateReceiver>().mockResolvedValue(receiver)
        deleteReceiver = vi.fn<typeof deleteReceiver>().mockResolvedValue(undefined)
        getReceiver = vi.fn<typeof getReceiver>().mockResolvedValue(receiver)
        listVersions = vi.fn<typeof listVersions>().mockResolvedValue([template])
        saveDraft = vi.fn<typeof saveDraft>().mockResolvedValue(template)
        publishDraft = vi.fn<typeof publishDraft>().mockResolvedValue(template)
        getVersionSummaries = vi.fn<typeof getVersionSummaries>().mockResolvedValue({
            31: { draftVersion: 1, publishedVersion: null },
        })

        const module: TestingModule = await Test.createTestingModule({
            controllers: [InboundFormController],
            providers: [
                {
                    provide: InboundFormService,
                    useValue: {
                        createForm,
                        getForms,
                        getFormById,
                        updateForm,
                        deleteForm,
                        replaceFields,
                        replaceSecurity,
                        createReceiver,
                        updateReceiver,
                        deleteReceiver,
                        getReceiver,
                    },
                },
                {
                    provide: InboundFormTemplateService,
                    useValue: { listVersions, saveDraft, publishDraft, getVersionSummaries },
                },
            ],
        }).compile()

        controller = module.get(InboundFormController)
    })

    it('creates a form', async () => {
        const result = await controller.createInboundForm({ name: 'Contact', slug: 'contact', domainId: 3 })

        expect(createForm).toHaveBeenCalledWith({ name: 'Contact', slug: 'contact', domainId: 3 })
        expect(result.slug).toBe('contact')
    })

    it('lists forms', async () => {
        const result = await controller.getInboundForms()

        expect(result).toHaveLength(1)
        expect(result[0]).toMatchObject({ inboundFormId: 1, slug: 'contact' })
    })

    it('returns the detail view with template summaries per receiver', async () => {
        const result = await controller.getInboundForm(1)

        expect(getVersionSummaries).toHaveBeenCalledWith([31])
        expect(result.receivers[0]).toMatchObject({
            inboundFormReceiverId: 31,
            draftVersion: 1,
            publishedVersion: null,
        })
    })

    it('replaces fields through the service', async () => {
        await controller.updateInboundFormFields(1, { fields: [] })

        expect(replaceFields).toHaveBeenCalledWith(1, [])
    })

    it('replaces security schemes through the service', async () => {
        await controller.updateInboundFormSecurity(1, { security: [] })

        expect(replaceSecurity).toHaveBeenCalledWith(1, [])
    })

    it('scopes template access to the form before saving a draft', async () => {
        await controller.saveInboundFormTemplateDraft(1, 31, { subject: 'S', template: 'T' })

        expect(getReceiver).toHaveBeenCalledWith(1, 31)
        expect(saveDraft).toHaveBeenCalledWith(31, { subject: 'S', template: 'T' })
    })

    it('publishes the draft of a receiver', async () => {
        await controller.publishInboundFormTemplate(1, 31)

        expect(getReceiver).toHaveBeenCalledWith(1, 31)
        expect(publishDraft).toHaveBeenCalledWith(31)
    })

    it('lists template versions', async () => {
        const result = await controller.getInboundFormTemplates(1, 31)

        expect(getReceiver).toHaveBeenCalledWith(1, 31)
        expect(result).toHaveLength(1)
    })
})
```

- [ ] **Step 9: Run to verify failure**

Run: `pnpm --filter backend exec vitest run src/modules/inbound-form/controller/inbound-form.controller.spec.ts`
Expected: FAIL — cannot resolve `./inbound-form.controller`.

- [ ] **Step 10: Implement the controller**

```ts
import { Body, Controller, Delete, Get, Param, Patch, Post, Put, SerializeOptions } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { JwtAuth } from '../../auth/decorators/JwtAuth'
import { ResponseDto } from '../../../decorators/ResponseDto'
import { InboundFormService } from '../services/inbound-form.service'
import { InboundFormTemplateService } from '../services/inbound-form-template.service'
import { InboundFormCreateDto, InboundFormUpdateDto } from '../dtos/inbound-form-create.dto'
import { InboundFormDetailDto, InboundFormDto } from '../dtos/inbound-form.dto'
import { InboundFormFieldDto, InboundFormFieldsPutDto } from '../dtos/inbound-form-field.dto'
import { InboundFormSecurityDto, InboundFormSecurityPutDto } from '../dtos/inbound-form-security.dto'
import {
    InboundFormReceiverCreateDto,
    InboundFormReceiverDto,
    InboundFormReceiverUpdateDto,
} from '../dtos/inbound-form-receiver.dto'
import { InboundFormTemplateDraftDto, InboundFormTemplateDto } from '../dtos/inbound-form-template.dto'

@JwtAuth()
@ApiTags('inbound-form')
@Controller('inbound-form')
export class InboundFormController {
    constructor(
        private readonly inboundFormService: InboundFormService,
        private readonly templateService: InboundFormTemplateService,
    ) {}

    @ResponseDto(InboundFormDto)
    @Post()
    async createInboundForm(@Body() body: InboundFormCreateDto): Promise<InboundFormDto> {
        const form = await this.inboundFormService.createForm({
            name: body.name,
            slug: body.slug,
            domainId: body.domainId,
        })

        return InboundFormDto.fromInboundForm(form)
    }

    @SerializeOptions({ type: InboundFormDto })
    @Get()
    async getInboundForms(): Promise<InboundFormDto[]> {
        const forms = await this.inboundFormService.getForms()

        return forms.map(InboundFormDto.fromInboundForm)
    }

    @ResponseDto(InboundFormDetailDto)
    @Get(':inboundFormId')
    async getInboundForm(@Param('inboundFormId') inboundFormId: number): Promise<InboundFormDetailDto> {
        const form = await this.inboundFormService.getFormById(inboundFormId)

        return this.toDetailDto(form)
    }

    @ResponseDto(InboundFormDetailDto)
    @Patch(':inboundFormId')
    async updateInboundForm(
        @Param('inboundFormId') inboundFormId: number,
        @Body() body: InboundFormUpdateDto,
    ): Promise<InboundFormDetailDto> {
        const form = await this.inboundFormService.updateForm(inboundFormId, body)

        return this.toDetailDto(form)
    }

    @Delete(':inboundFormId')
    async deleteInboundForm(@Param('inboundFormId') inboundFormId: number): Promise<void> {
        await this.inboundFormService.deleteForm(inboundFormId)
    }

    @SerializeOptions({ type: InboundFormFieldDto })
    @Put(':inboundFormId/fields')
    async updateInboundFormFields(
        @Param('inboundFormId') inboundFormId: number,
        @Body() body: InboundFormFieldsPutDto,
    ): Promise<InboundFormFieldDto[]> {
        const fields = await this.inboundFormService.replaceFields(inboundFormId, body.fields)

        return fields.map(InboundFormFieldDto.fromField)
    }

    @SerializeOptions({ type: InboundFormSecurityDto })
    @Put(':inboundFormId/security')
    async updateInboundFormSecurity(
        @Param('inboundFormId') inboundFormId: number,
        @Body() body: InboundFormSecurityPutDto,
    ): Promise<InboundFormSecurityDto[]> {
        const security = await this.inboundFormService.replaceSecurity(inboundFormId, body.security)

        return security.map(InboundFormSecurityDto.fromSecurity)
    }

    @ResponseDto(InboundFormReceiverDto)
    @Post(':inboundFormId/receiver')
    async createInboundFormReceiver(
        @Param('inboundFormId') inboundFormId: number,
        @Body() body: InboundFormReceiverCreateDto,
    ): Promise<InboundFormReceiverDto> {
        const receiver = await this.inboundFormService.createReceiver(inboundFormId, {
            emailFrom: body.emailFrom,
            emailReceiver: body.emailReceiver,
            emailReplyTo: body.emailReplyTo,
            isActive: body.isActive,
        })

        return InboundFormReceiverDto.fromReceiver(receiver)
    }

    @ResponseDto(InboundFormReceiverDto)
    @Patch(':inboundFormId/receiver/:inboundFormReceiverId')
    async updateInboundFormReceiver(
        @Param('inboundFormId') inboundFormId: number,
        @Param('inboundFormReceiverId') inboundFormReceiverId: number,
        @Body() body: InboundFormReceiverUpdateDto,
    ): Promise<InboundFormReceiverDto> {
        const receiver = await this.inboundFormService.updateReceiver(inboundFormId, inboundFormReceiverId, body)
        const summaries = await this.templateService.getVersionSummaries([inboundFormReceiverId])

        return InboundFormReceiverDto.fromReceiver(receiver, summaries[inboundFormReceiverId])
    }

    @Delete(':inboundFormId/receiver/:inboundFormReceiverId')
    async deleteInboundFormReceiver(
        @Param('inboundFormId') inboundFormId: number,
        @Param('inboundFormReceiverId') inboundFormReceiverId: number,
    ): Promise<void> {
        await this.inboundFormService.deleteReceiver(inboundFormId, inboundFormReceiverId)
    }

    @SerializeOptions({ type: InboundFormTemplateDto })
    @Get(':inboundFormId/receiver/:inboundFormReceiverId/template')
    async getInboundFormTemplates(
        @Param('inboundFormId') inboundFormId: number,
        @Param('inboundFormReceiverId') inboundFormReceiverId: number,
    ): Promise<InboundFormTemplateDto[]> {
        await this.inboundFormService.getReceiver(inboundFormId, inboundFormReceiverId)
        const templates = await this.templateService.listVersions(inboundFormReceiverId)

        return templates.map(InboundFormTemplateDto.fromTemplate)
    }

    @ResponseDto(InboundFormTemplateDto)
    @Put(':inboundFormId/receiver/:inboundFormReceiverId/template/draft')
    async saveInboundFormTemplateDraft(
        @Param('inboundFormId') inboundFormId: number,
        @Param('inboundFormReceiverId') inboundFormReceiverId: number,
        @Body() body: InboundFormTemplateDraftDto,
    ): Promise<InboundFormTemplateDto> {
        await this.inboundFormService.getReceiver(inboundFormId, inboundFormReceiverId)
        const draft = await this.templateService.saveDraft(inboundFormReceiverId, body)

        return InboundFormTemplateDto.fromTemplate(draft)
    }

    @ResponseDto(InboundFormTemplateDto)
    @Post(':inboundFormId/receiver/:inboundFormReceiverId/template/publish')
    async publishInboundFormTemplate(
        @Param('inboundFormId') inboundFormId: number,
        @Param('inboundFormReceiverId') inboundFormReceiverId: number,
    ): Promise<InboundFormTemplateDto> {
        await this.inboundFormService.getReceiver(inboundFormId, inboundFormReceiverId)
        const published = await this.templateService.publishDraft(inboundFormReceiverId)

        return InboundFormTemplateDto.fromTemplate(published)
    }

    private async toDetailDto(
        form: Awaited<ReturnType<InboundFormService['getFormById']>>,
    ): Promise<InboundFormDetailDto> {
        const receiverIds = form.inboundFormReceivers.map((receiver) => receiver.inboundFormReceiverId)
        const summaries = await this.templateService.getVersionSummaries(receiverIds)

        return InboundFormDetailDto.fromInboundFormFull(form, summaries)
    }
}
```

- [ ] **Step 11: Register services + controller in `inbound-form.module.ts`**

Add to the module decorator (imports stay, plus `DomainModule` and `MailModule`):

```ts
import { DomainModule } from '../domain/domain.module'
import { MailModule } from '../mail/mail.module'
import { InboundFormController } from './controller/inbound-form.controller'
import { InboundFormService } from './services/inbound-form.service'
import { InboundFormTemplateService } from './services/inbound-form-template.service'
import { InboundFormSecurityService } from './services/inbound-form-security.service'
import { InboundFormSubmissionService } from './services/inbound-form-submission.service'
```

```ts
    imports: [SequelizeModule.forFeature([...unchanged...]), DomainModule, MailModule],
    controllers: [InboundFormController],
    providers: [
        InboundFormService,
        InboundFormTemplateService,
        InboundFormSecurityService,
        InboundFormSubmissionService,
    ],
```

- [ ] **Step 12: Verify**

Run: `pnpm --filter backend exec vitest run src/modules/inbound-form/controller/inbound-form.controller.spec.ts && pnpm --filter backend typecheck && pnpm --filter backend lint`
Expected: all PASS.

---

### Task 16: Public controller + throttling + CORS (TDD)

**Files:**

- Create: `apps/backend/src/modules/inbound-form/dtos/inbound-form-submit.dto.ts`
- Create: `apps/backend/src/modules/inbound-form/controller/public-inbound-form.controller.ts`
- Test: `apps/backend/src/modules/inbound-form/controller/public-inbound-form.controller.spec.ts`
- Modify: `apps/backend/src/modules/inbound-form/inbound-form.module.ts`
- Modify: `apps/backend/src/app.module.ts`
- Modify: `apps/backend/src/main.ts`

- [ ] **Step 1: Create `inbound-form-submit.dto.ts`**

```ts
import { Expose } from 'class-transformer'
import { IsObject, IsOptional } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class InboundFormSubmitDto {
    @Expose()
    @ApiProperty({ type: 'object', additionalProperties: true, required: false })
    @IsOptional()
    @IsObject()
    security?: Record<string, unknown>

    @Expose()
    @ApiProperty({ type: 'object', additionalProperties: true })
    @IsObject()
    data!: Record<string, unknown>
}

export class InboundFormSubmitResultDto {
    @Expose()
    @ApiProperty({ enum: ['accepted'] })
    status!: 'accepted'
}
```

- [ ] **Step 2: Write the failing controller test**

```ts
import { Test, TestingModule } from '@nestjs/testing'
import type { Request } from 'express'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { PublicInboundFormController } from './public-inbound-form.controller'
import { InboundFormSubmissionService } from '../services/inbound-form-submission.service'

describe('PublicInboundFormController', () => {
    let controller: PublicInboundFormController
    let submitForm: Mock<InboundFormSubmissionService['submitForm']>

    beforeEach(async () => {
        submitForm = vi.fn<typeof submitForm>().mockResolvedValue(undefined)

        const module: TestingModule = await Test.createTestingModule({
            controllers: [PublicInboundFormController],
            providers: [{ provide: InboundFormSubmissionService, useValue: { submitForm } }],
        }).compile()

        controller = module.get(PublicInboundFormController)
    })

    it('delegates the submission with body, headers and query', async () => {
        const request = {
            headers: { 'x-captcha': 'token' },
            query: { captcha: 'q' },
        } as unknown as Request

        const result = await controller.submitInboundForm(
            'contact',
            { security: { honeypot: null }, data: { email: 'max@example.com' } },
            request,
        )

        expect(submitForm).toHaveBeenCalledWith(
            'contact',
            { security: { honeypot: null }, data: { email: 'max@example.com' } },
            { 'x-captcha': 'token' },
            { captcha: 'q' },
        )
        expect(result).toEqual({ status: 'accepted' })
    })
})
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm --filter backend exec vitest run src/modules/inbound-form/controller/public-inbound-form.controller.spec.ts`
Expected: FAIL — cannot resolve `./public-inbound-form.controller`.

- [ ] **Step 4: Implement the controller** (no `@JwtAuth()` — the guard is only applied by that decorator, so this controller is public)

```ts
import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { ThrottlerGuard } from '@nestjs/throttler'
import type { Request } from 'express'
import { ResponseDto } from '../../../decorators/ResponseDto'
import { InboundFormSubmissionService } from '../services/inbound-form-submission.service'
import { InboundFormSubmitDto, InboundFormSubmitResultDto } from '../dtos/inbound-form-submit.dto'

@ApiTags('public-form')
@UseGuards(ThrottlerGuard)
@Controller('public/form')
export class PublicInboundFormController {
    constructor(private readonly submissionService: InboundFormSubmissionService) {}

    @ResponseDto(InboundFormSubmitResultDto)
    @Post(':slug')
    async submitInboundForm(
        @Param('slug') slug: string,
        @Body() body: InboundFormSubmitDto,
        @Req() request: Request,
    ): Promise<InboundFormSubmitResultDto> {
        await this.submissionService.submitForm(
            slug,
            { security: body.security, data: body.data },
            request.headers,
            request.query as Record<string, unknown>,
        )

        return { status: 'accepted' }
    }
}
```

- [ ] **Step 5: Register the controller and the throttler**

In `inbound-form.module.ts` add `PublicInboundFormController` to `controllers`. In `app.module.ts` add:

```ts
import { ThrottlerModule } from '@nestjs/throttler'
```

and to `imports` (before the feature modules):

```ts
        ThrottlerModule.forRoot([
            {
                ttl: 60_000,
                limit: 10,
            },
        ]),
```

- [ ] **Step 6: Enable CORS in `main.ts`**

After `const app = await NestFactory.create(AppModule)` add:

```ts
app.enableCors()
```

(Default config answers preflights with `Access-Control-Allow-Origin: *` and no credentials — matching the open-CORS decision; the admin API stays safe because the bearer token is only attached by our own frontend.)

- [ ] **Step 7: Verify**

Run: `pnpm --filter backend test && pnpm --filter backend typecheck && pnpm --filter backend lint`
Expected: all PASS.

---

### Task 17: Backend e2e — MailHog container + full journey

**Files:**

- Modify: `apps/backend/test/support/infrastructure.ts`
- Create: `apps/backend/test/inbound-form.e2e-spec.ts`

- [ ] **Step 1: Add MailHog to the shared infrastructure**

In `infrastructure.ts`, extend `E2eEnv`:

```ts
SMTP_HOST: string
SMTP_PORT: string
SMTP_SECURE: string
MAILHOG_URL: string
```

In `startInfrastructure()`, start the container next to Redis:

```ts
const mailhog = await new GenericContainer('mailhog/mailhog')
    .withExposedPorts(1025, 8025)
    .withWaitStrategy(Wait.forListeningPorts())
    .start()
```

Extend the returned `env`:

```ts
        SMTP_HOST: mailhog.getHost(),
        SMTP_PORT: String(mailhog.getMappedPort(1025)),
        SMTP_SECURE: 'false',
        MAILHOG_URL: `http://${mailhog.getHost()}:${mailhog.getMappedPort(8025)}`,
```

and stop it in `stop()`:

```ts
await mailhog.stop()
```

- [ ] **Step 2: Write `inbound-form.e2e-spec.ts`**

```ts
import { INestApplication } from '@nestjs/common'
import { getModelToken } from '@nestjs/sequelize'
import request from 'supertest'
import type { App } from 'supertest/types'
import { afterAll, beforeAll, describe, expect, inject, it, vi } from 'vitest'
import { createTestApp } from './support/app'
import { login, seedUser, type Credentials } from './support/session'
import { InboundFormSubmissionModel } from '../src/modules/inbound-form/models/inbound-form-submission.model'
import { InboundFormDeliveryModel } from '../src/modules/inbound-form/models/inbound-form-delivery.model'

interface MailhogMessage {
    Content: {
        Headers: Record<string, string[]>
        Body: string
    }
}

interface MailhogMessages {
    total: number
    items: MailhogMessage[]
}

function header(message: MailhogMessage, name: string): string[] {
    const key = Object.keys(message.Content.Headers).find(
        (headerName) => headerName.toLowerCase() === name.toLowerCase(),
    )
    return key ? message.Content.Headers[key]! : []
}

describe('InboundForm (e2e)', () => {
    let app: INestApplication<App>
    let token: string
    let inboundFormId: number
    let inboundFormReceiverId: number
    const slug = 'e2e-contact'
    const mailhogUrl = inject('e2eEnv').MAILHOG_URL

    const credentials: Credentials = {
        email: 'inbound.form.user@example.com',
        password: 'correct-horse-battery-staple',
    }

    const http = () => request(app.getHttpServer())

    async function fetchMessages(): Promise<MailhogMessages> {
        const response = await fetch(`${mailhogUrl}/api/v2/messages`)
        return (await response.json()) as MailhogMessages
    }

    beforeAll(async () => {
        app = await createTestApp()
        await seedUser(app, credentials)
        token = await login(app, credentials)

        const domainResponse = await http()
            .post('/api/domain')
            .set('Authorization', `Bearer ${token}`)
            .send({ fqdn: 'forms.example.com' })
            .expect(201)
        const domainId = (domainResponse.body as { domainId: number }).domainId

        const formResponse = await http()
            .post('/api/inbound-form')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'E2E Contact', slug, domainId })
            .expect(201)
        inboundFormId = (formResponse.body as { inboundFormId: number }).inboundFormId

        await http()
            .put(`/api/inbound-form/${inboundFormId}/fields`)
            .set('Authorization', `Bearer ${token}`)
            .send({
                fields: [
                    { key: 'firstName', label: 'First name', type: 'text', validation: { required: true } },
                    { key: 'email', label: 'Email', type: 'email', validation: { required: true } },
                ],
            })
            .expect(200)

        await http()
            .put(`/api/inbound-form/${inboundFormId}/security`)
            .set('Authorization', `Bearer ${token}`)
            .send({ security: [{ type: 'honeypot', location: 'body', key: 'website' }] })
            .expect(200)

        const receiverResponse = await http()
            .post(`/api/inbound-form/${inboundFormId}/receiver`)
            .set('Authorization', `Bearer ${token}`)
            .send({
                emailFrom: 'noreply@forms.example.com',
                emailReceiver: 'owner@business.com',
                emailReplyTo: '{{email}}',
            })
            .expect(201)
        inboundFormReceiverId = (receiverResponse.body as { inboundFormReceiverId: number }).inboundFormReceiverId

        await http()
            .put(`/api/inbound-form/${inboundFormId}/receiver/${inboundFormReceiverId}/template/draft`)
            .set('Authorization', `Bearer ${token}`)
            .send({ subject: 'Message from {{firstName}}', template: '<p>{{firstName}} ({{email}}) wrote in.</p>' })
            .expect(200)

        await http()
            .post(`/api/inbound-form/${inboundFormId}/receiver/${inboundFormReceiverId}/template/publish`)
            .set('Authorization', `Bearer ${token}`)
            .expect(201)
    })

    afterAll(async () => {
        await app?.close()
    })

    it('accepts a public submission, stores it and delivers a dkim-signed mail', async () => {
        const response = await http()
            .post(`/api/public/form/${slug}`)
            .send({
                security: { website: null },
                data: { firstName: 'Max', email: 'max@example.com' },
            })
            .expect(201)

        expect(response.body).toEqual({ status: 'accepted' })

        const submissionModel = app.get<typeof InboundFormSubmissionModel>(getModelToken(InboundFormSubmissionModel))
        const submission = await submissionModel.findOne({ where: { inboundFormId, status: 'accepted' } })
        expect(submission).not.toBeNull()
        expect(submission!.data).toEqual({ firstName: 'Max', email: 'max@example.com' })

        const deliveryModel = app.get<typeof InboundFormDeliveryModel>(getModelToken(InboundFormDeliveryModel))
        await vi.waitFor(
            async () => {
                const delivery = await deliveryModel.findOne({
                    where: { inboundFormSubmissionId: submission!.inboundFormSubmissionId },
                })
                expect(delivery?.status).toBe('sent')
                expect(delivery?.emailTo).toBe('owner@business.com')
            },
            { timeout: 15_000 },
        )

        const messages = await fetchMessages()
        expect(messages.total).toBeGreaterThanOrEqual(1)
        const message = messages.items[0]!
        expect(header(message, 'To')).toContain('owner@business.com')
        expect(header(message, 'Subject')).toContain('Message from Max')
        expect(header(message, 'Reply-To')).toContain('max@example.com')
        expect(header(message, 'DKIM-Signature').length).toBeGreaterThan(0)
        expect(header(message, 'DKIM-Signature')[0]).toContain('d=forms.example.com')
    })

    it('answers a honeypot hit with success but stores spam and sends nothing', async () => {
        const messagesBefore = (await fetchMessages()).total

        await http()
            .post(`/api/public/form/${slug}`)
            .send({
                security: { website: 'http://spam.example' },
                data: { firstName: 'Bot', email: 'bot@example.com' },
            })
            .expect(201)

        const submissionModel = app.get<typeof InboundFormSubmissionModel>(getModelToken(InboundFormSubmissionModel))
        const spam = await submissionModel.findOne({ where: { inboundFormId, status: 'spam' } })
        expect(spam).not.toBeNull()

        const deliveryModel = app.get<typeof InboundFormDeliveryModel>(getModelToken(InboundFormDeliveryModel))
        const deliveries = await deliveryModel.count({
            where: { inboundFormSubmissionId: spam!.inboundFormSubmissionId },
        })
        expect(deliveries).toBe(0)
        expect((await fetchMessages()).total).toBe(messagesBefore)
    })

    it('rejects an unknown slug with 404', async () => {
        await http().post('/api/public/form/does-not-exist').send({ data: {} }).expect(404)
    })

    it('rejects invalid data with 400', async () => {
        await http()
            .post(`/api/public/form/${slug}`)
            .send({ security: { website: null }, data: { firstName: 'Max', email: 'broken' } })
            .expect(400)
    })
})
```

- [ ] **Step 3: Run the e2e suite** (Docker required; first run pulls the MailHog image)

Run: `pnpm --filter backend test:e2e`
Expected: all e2e files PASS, including the existing auth/domain suites.

---

### Task 18: Regenerate the API client

- [ ] **Step 1: Regenerate the OpenAPI spec** (dev Postgres/Redis must be running: `docker compose -f dev/docker-compose.yml up -d`; `.env` must contain the `SMTP_*` keys from Task 7)

Run: `pnpm --filter backend generate`
Expected: exits 0, log line `OpenAPI spec saved.`

- [ ] **Step 2: Check the spec contains the new endpoints**

Run: `node -e "const spec = require('./packages/api/assets/openapi.json'); console.log(Object.keys(spec.paths).filter((p) => p.includes('inbound-form') || p.includes('public/form')))"`
Expected: lists `/api/inbound-form`, `/api/inbound-form/{inboundFormId}`, `/api/inbound-form/{inboundFormId}/fields`, `/api/inbound-form/{inboundFormId}/security`, receiver + template paths, and `/api/public/form/{slug}`.

- [ ] **Step 3: Rebuild the typed client**

Run: `pnpm --filter api build`
Expected: exits 0; `packages/api/dist` now exports `InboundFormApi` (methods named after the controller methods: `createInboundForm`, `getInboundForms`, `getInboundForm`, `updateInboundForm`, `deleteInboundForm`, `updateInboundFormFields`, `updateInboundFormSecurity`, `createInboundFormReceiver`, `updateInboundFormReceiver`, `deleteInboundFormReceiver`, `getInboundFormTemplates`, `saveInboundFormTemplateDraft`, `publishInboundFormTemplate`) and `PublicFormApi.submitInboundForm`, plus DTO types (`InboundFormDto`, `InboundFormDetailDto`, `InboundFormFieldDto`, …).

- [ ] **Step 4: Full backend gate**

Run: `pnpm --filter backend lint && pnpm --filter backend typecheck && pnpm --filter backend test`
Expected: all PASS.

---

### Task 19: Frontend — dependencies, routes, i18n, navigation

**Files:**

- Modify: `apps/frontend/package.json` (via pnpm)
- Modify: `apps/frontend/src/router/RouteNames.ts`
- Modify: `apps/frontend/src/router/index.ts`
- Modify: `apps/frontend/src/locales/en.json`
- Modify: `apps/frontend/src/modules/dashboard/layouts/AppLayout.vue`

- [ ] **Step 1: Install dependencies**

```bash
pnpm --filter frontend add monaco-editor handlebars
```

- [ ] **Step 2: Extend `RouteNames.ts`**

```ts
export enum RouteNames {
    LOGIN = 'auth::login',
    DASHBOARD = 'dashboard::index',
    DOMAIN_LIST = 'domains::list',
    DOMAIN_DETAILS = 'domains::details',
    INBOUND_FORM_LIST = 'inboundForms::list',
    INBOUND_FORM_DETAILS = 'inboundForms::details',
    INBOUND_FORM_TEMPLATE = 'inboundForms::template',
}
```

- [ ] **Step 3: Register the routes in `router/index.ts`**

Add imports:

```ts
import InboundFormListView from '@/modules/inbound-forms/views/list/InboundFormListView.vue'
import InboundFormDetailView from '@/modules/inbound-forms/views/details/InboundFormDetailView.vue'
import InboundFormTemplateView from '@/modules/inbound-forms/views/template/InboundFormTemplateView.vue'
```

Add to the `AppLayout` children after the domain routes:

```ts
                {
                    path: '/forms',
                    name: RouteNames.INBOUND_FORM_LIST,
                    component: InboundFormListView,
                },
                {
                    path: '/forms/:inboundFormId',
                    name: RouteNames.INBOUND_FORM_DETAILS,
                    component: InboundFormDetailView,
                },
                {
                    path: '/forms/:inboundFormId/receivers/:inboundFormReceiverId/template',
                    name: RouteNames.INBOUND_FORM_TEMPLATE,
                    component: InboundFormTemplateView,
                },
```

(The views do not exist yet — create empty placeholder SFCs with just `<template><div /></template>` in Task 21/22/27 order, or do this step last in this task group. Simplest: create the three view files in Tasks 21, 22 and 27 first and wire the router afterwards; either order is fine as long as typecheck runs at the end of Task 27.)

- [ ] **Step 4: Add a nav tab in `AppLayout.vue`**

After the domains `VTab`:

```html
<VTab :to="{ name: RouteNames.INBOUND_FORM_LIST }" :text="t('module.inboundForms.nav')" />
```

- [ ] **Step 5: Extend `en.json`**

While editing: remove the trailing comma after `"refresh": "Refresh"` (line 25 — currently invalid JSON). Add to `cta`:

```json
"add": "Add",
"edit": "Edit",
"delete": "Delete",
"publish": "Publish",
"saveDraft": "Save draft"
```

Add to `field`:

```json
"name": "Name",
"slug": "Slug"
```

Add under `module` (sibling of `domains`):

```json
"inboundForms": {
    "nav": "Forms",
    "list": {
        "title": "Inbound Forms"
    },
    "add": {
        "title": "New Form",
        "intro": "Give your form a name. The slug becomes part of the public endpoint URL."
    },
    "status": {
        "active": "Active",
        "inactive": "Inactive"
    },
    "details": {
        "endpoint": "Endpoint URL",
        "general": {
            "title": "General"
        },
        "fields": {
            "title": "Fields",
            "empty": "No fields defined yet. Add the fields your website form will submit.",
            "add": "Add field",
            "key": "Key",
            "label": "Label",
            "type": "Type",
            "required": "Required",
            "defaultValue": "Default value",
            "minLength": "Min length",
            "maxLength": "Max length",
            "pattern": "Pattern (regex)",
            "min": "Minimum",
            "max": "Maximum",
            "typeOptions": {
                "text": "Text",
                "email": "Email",
                "number": "Number",
                "boolean": "Boolean"
            }
        },
        "security": {
            "title": "Security",
            "empty": "No security schemes configured. Add a honeypot or reCAPTCHA to protect the endpoint.",
            "add": "Add scheme",
            "type": "Type",
            "location": "Location",
            "key": "Key",
            "secret": "Secret key",
            "minScore": "Minimum score (v3)",
            "typeOptions": {
                "google-recaptcha": "Google reCAPTCHA",
                "honeypot": "Honeypot"
            },
            "locationOptions": {
                "body": "Body",
                "header": "Header",
                "query": "Query parameter"
            }
        },
        "receivers": {
            "title": "Receivers",
            "empty": "No receivers configured. Add one to send an email for every submission.",
            "add": "Add receiver",
            "from": "Sender",
            "to": "Recipient",
            "replyTo": "Reply-To",
            "recipientHint": "A fixed address or a form field like {placeholder}",
            "template": {
                "none": "No template",
                "draft": "Draft v{version}",
                "published": "Published v{version}",
                "edit": "Edit template"
            }
        }
    },
    "template": {
        "title": "Email template",
        "subject": "Subject",
        "fieldsHint": "Click a field to insert it at the cursor",
        "preview": "Preview",
        "previewError": "Template error: {error}",
        "versions": "Versions",
        "version": "v{version} ({status})",
        "statusOptions": {
            "draft": "Draft",
            "published": "Published"
        }
    }
}
```

- [ ] **Step 6: Verify** (after the views exist — re-run at the end of Task 27; for now only lint the JSON)

Run: `pnpm --filter frontend lint`
Expected: PASS (i18n JSON parses).

---

### Task 20: Frontend — queries and mutations (TDD for query + create mutation)

**Files:**

- Create: `apps/frontend/src/modules/inbound-forms/queries/useInboundFormsQuery.ts`
- Create: `apps/frontend/src/modules/inbound-forms/queries/useInboundFormQuery.ts`
- Create: `apps/frontend/src/modules/inbound-forms/queries/useInboundFormTemplatesQuery.ts`
- Create: `apps/frontend/src/modules/inbound-forms/mutations/useInboundFormCreateMutation.ts`
- Create: `apps/frontend/src/modules/inbound-forms/mutations/useInboundFormUpdateMutation.ts`
- Create: `apps/frontend/src/modules/inbound-forms/mutations/useInboundFormDeleteMutation.ts`
- Create: `apps/frontend/src/modules/inbound-forms/mutations/useInboundFormFieldsMutation.ts`
- Create: `apps/frontend/src/modules/inbound-forms/mutations/useInboundFormSecurityMutation.ts`
- Create: `apps/frontend/src/modules/inbound-forms/mutations/useReceiverCreateMutation.ts`
- Create: `apps/frontend/src/modules/inbound-forms/mutations/useReceiverUpdateMutation.ts`
- Create: `apps/frontend/src/modules/inbound-forms/mutations/useReceiverDeleteMutation.ts`
- Create: `apps/frontend/src/modules/inbound-forms/mutations/useTemplateDraftMutation.ts`
- Create: `apps/frontend/src/modules/inbound-forms/mutations/useTemplatePublishMutation.ts`
- Test: `apps/frontend/src/modules/inbound-forms/queries/__tests__/useInboundFormsQuery.spec.ts`
- Test: `apps/frontend/src/modules/inbound-forms/mutations/__tests__/useInboundFormCreateMutation.spec.ts`

- [ ] **Step 1: Write the failing query spec**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InboundFormApi, type InboundFormDto } from 'api'
import { useQuery } from '@tanstack/vue-query'
import { useInboundFormsQuery } from '../useInboundFormsQuery.ts'
import { withVueQuery } from '@/__tests__/support.ts'

const form: InboundFormDto = {
    inboundFormId: 1,
    domainId: 3,
    name: 'Contact',
    slug: 'contact',
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
}

afterEach(() => {
    vi.restoreAllMocks()
})

describe('useInboundFormsQuery', () => {
    it('loads the forms and exposes them under the inboundForms key', async () => {
        const listSpy = vi.spyOn(InboundFormApi, 'getInboundForms').mockResolvedValue([form])
        const { result, queryClient, unmount } = withVueQuery(() => useQuery(useInboundFormsQuery()))

        await vi.waitFor(() => expect(result.isSuccess.value).toBe(true))

        expect(listSpy).toHaveBeenCalledOnce()
        expect(result.data.value).toEqual([form])
        expect(queryClient.getQueryData(['inboundForms'])).toEqual([form])
        unmount()
    })
})
```

- [ ] **Step 2: Write the failing mutation spec**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InboundFormApi, type InboundFormDto } from 'api'
import { useInboundFormCreateMutation } from '../useInboundFormCreateMutation.ts'
import { withVueQuery } from '@/__tests__/support.ts'

const form: InboundFormDto = {
    inboundFormId: 1,
    domainId: 3,
    name: 'Contact',
    slug: 'contact',
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
}

afterEach(() => {
    vi.restoreAllMocks()
})

describe('useInboundFormCreateMutation', () => {
    it('creates the form and invalidates the list', async () => {
        const createSpy = vi.spyOn(InboundFormApi, 'createInboundForm').mockResolvedValue(form)
        const { result, queryClient, unmount } = withVueQuery(() => useInboundFormCreateMutation())
        const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

        const created = await result.mutateAsync({ name: 'Contact', slug: 'contact', domainId: 3 })

        expect(createSpy).toHaveBeenCalledWith({ body: { name: 'Contact', slug: 'contact', domainId: 3 } })
        expect(created).toEqual(form)
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['inboundForms'] })
        unmount()
    })
})
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm --filter frontend exec vitest run src/modules/inbound-forms`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement the queries**

`useInboundFormsQuery.ts`:

```ts
import { queryOptions } from '@tanstack/vue-query'
import { InboundFormApi } from 'api'

export function useInboundFormsQuery() {
    return queryOptions({
        queryKey: ['inboundForms'],
        queryFn: () => InboundFormApi.getInboundForms(),
    })
}
```

`useInboundFormQuery.ts`:

```ts
import { type MaybeRefOrGetter, toValue } from 'vue'
import { queryOptions } from '@tanstack/vue-query'
import { InboundFormApi } from 'api'

export function useInboundFormQuery(inboundFormId: MaybeRefOrGetter<number>) {
    return queryOptions({
        queryKey: ['inboundForms', inboundFormId],
        queryFn: () =>
            InboundFormApi.getInboundForm({
                path: {
                    inboundFormId: toValue(inboundFormId),
                },
            }),
    })
}
```

`useInboundFormTemplatesQuery.ts`:

```ts
import { type MaybeRefOrGetter, toValue } from 'vue'
import { queryOptions } from '@tanstack/vue-query'
import { InboundFormApi } from 'api'

export function useInboundFormTemplatesQuery(
    inboundFormId: MaybeRefOrGetter<number>,
    inboundFormReceiverId: MaybeRefOrGetter<number>,
) {
    return queryOptions({
        queryKey: ['inboundForms', inboundFormId, 'templates', inboundFormReceiverId],
        queryFn: () =>
            InboundFormApi.getInboundFormTemplates({
                path: {
                    inboundFormId: toValue(inboundFormId),
                    inboundFormReceiverId: toValue(inboundFormReceiverId),
                },
            }),
    })
}
```

- [ ] **Step 5: Implement the mutations**

`useInboundFormCreateMutation.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { InboundFormApi, type InboundFormCreateDto } from 'api'
import { waitAtleast } from '@/helper/waitAtleast.ts'

export function useInboundFormCreateMutation() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: (body: InboundFormCreateDto) => waitAtleast(InboundFormApi.createInboundForm({ body })),
        onSuccess() {
            void client.invalidateQueries({ queryKey: ['inboundForms'] })
        },
    })
}
```

`useInboundFormUpdateMutation.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { InboundFormApi, type InboundFormUpdateDto } from 'api'
import { waitAtleast } from '@/helper/waitAtleast.ts'

export function useInboundFormUpdateMutation() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: ({ inboundFormId, update }: { inboundFormId: number; update: InboundFormUpdateDto }) =>
            waitAtleast(
                InboundFormApi.updateInboundForm({
                    path: { inboundFormId },
                    body: update,
                }),
            ),
        onSuccess(detail, { inboundFormId }) {
            client.setQueryData(['inboundForms', inboundFormId], detail)
            void client.invalidateQueries({ queryKey: ['inboundForms'], exact: true })
        },
    })
}
```

`useInboundFormDeleteMutation.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { InboundFormApi } from 'api'
import { waitAtleast } from '@/helper/waitAtleast.ts'

export function useInboundFormDeleteMutation() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: (inboundFormId: number) =>
            waitAtleast(InboundFormApi.deleteInboundForm({ path: { inboundFormId: inboundFormId.toString() } })),
        onSuccess(_result, inboundFormId) {
            client.removeQueries({ queryKey: ['inboundForms', inboundFormId] })
            void client.invalidateQueries({ queryKey: ['inboundForms'], exact: true })
        },
    })
}
```

`useInboundFormFieldsMutation.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { InboundFormApi, type InboundFormFieldUpsertDto } from 'api'
import { waitAtleast } from '@/helper/waitAtleast.ts'

export function useInboundFormFieldsMutation() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: ({ inboundFormId, fields }: { inboundFormId: number; fields: InboundFormFieldUpsertDto[] }) =>
            waitAtleast(
                InboundFormApi.updateInboundFormFields({
                    path: { inboundFormId },
                    body: { fields },
                }),
            ),
        onSuccess(_fields, { inboundFormId }) {
            void client.invalidateQueries({ queryKey: ['inboundForms', inboundFormId] })
        },
    })
}
```

`useInboundFormSecurityMutation.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { InboundFormApi, type InboundFormSecurityUpsertDto } from 'api'
import { waitAtleast } from '@/helper/waitAtleast.ts'

export function useInboundFormSecurityMutation() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: ({
            inboundFormId,
            security,
        }: {
            inboundFormId: number
            security: InboundFormSecurityUpsertDto[]
        }) =>
            waitAtleast(
                InboundFormApi.updateInboundFormSecurity({
                    path: { inboundFormId },
                    body: { security },
                }),
            ),
        onSuccess(_security, { inboundFormId }) {
            void client.invalidateQueries({ queryKey: ['inboundForms', inboundFormId] })
        },
    })
}
```

`useReceiverCreateMutation.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { InboundFormApi, type InboundFormReceiverCreateDto } from 'api'
import { waitAtleast } from '@/helper/waitAtleast.ts'

export function useReceiverCreateMutation() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: ({ inboundFormId, receiver }: { inboundFormId: number; receiver: InboundFormReceiverCreateDto }) =>
            waitAtleast(
                InboundFormApi.createInboundFormReceiver({
                    path: { inboundFormId },
                    body: receiver,
                }),
            ),
        onSuccess(_receiver, { inboundFormId }) {
            void client.invalidateQueries({ queryKey: ['inboundForms', inboundFormId] })
        },
    })
}
```

`useReceiverUpdateMutation.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { InboundFormApi, type InboundFormReceiverUpdateDto } from 'api'
import { waitAtleast } from '@/helper/waitAtleast.ts'

export function useReceiverUpdateMutation() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: ({
            inboundFormId,
            inboundFormReceiverId,
            update,
        }: {
            inboundFormId: number
            inboundFormReceiverId: number
            update: InboundFormReceiverUpdateDto
        }) =>
            waitAtleast(
                InboundFormApi.updateInboundFormReceiver({
                    path: {
                        inboundFormId,
                        inboundFormReceiverId,
                    },
                    body: update,
                }),
            ),
        onSuccess(_receiver, { inboundFormId }) {
            void client.invalidateQueries({ queryKey: ['inboundForms', inboundFormId] })
        },
    })
}
```

`useReceiverDeleteMutation.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { InboundFormApi } from 'api'
import { waitAtleast } from '@/helper/waitAtleast.ts'

export function useReceiverDeleteMutation() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: ({
            inboundFormId,
            inboundFormReceiverId,
        }: {
            inboundFormId: number
            inboundFormReceiverId: number
        }) =>
            waitAtleast(
                InboundFormApi.deleteInboundFormReceiver({
                    path: {
                        inboundFormId,
                        inboundFormReceiverId,
                    },
                }),
            ),
        onSuccess(_result, { inboundFormId }) {
            void client.invalidateQueries({ queryKey: ['inboundForms', inboundFormId] })
        },
    })
}
```

`useTemplateDraftMutation.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { InboundFormApi, type InboundFormTemplateDraftDto } from 'api'
import { waitAtleast } from '@/helper/waitAtleast.ts'

export function useTemplateDraftMutation() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: ({
            inboundFormId,
            inboundFormReceiverId,
            draft,
        }: {
            inboundFormId: number
            inboundFormReceiverId: number
            draft: InboundFormTemplateDraftDto
        }) =>
            waitAtleast(
                InboundFormApi.saveInboundFormTemplateDraft({
                    path: {
                        inboundFormId,
                        inboundFormReceiverId,
                    },
                    body: draft,
                }),
            ),
        onSuccess(_template, { inboundFormId }) {
            void client.invalidateQueries({ queryKey: ['inboundForms', inboundFormId] })
        },
    })
}
```

`useTemplatePublishMutation.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { InboundFormApi } from 'api'
import { waitAtleast } from '@/helper/waitAtleast.ts'

export function useTemplatePublishMutation() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: ({
            inboundFormId,
            inboundFormReceiverId,
        }: {
            inboundFormId: number
            inboundFormReceiverId: number
        }) =>
            waitAtleast(
                InboundFormApi.publishInboundFormTemplate({
                    path: {
                        inboundFormId,
                        inboundFormReceiverId,
                    },
                }),
            ),
        onSuccess(_template, { inboundFormId }) {
            void client.invalidateQueries({ queryKey: ['inboundForms', inboundFormId] })
        },
    })
}
```

- [ ] **Step 6: Run tests to verify pass**

Run: `pnpm --filter frontend exec vitest run src/modules/inbound-forms`
Expected: PASS (2 spec files). If the generated SDK's path-parameter or DTO names differ from the ones used here, check `packages/api/dist` exports and adjust the composables — the SDK is the source of truth.

---

### Task 21: Frontend — list view + add dialog (TDD)

**Files:**

- Create: `apps/frontend/src/modules/inbound-forms/helpers/formEndpointUrl.ts`
- Create: `apps/frontend/src/modules/inbound-forms/views/list/InboundFormListView.vue`
- Create: `apps/frontend/src/modules/inbound-forms/views/list/partials/InboundFormListEntry.vue`
- Create: `apps/frontend/src/modules/inbound-forms/views/list/partials/AddInboundFormDialog.vue`
- Test: `apps/frontend/src/modules/inbound-forms/views/list/__tests__/InboundFormListView.spec.ts`

- [ ] **Step 1: Write the failing view spec**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DomainApi, InboundFormApi, type InboundFormDto } from 'api'
import InboundFormListView from '../InboundFormListView.vue'
import { mountView } from '@/__tests__/support.ts'

vi.mock('vue-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('vue-router')>()
    return { ...actual, useRouter: () => ({ push: vi.fn() }) }
})

const forms: InboundFormDto[] = [
    {
        inboundFormId: 1,
        domainId: 3,
        name: 'Contact',
        slug: 'contact',
        isActive: true,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
    },
    {
        inboundFormId: 2,
        domainId: null,
        name: 'Feedback',
        slug: 'feedback',
        isActive: false,
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
    },
]

afterEach(() => {
    vi.restoreAllMocks()
})

describe('InboundFormListView', () => {
    it('renders one entry per form with name and slug', async () => {
        vi.spyOn(InboundFormApi, 'getInboundForms').mockResolvedValue(forms)
        vi.spyOn(DomainApi, 'getDomains').mockResolvedValue([])
        const wrapper = mountView(InboundFormListView)

        await vi.waitFor(() => {
            expect(wrapper.text()).toContain('Contact')
        })
        expect(wrapper.text()).toContain('contact')
        expect(wrapper.text()).toContain('Feedback')
        expect(wrapper.get('h1').text()).toBe('Inbound Forms')
    })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter frontend exec vitest run src/modules/inbound-forms/views/list/__tests__/InboundFormListView.spec.ts`
Expected: FAIL — component not found.

- [ ] **Step 3: Create `helpers/formEndpointUrl.ts`**

```ts
export function formEndpointUrl(slug: string): string {
    return `${location.origin}/api/public/form/${slug}`
}
```

- [ ] **Step 4: Create `InboundFormListView.vue`**

```vue
<template>
    <VContainer>
        <div class="d-flex justify-space-between align-center">
            <h1>{{ t('module.inboundForms.list.title') }}</h1>
            <AddInboundFormDialog v-slot="{ props }">
                <VBtn v-bind="props">{{ t('cta.add') }}</VBtn>
            </AddInboundFormDialog>
        </div>
        <VDivider />
        <VFadeTransition leave-absolute>
            <div class="d-flex flex-column gr-3 pt-6" v-if="isPending">
                <VSkeletonLoader v-for="i in 3" :key="i" type="table-heading" />
            </div>
            <div class="d-flex flex-column gr-3 pt-6" v-else>
                <InboundFormListEntry v-for="form in forms" :key="form.inboundFormId" :form="form" />
            </div>
        </VFadeTransition>
    </VContainer>
</template>

<script setup lang="ts">
    import { useQuery } from '@tanstack/vue-query'
    import { useI18n } from 'vue-i18n'
    import { useInboundFormsQuery } from '@/modules/inbound-forms/queries/useInboundFormsQuery.ts'
    import InboundFormListEntry from '@/modules/inbound-forms/views/list/partials/InboundFormListEntry.vue'
    import AddInboundFormDialog from '@/modules/inbound-forms/views/list/partials/AddInboundFormDialog.vue'

    const { data: forms, isPending } = useQuery(useInboundFormsQuery())
    const { t } = useI18n()
</script>
```

- [ ] **Step 5: Create `partials/InboundFormListEntry.vue`**

```vue
<template>
    <VCard :to="{ name: RouteNames.INBOUND_FORM_DETAILS, params: { inboundFormId: form.inboundFormId } }" hover>
        <VCardItem>
            <template #title>
                {{ form.name }}
            </template>
            <template #subtitle>
                {{ form.slug }}
            </template>
            <template #append>
                <VChip :color="form.isActive ? 'success' : 'default'" size="small">
                    {{
                        form.isActive
                            ? t('module.inboundForms.status.active')
                            : t('module.inboundForms.status.inactive')
                    }}
                </VChip>
            </template>
        </VCardItem>
    </VCard>
</template>

<script setup lang="ts">
    import type { InboundFormDto } from 'api'
    import { useI18n } from 'vue-i18n'
    import { RouteNames } from '@/router/RouteNames.ts'

    defineProps<{ form: InboundFormDto }>()

    const { t } = useI18n()
</script>
```

- [ ] **Step 6: Create `partials/AddInboundFormDialog.vue`**

```vue
<template>
    <VDialog max-width="600" v-model="model" @after-leave="resetForm" :persistent="isPending">
        <template #activator="props">
            <slot v-bind="props" />
        </template>
        <VCard :title="t('module.inboundForms.add.title')">
            <template #append>
                <VIconBtn icon="mdi-close" @click="model = false" :disabled="isPending" />
            </template>
            <form @submit.prevent="onSubmit">
                <VCardItem>
                    <p class="mb-4">{{ t('module.inboundForms.add.intro') }}</p>
                    <VTextField name="name" :label="t('field.name')" v-model="name" :error-messages="errors.name" />
                    <VTextField name="slug" :label="t('field.slug')" v-model="slug" :error-messages="errors.slug" />
                    <VSelect
                        name="domainId"
                        :label="t('field.domain')"
                        v-model="domainId"
                        :items="domains ?? []"
                        item-title="fqdn"
                        item-value="domainId"
                        clearable
                        :error-messages="errors.domainId"
                    />
                </VCardItem>
                <VCardActions>
                    <VSpacer />
                    <VBtn color="error" :text="t('cta.abort')" :disabled="isPending" @click="model = false" />
                    <VBtn color="primary" variant="elevated" :text="t('cta.save')" :loading="isPending" type="submit" />
                </VCardActions>
            </form>
        </VCard>
    </VDialog>
</template>

<script setup lang="ts">
    import { ref, watch } from 'vue'
    import { useForm } from 'vee-validate'
    import { toTypedSchema } from '@vee-validate/zod'
    import { z } from 'zod'
    import { useI18n } from 'vue-i18n'
    import { useQuery } from '@tanstack/vue-query'
    import { useRouter } from 'vue-router'
    import { useDomainsQuery } from '@/modules/domains/queries/useDomainsQuery.ts'
    import { useInboundFormCreateMutation } from '@/modules/inbound-forms/mutations/useInboundFormCreateMutation.ts'
    import { RouteNames } from '@/router/RouteNames.ts'

    const model = ref<undefined | boolean>()
    const slugTouched = ref(false)
    const { t } = useI18n()
    const { data: domains } = useQuery(useDomainsQuery())
    const { mutateAsync, isPending } = useInboundFormCreateMutation()
    const router = useRouter()

    const { defineField, handleSubmit, errors, resetForm } = useForm({
        validationSchema: toTypedSchema(
            z.object({
                name: z.string().min(1).max(255),
                slug: z
                    .string()
                    .min(1)
                    .max(255)
                    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
                domainId: z.number().nullable().optional(),
            }),
        ),
    })

    const [name] = defineField('name')
    const [slug] = defineField('slug')
    const [domainId] = defineField('domainId')

    watch(name, (value) => {
        if (!slugTouched.value) {
            slug.value = slugify(value ?? '')
        }
    })

    watch(slug, (value, oldValue) => {
        if (value !== slugify(name.value ?? '') && value !== oldValue) {
            slugTouched.value = true
        }
    })

    function slugify(value: string): string {
        return value
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
    }

    const onSubmit = handleSubmit(async (values) => {
        const { inboundFormId } = await mutateAsync({
            name: values.name,
            slug: values.slug,
            domainId: values.domainId ?? null,
        })
        void router.push({ name: RouteNames.INBOUND_FORM_DETAILS, params: { inboundFormId } })
    })
</script>
```

- [ ] **Step 7: Run the spec to verify pass**

Run: `pnpm --filter frontend exec vitest run src/modules/inbound-forms/views/list/__tests__/InboundFormListView.spec.ts`
Expected: PASS.

---

### Task 22: Frontend — detail view skeleton + general card

**Files:**

- Create: `apps/frontend/src/modules/inbound-forms/views/details/InboundFormDetailView.vue`
- Create: `apps/frontend/src/modules/inbound-forms/views/details/partials/GeneralCard.vue`

The detail spec that covers all cards is written in Task 25 — this task and the two after it are verified by typecheck/lint until then.

- [ ] **Step 1: Create `InboundFormDetailView.vue`** (the cards from Tasks 23–25 are added to this template as they are built)

```vue
<template>
    <VContainer v-if="form">
        <div class="d-flex align-center gc-3">
            <VIconBtn icon="mdi-arrow-left" :to="{ name: RouteNames.INBOUND_FORM_LIST }" />
            <h1>{{ form.name }}</h1>
            <VChip :color="form.isActive ? 'success' : 'default'" size="small">
                {{ form.isActive ? t('module.inboundForms.status.active') : t('module.inboundForms.status.inactive') }}
            </VChip>
        </div>
        <VDivider class="mb-6" />
        <div class="d-flex flex-column gr-6">
            <GeneralCard :form="form" />
        </div>
    </VContainer>
</template>

<script setup lang="ts">
    import { useQuery } from '@tanstack/vue-query'
    import { useRoute } from 'vue-router'
    import { useI18n } from 'vue-i18n'
    import { useInboundFormQuery } from '@/modules/inbound-forms/queries/useInboundFormQuery.ts'
    import GeneralCard from '@/modules/inbound-forms/views/details/partials/GeneralCard.vue'
    import { RouteNames } from '@/router/RouteNames.ts'

    const route = useRoute()
    const { t } = useI18n()
    const { data: form } = useQuery(useInboundFormQuery(() => Number(route.params.inboundFormId)))
</script>
```

- [ ] **Step 2: Create `partials/GeneralCard.vue`**

```vue
<template>
    <VCard :title="t('module.inboundForms.details.general.title')">
        <form @submit.prevent="onSubmit">
            <VCardItem>
                <VTextField name="name" :label="t('field.name')" v-model="name" :error-messages="errors.name" />
                <VTextField name="slug" :label="t('field.slug')" v-model="slug" :error-messages="errors.slug" />
                <VSelect
                    name="domainId"
                    :label="t('field.domain')"
                    v-model="domainId"
                    :items="domains ?? []"
                    item-title="fqdn"
                    item-value="domainId"
                    clearable
                    :error-messages="errors.domainId"
                />
                <VSwitch name="isActive" :label="t('module.inboundForms.status.active')" v-model="isActive" />
                <VTextField :label="t('module.inboundForms.details.endpoint')" :model-value="endpointUrl" readonly>
                    <template #append-inner>
                        <VBtn
                            variant="text"
                            size="small"
                            :text="copied ? t('cta.copy.success') : t('cta.copy.default')"
                            @click="copyEndpoint"
                        />
                    </template>
                </VTextField>
            </VCardItem>
            <VCardActions>
                <VSpacer />
                <VBtn color="primary" variant="elevated" :text="t('cta.save')" :loading="isPending" type="submit" />
            </VCardActions>
        </form>
    </VCard>
</template>

<script setup lang="ts">
    import { computed, ref } from 'vue'
    import { useForm } from 'vee-validate'
    import { toTypedSchema } from '@vee-validate/zod'
    import { z } from 'zod'
    import { useI18n } from 'vue-i18n'
    import { useQuery } from '@tanstack/vue-query'
    import type { InboundFormDetailDto } from 'api'
    import { useDomainsQuery } from '@/modules/domains/queries/useDomainsQuery.ts'
    import { useInboundFormUpdateMutation } from '@/modules/inbound-forms/mutations/useInboundFormUpdateMutation.ts'
    import { formEndpointUrl } from '@/modules/inbound-forms/helpers/formEndpointUrl.ts'

    const props = defineProps<{ form: InboundFormDetailDto }>()

    const { t } = useI18n()
    const { data: domains } = useQuery(useDomainsQuery())
    const { mutateAsync, isPending } = useInboundFormUpdateMutation()
    const copied = ref(false)

    const endpointUrl = computed(() => formEndpointUrl(props.form.slug))

    const { defineField, handleSubmit, errors } = useForm({
        validationSchema: toTypedSchema(
            z.object({
                name: z.string().min(1).max(255),
                slug: z
                    .string()
                    .min(1)
                    .max(255)
                    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
                domainId: z.number().nullable().optional(),
                isActive: z.boolean(),
            }),
        ),
        initialValues: {
            name: props.form.name,
            slug: props.form.slug,
            domainId: props.form.domainId,
            isActive: props.form.isActive,
        },
    })

    const [name] = defineField('name')
    const [slug] = defineField('slug')
    const [domainId] = defineField('domainId')
    const [isActive] = defineField('isActive')

    async function copyEndpoint() {
        await navigator.clipboard.writeText(endpointUrl.value)
        copied.value = true
        setTimeout(() => (copied.value = false), 2000)
    }

    const onSubmit = handleSubmit(async (values) => {
        await mutateAsync({
            inboundFormId: props.form.inboundFormId,
            update: {
                name: values.name,
                slug: values.slug,
                domainId: values.domainId ?? null,
                isActive: values.isActive,
            },
        })
    })
</script>
```

- [ ] **Step 3: Verify**

Run: `pnpm --filter frontend typecheck && pnpm --filter frontend lint`
Expected: PASS.

---

### Task 23: Frontend — fields card + dialog

**Files:**

- Create: `apps/frontend/src/modules/inbound-forms/views/details/partials/FieldsCard.vue`
- Create: `apps/frontend/src/modules/inbound-forms/views/details/partials/FieldDialog.vue`
- Modify: `apps/frontend/src/modules/inbound-forms/views/details/InboundFormDetailView.vue`

- [ ] **Step 1: Create `partials/FieldDialog.vue`**

```vue
<template>
    <VDialog max-width="700" :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)">
        <VCard :title="field ? t('cta.edit') : t('module.inboundForms.details.fields.add')">
            <form @submit.prevent="onSubmit">
                <VCardItem>
                    <VRow dense>
                        <VCol cols="6">
                            <VTextField
                                name="key"
                                :label="t('module.inboundForms.details.fields.key')"
                                v-model="key"
                                :error-messages="errors.key"
                            />
                        </VCol>
                        <VCol cols="6">
                            <VTextField
                                name="label"
                                :label="t('module.inboundForms.details.fields.label')"
                                v-model="label"
                                :error-messages="errors.label"
                            />
                        </VCol>
                        <VCol cols="6">
                            <VSelect
                                name="type"
                                :label="t('module.inboundForms.details.fields.type')"
                                v-model="type"
                                :items="typeOptions"
                                :error-messages="errors.type"
                            />
                        </VCol>
                        <VCol cols="6">
                            <VTextField
                                name="defaultValue"
                                :label="t('module.inboundForms.details.fields.defaultValue')"
                                v-model="defaultValue"
                            />
                        </VCol>
                        <VCol cols="12">
                            <VCheckbox
                                name="required"
                                :label="t('module.inboundForms.details.fields.required')"
                                v-model="required"
                            />
                        </VCol>
                        <template v-if="type === 'text'">
                            <VCol cols="4">
                                <VNumberInput
                                    name="minLength"
                                    :label="t('module.inboundForms.details.fields.minLength')"
                                    v-model="minLength"
                                    :min="0"
                                />
                            </VCol>
                            <VCol cols="4">
                                <VNumberInput
                                    name="maxLength"
                                    :label="t('module.inboundForms.details.fields.maxLength')"
                                    v-model="maxLength"
                                    :min="0"
                                />
                            </VCol>
                            <VCol cols="4">
                                <VTextField
                                    name="pattern"
                                    :label="t('module.inboundForms.details.fields.pattern')"
                                    v-model="pattern"
                                />
                            </VCol>
                        </template>
                        <template v-if="type === 'number'">
                            <VCol cols="6">
                                <VNumberInput
                                    name="min"
                                    :label="t('module.inboundForms.details.fields.min')"
                                    v-model="min"
                                />
                            </VCol>
                            <VCol cols="6">
                                <VNumberInput
                                    name="max"
                                    :label="t('module.inboundForms.details.fields.max')"
                                    v-model="max"
                                />
                            </VCol>
                        </template>
                    </VRow>
                </VCardItem>
                <VCardActions>
                    <VSpacer />
                    <VBtn color="error" :text="t('cta.abort')" @click="emit('update:modelValue', false)" />
                    <VBtn color="primary" variant="elevated" :text="t('cta.save')" :loading="saving" type="submit" />
                </VCardActions>
            </form>
        </VCard>
    </VDialog>
</template>

<script setup lang="ts">
    import { computed, watch } from 'vue'
    import { useForm } from 'vee-validate'
    import { toTypedSchema } from '@vee-validate/zod'
    import { z } from 'zod'
    import { useI18n } from 'vue-i18n'
    import type { InboundFormFieldDto, InboundFormFieldUpsertDto } from 'api'

    const props = defineProps<{
        modelValue: boolean
        field: InboundFormFieldDto | null
        saving: boolean
    }>()

    const emit = defineEmits<{
        'update:modelValue': [value: boolean]
        save: [field: InboundFormFieldUpsertDto]
    }>()

    const { t } = useI18n()

    const typeOptions = computed(() =>
        (['text', 'email', 'number', 'boolean'] as const).map((value) => ({
            value,
            title: t(`module.inboundForms.details.fields.typeOptions.${value}`),
        })),
    )

    const { defineField, handleSubmit, errors, resetForm } = useForm({
        validationSchema: toTypedSchema(
            z.object({
                key: z
                    .string()
                    .min(1)
                    .max(255)
                    .regex(/^[\w-]+$/),
                label: z.string().min(1).max(255),
                type: z.enum(['text', 'email', 'number', 'boolean']),
                defaultValue: z.string().max(255).optional(),
                required: z.boolean().optional(),
                minLength: z.number().int().min(0).nullable().optional(),
                maxLength: z.number().int().min(0).nullable().optional(),
                pattern: z.string().optional(),
                min: z.number().nullable().optional(),
                max: z.number().nullable().optional(),
            }),
        ),
    })

    const [key] = defineField('key')
    const [label] = defineField('label')
    const [type] = defineField('type')
    const [defaultValue] = defineField('defaultValue')
    const [required] = defineField('required')
    const [minLength] = defineField('minLength')
    const [maxLength] = defineField('maxLength')
    const [pattern] = defineField('pattern')
    const [min] = defineField('min')
    const [max] = defineField('max')

    watch(
        () => props.modelValue,
        (open) => {
            if (!open) {
                return
            }
            resetForm({
                values: {
                    key: props.field?.key ?? '',
                    label: props.field?.label ?? '',
                    type: props.field?.type ?? 'text',
                    defaultValue: props.field?.defaultValue ?? undefined,
                    required: props.field?.validation?.required ?? false,
                    minLength: props.field?.validation?.minLength ?? null,
                    maxLength: props.field?.validation?.maxLength ?? null,
                    pattern: props.field?.validation?.pattern ?? undefined,
                    min: props.field?.validation?.min ?? null,
                    max: props.field?.validation?.max ?? null,
                },
            })
        },
    )

    const onSubmit = handleSubmit((values) => {
        const validation: Record<string, unknown> = {}
        if (values.required) {
            validation.required = true
        }
        if (values.type === 'text') {
            if (values.minLength != null) {
                validation.minLength = values.minLength
            }
            if (values.maxLength != null) {
                validation.maxLength = values.maxLength
            }
            if (values.pattern) {
                validation.pattern = values.pattern
            }
        }
        if (values.type === 'number') {
            if (values.min != null) {
                validation.min = values.min
            }
            if (values.max != null) {
                validation.max = values.max
            }
        }

        emit('save', {
            key: values.key,
            label: values.label,
            type: values.type,
            defaultValue: values.defaultValue || null,
            validation: Object.keys(validation).length > 0 ? validation : null,
        })
    })
</script>
```

- [ ] **Step 2: Create `partials/FieldsCard.vue`**

```vue
<template>
    <VCard :title="t('module.inboundForms.details.fields.title')">
        <template #append>
            <VBtn :text="t('module.inboundForms.details.fields.add')" @click="openDialog(null)" />
        </template>
        <VCardItem>
            <p v-if="form.fields.length === 0">{{ t('module.inboundForms.details.fields.empty') }}</p>
            <VTable v-else>
                <thead>
                    <tr>
                        <th>{{ t('module.inboundForms.details.fields.key') }}</th>
                        <th>{{ t('module.inboundForms.details.fields.label') }}</th>
                        <th>{{ t('module.inboundForms.details.fields.type') }}</th>
                        <th>{{ t('module.inboundForms.details.fields.required') }}</th>
                        <th />
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="field in form.fields" :key="field.inboundFormFieldId">
                        <td>
                            <code>{{ field.key }}</code>
                        </td>
                        <td>{{ field.label }}</td>
                        <td>{{ t(`module.inboundForms.details.fields.typeOptions.${field.type}`) }}</td>
                        <td>
                            <VIcon v-if="field.validation?.required" icon="mdi-check" />
                        </td>
                        <td class="text-right">
                            <VIconBtn icon="mdi-pencil" size="small" @click="openDialog(field)" />
                            <VIconBtn icon="mdi-delete" size="small" @click="removeField(field.key)" />
                        </td>
                    </tr>
                </tbody>
            </VTable>
        </VCardItem>
        <FieldDialog v-model="dialogOpen" :field="editingField" :saving="isPending" @save="saveField" />
    </VCard>
</template>

<script setup lang="ts">
    import { ref } from 'vue'
    import { useI18n } from 'vue-i18n'
    import type { InboundFormDetailDto, InboundFormFieldDto, InboundFormFieldUpsertDto } from 'api'
    import { useInboundFormFieldsMutation } from '@/modules/inbound-forms/mutations/useInboundFormFieldsMutation.ts'
    import FieldDialog from '@/modules/inbound-forms/views/details/partials/FieldDialog.vue'

    const props = defineProps<{ form: InboundFormDetailDto }>()

    const { t } = useI18n()
    const { mutateAsync, isPending } = useInboundFormFieldsMutation()

    const dialogOpen = ref(false)
    const editingField = ref<InboundFormFieldDto | null>(null)

    function openDialog(field: InboundFormFieldDto | null) {
        editingField.value = field
        dialogOpen.value = true
    }

    function toUpsert(field: InboundFormFieldDto): InboundFormFieldUpsertDto {
        return {
            key: field.key,
            label: field.label,
            type: field.type,
            defaultValue: field.defaultValue ?? null,
            validation: field.validation ?? null,
        }
    }

    async function saveField(payload: InboundFormFieldUpsertDto) {
        const current = props.form.fields.map(toUpsert)
        const originalKey = editingField.value?.key ?? null
        const fields =
            originalKey === null
                ? [...current, payload]
                : current.map((field) => (field.key === originalKey ? payload : field))

        await mutateAsync({ inboundFormId: props.form.inboundFormId, fields })
        dialogOpen.value = false
    }

    async function removeField(key: string) {
        const fields = props.form.fields.map(toUpsert).filter((field) => field.key !== key)

        await mutateAsync({ inboundFormId: props.form.inboundFormId, fields })
    }
</script>
```

- [ ] **Step 3: Add the card to `InboundFormDetailView.vue`**

Import `FieldsCard` and append `<FieldsCard :form="form" />` inside the `d-flex flex-column gr-6` container.

- [ ] **Step 4: Verify**

Run: `pnpm --filter frontend typecheck && pnpm --filter frontend lint`
Expected: PASS.

---

### Task 24: Frontend — security card + dialog

**Files:**

- Create: `apps/frontend/src/modules/inbound-forms/views/details/partials/SecurityCard.vue`
- Create: `apps/frontend/src/modules/inbound-forms/views/details/partials/SecurityDialog.vue`
- Modify: `apps/frontend/src/modules/inbound-forms/views/details/InboundFormDetailView.vue`

- [ ] **Step 1: Create `partials/SecurityDialog.vue`**

```vue
<template>
    <VDialog max-width="600" :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)">
        <VCard :title="scheme ? t('cta.edit') : t('module.inboundForms.details.security.add')">
            <form @submit.prevent="onSubmit">
                <VCardItem>
                    <VSelect
                        name="type"
                        :label="t('module.inboundForms.details.security.type')"
                        v-model="type"
                        :items="typeOptions"
                        :disabled="scheme !== null"
                        :error-messages="errors.type"
                    />
                    <VSelect
                        name="location"
                        :label="t('module.inboundForms.details.security.location')"
                        v-model="location"
                        :items="locationOptions"
                        :error-messages="errors.location"
                    />
                    <VTextField
                        name="key"
                        :label="t('module.inboundForms.details.security.key')"
                        v-model="key"
                        :error-messages="errors.key"
                    />
                    <template v-if="type === 'google-recaptcha'">
                        <VTextField
                            name="secret"
                            :label="t('module.inboundForms.details.security.secret')"
                            v-model="secret"
                            :error-messages="errors.secret"
                        />
                        <VNumberInput
                            name="minScore"
                            :label="t('module.inboundForms.details.security.minScore')"
                            v-model="minScore"
                            :min="0"
                            :max="1"
                            :step="0.1"
                        />
                    </template>
                </VCardItem>
                <VCardActions>
                    <VSpacer />
                    <VBtn color="error" :text="t('cta.abort')" @click="emit('update:modelValue', false)" />
                    <VBtn color="primary" variant="elevated" :text="t('cta.save')" :loading="saving" type="submit" />
                </VCardActions>
            </form>
        </VCard>
    </VDialog>
</template>

<script setup lang="ts">
    import { computed, watch } from 'vue'
    import { useForm } from 'vee-validate'
    import { toTypedSchema } from '@vee-validate/zod'
    import { z } from 'zod'
    import { useI18n } from 'vue-i18n'
    import type { InboundFormSecurityDto, InboundFormSecurityUpsertDto } from 'api'

    const props = defineProps<{
        modelValue: boolean
        scheme: InboundFormSecurityDto | null
        saving: boolean
    }>()

    const emit = defineEmits<{
        'update:modelValue': [value: boolean]
        save: [scheme: InboundFormSecurityUpsertDto]
    }>()

    const { t } = useI18n()

    const typeOptions = computed(() =>
        (['google-recaptcha', 'honeypot'] as const).map((value) => ({
            value,
            title: t(`module.inboundForms.details.security.typeOptions.${value}`),
        })),
    )

    const locationOptions = computed(() =>
        (['body', 'header', 'query'] as const).map((value) => ({
            value,
            title: t(`module.inboundForms.details.security.locationOptions.${value}`),
        })),
    )

    const { defineField, handleSubmit, errors, resetForm } = useForm({
        validationSchema: toTypedSchema(
            z
                .object({
                    type: z.enum(['google-recaptcha', 'honeypot']),
                    location: z.enum(['body', 'header', 'query']),
                    key: z.string().min(1).max(255),
                    secret: z.string().optional(),
                    minScore: z.number().min(0).max(1).nullable().optional(),
                })
                .refine((values) => values.type !== 'google-recaptcha' || !!values.secret, {
                    path: ['secret'],
                    error: t('validation.required'),
                }),
        ),
    })

    const [type] = defineField('type')
    const [location] = defineField('location')
    const [key] = defineField('key')
    const [secret] = defineField('secret')
    const [minScore] = defineField('minScore')

    watch(
        () => props.modelValue,
        (open) => {
            if (!open) {
                return
            }
            resetForm({
                values: {
                    type: props.scheme?.type ?? 'honeypot',
                    location: props.scheme?.location ?? 'body',
                    key: props.scheme?.key ?? '',
                    secret: props.scheme?.config?.secret ?? undefined,
                    minScore: props.scheme?.config?.minScore ?? null,
                },
            })
        },
    )

    const onSubmit = handleSubmit((values) => {
        emit('save', {
            type: values.type,
            location: values.location,
            key: values.key,
            config:
                values.type === 'google-recaptcha'
                    ? { secret: values.secret!, minScore: values.minScore ?? undefined }
                    : null,
        })
    })
</script>
```

- [ ] **Step 2: Create `partials/SecurityCard.vue`**

```vue
<template>
    <VCard :title="t('module.inboundForms.details.security.title')">
        <template #append>
            <VBtn :text="t('module.inboundForms.details.security.add')" @click="openDialog(null)" />
        </template>
        <VCardItem>
            <p v-if="form.security.length === 0">{{ t('module.inboundForms.details.security.empty') }}</p>
            <VList v-else>
                <VListItem v-for="scheme in form.security" :key="scheme.inboundFormSecurityId">
                    <template #title>
                        {{ t(`module.inboundForms.details.security.typeOptions.${scheme.type}`) }}
                    </template>
                    <template #subtitle>
                        {{ t(`module.inboundForms.details.security.locationOptions.${scheme.location}`) }} ·
                        <code>{{ scheme.key }}</code>
                    </template>
                    <template #append>
                        <VIconBtn icon="mdi-pencil" size="small" @click="openDialog(scheme)" />
                        <VIconBtn icon="mdi-delete" size="small" @click="removeScheme(scheme.type)" />
                    </template>
                </VListItem>
            </VList>
        </VCardItem>
        <SecurityDialog v-model="dialogOpen" :scheme="editingScheme" :saving="isPending" @save="saveScheme" />
    </VCard>
</template>

<script setup lang="ts">
    import { ref } from 'vue'
    import { useI18n } from 'vue-i18n'
    import type { InboundFormDetailDto, InboundFormSecurityDto, InboundFormSecurityUpsertDto } from 'api'
    import { useInboundFormSecurityMutation } from '@/modules/inbound-forms/mutations/useInboundFormSecurityMutation.ts'
    import SecurityDialog from '@/modules/inbound-forms/views/details/partials/SecurityDialog.vue'

    const props = defineProps<{ form: InboundFormDetailDto }>()

    const { t } = useI18n()
    const { mutateAsync, isPending } = useInboundFormSecurityMutation()

    const dialogOpen = ref(false)
    const editingScheme = ref<InboundFormSecurityDto | null>(null)

    function openDialog(scheme: InboundFormSecurityDto | null) {
        editingScheme.value = scheme
        dialogOpen.value = true
    }

    function toUpsert(scheme: InboundFormSecurityDto): InboundFormSecurityUpsertDto {
        return {
            type: scheme.type,
            location: scheme.location,
            key: scheme.key,
            config: scheme.config ?? null,
        }
    }

    async function saveScheme(payload: InboundFormSecurityUpsertDto) {
        const others = props.form.security.filter((scheme) => scheme.type !== payload.type).map(toUpsert)

        await mutateAsync({ inboundFormId: props.form.inboundFormId, security: [...others, payload] })
        dialogOpen.value = false
    }

    async function removeScheme(type: InboundFormSecurityDto['type']) {
        const security = props.form.security.filter((scheme) => scheme.type !== type).map(toUpsert)

        await mutateAsync({ inboundFormId: props.form.inboundFormId, security })
    }
</script>
```

- [ ] **Step 3: Add `<SecurityCard :form="form" />` to the detail view**

- [ ] **Step 4: Verify**

Run: `pnpm --filter frontend typecheck && pnpm --filter frontend lint`
Expected: PASS.

---

### Task 25: Frontend — receivers card + dialog + detail view spec

**Files:**

- Create: `apps/frontend/src/modules/inbound-forms/views/details/partials/ReceiversCard.vue`
- Create: `apps/frontend/src/modules/inbound-forms/views/details/partials/ReceiverDialog.vue`
- Modify: `apps/frontend/src/modules/inbound-forms/views/details/InboundFormDetailView.vue`
- Test: `apps/frontend/src/modules/inbound-forms/views/details/__tests__/InboundFormDetailView.spec.ts`

- [ ] **Step 1: Create `partials/ReceiverDialog.vue`**

```vue
<template>
    <VDialog max-width="600" :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)">
        <VCard :title="receiver ? t('cta.edit') : t('module.inboundForms.details.receivers.add')">
            <form @submit.prevent="onSubmit">
                <VCardItem>
                    <VTextField
                        name="emailFrom"
                        :label="t('module.inboundForms.details.receivers.from')"
                        :hint="domainFqdn ? `@${domainFqdn}` : undefined"
                        v-model="emailFrom"
                        :error-messages="errors.emailFrom"
                    />
                    <VCombobox
                        name="emailReceiver"
                        :label="t('module.inboundForms.details.receivers.to')"
                        :hint="
                            t('module.inboundForms.details.receivers.recipientHint', {
                                placeholder: placeholderExample,
                            })
                        "
                        :items="placeholderItems"
                        v-model="emailReceiver"
                        :error-messages="errors.emailReceiver"
                    />
                    <VCombobox
                        name="emailReplyTo"
                        :label="t('module.inboundForms.details.receivers.replyTo')"
                        :items="placeholderItems"
                        clearable
                        v-model="emailReplyTo"
                    />
                    <VSwitch name="isActive" :label="t('module.inboundForms.status.active')" v-model="isActive" />
                </VCardItem>
                <VCardActions>
                    <VSpacer />
                    <VBtn color="error" :text="t('cta.abort')" @click="emit('update:modelValue', false)" />
                    <VBtn color="primary" variant="elevated" :text="t('cta.save')" :loading="saving" type="submit" />
                </VCardActions>
            </form>
        </VCard>
    </VDialog>
</template>

<script setup lang="ts">
    import { computed, watch } from 'vue'
    import { useForm } from 'vee-validate'
    import { toTypedSchema } from '@vee-validate/zod'
    import { z } from 'zod'
    import { useI18n } from 'vue-i18n'
    import type { InboundFormReceiverCreateDto, InboundFormReceiverDto } from 'api'

    const props = defineProps<{
        modelValue: boolean
        receiver: InboundFormReceiverDto | null
        emailFieldKeys: string[]
        domainFqdn: string | null
        saving: boolean
    }>()

    const emit = defineEmits<{
        'update:modelValue': [value: boolean]
        save: [receiver: InboundFormReceiverCreateDto]
    }>()

    const { t } = useI18n()

    const placeholderItems = computed(() => props.emailFieldKeys.map((key) => `{{${key}}}`))
    const placeholderExample = computed(() => placeholderItems.value[0] ?? '{{email}}')

    const { defineField, handleSubmit, errors, resetForm } = useForm({
        validationSchema: toTypedSchema(
            z.object({
                emailFrom: z.email(),
                emailReceiver: z.string().min(1),
                emailReplyTo: z.string().nullable().optional(),
                isActive: z.boolean(),
            }),
        ),
    })

    const [emailFrom] = defineField('emailFrom')
    const [emailReceiver] = defineField('emailReceiver')
    const [emailReplyTo] = defineField('emailReplyTo')
    const [isActive] = defineField('isActive')

    watch(
        () => props.modelValue,
        (open) => {
            if (!open) {
                return
            }
            resetForm({
                values: {
                    emailFrom: props.receiver?.emailFrom ?? (props.domainFqdn ? `noreply@${props.domainFqdn}` : ''),
                    emailReceiver: props.receiver?.emailReceiver ?? '',
                    emailReplyTo: props.receiver?.emailReplyTo ?? null,
                    isActive: props.receiver?.isActive ?? true,
                },
            })
        },
    )

    const onSubmit = handleSubmit((values) => {
        emit('save', {
            emailFrom: values.emailFrom,
            emailReceiver: values.emailReceiver,
            emailReplyTo: values.emailReplyTo || null,
            isActive: values.isActive,
        })
    })
</script>
```

- [ ] **Step 2: Create `partials/ReceiversCard.vue`**

```vue
<template>
    <VCard :title="t('module.inboundForms.details.receivers.title')">
        <template #append>
            <VBtn :text="t('module.inboundForms.details.receivers.add')" @click="openDialog(null)" />
        </template>
        <VCardItem>
            <p v-if="form.receivers.length === 0">{{ t('module.inboundForms.details.receivers.empty') }}</p>
            <VList v-else>
                <VListItem v-for="receiver in form.receivers" :key="receiver.inboundFormReceiverId">
                    <template #title> {{ receiver.emailFrom }} → {{ receiver.emailReceiver }} </template>
                    <template #subtitle>
                        <span v-if="receiver.emailReplyTo">
                            {{ t('module.inboundForms.details.receivers.replyTo') }}: {{ receiver.emailReplyTo }} ·
                        </span>
                        <span>{{ templateLabel(receiver) }}</span>
                    </template>
                    <template #append>
                        <VChip :color="receiver.isActive ? 'success' : 'default'" size="small" class="mr-2">
                            {{
                                receiver.isActive
                                    ? t('module.inboundForms.status.active')
                                    : t('module.inboundForms.status.inactive')
                            }}
                        </VChip>
                        <VBtn
                            variant="text"
                            size="small"
                            :text="t('module.inboundForms.details.receivers.template.edit')"
                            :to="{
                                name: RouteNames.INBOUND_FORM_TEMPLATE,
                                params: {
                                    inboundFormId: form.inboundFormId,
                                    inboundFormReceiverId: receiver.inboundFormReceiverId,
                                },
                            }"
                        />
                        <VIconBtn icon="mdi-pencil" size="small" @click="openDialog(receiver)" />
                        <VIconBtn icon="mdi-delete" size="small" @click="removeReceiver(receiver)" />
                    </template>
                </VListItem>
            </VList>
        </VCardItem>
        <ReceiverDialog
            v-model="dialogOpen"
            :receiver="editingReceiver"
            :email-field-keys="emailFieldKeys"
            :domain-fqdn="domainFqdn"
            :saving="isSaving"
            @save="saveReceiver"
        />
    </VCard>
</template>

<script setup lang="ts">
    import { computed, ref } from 'vue'
    import { useI18n } from 'vue-i18n'
    import { useQuery } from '@tanstack/vue-query'
    import type { InboundFormDetailDto, InboundFormReceiverCreateDto, InboundFormReceiverDto } from 'api'
    import { useDomainsQuery } from '@/modules/domains/queries/useDomainsQuery.ts'
    import { useReceiverCreateMutation } from '@/modules/inbound-forms/mutations/useReceiverCreateMutation.ts'
    import { useReceiverUpdateMutation } from '@/modules/inbound-forms/mutations/useReceiverUpdateMutation.ts'
    import { useReceiverDeleteMutation } from '@/modules/inbound-forms/mutations/useReceiverDeleteMutation.ts'
    import ReceiverDialog from '@/modules/inbound-forms/views/details/partials/ReceiverDialog.vue'
    import { RouteNames } from '@/router/RouteNames.ts'

    const props = defineProps<{ form: InboundFormDetailDto }>()

    const { t } = useI18n()
    const { data: domains } = useQuery(useDomainsQuery())
    const createMutation = useReceiverCreateMutation()
    const updateMutation = useReceiverUpdateMutation()
    const deleteMutation = useReceiverDeleteMutation()

    const dialogOpen = ref(false)
    const editingReceiver = ref<InboundFormReceiverDto | null>(null)

    const isSaving = computed(() => createMutation.isPending.value || updateMutation.isPending.value)

    const emailFieldKeys = computed(() =>
        props.form.fields.filter((field) => field.type === 'email').map((field) => field.key),
    )

    const domainFqdn = computed(
        () => domains.value?.find((domain) => domain.domainId === props.form.domainId)?.fqdn ?? null,
    )

    function openDialog(receiver: InboundFormReceiverDto | null) {
        editingReceiver.value = receiver
        dialogOpen.value = true
    }

    function templateLabel(receiver: InboundFormReceiverDto): string {
        if (receiver.draftVersion !== null) {
            return t('module.inboundForms.details.receivers.template.draft', { version: receiver.draftVersion })
        }
        if (receiver.publishedVersion !== null) {
            return t('module.inboundForms.details.receivers.template.published', {
                version: receiver.publishedVersion,
            })
        }
        return t('module.inboundForms.details.receivers.template.none')
    }

    async function saveReceiver(payload: InboundFormReceiverCreateDto) {
        if (editingReceiver.value) {
            await updateMutation.mutateAsync({
                inboundFormId: props.form.inboundFormId,
                inboundFormReceiverId: editingReceiver.value.inboundFormReceiverId,
                update: payload,
            })
        } else {
            await createMutation.mutateAsync({ inboundFormId: props.form.inboundFormId, receiver: payload })
        }
        dialogOpen.value = false
    }

    async function removeReceiver(receiver: InboundFormReceiverDto) {
        await deleteMutation.mutateAsync({
            inboundFormId: props.form.inboundFormId,
            inboundFormReceiverId: receiver.inboundFormReceiverId,
        })
    }
</script>
```

- [ ] **Step 3: Add `<ReceiversCard :form="form" />` to the detail view**

- [ ] **Step 4: Write the detail view spec**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DomainApi, InboundFormApi, type InboundFormDetailDto } from 'api'
import InboundFormDetailView from '../InboundFormDetailView.vue'
import { mountView } from '@/__tests__/support.ts'

vi.mock('vue-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('vue-router')>()
    return {
        ...actual,
        useRoute: () => ({ params: { inboundFormId: '1' } }),
        useRouter: () => ({ push: vi.fn() }),
    }
})

const detail: InboundFormDetailDto = {
    inboundFormId: 1,
    domainId: 3,
    name: 'Contact',
    slug: 'contact',
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    fields: [
        {
            inboundFormFieldId: 21,
            key: 'email',
            label: 'Email',
            type: 'email',
            defaultValue: null,
            validation: { required: true },
        },
    ],
    security: [
        {
            inboundFormSecurityId: 11,
            type: 'honeypot',
            location: 'body',
            key: 'website',
            config: null,
        },
    ],
    receivers: [
        {
            inboundFormReceiverId: 31,
            emailFrom: 'noreply@mail.example.com',
            emailReceiver: 'owner@business.com',
            emailReplyTo: '{{email}}',
            isActive: true,
            draftVersion: null,
            publishedVersion: 2,
        },
    ],
}

afterEach(() => {
    vi.restoreAllMocks()
})

describe('InboundFormDetailView', () => {
    it('renders all four setup cards from the loaded form', async () => {
        vi.spyOn(InboundFormApi, 'getInboundForm').mockResolvedValue(detail)
        vi.spyOn(DomainApi, 'getDomains').mockResolvedValue([])
        const wrapper = mountView(InboundFormDetailView)

        await vi.waitFor(() => {
            expect(wrapper.get('h1').text()).toBe('Contact')
        })
        expect(wrapper.text()).toContain('General')
        expect(wrapper.text()).toContain('/api/public/form/contact')
        expect(wrapper.text()).toContain('email')
        expect(wrapper.text()).toContain('Honeypot')
        expect(wrapper.text()).toContain('owner@business.com')
        expect(wrapper.text()).toContain('Published v2')
    })
})
```

- [ ] **Step 5: Verify**

Run: `pnpm --filter frontend exec vitest run src/modules/inbound-forms && pnpm --filter frontend typecheck && pnpm --filter frontend lint`
Expected: all PASS. Adjust the spec's DTO literals if the generated types differ (they are the source of truth).

---

### Task 26: Frontend — template editor building blocks (TDD for sample data)

**Files:**

- Create: `apps/frontend/src/modules/inbound-forms/helpers/sampleData.ts`
- Test: `apps/frontend/src/modules/inbound-forms/helpers/__tests__/sampleData.spec.ts`
- Create: `apps/frontend/src/modules/inbound-forms/views/template/partials/MonacoEditor.vue`
- Create: `apps/frontend/src/modules/inbound-forms/views/template/partials/TemplatePreview.vue`

- [ ] **Step 1: Write the failing sample-data spec**

```ts
import { describe, expect, it } from 'vitest'
import type { InboundFormFieldDto } from 'api'
import { buildSampleData } from '../sampleData.ts'

function field(partial: Partial<InboundFormFieldDto>): InboundFormFieldDto {
    return {
        inboundFormFieldId: 1,
        key: 'field',
        label: 'Field',
        type: 'text',
        defaultValue: null,
        validation: null,
        ...partial,
    }
}

describe('buildSampleData', () => {
    it('generates a typed sample value per field', () => {
        const result = buildSampleData([
            field({ key: 'firstName', label: 'First name', type: 'text' }),
            field({ key: 'email', type: 'email' }),
            field({ key: 'guests', type: 'number' }),
            field({ key: 'newsletter', type: 'boolean' }),
        ])

        expect(result).toEqual({
            firstName: 'Sample First name',
            email: 'jane.doe@example.com',
            guests: 42,
            newsletter: true,
        })
    })

    it('prefers configured default values with type casting', () => {
        const result = buildSampleData([
            field({ key: 'source', type: 'text', defaultValue: 'website' }),
            field({ key: 'guests', type: 'number', defaultValue: '3' }),
            field({ key: 'newsletter', type: 'boolean', defaultValue: 'false' }),
        ])

        expect(result).toEqual({ source: 'website', guests: 3, newsletter: false })
    })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter frontend exec vitest run src/modules/inbound-forms/helpers/__tests__/sampleData.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `helpers/sampleData.ts`**

```ts
import type { InboundFormFieldDto } from 'api'

export function buildSampleData(fields: InboundFormFieldDto[]): Record<string, unknown> {
    return Object.fromEntries(fields.map((field) => [field.key, sampleValue(field)]))
}

function sampleValue(field: InboundFormFieldDto): unknown {
    if (field.defaultValue) {
        if (field.type === 'number') {
            return Number(field.defaultValue)
        }
        if (field.type === 'boolean') {
            return field.defaultValue === 'true'
        }
        return field.defaultValue
    }

    switch (field.type) {
        case 'email':
            return 'jane.doe@example.com'
        case 'number':
            return 42
        case 'boolean':
            return true
        default:
            return `Sample ${field.label}`
    }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter frontend exec vitest run src/modules/inbound-forms/helpers/__tests__/sampleData.spec.ts`
Expected: PASS.

- [ ] **Step 5: Create `partials/MonacoEditor.vue`** (never import `monaco-editor` outside this file — jsdom tests mock this component)

```vue
<template>
    <div ref="container" class="monaco-container" />
</template>

<script setup lang="ts">
    import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
    import * as monaco from 'monaco-editor'
    import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
    import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'

    ;(self as unknown as { MonacoEnvironment: monaco.Environment }).MonacoEnvironment = {
        getWorker(_workerId: string, label: string) {
            if (label === 'html' || label === 'handlebars') {
                return new HtmlWorker()
            }
            return new EditorWorker()
        },
    }

    const props = defineProps<{ modelValue: string; fieldKeys: string[] }>()
    const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

    const container = ref<HTMLElement>()
    let editor: monaco.editor.IStandaloneCodeEditor | undefined
    let completionProvider: monaco.IDisposable | undefined

    onMounted(() => {
        editor = monaco.editor.create(container.value!, {
            value: props.modelValue,
            language: 'handlebars',
            minimap: { enabled: false },
            wordWrap: 'on',
            automaticLayout: true,
        })

        editor.onDidChangeModelContent(() => {
            emit('update:modelValue', editor!.getValue())
        })

        completionProvider = monaco.languages.registerCompletionItemProvider('handlebars', {
            triggerCharacters: ['{'],
            provideCompletionItems(model, position) {
                const word = model.getWordUntilPosition(position)
                const range = new monaco.Range(
                    position.lineNumber,
                    word.startColumn,
                    position.lineNumber,
                    word.endColumn,
                )
                return {
                    suggestions: props.fieldKeys.map((key) => ({
                        label: `{{${key}}}`,
                        kind: monaco.languages.CompletionItemKind.Variable,
                        insertText: key,
                        range,
                    })),
                }
            },
        })
    })

    watch(
        () => props.modelValue,
        (value) => {
            if (editor && editor.getValue() !== value) {
                editor.setValue(value)
            }
        },
    )

    onBeforeUnmount(() => {
        completionProvider?.dispose()
        editor?.dispose()
    })

    function insertText(text: string) {
        if (!editor) {
            return
        }
        const selection = editor.getSelection()
        editor.executeEdits('insert-placeholder', [
            {
                range: selection ?? new monaco.Range(1, 1, 1, 1),
                text,
                forceMoveMarkers: true,
            },
        ])
        editor.focus()
    }

    defineExpose({ insertText })
</script>

<style scoped>
    .monaco-container {
        height: 100%;
        min-height: 480px;
    }
</style>
```

- [ ] **Step 6: Create `partials/TemplatePreview.vue`**

```vue
<template>
    <VAlert v-if="preview.error" color="warning" icon="mdi-alert">
        {{ t('module.inboundForms.template.previewError', { error: preview.error }) }}
    </VAlert>
    <iframe
        v-else
        class="preview-frame"
        sandbox=""
        :srcdoc="preview.html"
        :title="t('module.inboundForms.template.preview')"
    />
</template>

<script setup lang="ts">
    import { computed, toRef } from 'vue'
    import Handlebars from 'handlebars'
    import { useI18n } from 'vue-i18n'
    import { refDebounced } from '@vueuse/core'

    const props = defineProps<{ template: string; sampleData: Record<string, unknown> }>()

    const { t } = useI18n()
    const debouncedTemplate = refDebounced(toRef(props, 'template'), 300)

    const preview = computed(() => {
        try {
            return { html: Handlebars.compile(debouncedTemplate.value)(props.sampleData), error: null }
        } catch (error) {
            return { html: '', error: error instanceof Error ? error.message : String(error) }
        }
    })
</script>

<style scoped>
    .preview-frame {
        width: 100%;
        height: 100%;
        min-height: 480px;
        border: 1px solid rgba(0, 0, 0, 0.12);
        border-radius: 4px;
        background: white;
    }
</style>
```

- [ ] **Step 7: Verify**

Run: `pnpm --filter frontend typecheck && pnpm --filter frontend lint`
Expected: PASS.

---

### Task 27: Frontend — template editor view (TDD)

**Files:**

- Create: `apps/frontend/src/modules/inbound-forms/views/template/InboundFormTemplateView.vue`
- Test: `apps/frontend/src/modules/inbound-forms/views/template/__tests__/InboundFormTemplateView.spec.ts`

If Task 19 Step 3 (router wiring) was deferred because the views did not exist yet, complete it now.

- [ ] **Step 1: Write the failing view spec**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { InboundFormApi, type InboundFormDetailDto, type InboundFormTemplateDto } from 'api'
import InboundFormTemplateView from '../InboundFormTemplateView.vue'
import { mountView } from '@/__tests__/support.ts'

vi.mock('vue-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('vue-router')>()
    return {
        ...actual,
        useRoute: () => ({ params: { inboundFormId: '1', inboundFormReceiverId: '31' } }),
        useRouter: () => ({ push: vi.fn() }),
    }
})

vi.mock('@/modules/inbound-forms/views/template/partials/MonacoEditor.vue', () => ({
    default: {
        name: 'MonacoEditor',
        props: ['modelValue', 'fieldKeys'],
        emits: ['update:modelValue'],
        methods: {
            insertText: vi.fn(),
        },
        template:
            '<textarea class="monaco-stub" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    },
}))

const detail: InboundFormDetailDto = {
    inboundFormId: 1,
    domainId: 3,
    name: 'Contact',
    slug: 'contact',
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    fields: [
        {
            inboundFormFieldId: 21,
            key: 'firstName',
            label: 'First name',
            type: 'text',
            defaultValue: null,
            validation: null,
        },
        {
            inboundFormFieldId: 22,
            key: 'email',
            label: 'Email',
            type: 'email',
            defaultValue: null,
            validation: { required: true },
        },
    ],
    security: [],
    receivers: [
        {
            inboundFormReceiverId: 31,
            emailFrom: 'noreply@mail.example.com',
            emailReceiver: 'owner@business.com',
            emailReplyTo: null,
            isActive: true,
            draftVersion: 2,
            publishedVersion: 1,
        },
    ],
}

const draft: InboundFormTemplateDto = {
    inboundFormTemplateId: 42,
    inboundFormReceiverId: 31,
    subject: 'Message from {{firstName}}',
    template: '<p>{{firstName}} wrote in</p>',
    status: 'draft',
    version: 2,
    updatedAt: new Date('2026-01-03T00:00:00.000Z'),
}

const published: InboundFormTemplateDto = {
    ...draft,
    inboundFormTemplateId: 41,
    status: 'published',
    version: 1,
    subject: 'Old subject',
    template: '<p>Old</p>',
}

afterEach(() => {
    vi.restoreAllMocks()
})

describe('InboundFormTemplateView', () => {
    it('loads the draft into subject and editor and lists field chips', async () => {
        vi.spyOn(InboundFormApi, 'getInboundForm').mockResolvedValue(detail)
        vi.spyOn(InboundFormApi, 'getInboundFormTemplates').mockResolvedValue([draft, published])
        const wrapper = mountView(InboundFormTemplateView)

        await vi.waitFor(() => {
            expect(wrapper.find('.monaco-stub').exists()).toBe(true)
        })
        await flushPromises()

        expect((wrapper.get('input[name="subject"]').element as HTMLInputElement).value).toBe(
            'Message from {{firstName}}',
        )
        expect((wrapper.get('.monaco-stub').element as HTMLTextAreaElement).value).toBe('<p>{{firstName}} wrote in</p>')
        expect(wrapper.text()).toContain('firstName')
        expect(wrapper.text()).toContain('email')
    })

    it('saves the draft through the api', async () => {
        vi.spyOn(InboundFormApi, 'getInboundForm').mockResolvedValue(detail)
        vi.spyOn(InboundFormApi, 'getInboundFormTemplates').mockResolvedValue([draft, published])
        const saveSpy = vi.spyOn(InboundFormApi, 'saveInboundFormTemplateDraft').mockResolvedValue(draft)
        const wrapper = mountView(InboundFormTemplateView)

        await vi.waitFor(() => {
            expect(wrapper.find('.monaco-stub').exists()).toBe(true)
        })
        await flushPromises()

        await wrapper.get('button[data-testid="save-draft"]').trigger('click')

        await vi.waitFor(() => {
            expect(saveSpy).toHaveBeenCalledWith({
                path: { inboundFormId: 1, inboundFormReceiverId: 31 },
                body: { subject: 'Message from {{firstName}}', template: '<p>{{firstName}} wrote in</p>' },
            })
        })
    })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter frontend exec vitest run src/modules/inbound-forms/views/template/__tests__/InboundFormTemplateView.spec.ts`
Expected: FAIL — component not found.

- [ ] **Step 3: Implement `InboundFormTemplateView.vue`**

```vue
<template>
    <VContainer fluid v-if="form && receiver">
        <div class="d-flex align-center gc-3 mb-4">
            <VIconBtn
                icon="mdi-arrow-left"
                :to="{ name: RouteNames.INBOUND_FORM_DETAILS, params: { inboundFormId } }"
            />
            <div>
                <h1>{{ t('module.inboundForms.template.title') }}</h1>
                <span class="text-medium-emphasis">{{ receiver.emailFrom }} → {{ receiver.emailReceiver }}</span>
            </div>
            <VSpacer />
            <VMenu v-if="versions && versions.length > 0">
                <template #activator="{ props: menuProps }">
                    <VBtn v-bind="menuProps" variant="text" :text="t('module.inboundForms.template.versions')" />
                </template>
                <VList>
                    <VListItem
                        v-for="version in versions"
                        :key="version.inboundFormTemplateId"
                        :title="
                            t('module.inboundForms.template.version', {
                                version: version.version,
                                status: t(`module.inboundForms.template.statusOptions.${version.status}`),
                            })
                        "
                        @click="loadVersion(version)"
                    />
                </VList>
            </VMenu>
            <VBtn
                data-testid="save-draft"
                :text="t('cta.saveDraft')"
                :loading="draftMutation.isPending.value"
                @click="saveDraft"
            />
            <VBtn
                data-testid="publish"
                color="primary"
                variant="elevated"
                :text="t('cta.publish')"
                :loading="publishMutation.isPending.value"
                @click="publish"
            />
        </div>
        <VTextField name="subject" :label="t('module.inboundForms.template.subject')" v-model="subject" />
        <div class="d-flex align-center gc-2 mb-4 flex-wrap">
            <span class="text-medium-emphasis">{{ t('module.inboundForms.template.fieldsHint') }}:</span>
            <VChip
                v-for="field in form.fields"
                :key="field.inboundFormFieldId"
                size="small"
                @click="insertField(field.key)"
            >
                {{ field.key }}
            </VChip>
        </div>
        <VRow>
            <VCol cols="12" md="6">
                <MonacoEditor ref="editorRef" v-model="template" :field-keys="fieldKeys" />
            </VCol>
            <VCol cols="12" md="6">
                <TemplatePreview :template="template" :sample-data="sampleData" />
            </VCol>
        </VRow>
    </VContainer>
</template>

<script setup lang="ts">
    import { computed, ref, watch } from 'vue'
    import { useQuery } from '@tanstack/vue-query'
    import { useRoute } from 'vue-router'
    import { useI18n } from 'vue-i18n'
    import type { InboundFormTemplateDto } from 'api'
    import { useInboundFormQuery } from '@/modules/inbound-forms/queries/useInboundFormQuery.ts'
    import { useInboundFormTemplatesQuery } from '@/modules/inbound-forms/queries/useInboundFormTemplatesQuery.ts'
    import { useTemplateDraftMutation } from '@/modules/inbound-forms/mutations/useTemplateDraftMutation.ts'
    import { useTemplatePublishMutation } from '@/modules/inbound-forms/mutations/useTemplatePublishMutation.ts'
    import { buildSampleData } from '@/modules/inbound-forms/helpers/sampleData.ts'
    import MonacoEditor from '@/modules/inbound-forms/views/template/partials/MonacoEditor.vue'
    import TemplatePreview from '@/modules/inbound-forms/views/template/partials/TemplatePreview.vue'
    import { RouteNames } from '@/router/RouteNames.ts'

    const route = useRoute()
    const { t } = useI18n()

    const inboundFormId = computed(() => Number(route.params.inboundFormId))
    const inboundFormReceiverId = computed(() => Number(route.params.inboundFormReceiverId))

    const { data: form } = useQuery(useInboundFormQuery(inboundFormId))
    const { data: versions } = useQuery(useInboundFormTemplatesQuery(inboundFormId, inboundFormReceiverId))
    const draftMutation = useTemplateDraftMutation()
    const publishMutation = useTemplatePublishMutation()

    const subject = ref('')
    const template = ref('')
    const initialized = ref(false)
    const editorRef = ref<InstanceType<typeof MonacoEditor>>()

    const receiver = computed(() =>
        form.value?.receivers.find(
            (formReceiver) => formReceiver.inboundFormReceiverId === inboundFormReceiverId.value,
        ),
    )

    const fieldKeys = computed(() => form.value?.fields.map((field) => field.key) ?? [])
    const sampleData = computed(() => buildSampleData(form.value?.fields ?? []))

    watch(versions, (loadedVersions) => {
        if (initialized.value || !loadedVersions) {
            return
        }
        initialized.value = true
        const initial = loadedVersions.find((version) => version.status === 'draft') ?? loadedVersions[0]
        if (initial) {
            subject.value = initial.subject
            template.value = initial.template
        }
    })

    function loadVersion(version: InboundFormTemplateDto) {
        subject.value = version.subject
        template.value = version.template
    }

    function insertField(key: string) {
        editorRef.value?.insertText(`{{${key}}}`)
    }

    async function saveDraft() {
        await draftMutation.mutateAsync({
            inboundFormId: inboundFormId.value,
            inboundFormReceiverId: inboundFormReceiverId.value,
            draft: { subject: subject.value, template: template.value },
        })
    }

    async function publish() {
        await saveDraft()
        await publishMutation.mutateAsync({
            inboundFormId: inboundFormId.value,
            inboundFormReceiverId: inboundFormReceiverId.value,
        })
    }
</script>
```

- [ ] **Step 4: Run the spec to verify pass**

Run: `pnpm --filter frontend exec vitest run src/modules/inbound-forms/views/template/__tests__/InboundFormTemplateView.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Verify the whole frontend**

Run: `pnpm --filter frontend test && pnpm --filter frontend typecheck && pnpm --filter frontend lint`
Expected: all PASS.

---

### Task 28: Full gate + manual verification

- [ ] **Step 1: Run the complete repository gate**

Run: `pnpm check`
Expected: lint, typecheck, tests and prettier all PASS across the three workspaces. Run `pnpm format:fix` first if prettier complains.

- [ ] **Step 2: Run the backend e2e suite once more**

Run: `pnpm --filter backend test:e2e`
Expected: PASS.

- [ ] **Step 3: Manual smoke test** (requires `.env` with `SMTP_*` keys and `docker compose -f dev/docker-compose.yml up -d`)

1. `pnpm --filter backend migrate up`, then `pnpm dev`.
2. Log in at `http://localhost:5173`, open **Forms**, create a form on an existing domain.
3. Add fields (`firstName` text required, `email` email required), a honeypot scheme (body, key `website`), and a receiver (`noreply@<domain>` → your address, reply-to `{{email}}`).
4. Open the template editor: type `{{` (completion should offer fields), click a field chip (inserts at cursor), check the live preview, save draft, publish.
5. Submit from a terminal:

```bash
curl -X POST http://localhost:8000/api/public/form/<slug> \
  -H "content-type: application/json" \
  -d '{"security":{"website":null},"data":{"firstName":"Max","email":"test@example.com"}}'
```

6. Open MailHog at `http://localhost:8025` — the rendered mail must be there with a `DKIM-Signature` header; the delivery row in `inbound_form_delivery` must be `sent`.
7. Repeat with `"website":"spam"` — response is still `201`, but no new mail arrives and the submission row is stored with status `spam`.

- [ ] **Step 4: Hand over to the repository owner**

Report: what was built, the env keys the owner must add, and that all git operations (review, commit) are theirs. Do NOT commit anything.
