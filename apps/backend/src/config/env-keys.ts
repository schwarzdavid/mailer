import { envShape } from './env.schema.js'

export function listEnvKeys(): string[] {
    return Object.keys(envShape).sort((a, b) => a.localeCompare(b))
}
