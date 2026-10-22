const SPEC_PLACEHOLDER_ENV: Record<string, string> = {
    BACKEND_JWT_SECRET: 'openapi-spec-placeholder-0123456789',
    BACKEND_ENCRYPTION_SECRET: 'openapi-spec-placeholder-0123456789',
    MAIL_HOSTNAME: 'mail.openapi-spec-placeholder.org',
    SMTP_HOST: 'openapi-spec-placeholder',
    SMTP_PORT: '25',
}

export function applySpecPlaceholderEnv(env: NodeJS.ProcessEnv): void {
    for (const [key, value] of Object.entries(SPEC_PLACEHOLDER_ENV)) {
        env[key] ??= value
    }
}
