import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { Injectable } from '@nestjs/common'

export function loadInboundFormClientScript(
    resolve: (id: string) => string = createRequire(import.meta.url).resolve,
): string {
    return readFileSync(resolve('@schwarzdavid/mailer-client/client.iife.js'), 'utf8')
}

@Injectable()
export class InboundFormClientScript {
    readonly source: string = loadInboundFormClientScript()
}
