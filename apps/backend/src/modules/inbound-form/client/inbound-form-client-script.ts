import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Env } from '../../../config/env.schema.js'
import { describeError } from '../../../helpers/describe-error.js'

const CLIENT_SCRIPT_MODULE = '@schwarzdavid/mailer-client/client.iife.js'

export function loadInboundFormClientScript(
    resolve: (id: string) => string = createRequire(import.meta.url).resolve,
): string {
    return readFileSync(resolve(CLIENT_SCRIPT_MODULE), 'utf8')
}

function tryLoadInboundFormClientScript(): string | undefined {
    try {
        return loadInboundFormClientScript()
    } catch {
        return undefined
    }
}

@Injectable()
export class InboundFormClientScript {
    private readonly logger = new Logger(InboundFormClientScript.name)
    private readonly cachedSource: string | undefined

    constructor(configService: ConfigService<Env, true>) {
        if (configService.get('NODE_ENV', { infer: true }) === 'production') {
            this.cachedSource = loadInboundFormClientScript()
            return
        }
        try {
            loadInboundFormClientScript()
        } catch (error) {
            this.logger.warn(
                `client.js answers 404 until ${CLIENT_SCRIPT_MODULE} is built (pnpm build --filter @schwarzdavid/mailer-client): ${describeError(error)}`,
            )
        }
    }

    get source(): string | undefined {
        return this.cachedSource ?? tryLoadInboundFormClientScript()
    }
}
