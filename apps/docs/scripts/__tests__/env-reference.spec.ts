import { describe, expect, it } from 'vitest'
import { documentedVariables, findDrift } from '../env-reference.ts'

const page = [
    '# Environment variables',
    '',
    'Set `DB_HOST` only outside Docker.',
    '',
    '| Variable | Required | Default | Set by compose | Description |',
    '| --- | --- | --- | --- | --- |',
    '| `DB_HOST` | yes | `localhost` | `postgres` | Database host |',
    '| `LOG_LEVEL` | no | `info` | – | Log level |',
].join('\n')

describe('documentedVariables', () => {
    it('collects the variable names from table rows and ignores prose', () => {
        expect([...documentedVariables(page)].sort()).toEqual(['DB_HOST', 'LOG_LEVEL'])
    })
})

describe('findDrift', () => {
    it('reports variables missing from the page and variables the schema no longer has', () => {
        const drift = findDrift(new Set(['DB_HOST', 'OLD_KEY']), ['DB_HOST', 'LOG_LEVEL'])
        expect(drift).toEqual({ missing: ['LOG_LEVEL'], stale: ['OLD_KEY'] })
    })
})
