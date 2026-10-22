import { Module } from '@nestjs/common'
import { LocksModule } from '@nestjs/locks'
import { SequelizeLockStore } from './stores/sequelize-lock.store.js'

@Module({
    imports: [LocksModule.forRoot({ ttl: '30s' })],
    providers: [SequelizeLockStore],
})
export class AppLocksModule {}
