import { Injectable } from '@nestjs/common'
import { LocksStorage, type LockAcquireResult, type LockStore } from '@nestjs/locks'
import { QueryTypes } from 'sequelize'
import { Sequelize } from 'sequelize-typescript'

interface FencingTokenRow {
    fencing_token: string
}

@Injectable()
export class SequelizeLockStore implements LockStore {
    constructor(
        private readonly sequelize: Sequelize,
        storage: LocksStorage,
    ) {
        storage.registerSource(this)
    }

    async acquire(key: string, owner: string, ttl: number): Promise<LockAcquireResult> {
        const [row] = await this.sequelize.query<FencingTokenRow>(
            `INSERT INTO "locks" ("key", "owner", "fencing_token", "expires_at")
             VALUES (:key, :owner, nextval('locks_fencing_token_seq'), clock_timestamp() + make_interval(secs => :ttl / 1000.0))
             ON CONFLICT ("key") DO UPDATE SET
                 "owner" = EXCLUDED."owner",
                 "expires_at" = EXCLUDED."expires_at",
                 "fencing_token" = greatest("locks"."fencing_token" + 1, nextval('locks_fencing_token_seq'))
             WHERE "locks"."owner" IS NULL OR "locks"."expires_at" <= clock_timestamp()
             RETURNING "fencing_token"`,
            { type: QueryTypes.SELECT, replacements: { key, owner, ttl } },
        )

        return row ? { acquired: true, fencingToken: Number(row.fencing_token) } : { acquired: false }
    }

    async renew(key: string, owner: string, ttl: number): Promise<boolean> {
        const updated = await this.sequelize.query(
            `UPDATE "locks" SET "expires_at" = clock_timestamp() + make_interval(secs => :ttl / 1000.0)
             WHERE "key" = :key AND "owner" = :owner AND "expires_at" > clock_timestamp()`,
            { type: QueryTypes.BULKUPDATE, replacements: { key, owner, ttl } },
        )

        return updated === 1
    }

    async release(key: string, owner: string): Promise<boolean> {
        const updated = await this.sequelize.query(
            `UPDATE "locks" SET "owner" = NULL, "expires_at" = NULL
             WHERE "key" = :key AND "owner" = :owner AND "expires_at" > clock_timestamp()`,
            { type: QueryTypes.BULKUPDATE, replacements: { key, owner } },
        )

        return updated === 1
    }
}
