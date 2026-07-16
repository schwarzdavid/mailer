import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import type { App } from 'supertest/types'

export async function configureSendingDomain(
    app: INestApplication<App>,
    token: string,
    fqdn = 'mail.sending-e2e.org',
): Promise<void> {
    await request(app.getHttpServer())
        .put('/api/settings/sending-domain')
        .set('Authorization', `Bearer ${token}`)
        .send({ fqdn, serverIpv4: '203.0.113.10' })
        .expect(200)
}
