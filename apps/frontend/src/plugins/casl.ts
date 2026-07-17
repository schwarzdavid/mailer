import { createMongoAbility, type MongoAbility } from '@casl/ability'

export type AppAbility = MongoAbility

export const ability: AppAbility = createMongoAbility()
