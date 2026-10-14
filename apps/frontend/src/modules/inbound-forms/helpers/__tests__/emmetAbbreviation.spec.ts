import { describe, expect, it } from 'vitest'
import { expandEmmet } from '../emmetAbbreviation.ts'

describe('expandEmmet', () => {
    it('expands nested and repeated elements', () => {
        const result = expandEmmet('    ul>li*2')

        expect(result?.abbreviation).toBe('ul>li*2')
        expect(result?.expansion).toContain('<ul>')
        expect(result?.expansion.match(/<li><\/li>/g)).toHaveLength(2)
    })

    it('expands classes, ids and text', () => {
        expect(expandEmmet('p.lead{Hello}')?.expansion).toBe('<p class="lead">Hello</p>')
        expect(expandEmmet('<div>table#fields')?.expansion).toContain('<table id="fields">')
    })

    it('expands a plain known tag', () => {
        expect(expandEmmet('td')?.expansion).toBe('<td></td>')
    })

    it('leaves ordinary words, placeholders and markup alone', () => {
        expect(expandEmmet('Hello')).toBeNull()
        expect(expandEmmet('{{name}}')).toBeNull()
        expect(expandEmmet('<p>')).toBeNull()
        expect(expandEmmet('')).toBeNull()
    })
})
