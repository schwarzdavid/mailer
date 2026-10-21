import 'reflect-metadata'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { applySpecPlaceholderEnv } from './openapi/spec-env.js'

async function main(): Promise<void> {
    const outputPath = process.argv[2]
    if (!outputPath) {
        console.error('Usage: node dist/openapi.js <output-path>')
        process.exitCode = 1
        return
    }

    applySpecPlaceholderEnv(process.env)
    const { createPreviewOpenApiDocument } = await import('./openapi/preview-document.js')
    const document = await createPreviewOpenApiDocument()

    await mkdir(dirname(outputPath), { recursive: true })
    await writeFile(outputPath, JSON.stringify(document))
}

void main()
