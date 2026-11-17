import { INestApplication } from '@nestjs/common'
import type { AddressInfo } from 'node:net'

export async function listenOnLoopback(app: INestApplication): Promise<string> {
    await app.listen(0, '127.0.0.1')
    const { port } = (app.getHttpServer() as { address(): AddressInfo }).address()
    return `http://127.0.0.1:${port}`
}
