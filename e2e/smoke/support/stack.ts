import { randomBytes } from 'node:crypto'
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'
import { Compose } from './compose.js'
import type { RunResult } from './compose.js'
import { createCa, issueLeaf } from './pki.js'

export const PROJECT_NAME = 'mailer-smoke'
export const MAIL_HOSTNAME = 'mail.smoke.test'
export const HTTP_PORT = 18080
export const HTTPS_PORT = 18443
export const SMTP_PORT = 18025
export const BASE_URL = `http://localhost:${HTTP_PORT}`
export const IMAGE = 'ghcr.io/schwarzdavid/mailer'

export interface SmokeStack {
    dir: string
    composeFile: string
    overrideFile: string
    envFile: string
    launcherFile: string
    pkiDir: string
    caDir: string
    tlsDir: string
    renewDir: string
    tlsAwayDir: string
}

export const sourceComposeFile = fileURLToPath(new URL('../../../deploy/compose.yml', import.meta.url))
export const sourceLauncherFile = fileURLToPath(new URL('../../../deploy/mailer.sh', import.meta.url))

const smokeOverride = `services:
    mail:
        environment:
            SSL_CERT_PATH: /smoke-tls/${MAIL_HOSTNAME}.crt
            SSL_KEY_PATH: /smoke-tls/${MAIL_HOSTNAME}.key
        volumes:
            - ./tls:/smoke-tls:ro
    backend:
        environment:
            NODE_EXTRA_CA_CERTS: /smoke-ca/ca.crt
        volumes:
            - ./ca:/smoke-ca:ro
`

function secret(): string {
    return randomBytes(32).toString('base64')
}

function envFileContent(imageTag: string): string {
    return `SITE_ADDRESS=:80
HTTP_PORT=${HTTP_PORT}
HTTPS_PORT=${HTTPS_PORT}
SMTP_PUBLIC_PORT=${SMTP_PORT}
IMAGE_TAG=${imageTag}
DB_DATABASE=mailer
DB_USERNAME=mailer
DB_PASSWORD=${secret()}
BACKEND_JWT_SECRET=${secret()}
BACKEND_ENCRYPTION_SECRET=${secret()}
MAIL_HOSTNAME=${MAIL_HOSTNAME}
MAIL_SERVER_IPV4=203.0.113.10
MAIL_PASSWORD=${secret()}
SEND_REQUIRE_VALID_DNS=false
`
}

async function assertImageExists(imageTag: string): Promise<void> {
    const image = `${IMAGE}:${imageTag}`
    const { failed } = await execa('docker', ['image', 'inspect', image], { reject: false })
    if (failed) {
        throw new Error(`image ${image} not found; build it with: docker build -t ${image} .`)
    }
}

async function prepareStack(dir: string, imageTag: string): Promise<SmokeStack> {
    const stack: SmokeStack = {
        dir,
        composeFile: join(dir, 'compose.yml'),
        overrideFile: join(dir, 'compose.override.yml'),
        envFile: join(dir, '.env'),
        launcherFile: join(dir, 'mailer.sh'),
        pkiDir: join(dir, 'pki'),
        caDir: join(dir, 'ca'),
        tlsDir: join(dir, 'tls'),
        renewDir: join(dir, 'renew'),
        tlsAwayDir: join(dir, 'tls-away'),
    }
    await copyFile(sourceComposeFile, stack.composeFile)
    await copyFile(sourceLauncherFile, stack.launcherFile)
    await writeFile(stack.overrideFile, smokeOverride)
    await writeFile(stack.envFile, envFileContent(imageTag))
    for (const subDir of [stack.pkiDir, stack.caDir, stack.tlsDir, stack.renewDir, stack.tlsAwayDir]) {
        await mkdir(subDir)
    }
    await createCa(stack.pkiDir, stack.caDir)
    await issueLeaf(stack.pkiDir, stack.caDir, stack.tlsDir, MAIL_HOSTNAME)
    await new Compose(stack).run(['down', '-v', '--remove-orphans'], { reject: false })
    return stack
}

export async function createStack(imageTag: string): Promise<SmokeStack> {
    await assertImageExists(imageTag)
    const dir = await mkdtemp(join(tmpdir(), 'mailer-smoke-'))
    try {
        return await prepareStack(dir, imageTag)
    } catch (error) {
        await rm(dir, { recursive: true, force: true })
        throw error
    }
}

const launcherEnvKeysToDrop = [
    'DB_PASSWORD',
    'BACKEND_JWT_SECRET',
    'BACKEND_ENCRYPTION_SECRET',
    'MAIL_PASSWORD',
    'COMPOSE_FILE',
    'COMPOSE_PATH_SEPARATOR',
]

function launcherEnv(): Record<string, string | undefined> {
    const env: Record<string, string | undefined> = { ...process.env }
    for (const key of launcherEnvKeysToDrop) {
        delete env[key]
    }
    return { ...env, COMPOSE_PROJECT_NAME: PROJECT_NAME, MSYS_NO_PATHCONV: '1' }
}

export async function runLauncher(
    stack: SmokeStack,
    args: string[],
    options: { reject?: boolean } = {},
): Promise<RunResult> {
    const result = await execa('sh', ['mailer.sh', ...args], {
        cwd: stack.dir,
        stdin: 'ignore',
        env: launcherEnv(),
        extendEnv: false,
        reject: options.reject ?? true,
    })
    return {
        stdout: result.stdout.replaceAll('\r', ''),
        stderr: result.stderr.replaceAll('\r', ''),
        exitCode: result.exitCode,
    }
}

export async function destroyStack(stack: SmokeStack): Promise<void> {
    await new Compose(stack).run(['down', '-v', '--remove-orphans'], { reject: false })
    await execa('docker', ['image', 'rm', `${IMAGE}:smoke-next`], { reject: false })
    await rm(stack.dir, { recursive: true, force: true })
}
