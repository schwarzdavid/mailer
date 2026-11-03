import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { watch } from 'chokidar'

const packageDir = join(import.meta.dirname, '..')
const backendDir = join(packageDir, '..', '..', 'apps', 'backend')
const backendDist = join(backendDir, 'dist')
const specPath = join(backendDir, 'openapi.json')
const settleMs = 1000

let settleTimer: ReturnType<typeof setTimeout> | undefined
let running = false
let rerunRequested = false
let generatedSpec = await readOptional(specPath)

function log(message: string): void {
    console.log(`[api] ${message}`)
}

function runCommand(command: string, args: string[], cwd: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' })
        child.on('error', reject)
        child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}`))))
    })
}

async function readOptional(path: string): Promise<string | null> {
    return readFile(path, 'utf8').catch(() => null)
}

async function regenerate(): Promise<void> {
    if (!existsSync(join(backendDist, 'openapi.js'))) {
        log('Waiting for the backend build')
        return
    }
    await runCommand('pnpm', ['run', '--silent', 'generate'], backendDir)

    const spec = await readOptional(specPath)
    if (spec === generatedSpec) {
        log('OpenAPI spec unchanged')
        return
    }

    log('OpenAPI spec changed, regenerating the client')
    await runCommand('openapi-ts', [], packageDir)
    generatedSpec = spec
    log('Client regenerated')
}

async function run(): Promise<void> {
    if (running) {
        rerunRequested = true
        return
    }
    running = true
    await regenerate().catch((error: unknown) => {
        log(`Generation failed, waiting for the next backend build: ${String(error)}`)
    })
    running = false
    if (rerunRequested) {
        rerunRequested = false
        await run()
    }
}

function onBackendChange(): void {
    clearTimeout(settleTimer)
    settleTimer = setTimeout(() => void run(), settleMs)
}

await mkdir(backendDist, { recursive: true })
watch(backendDist, {
    ignoreInitial: true,
    ignored: (path, stats) => stats?.isFile() === true && !path.endsWith('.js'),
}).on('all', onBackendChange)
log(`Watching ${backendDist}`)
if (!existsSync(join(packageDir, 'dist', 'index.ts'))) {
    generatedSpec = null
}
if (generatedSpec === null) {
    await run()
}
