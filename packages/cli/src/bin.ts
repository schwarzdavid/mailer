import { resolve4, resolve6 } from 'node:dns/promises'
import { createClackPrompter } from './prompter.ts'
import { run } from './main.ts'

process.exitCode = await run(process.argv.slice(2), process.env, {
    prompter: createClackPrompter(),
    resolver: { resolve4, resolve6 },
    out: (line) => process.stdout.write(`${line}\n`),
    err: (line) => process.stderr.write(`${line}\n`),
})
