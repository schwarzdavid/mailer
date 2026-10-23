import { randomBytes } from 'node:crypto'
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'
import { Compose } from './compose.js'
import { createCa, issueLeaf } from './pki.js'

export const PROJECT_NAME = 'mailer-smoke'
export const MAIL_HOSTNAME = 'mail.smoke.test'
export const HTTP_PORT = 18080
export const HTTPS_PORT = 18443
export const SMTP_PORT = 18025
export const BASE_URL = `http://localhost:${HTTP_PORT}`
export const IMAGE = 'ghcr.io/schwarzdavid/mailer-backend'

export interface SmokeStack {
    dir: string
    composeFile: string
    overrideFile: string
    envFile: string
    mailPassword: string
    pkiDir: string
    caDir: string
    tlsDir: string
    renewDir: string
    tlsAwayDir: string
}

const sourceComposeFile = fileURLToPath(new URL('../../../deploy/compose.yml', import.meta.url))

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

function envFileContent(imageTag: string, mailPassword: string): string {
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
MAIL_PASSWORD=${mailPassword}
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
    const mailPassword = secret()
    const stack: SmokeStack = {
        dir,
        composeFile: join(dir, 'compose.yml'),
        overrideFile: join(dir, 'compose.smoke.yml'),
        envFile: join(dir, '.env'),
        mailPassword,
        pkiDir: join(dir, 'pki'),
        caDir: join(dir, 'ca'),
        tlsDir: join(dir, 'tls'),
        renewDir: join(dir, 'renew'),
        tlsAwayDir: join(dir, 'tls-away'),
    }
    await copyFile(sourceComposeFile, stack.composeFile)
    await writeFile(stack.overrideFile, smokeOverride)
    await writeFile(stack.envFile, envFileContent(imageTag, mailPassword))
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

export async function destroyStack(stack: SmokeStack): Promise<void> {
    await new Compose(stack).run(['down', '-v', '--remove-orphans'], { reject: false })
    await rm(stack.dir, { recursive: true, force: true })
}
