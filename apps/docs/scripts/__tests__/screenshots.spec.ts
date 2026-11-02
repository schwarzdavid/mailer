import { access, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { docsRoot, listPageFiles } from '../pages.ts'
import { screenshotReferences } from '../screenshots.ts'

describe('screenshotReferences', () => {
    it('returns the paths of markdown images under /screenshots/', () => {
        const md = '![Projects list](/screenshots/admin-guide/projects-list.png)\n![Logo](/logo.svg)'
        expect(screenshotReferences(md)).toEqual(['/screenshots/admin-guide/projects-list.png'])
    })
})

describe('screenshots', () => {
    it('every referenced screenshot exists in public/', async () => {
        for (const file of await listPageFiles(docsRoot)) {
            for (const reference of screenshotReferences(await readFile(join(docsRoot, file), 'utf8'))) {
                await expect(
                    access(join(docsRoot, 'public', reference)),
                    `${file} → ${reference}`,
                ).resolves.toBeUndefined()
            }
        }
    })
})
