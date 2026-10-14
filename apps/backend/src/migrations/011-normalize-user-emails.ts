import type { MigrationFn } from 'umzug'
import { QueryTypes, type QueryInterface } from 'sequelize'

const CONSTRAINT_NAME = 'users_email_normalized'

export const up: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
    const collisions = await queryInterface.sequelize.query<{ email: string; userIds: number[] }>(
        `SELECT lower(btrim("email")) AS "email", array_agg("userId" ORDER BY "userId") AS "userIds"
         FROM "users" GROUP BY lower(btrim("email")) HAVING count(*) > 1`,
        { type: QueryTypes.SELECT },
    )

    if (collisions.length > 0) {
        const details = collisions.map(({ email, userIds }) => `${email} (users ${userIds.join(', ')})`).join('; ')
        throw new Error(
            `Cannot normalize user emails: these addresses differ only by case or whitespace and must be merged first: ${details}`,
        )
    }

    await queryInterface.sequelize.query(
        'UPDATE "users" SET "email" = lower(btrim("email")) WHERE "email" <> lower(btrim("email"))',
    )

    await queryInterface.sequelize.query(
        `ALTER TABLE "users" ADD CONSTRAINT "${CONSTRAINT_NAME}" CHECK ("email" = lower(btrim("email")))`,
    )
}

export const down: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
    await queryInterface.removeConstraint('users', CONSTRAINT_NAME)
}
