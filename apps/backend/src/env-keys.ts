import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { listEnvKeys } from './config/env-keys.js'

async function main(): Promise<void> {
    const outputPath = process.argv[2]
    if (!outputPath) {
        console.error('Usage: node dist/env-keys.js <output-path>')
        process.exitCode = 1
        return
    }

    await mkdir(dirname(outputPath), { recursive: true })
    await writeFile(outputPath, JSON.stringify(listEnvKeys(), null, 4) + '\n')
}

void main()
