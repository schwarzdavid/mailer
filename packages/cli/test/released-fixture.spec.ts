import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const deployDir = join(import.meta.dirname, '../../../deploy')
const fixtureDir = join(import.meta.dirname, 'fixtures/format-1')

describe('format-1 fixture', () => {
    it.each(['mailer.sh', 'compose.yml'])(
        '%s equals deploy/ byte for byte until the first release; when it is cut, delete this test and keep the fixture frozen',
        async (name) => {
            expect(await readFile(join(fixtureDir, name))).toEqual(await readFile(join(deployDir, name)))
        },
    )
})
