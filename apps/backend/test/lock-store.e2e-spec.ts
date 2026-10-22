import { randomUUID } from 'node:crypto'
import { INestApplication } from '@nestjs/common'
import type { LockAcquireResult } from '@nestjs/locks'
import { lockStoreContract } from '@nestjs/locks/testing'
import type { App } from 'supertest/types.js'
import { SequelizeLockStore } from '../src/modules/locks/stores/sequelize-lock.store.js'
import { createTestApp } from './support/app.js'

function fencingTokenOf(result: LockAcquireResult): number {
    if (!result.acquired) {
        throw new Error('expected the lock to be acquired')
    }
    return result.fencingToken
}

describe('SequelizeLockStore', () => {
    let app: INestApplication<App>
    let store: SequelizeLockStore

    beforeAll(async () => {
        app = await createTestApp()
        store = app.get(SequelizeLockStore)
    })

    afterAll(async () => {
        await app?.close()
    })

    describe('LockStore contract', () => {
        const cases = lockStoreContract(() => store, { concurrent: true }).map(({ name, run }) => [name, run] as const)

        it.each(cases)('%s', async (_name, run) => {
            await expect(run()).resolves.toBeUndefined()
        })
    })

    it('stores monotonic fencing tokens across releases', async () => {
        const key = `monotonic-${randomUUID()}`

        const first = fencingTokenOf(await store.acquire(key, 'first-owner', 60_000))
        expect(await store.release(key, 'first-owner')).toBe(true)
        const second = fencingTokenOf(await store.acquire(key, 'second-owner', 60_000))

        expect(second).toBeGreaterThan(first)
    })
})
