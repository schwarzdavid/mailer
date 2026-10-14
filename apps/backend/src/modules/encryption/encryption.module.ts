import { Module } from '@nestjs/common'
import { SecretEncryptionService } from './services/secret-encryption.service.js'

@Module({
    providers: [SecretEncryptionService],
    exports: [SecretEncryptionService],
})
export class EncryptionModule {}
