import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { composeVariables, documentedVariables, findDrift, runtimeVariables } from './env-reference.ts'

const schemaKeysPath = resolve(import.meta.dirname, '..', '..', 'backend', 'env-keys.json')
const pagePath = resolve(import.meta.dirname, '..', 'configuration', 'environment.md')

if (!existsSync(schemaKeysPath)) {
    console.error('Run "pnpm build --filter docs" first')
    process.exit(1)
}

const schemaKeys = JSON.parse(readFileSync(schemaKeysPath, 'utf8')) as string[]
const expected = [...schemaKeys, ...composeVariables, ...runtimeVariables]
const drift = findDrift(documentedVariables(readFileSync(pagePath, 'utf8')), expected)

if (drift.missing.length > 0) {
    console.error(`Missing from configuration/environment.md: ${drift.missing.join(', ')}`)
}
if (drift.stale.length > 0) {
    console.error(`No longer exist: ${drift.stale.join(', ')}`)
}

if (drift.missing.length > 0 || drift.stale.length > 0) {
    process.exitCode = 1
} else {
    console.log(`environment.md covers all ${new Set(expected).size} variables`)
}
