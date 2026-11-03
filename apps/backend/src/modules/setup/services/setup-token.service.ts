import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { InjectModel } from '@nestjs/sequelize'
import { UserModel } from '../../user/models/user.model.js'

const TOKEN_BYTES = 16

function digest(value: string): Buffer {
    return createHash('sha256').update(value).digest()
}

@Injectable()
export class SetupTokenService implements OnApplicationBootstrap {
    private readonly logger = new Logger(SetupTokenService.name)

    readonly token = randomBytes(TOKEN_BYTES).toString('hex')

    constructor(@InjectModel(UserModel) private readonly userModel: typeof UserModel) {}

    matches(candidate: string): boolean {
        return timingSafeEqual(digest(candidate), digest(this.token))
    }

    async onApplicationBootstrap(): Promise<void> {
        if ((await this.userModel.count()) === 0) {
            this.logger.log(`No user exists yet. Setup token: ${this.token}`)
        }
    }
}
