import type { MigrationFn } from 'umzug'
import { QueryTypes, type QueryInterface } from 'sequelize'
import { decryptSecret, encryptSecret } from '../helpers/secret-encryption.js'

const RECAPTCHA_TYPE = 'google-recaptcha'
const MASTER_SECRET_ENV = 'BACKEND_ENCRYPTION_SECRET'

interface SecurityRow<Config> {
    inboundFormSecurityId: number
    config: Config
}

interface PlaintextConfig {
    secret: string
    minScore?: number
}

interface EncryptedConfig {
    encryptedSecret: string
    minScore?: number
}

function masterSecret(rowCount: number): string {
    const secret = process.env[MASTER_SECRET_ENV]
    if (!secret) {
        throw new Error(
            `${MASTER_SECRET_ENV} must be set to migrate the ${rowCount} stored reCAPTCHA secret(s) of inbound forms`,
        )
    }
    return secret
}

function selectRecaptchaRowsWith<Config>(
    queryInterface: QueryInterface,
    configKey: keyof PlaintextConfig | keyof EncryptedConfig,
): Promise<SecurityRow<Config>[]> {
    return queryInterface.sequelize.query<SecurityRow<Config>>(
        `SELECT "inboundFormSecurityId", "config" FROM "inbound_form_security"
         WHERE "type" = :type AND jsonb_typeof("config" -> :configKey) = 'string'
         ORDER BY "inboundFormSecurityId"`,
        { type: QueryTypes.SELECT, replacements: { type: RECAPTCHA_TYPE, configKey } },
    )
}

async function rewriteConfigs(
    queryInterface: QueryInterface,
    updates: { inboundFormSecurityId: number; config: PlaintextConfig | EncryptedConfig }[],
): Promise<void> {
    for (const { inboundFormSecurityId, config } of updates) {
        await queryInterface.sequelize.query(
            `UPDATE "inbound_form_security" SET "config" = CAST(:config AS jsonb)
             WHERE "inboundFormSecurityId" = :inboundFormSecurityId`,
            { replacements: { config: JSON.stringify(config), inboundFormSecurityId } },
        )
    }
}

function withMinScore<Config extends object>(config: Config, minScore: number | undefined): Config {
    return typeof minScore === 'number' ? { ...config, minScore } : config
}

export const up: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
    const rows = await selectRecaptchaRowsWith<PlaintextConfig>(queryInterface, 'secret')
    if (rows.length === 0) {
        return
    }

    const secret = masterSecret(rows.length)
    const updates = await Promise.all(
        rows.map(async ({ inboundFormSecurityId, config }) => ({
            inboundFormSecurityId,
            config: withMinScore<EncryptedConfig>(
                { encryptedSecret: await encryptSecret(config.secret, secret) },
                config.minScore,
            ),
        })),
    )

    await rewriteConfigs(queryInterface, updates)
}

export const down: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
    const rows = await selectRecaptchaRowsWith<EncryptedConfig>(queryInterface, 'encryptedSecret')
    if (rows.length === 0) {
        return
    }

    const secret = masterSecret(rows.length)
    const updates = await Promise.all(
        rows.map(async ({ inboundFormSecurityId, config }) => ({
            inboundFormSecurityId,
            config: withMinScore<PlaintextConfig>(
                { secret: await decryptSecret(config.encryptedSecret, secret) },
                config.minScore,
            ),
        })),
    )

    await rewriteConfigs(queryInterface, updates)
}
