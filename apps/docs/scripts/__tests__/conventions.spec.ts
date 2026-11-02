import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { hasVerifySection, proceduralPages, startsWithHeading, stripFrontmatter } from '../conventions.ts'
import { docsRoot, listPageFiles } from '../pages.ts'

describe('stripFrontmatter', () => {
    it('removes a leading frontmatter block', () => {
        expect(stripFrontmatter('---\naside: false\n---\n\n# Title\n')).toBe('\n# Title\n')
    })

    it('leaves a page without frontmatter unchanged', () => {
        expect(stripFrontmatter('# Title\n\nBody\n')).toBe('# Title\n\nBody\n')
    })
})

describe('startsWithHeading', () => {
    it('accepts a page that starts with an H1', () => {
        expect(startsWithHeading('# Title\n\nBody')).toBe(true)
    })

    it('accepts an H1 after frontmatter and blank lines', () => {
        expect(startsWithHeading('---\naside: false\n---\n\n# Title\n')).toBe(true)
    })

    it('rejects a page that starts with a paragraph', () => {
        expect(startsWithHeading('Intro text\n\n# Title\n')).toBe(false)
    })

    it('rejects a page that starts with an H2', () => {
        expect(startsWithHeading('## Title\n')).toBe(false)
    })
})

describe('hasVerifySection', () => {
    it('detects the verification heading', () => {
        expect(hasVerifySection('# T\n\n## How you know it worked\n\nCheck.\n')).toBe(true)
    })

    it('does not accept a differently named heading', () => {
        expect(hasVerifySection('# T\n\n## Verify\n\nCheck.\n')).toBe(false)
    })
})

describe('page conventions', () => {
    it('every page starts with an H1', async () => {
        const pages = await listPageFiles(docsRoot)
        const offenders: string[] = []
        for (const page of pages) {
            const content = await readFile(resolve(docsRoot, page), 'utf8')
            if (!startsWithHeading(content)) offenders.push(page)
        }
        expect(offenders).toEqual([])
    })

    it('every existing procedural page has a verification section', async () => {
        const existing = proceduralPages.filter((page) => existsSync(resolve(docsRoot, page)))
        const offenders: string[] = []
        for (const page of existing) {
            const content = await readFile(resolve(docsRoot, page), 'utf8')
            if (!hasVerifySection(content)) offenders.push(page)
        }
        expect(offenders).toEqual([])
    })

    it('every procedural page exists', () => {
        const missing = proceduralPages.filter((page) => !existsSync(resolve(docsRoot, page)))
        expect(missing).toEqual([])
    })
})
