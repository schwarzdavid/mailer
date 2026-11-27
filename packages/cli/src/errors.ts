export const EXIT = { ok: 0, failure: 1, usage: 2, manual: 3, review: 4 } as const

export class CliError extends Error {
    exitCode: 1 | 2 | 3

    constructor(message: string, exitCode: 1 | 2 | 3 = 1) {
        super(message)
        this.name = 'CliError'
        this.exitCode = exitCode
    }
}
