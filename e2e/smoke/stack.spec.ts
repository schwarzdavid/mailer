import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'
import { Compose } from './support/compose.js'
import { issueLeaf, serialOf, servedImapSerial, servedSmtpSerial } from './support/pki.js'
import { request, statusOf } from './support/http.js'
import { requestLogEntry, setupTokenFrom } from './support/logs.js'
import { deliverDsn, relayFromOutside, smtpGreeting } from './support/smtp.js'
import {
    BASE_URL,
    IMAGE,
    MAIL_HOSTNAME,
    SMTP_PORT,
    createStack,
    destroyStack,
    runLauncher,
    sourceComposeFile,
    sourceLauncherFile,
} from './support/stack.js'
import type { SmokeStack } from './support/stack.js'

const imageTag = process.env.IMAGE_TAG ?? 'local'
let stack: SmokeStack | undefined
let compose: Compose
let indexHtml = ''
let asset = ''

function current(): SmokeStack {
    if (stack === undefined) {
        throw new Error('the smoke stack was not created')
    }
    return stack
}

function withEnvValue(env: string, key: string, value: string): string {
    return env.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${value}`)
}

function envValue(env: string, key: string): string | undefined {
    return new RegExp(`^${key}=(.*)$`, 'm').exec(env)?.[1]
}

beforeAll(async () => {
    stack = await createStack(imageTag)
    compose = new Compose(stack)
})

afterAll(async () => {
    if (stack !== undefined) {
        await destroyStack(stack)
    }
})

describe('compose configuration', () => {
    it('the proxy config hash follows SITE_ADDRESS, MAIL_HOSTNAME and the Caddyfile, the mail config hash follows MAIL_HOSTNAME and postfix-main.cf', async () => {
        const { dir, composeFile, envFile } = current()
        const original = await readFile(composeFile, 'utf8')
        const edited = original
            .replace('respond 404', 'respond 410')
            .replace('localhost.$$mydomain, localhost', 'localhost')
        expect(edited).not.toBe(original)
        const env = await readFile(envFile, 'utf8')
        const editedFile = join(dir, 'compose.edited.yml')
        const siteEnv = join(dir, 'hash-site.env')
        const mailEnv = join(dir, 'hash-mail.env')
        await writeFile(editedFile, edited)
        await writeFile(siteEnv, withEnvValue(env, 'SITE_ADDRESS', 'hash-check.smoke.test'))
        await writeFile(mailEnv, withEnvValue(env, 'MAIL_HOSTNAME', 'hash-check-mail.smoke.test'))
        const proxyHash = await compose.configHash('proxy', envFile)
        expect(proxyHash).not.toBe('')
        expect(await compose.configHash('proxy', siteEnv)).not.toBe(proxyHash)
        expect(await compose.configHash('proxy', mailEnv)).not.toBe(proxyHash)
        const mailHash = await compose.configHash('mail', envFile)
        expect(mailHash).not.toBe('')
        expect(await compose.configHash('mail', mailEnv)).not.toBe(mailHash)
        expect(await compose.configHash('proxy', envFile, editedFile)).not.toBe(proxyHash)
        expect(await compose.configHash('mail', envFile, editedFile)).not.toBe(mailHash)
    })

    it('the backend takes DB_PASSWORD, BACKEND_JWT_SECRET and BACKEND_ENCRYPTION_SECRET from the process environment', async () => {
        const { dir, envFile } = current()
        const secrets = {
            DB_PASSWORD: 'process-db-password',
            BACKEND_JWT_SECRET: 'process-jwt-secret-process-jwt-secret',
            BACKEND_ENCRYPTION_SECRET: 'process-encryption-secret-process-secret',
        }
        const withoutSecrets = (await readFile(envFile, 'utf8'))
            .split('\n')
            .filter((line) => !Object.keys(secrets).some((key) => line.startsWith(`${key}=`)))
            .join('\n')
        const strippedEnv = join(dir, 'process-secrets.env')
        await writeFile(strippedEnv, withoutSecrets)
        const config = await compose.config(strippedEnv, secrets)
        expect(config.services.backend?.environment).toMatchObject(secrets)
    })
})

describe('boot without the mail server', () => {
    let services: string[] = []

    it('stack without mail is up and healthy', async () => {
        services = (await compose.services()).filter((service) => service !== 'mail')
        await expect(compose.run(['up', '-d', '--pull', 'missing', '--wait', ...services])).resolves.toBeDefined()
    })

    it('readiness reports the missing mail server while liveness stays up', async () => {
        expect((await request(`${BASE_URL}/api/health`)).status).toBe(200)
        const readiness = await request(`${BASE_URL}/api/health/ready`)
        expect(readiness.status).toBe(503)
        const report = JSON.parse(readiness.body) as { details: { smtp: { status: string } } }
        expect(report.details.smtp.status).toBe('down')
    })

    it('the backend logs a setup token on first start and refuses a wrong one', async () => {
        const token = setupTokenFrom(await compose.logs('backend'))
        expect(token).toBeDefined()
        const wrong = '0'.repeat(32)
        expect(wrong).not.toBe(token)
        const response = await request(`${BASE_URL}/api/setup/user`, 'POST', {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                firstName: 'Smoke',
                lastName: 'Test',
                email: 'smoke@example.com',
                password: 'smoke-password-123',
                setupToken: wrong,
            }),
        })
        expect(response.status).toBe(403)
    })

    it('the proxy is the stock caddy image and there is no web service', async () => {
        expect(services).toContain('proxy')
        expect(services).not.toContain('web')
        const id = await compose.containerId('proxy')
        expect(id).not.toBe('')
        expect(await compose.inspect(id, '{{.Config.Image}}')).toMatch(/^caddy:2\.\d+\.\d+-alpine$/)
    })
})

describe('mail server', () => {
    it('mailer.sh setup adopts the directory, starts mail and creates the bounce account and the postmaster alias', async () => {
        const { stdout } = await runLauncher(current(), ['setup', '--yes'])
        expect(stdout).not.toContain('Generated')
        expect(stdout).toContain(`Created the mailbox bounce@${MAIL_HOSTNAME}.`)
        expect(stdout).toContain(`Created the alias postmaster@${MAIL_HOSTNAME} -> bounce@${MAIL_HOSTNAME}.`)
        const env = await readFile(current().envFile, 'utf8')
        expect(envValue(env, 'MAILER_FORMAT_VERSION')).toBe('1')
        expect(envValue(env, 'IMAGE_TAG')).toBe(imageTag)
        expect(await readFile(current().composeFile, 'utf8')).toBe(await readFile(sourceComposeFile, 'utf8'))
        expect(await readFile(current().launcherFile, 'utf8')).toBe(await readFile(sourceLauncherFile, 'utf8'))
        expect(existsSync(join(current().dir, 'compose.yml.legacy'))).toBe(false)
        expect(await compose.waitHealthy('mail', 120_000)).toBe(true)
    })

    it('readiness is 200 once the mail server accepts connections', async () => {
        await expect
            .poll(async () => (await request(`${BASE_URL}/api/health/ready`)).status, {
                interval: 1_000,
                timeout: 30_000,
            })
            .toBe(200)
    })

    it('mail announces MAIL_HOSTNAME in its SMTP greeting', async () => {
        expect(await smtpGreeting(SMTP_PORT)).toMatch(new RegExp(`^220[ -]${MAIL_HOSTNAME.replaceAll('.', '\\.')} `))
    })

    it('Docker DNS does not answer for MAIL_HOSTNAME, so the backend resolves it publicly', async () => {
        const mailIps = (
            await compose.inspect(
                await compose.containerId('mail'),
                '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}',
            )
        )
            .split(' ')
            .filter((ip) => ip !== '')
        expect(mailIps.length).toBeGreaterThan(0)
        const { stdout } = await compose.run([
            'exec',
            '-T',
            'backend',
            'node',
            '-e',
            "require('node:dns').promises.resolve4(process.argv[1]).then((ips) => console.log(ips.join(' ')), (error) => console.log(error.code))",
            MAIL_HOSTNAME,
        ])
        const answer = stdout.trim().split(' ')
        expect(answer.length).toBeGreaterThan(0)
        for (const ip of mailIps) {
            expect(answer).not.toContain(ip)
        }
    })

    it('mailer.sh setup run again with an emptied MAIL_PASSWORD generates a new one and rotates it for mail and backend', async () => {
        const { envFile } = current()
        const before = await readFile(envFile, 'utf8')
        await writeFile(envFile, withEnvValue(before, 'MAIL_PASSWORD', ''))
        const { stdout } = await runLauncher(current(), ['setup', '--yes'])
        expect(stdout).toContain('Generated MAIL_PASSWORD in .env.')
        expect(stdout).toContain('Store this recovery kit in a password manager.')
        expect(stdout).toContain(`Updated the password of bounce@${MAIL_HOSTNAME}.`)
        expect(stdout).not.toContain('Created the alias')
        const after = await readFile(envFile, 'utf8')
        expect(envValue(after, 'MAIL_PASSWORD')).toMatch(/^[A-Za-z0-9+/]{64}$/)
        for (const key of ['DB_PASSWORD', 'BACKEND_JWT_SECRET', 'BACKEND_ENCRYPTION_SECRET']) {
            expect(envValue(after, key)).toBe(envValue(before, key))
        }
        await expect
            .poll(async () => (await request(`${BASE_URL}/api/health/ready`)).status, {
                interval: 1_000,
                timeout: 90_000,
            })
            .toBe(200)
    })

    it('mailer.sh token prints the setup token the backend logged', async () => {
        const { stdout } = await runLauncher(current(), ['token'])
        expect(stdout.trim()).toMatch(/^[0-9a-f]{32}$/)
        expect(stdout.trim()).toBe(setupTokenFrom(await compose.logs('backend')))
    })

    it('mailer.sh status lists the backend', async () => {
        const { stdout } = await runLauncher(current(), ['status'])
        expect(stdout).toContain('backend')
    })
})

describe('routing and headers', () => {
    beforeAll(async () => {
        await vi.waitFor(
            async () => {
                if ((await statusOf(`${BASE_URL}/`)) === undefined) {
                    throw new Error(`nothing answers on ${BASE_URL}/`)
                }
            },
            { interval: 1_000, timeout: 30_000 },
        )
    })

    it('GET / serves the SPA', async () => {
        const response = await request(`${BASE_URL}/`)
        expect(response.status).toBe(200)
        expect(response.body).toContain('<div id="app">')
        indexHtml = response.body
    })

    it('GET /projects/5 falls back to index.html', async () => {
        const response = await request(`${BASE_URL}/projects/5`)
        expect(response.status).toBe(200)
        expect(response.body).toContain('<div id="app">')
    })

    it('cache headers: no-cache for the shell, immutable for assets', async () => {
        const shell = await request(`${BASE_URL}/`)
        expect(shell.headers['cache-control']).toMatch(/no-cache/i)
        const found = /\/assets\/[^"]+\.js/.exec(indexHtml)?.[0]
        expect(found).toBeDefined()
        asset = found ?? ''
        const response = await request(`${BASE_URL}${asset}`)
        expect(response.status).toBe(200)
        expect(response.headers['cache-control']).toMatch(/immutable/i)
    })

    it('the proxy compresses assets', async () => {
        const response = await request(`${BASE_URL}${asset}`, 'GET', { headers: { 'Accept-Encoding': 'gzip' } })
        expect(response.status).toBe(200)
        expect(response.headers['content-encoding']).toMatch(/^gzip/i)
    })

    it('missing asset returns 404 without immutable caching', async () => {
        const response = await request(`${BASE_URL}/assets/does-not-exist.js`)
        expect(response.status).toBe(404)
        expect(response.headers['cache-control'] ?? '').not.toMatch(/immutable/i)
    })

    it('GET /api/setup/status returns JSON', async () => {
        const response = await request(`${BASE_URL}/api/setup/status`)
        expect(response.status).toBe(200)
        expect(response.headers['content-type']).toMatch(/application\/json/i)
    })

    it('the backend writes json request logs with request ids', async () => {
        const response = await request(`${BASE_URL}/api/setup/status`)
        const requestId = response.headers['x-request-id'] ?? ''
        expect(requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
        await expect
            .poll(async () => requestLogEntry(await compose.logs('backend'), requestId, '/api/setup/status'), {
                interval: 1_000,
                timeout: 10_000,
            })
            .toBeDefined()
    })

    it('an unknown /api path returns a JSON 404, not the SPA', async () => {
        const response = await request(`${BASE_URL}/api/does-not-exist`)
        expect(response.status).toBe(404)
        expect(response.headers['content-type']).toMatch(/application\/json/i)
        expect(response.body).not.toContain('<div id="app">')
    })

    it('GET /docs falls back to the SPA and does not expose swagger-ui', async () => {
        const response = await request(`${BASE_URL}/docs`)
        expect(response.status).toBe(200)
        expect(response.body).not.toContain('swagger-ui')
        expect(response.body).toContain('<div id="app">')
    })
})

describe('throttling and logs', () => {
    it('forged X-Forwarded-For does not evade the login throttle', async () => {
        for (let i = 1; i <= 11; i++) {
            const response = await request(`${BASE_URL}/api/auth/login`, 'POST', {
                headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `203.0.113.${i}` },
                body: JSON.stringify({ email: 'smoke@example.com', password: 'wrong-password' }),
            })
            expect(response.status, `login attempt ${i}`).toBe(i <= 10 ? 401 : 429)
        }
    })

    it('query-string API keys never reach the container logs', async () => {
        const suffix = randomBytes(64)
            .toString('base64')
            .replace(/[^a-zA-Z0-9]/g, '')
            .slice(0, 24)
        expect(suffix).toHaveLength(24)
        const marker = `sdm_smokelog_${suffix}`
        const send = await request(`${BASE_URL}/api/v1/send?key=${marker}`, 'POST', {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                from: 'smoke@example.org',
                to: 'reader@example.org',
                subject: 'log check',
                text: 'log check',
            }),
        })
        expect(send.status).toBe(401)
        expect((await request(`${BASE_URL}/api/setup/status?key=${marker}`)).status).toBe(200)
        expect(await compose.logs()).not.toContain(marker)
    })
})

describe('mail submission, relay and bounces', () => {
    const containerScript = (name: string) => fileURLToPath(new URL('./container/' + name, import.meta.url))

    it('authenticated submission on mail:587 verifies the certificate against the mail hostname and spoof protection rejects a foreign envelope', async () => {
        const out = await compose.execNode(containerScript('submission-check.ts'), { SMOKE_DOMAIN: MAIL_HOSTNAME })
        expect(out).toMatch(/^foreign envelope rejected: command=RCPT TO responseCode=5/m)
        expect(out).toMatch(/^verify ok against mail\.smoke\.test on mail:587/m)
    })

    it('port 25 from outside rejects relaying', async () => {
        expect(await relayFromOutside(SMTP_PORT)).toMatch(/Relay access denied/)
    })

    it('mail:25 from the backend network rejects unauthenticated relaying', async () => {
        const out = await compose.execNode(containerScript('relay-check.ts'), { SMOKE_DOMAIN: MAIL_HOSTNAME })
        expect(out).toMatch(/^unauthenticated relay rejected: .*Relay access denied/m)
    })

    it('the DSN delivered on port 25 is ingested over IMAP into the bounce table', async () => {
        const raw = await readFile(fileURLToPath(new URL('./fixtures/dsn-permanent.eml', import.meta.url)), 'utf8')
        await deliverDsn(SMTP_PORT, 'bounce@' + MAIL_HOSTNAME, raw)
        await expect
            .poll(async () => Number(await compose.psql('select count(*) from bounce')), {
                interval: 5_000,
                timeout: 150_000,
            })
            .toBeGreaterThanOrEqual(1)
    })

    it('mail publishes only port 25; 587 and 143 stay internal', async () => {
        expect(await compose.publishedPort('mail', 587)).toBe('')
        expect(await compose.publishedPort('mail', 143)).toBe('')
        expect(await compose.publishedPort('mail', 25)).toMatch(/:18025$/)
    })
})

async function moveAll(from: string, to: string): Promise<void> {
    for (const name of await readdir(from)) {
        await rename(join(from, name), join(to, name))
    }
}

describe('mail certificate lifecycle', () => {
    let initialSerial = ''

    it('mail stays unhealthy for 60 s without a certificate', async () => {
        const { tlsDir, tlsAwayDir } = current()
        initialSerial = await serialOf(join(tlsDir, MAIL_HOSTNAME + '.crt'))
        await compose.run(['stop', 'mail'], { reject: false })
        await compose.run(['rm', '-f', 'mail'], { reject: false })
        await moveAll(tlsDir, tlsAwayDir)
        await compose.run(['up', '-d', 'mail'])
        expect(await compose.waitHealthy('mail', 60_000)).toBe(false)
    })

    it('mail recovers on its own once the certificate appears', async () => {
        const { tlsDir, tlsAwayDir } = current()
        await moveAll(tlsAwayDir, tlsDir)
        expect(await compose.waitHealthy('mail', 180_000)).toBe(true)
    })

    it('renewed certificate is served on 25 and 143 without a restart', async () => {
        const { pkiDir, caDir, tlsDir, renewDir } = current()
        expect(await servedSmtpSerial(SMTP_PORT, MAIL_HOSTNAME)).toBe(initialSerial)
        expect(await servedImapSerial(compose)).toBe(initialSerial)
        await issueLeaf(pkiDir, caDir, renewDir, MAIL_HOSTNAME)
        const renewedSerial = await serialOf(join(renewDir, MAIL_HOSTNAME + '.crt'))
        expect(renewedSerial).not.toBe(initialSerial)
        const format = '{{.State.StartedAt}} {{.RestartCount}}'
        const started = await compose.inspect(await compose.containerId('mail'), format)
        await moveAll(renewDir, tlsDir)
        await expect
            .poll(async () => [await servedSmtpSerial(SMTP_PORT, MAIL_HOSTNAME), await servedImapSerial(compose)], {
                interval: 3_000,
                timeout: 90_000,
            })
            .toEqual([renewedSerial, renewedSerial])
        expect(await compose.inspect(await compose.containerId('mail'), format)).toBe(started)
    })
})

describe('migrations', () => {
    const failingMigration = '017-harden-inbound-forms'

    it('the backend applied every migration when it started', async () => {
        const out = (await compose.run(['exec', '-T', 'backend', 'node', 'dist/migrate.js', 'pending', '--json']))
            .stdout
        const lastLine = out
            .split('\n')
            .filter((line) => line.trim() !== '')
            .at(-1)
        expect(lastLine?.trim()).toBe('[]')
    })

    it('a failed upstream request is logged with the key query parameter redacted', async () => {
        await compose.psql(`DELETE FROM "SequelizeMeta" WHERE name = '${failingMigration}'`)
        await compose.run(['restart', 'backend'])
        await expect
            .poll(() => compose.logs('backend'), { interval: 2_000, timeout: 60_000 })
            .toContain(`Migration ${failingMigration} (up) failed`)
        const suffix = randomBytes(64)
            .toString('base64')
            .replace(/[^a-zA-Z0-9]/g, '')
            .slice(0, 24)
        expect(suffix).toHaveLength(24)
        const downMarker = `sdm_smokedown_${suffix}`
        expect(await statusOf(`${BASE_URL}/api/setup/status?key=${downMarker}`)).toBe(502)
        const proxyLog = await compose.logs('proxy')
        expect(proxyLog).toContain('key=REDACTED')
        expect(proxyLog).not.toContain(downMarker)
    })

    it('a failing migration keeps the backend from serving, and it recovers once the migrations run', async () => {
        expect(await statusOf(`${BASE_URL}/api/setup/status`)).not.toBe(200)
        await compose.psql(`INSERT INTO "SequelizeMeta" (name) VALUES ('${failingMigration}')`)
        await compose.run(['restart', 'backend'])
        expect(await compose.waitHealthy('backend', 120_000)).toBe(true)
        expect((await request(`${BASE_URL}/api/setup/status`)).status).toBe(200)
    })
})

describe('updates', () => {
    it('mailer.sh update hands over to the target image and replaces the backend', async () => {
        const oldId = await compose.containerId('backend')
        expect(oldId).not.toBe('')
        await execa('docker', ['tag', `${IMAGE}:${imageTag}`, `${IMAGE}:smoke-next`])
        const { stdout } = await runLauncher(current(), ['update', '--to', 'smoke-next'])
        expect(stdout).toContain(`Updated from ${imageTag} to smoke-next.`)
        const env = await readFile(current().envFile, 'utf8')
        expect(envValue(env, 'IMAGE_TAG')).toBe('smoke-next')
        expect(envValue(env, 'MAILER_PREVIOUS_IMAGE_TAG')).toBe(imageTag)
        const snapshots = await readdir(join(current().dir, 'backups', 'snapshots'))
        expect(snapshots).toHaveLength(1)
        expect((await readdir(join(current().dir, 'backups', 'snapshots', snapshots[0]!))).sort()).toEqual([
            '.env',
            'compose.yml',
            'mailer.sh',
        ])
        expect(existsSync(join(current().dir, '.update-lock'))).toBe(false)
        const newId = await compose.containerId('backend')
        expect(newId).not.toBe(oldId)
        expect(await compose.inspect(newId, '{{.Config.Image}}')).toBe(`${IMAGE}:smoke-next`)
        expect((await request(`${BASE_URL}/api/setup/status`)).status).toBe(200)
    })

    it('mailer.sh update to the running version changes nothing', async () => {
        const oldId = await compose.containerId('backend')
        const { stdout } = await runLauncher(current(), ['update', '--to', 'smoke-next'])
        expect(stdout).toBe('Already on smoke-next. If the last update did not finish, run: sh mailer.sh start')
        expect(await compose.containerId('backend')).toBe(oldId)
    })

    it(
        'mailer.sh update gives up within the wait timeout when the new backend fails its migrations, and start recovers',
        { timeout: 600_000 },
        async () => {
            const failingMigration = '017-harden-inbound-forms'
            await execa('docker', ['tag', `${IMAGE}:${imageTag}`, `${IMAGE}:smoke-broken`])
            await compose.psql(`DELETE FROM "SequelizeMeta" WHERE name = '${failingMigration}'`)
            const started = Date.now()
            const failed = await runLauncher(current(), ['update', '--to', 'smoke-broken'], { reject: false })
            const elapsedSeconds = Math.round((Date.now() - started) / 1_000)
            console.log(`update to a crash-looping backend returned ${failed.exitCode} after ${elapsedSeconds} s`)
            expect(failed.exitCode).toBe(1)
            expect(elapsedSeconds).toBeLessThan(360)
            expect(failed.stderr).toContain(
                'mailer.sh: the update to smoke-broken did not come up. The previous files are in backups/snapshots/; see the rollback page of the documentation.',
            )
            expect(failed.stdout).not.toContain('Updated from')
            expect(existsSync(join(current().dir, '.update-lock'))).toBe(false)
            expect(await compose.logs('backend')).toContain(`Migration ${failingMigration} (up) failed`)

            await compose.psql(`INSERT INTO "SequelizeMeta" (name) VALUES ('${failingMigration}')`)
            const again = await runLauncher(current(), ['update', '--to', 'smoke-broken'])
            expect(again.stdout).toBe(
                'Already on smoke-broken. If the last update did not finish, run: sh mailer.sh start',
            )
            await runLauncher(current(), ['start'])
            expect(await compose.waitHealthy('backend', 180_000)).toBe(true)
            expect((await request(`${BASE_URL}/api/setup/status`)).status).toBe(200)
        },
    )
})
