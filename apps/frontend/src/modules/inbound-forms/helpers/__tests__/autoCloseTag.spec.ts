import { describe, expect, it } from 'vitest'
import { closingTagFor } from '../autoCloseTag.ts'

describe('closingTagFor', () => {
    it('closes a freshly opened tag', () => {
        expect(closingTagFor('<p>')).toBe('</p>')
        expect(closingTagFor('  <td style="padding: 6px 0; color: #666">')).toBe('</td>')
    })

    it('ignores attribute values that contain a closing bracket', () => {
        expect(closingTagFor('<a title="a > b">')).toBe('</a>')
    })

    it('leaves void and self-closing elements alone', () => {
        expect(closingTagFor('<br>')).toBeNull()
        expect(closingTagFor('<img src="x.png">')).toBeNull()
        expect(closingTagFor('<span />')).toBeNull()
    })

    it('does nothing outside an opening tag', () => {
        expect(closingTagFor('</p>')).toBeNull()
        expect(closingTagFor('a > b')).toBeNull()
        expect(closingTagFor('{{#if consent}}>')).toBeNull()
    })
})
