import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { startInfrastructure, type Infrastructure } from './infrastructure.ts'
import { freePort, runCommand, startServer, type ServerProcess } from './processes.ts'

const frontendDir = resolve(import.meta.dirname, '..', '..')
const repoRoot = resolve(frontendDir, '..', '..')
const backendDir = join(repoRoot, 'apps', 'backend')
const workDir = join(frontendDir, 'node_modules', '.tmp', 'e2e')
const backendWorkDir = join(backendDir, 'node_modules', '.tmp', 'e2e')
const frontendDistDir = join(workDir, 'dist')
const generatedSpecPath = join(workDir, 'openapi.json')

const log = (message: string) => console.log(`[e2e] ${message}`)

async function buildBackend(): Promise<void> {
    await mkdir(backendWorkDir, { recursive: true })
    await copyFile(join(backendDir, 'package.json'), join(backendWorkDir, 'package.json'))
    await writeFile(
        join(backendWorkDir, 'tsconfig.json'),
        JSON.stringify({
            extends: '../../../tsconfig.build.json',
            compilerOptions: { outDir: './dist', incremental: false, declaration: false },
            include: ['../../../src'],
        }),
    )
    await runCommand('pnpm exec nest build -p node_modules/.tmp/e2e/tsconfig.json', {
        cwd: backendDir,
        logFile: join(workDir, 'backend-build.log'),
    })
}

export default async function globalSetup(): Promise<() => Promise<void>> {
    await mkdir(workDir, { recursive: true })
    const startedAt = Date.now()
    const cleanups: (() => Promise<void>)[] = []

    const teardown = async () => {
        for (const cleanup of cleanups.reverse()) {
            await cleanup().catch((error: unknown) => console.error('[e2e] teardown step failed', error))
        }
    }

    try {
        log('Starting containers and building the backend')
        const [infrastructure] = await Promise.all([
            startInfrastructure().then((infra: Infrastructure) => {
                cleanups.push(infra.stop)
                return infra
            }),
            buildBackend(),
        ])

        log('Applying migrations')
        await runCommand(`node "${join(backendWorkDir, 'dist', 'migrate.js')}" up`, {
            cwd: backendDir,
            env: { ...infrastructure.backendEnv },
            logFile: join(workDir, 'migrate.log'),
        })

        log('Generating the OpenAPI spec')
        await runCommand(`node "${join(backendWorkDir, 'dist', 'openapi.js')}" "${generatedSpecPath}"`, {
            cwd: backendDir,
            logFile: join(workDir, 'openapi.log'),
        })

        const backendPort = await freePort()
        const apiUrl = `http://127.0.0.1:${backendPort}`
        log(`Starting the backend on ${apiUrl}`)
        const backend: ServerProcess = await startServer(
            [join(backendWorkDir, 'dist', 'main.js')],
            `${apiUrl}/api/setup/status`,
            {
                cwd: backendDir,
                env: {
                    ...infrastructure.backendEnv,
                    NODE_ENV: 'test',
                    PORT: String(backendPort),
                },
                logFile: join(workDir, 'backend.log'),
            },
        )
        cleanups.push(backend.stop)

        log('Generating the api client')
        await runCommand(`pnpm --filter api exec openapi-ts -i "${generatedSpecPath}"`, {
            cwd: repoRoot,
            logFile: join(workDir, 'api-build.log'),
        })

        log('Building the frontend')
        await runCommand(`pnpm exec vite build --outDir "${frontendDistDir}" --emptyOutDir --logLevel warn`, {
            cwd: frontendDir,
            logFile: join(workDir, 'frontend-build.log'),
        })

        const frontendPort = await freePort()
        const baseUrl = `http://127.0.0.1:${frontendPort}`
        log(`Serving the frontend on ${baseUrl}`)
        const frontend = await startServer(
            [
                join(frontendDir, 'node_modules', 'vite', 'bin', 'vite.js'),
                'preview',
                '--outDir',
                frontendDistDir,
                '--host',
                '127.0.0.1',
                '--port',
                String(frontendPort),
                '--strictPort',
            ],
            baseUrl,
            {
                cwd: frontendDir,
                env: { API_PROXY_TARGET: apiUrl },
                logFile: join(workDir, 'frontend.log'),
            },
        )
        cleanups.push(frontend.stop)

        process.env.E2E_BASE_URL = baseUrl
        process.env.E2E_API_URL = apiUrl
        process.env.E2E_MAILHOG_URL = infrastructure.mailhogUrl
        log(`Stack ready in ${Math.round((Date.now() - startedAt) / 1000)}s (logs in ${workDir})`)
    } catch (error) {
        await teardown()
        throw error
    }

    return teardown
}
