import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import type { App } from 'supertest/types.js'

export const E2E_MAIL_HOSTNAME = 'mail.sending-e2e.org'

export async function configureSendingDomain(app: INestApplication<App>, token: string): Promise<void> {
    await request(app.getHttpServer())
        .put('/api/settings/sending-domain')
        .set('Authorization', `Bearer ${token}`)
        .send({ serverIpv4: '203.0.113.10' })
        .expect(200)
}
