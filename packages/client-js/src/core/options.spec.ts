import { describe, expect, it } from 'vitest'
import { resolveApiBase } from './options.ts'

describe('resolveApiBase', () => {
    it('appends the api path', () => {
        expect(resolveApiBase('https://app.example.com')).toBe('https://app.example.com/api/v1')
    })

    it('strips trailing slashes', () => {
        expect(resolveApiBase('https://app.example.com///')).toBe('https://app.example.com/api/v1')
    })

    it('keeps a path prefix', () => {
        expect(resolveApiBase('https://host.example/mailer/')).toBe('https://host.example/mailer/api/v1')
    })

    it.each([
        '',
        'app.example.com',
        '/relative',
        'ftp://x',
        'https://x.example?y=1',
        'https://x.example#frag',
        'https://x.example?',
    ])('rejects %j', (value) => {
        expect(() => resolveApiBase(value)).toThrow(TypeError)
        expect(() => resolveApiBase(value)).toThrow('baseUrl must be an absolute http(s) URL')
    })
})
