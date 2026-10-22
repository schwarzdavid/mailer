import { z } from 'zod'

const port = z.coerce.number().int().min(1).max(65535)

const secret = z
    .string()
    .min(32, { message: 'Must be at least 32 characters; generate one with: openssl rand -base64 48' })

const trustProxy = z
    .string()
    .trim()
    .optional()
    .transform((value): boolean | number | string => {
        if (!value || value.toLowerCase() === 'false') {
            return false
        }
        if (value.toLowerCase() === 'true') {
            return true
        }
        if (/^\d+$/.test(value)) {
            return Number(value)
        }
        return value
    })

const mailHostname = z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.hostname())
    .refine((value) => value.includes('.'), { message: 'Must be a fully qualified domain name' })

const envShape = {
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: port.default(8000),
    TRUST_PROXY: trustProxy,

    DB_HOST: z.string().default('localhost'),
    DB_PORT: port.optional(),
    DB_USERNAME: z.string().optional(),
    DB_PASSWORD: z.string().optional(),
    DB_DATABASE: z.string().optional(),

    REDIS_HOST: z.string().default('127.0.0.1'),
    REDIS_PORT: port.default(6379),

    BACKEND_JWT_SECRET: secret,
    BACKEND_ENCRYPTION_SECRET: secret,

    MAIL_HOSTNAME: mailHostname,

    SMTP_HOST: z.string().min(1),
    SMTP_PORT: port,
    SMTP_SECURE: z.stringbool().default(false),
    SMTP_USER: z.string().default(''),
    SMTP_PASSWORD: z.string().default(''),
    SMTP_TLS_SERVERNAME: z.string().optional(),

    IMAP_HOST: z.string().optional(),
    IMAP_PORT: port.default(993),
    IMAP_SECURE: z.stringbool().default(true),
    IMAP_USER: z.string().optional(),
    IMAP_PASSWORD: z.string().optional(),
    IMAP_TLS_SERVERNAME: z.string().optional(),

    PUBLIC_API_RATE_LIMIT: z.coerce.number().int().positive().default(60),
    PUBLIC_API_RATE_TTL: z.coerce.number().int().positive().default(60_000),

    FORM_SUBMIT_RATE_LIMIT: z.coerce.number().int().positive().default(5),
    FORM_SUBMIT_RATE_TTL: z.coerce.number().int().positive().default(600_000),
    FORM_TOKEN_RATE_LIMIT: z.coerce.number().int().positive().default(5),
    FORM_TOKEN_RATE_TTL: z.coerce.number().int().positive().default(600_000),
}

export const envSchema = z.object(envShape).superRefine((env, ctx) => {
    if (!env.IMAP_HOST) {
        return
    }
    for (const key of ['IMAP_USER', 'IMAP_PASSWORD'] as const) {
        if (!env[key]) {
            ctx.addIssue({ code: 'custom', path: [key], message: `${key} is required when IMAP_HOST is set` })
        }
    }
})

export const migrationEnvSchema = z.object({
    DB_HOST: envShape.DB_HOST,
    DB_PORT: envShape.DB_PORT,
    DB_USERNAME: envShape.DB_USERNAME,
    DB_PASSWORD: envShape.DB_PASSWORD,
    DB_DATABASE: envShape.DB_DATABASE,
    BACKEND_ENCRYPTION_SECRET: envShape.BACKEND_ENCRYPTION_SECRET,
})

export type Env = z.infer<typeof envSchema>
