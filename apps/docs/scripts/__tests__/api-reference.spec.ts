import { readFile, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { docsRoot } from '../pages.ts'
import { pageTag, specTags } from '../api-reference.ts'

describe('API reference pages', () => {
    it('has exactly one page per tag of the OpenAPI document', async () => {
        const spec = JSON.parse(
            await readFile(resolve(docsRoot, '..', 'backend', 'openapi.json'), 'utf8'),
        ) as Parameters<typeof specTags>[0]
        const dir = join(docsRoot, 'api', 'reference')
        const files = (await readdir(dir)).filter((name) => name.endsWith('.md') && name !== 'index.md')
        const tags = await Promise.all(files.map(async (name) => pageTag(await readFile(join(dir, name), 'utf8'))))
        expect(tags.sort()).toEqual(specTags(spec))
        expect(files.map((name) => name.replace(/\.md$/, '')).sort()).toEqual(specTags(spec))
    })
})

describe('pageTag', () => {
    it('reads the tag from the OASpec component', () => {
        expect(pageTag(`# Projects\n\n<OASpec :tags="['project']" hide-info hide-servers />`)).toBe('project')
        expect(pageTag('# No component')).toBeNull()
    })
})
