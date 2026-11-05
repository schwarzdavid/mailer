import { INestApplication } from '@nestjs/common'
import type { App } from 'supertest/types.js'
import { SettingsService } from '../../src/modules/settings/services/settings.service.js'

export const E2E_MAIL_HOSTNAME = 'mail.sending-e2e.org'
export const E2E_SERVER_IPV4 = '203.0.113.10'

export async function ensureSendingDomain(app: INestApplication<App>): Promise<void> {
    await app.get(SettingsService).reconcileSendingDomain()
}
