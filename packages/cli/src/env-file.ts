import { randomBytes } from 'node:crypto'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

const ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/

function unquote(raw: string): string {
    const first = raw[0]
    if (raw.length >= 2 && (first === '"' || first === "'") && raw.endsWith(first)) {
        return raw.slice(1, -1)
    }
    return raw
}

export class EnvFile {
    private lines: string[]

    private constructor(lines: string[]) {
        this.lines = lines
    }

    static parse(content: string): EnvFile {
        const lines = content.split('\n').map((line) => line.replace(/\r$/, ''))
        if (lines[lines.length - 1] === '') {
            lines.pop()
        }
        return new EnvFile(lines)
    }

    static async read(path: string): Promise<EnvFile> {
        try {
            return EnvFile.parse(await readFile(path, 'utf8'))
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return new EnvFile([])
            }
            throw error
        }
    }

    get(key: string): string | undefined {
        let value: string | undefined
        for (const line of this.lines) {
            const match = ASSIGNMENT.exec(line)
            if (match?.[1] === key) {
                value = unquote(match[2] ?? '')
            }
        }
        return value
    }

    has(key: string): boolean {
        const value = this.get(key)
        return value !== undefined && value !== ''
    }

    set(key: string, value: string): void {
        const assignment = `${key}=${value}`
        let index = -1
        this.lines.forEach((line, position) => {
            if (ASSIGNMENT.exec(line)?.[1] === key) {
                index = position
            }
        })
        if (index === -1) {
            this.lines.push(assignment)
        } else {
            this.lines[index] = assignment
        }
    }

    toString(): string {
        return this.lines.length === 0 ? '' : `${this.lines.join('\n')}\n`
    }

    async write(path: string): Promise<void> {
        const temporary = join(dirname(path), `.${basename(path)}.${randomBytes(6).toString('hex')}.tmp`)
        await writeFile(temporary, this.toString(), { mode: 0o600 })
        await rename(temporary, path)
    }
}
