import { z } from 'zod'

const port = z.coerce.number().int().min(1).max(65535)

export const envSchema = z
    .object({
        PORT: port.default(8000),

        DB_HOST: z.string().default('localhost'),
        DB_PORT: port.optional(),
        DB_USERNAME: z.string().optional(),
        DB_PASSWORD: z.string().optional(),
        DB_DATABASE: z.string().optional(),

        REDIS_HOST: z.string().default('127.0.0.1'),
        REDIS_PORT: port.default(6379),

        BACKEND_JWT_SECRET: z.string().min(1),
        BACKEND_DKIM_SECRET: z.string().min(1),

        SMTP_HOST: z.string().min(1),
        SMTP_PORT: port,
        SMTP_SECURE: z.stringbool().default(false),
        SMTP_USER: z.string().default(''),
        SMTP_PASSWORD: z.string().default(''),

        IMAP_HOST: z.string().optional(),
        IMAP_PORT: port.default(993),
        IMAP_SECURE: z.stringbool().default(true),
        IMAP_USER: z.string().optional(),
        IMAP_PASSWORD: z.string().optional(),

        OPENAPI_PATH: z.string().optional(),
    })
    .superRefine((env, ctx) => {
        if (!env.IMAP_HOST) {
            return
        }
        for (const key of ['IMAP_USER', 'IMAP_PASSWORD'] as const) {
            if (!env[key]) {
                ctx.addIssue({ code: 'custom', path: [key], message: `${key} is required when IMAP_HOST is set` })
            }
        }
    })

export type Env = z.infer<typeof envSchema>
