import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { startInfrastructure, type BackendEnv, type Infrastructure } from './infrastructure.ts'
import { freePort, runCommand, startServer, waitForLogLine, type ServerProcess } from './processes.ts'

export interface StackOptions {
    mailHostname: string
    serverIpv4: string
    serverIpv6?: string
    imapUser?: string
    imapPassword?: string
    log?: (message: string) => void
}

export interface RunningStack {
    baseUrl: string
    apiUrl: string
    setupToken: string
    mailhogUrl: string
    greenmailSmtpPort: number
    backendEnv: BackendEnv
    stop: () => Promise<void>
}

const repoRoot = resolve(import.meta.dirname, '..', '..', '..')
const backendDir = join(repoRoot, 'apps', 'backend')
const frontendDir = join(repoRoot, 'apps', 'frontend')
const workDir = join(frontendDir, 'node_modules', '.tmp', 'e2e')
const backendWorkDir = join(backendDir, 'node_modules', '.tmp', 'e2e')
const frontendDistDir = join(workDir, 'dist')
const generatedSpecPath = join(workDir, 'openapi.json')

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

export async function startStack(options: StackOptions): Promise<RunningStack> {
    const log = options.log ?? (() => undefined)
    await mkdir(workDir, { recursive: true })
    const startedAt = Date.now()
    const cleanups: (() => Promise<void>)[] = []

    const stop = async () => {
        for (const cleanup of cleanups.reverse()) {
            await cleanup().catch((error: unknown) => console.error('[e2e] teardown step failed', error))
        }
    }

    try {
        log('Starting containers and building the backend')
        const [infrastructure] = await Promise.all([
            startInfrastructure({
                mailHostname: options.mailHostname,
                serverIpv4: options.serverIpv4,
                serverIpv6: options.serverIpv6 ?? '',
                imapUser: options.imapUser ?? 'bounce@example.com',
                imapPassword: options.imapPassword ?? 'bounce',
            }).then((infra: Infrastructure) => {
                cleanups.push(infra.stop)
                return infra
            }),
            buildBackend(),
        ])

        log('Generating the OpenAPI spec')
        await runCommand(`node "${join(backendWorkDir, 'dist', 'openapi.js')}" "${generatedSpecPath}"`, {
            cwd: backendDir,
            logFile: join(workDir, 'openapi.log'),
        })

        const backendPort = await freePort()
        const apiUrl = `http://127.0.0.1:${backendPort}`
        log(`Starting the backend on ${apiUrl}`)
        const backendLogFile = join(workDir, 'backend.log')
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
                logFile: backendLogFile,
            },
        )
        cleanups.push(backend.stop)
        const setupToken = (await waitForLogLine(backendLogFile, /Setup token: ([A-Za-z0-9_-]{32})/))[1]
        if (setupToken === undefined) {
            throw new Error('Setup token missing from the backend log')
        }

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

        log(`Stack ready in ${Math.round((Date.now() - startedAt) / 1000)}s (logs in ${workDir})`)
        return {
            baseUrl,
            apiUrl,
            setupToken,
            mailhogUrl: infrastructure.mailhogUrl,
            greenmailSmtpPort: infrastructure.greenmailSmtpPort,
            backendEnv: infrastructure.backendEnv,
            stop,
        }
    } catch (error) {
        await stop()
        throw error
    }
}
