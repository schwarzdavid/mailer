import { mkdir, mkdtemp, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { EnvFile } from './env-file.ts'

describe('EnvFile', () => {
    it('reads the last occurrence and strips one pair of quotes and a trailing CR', () => {
        const env = EnvFile.parse('A=1\r\nB="two words"\r\nC=\'x\'\r\nA=2\r\n')
        expect(env.get('A')).toBe('2')
        expect(env.get('B')).toBe('two words')
        expect(env.get('C')).toBe('x')
        expect(env.get('MISSING')).toBeUndefined()
    })

    it('reads an unquoted value up to an inline comment, as Compose does, and writes lines unchanged', () => {
        const content = 'A=1.0.0 # pinned\nB="x # y"\nC=a#b\nD=v\t# tab\nE=two  # spaces\n'
        const env = EnvFile.parse(content)
        expect(env.get('A')).toBe('1.0.0')
        expect(env.get('B')).toBe('x # y')
        expect(env.get('C')).toBe('a#b')
        expect(env.get('D')).toBe('v')
        expect(env.get('E')).toBe('two')
        expect(env.toString()).toBe(content)
    })

    it('write() removes its temporary file when the rename fails', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'mailer-cli-'))
        const path = join(dir, '.env')
        await mkdir(path)
        await writeFile(join(path, 'blocker'), 'x')
        await expect(EnvFile.parse('A=1\n').write(path)).rejects.toThrow()
        expect(await readdir(dir)).toEqual(['.env'])
    })

    it('has() is false for an empty value', () => {
        const env = EnvFile.parse('A=\nB=x\n')
        expect(env.has('A')).toBe(false)
        expect(env.has('B')).toBe(true)
    })

    it('set() replaces in place, appends new keys and keeps foreign lines and comments', () => {
        const env = EnvFile.parse('# note\nA=1\n\nCUSTOM=keep\n')
        env.set('A', '9')
        env.set('NEW', 'v')
        expect(env.toString()).toBe('# note\nA=9\n\nCUSTOM=keep\nNEW=v\n')
    })

    it('normalises CRLF to LF on output', () => {
        expect(EnvFile.parse('A=1\r\nB=2\r\n').toString()).toBe('A=1\nB=2\n')
    })

    it('read() of a missing file is empty, write() is atomic and private', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'mailer-cli-'))
        const path = join(dir, '.env')
        const env = await EnvFile.read(path)
        env.set('A', '1')
        await env.write(path)
        expect(await readFile(path, 'utf8')).toBe('A=1\n')
        expect(await readdir(dir)).toEqual(['.env'])
    })

    it.skipIf(process.platform === 'win32')('write() creates the file with mode 0600', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'mailer-cli-'))
        const path = join(dir, '.env')
        await EnvFile.parse('A=1\n').write(path)
        expect((await stat(path)).mode & 0o777).toBe(0o600)
    })
})
