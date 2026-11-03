import { randomBytes } from 'node:crypto'
import { readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Compose } from './support/compose.js'
import { issueLeaf, serialOf, servedImapSerial, servedSmtpSerial } from './support/pki.js'
import { request, statusOf } from './support/http.js'
import { requestLogEntry, setupTokenFrom } from './support/logs.js'
import { deliverDsn, relayFromOutside } from './support/smtp.js'
import { BASE_URL, MAIL_HOSTNAME, SMTP_PORT, createStack, destroyStack } from './support/stack.js'
import type { SmokeStack } from './support/stack.js'

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

beforeAll(async () => {
    stack = await createStack(process.env.IMAGE_TAG ?? 'local')
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
    it('mail is up and healthy with the bounce account', async () => {
        const { mailPassword } = current()
        await compose.run(['up', '-d', '--pull', 'missing', 'mail'])
        await compose.run(['exec', '-T', 'mail', 'setup', 'email', 'add', `bounce@${MAIL_HOSTNAME}`, mailPassword])
        await compose.run([
            'exec',
            '-T',
            'mail',
            'setup',
            'alias',
            'add',
            `postmaster@${MAIL_HOSTNAME}`,
            `bounce@${MAIL_HOSTNAME}`,
        ])
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
        const raw = await readFile(
            fileURLToPath(new URL('../../dev/fixtures/dsn-permanent.eml', import.meta.url)),
            'utf8',
        )
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
    it('up -d replaces the backend', async () => {
        const oldId = await compose.containerId('backend')
        expect(oldId).not.toBe('')
        const revisionFile = join(current().dir, 'compose.revision.yml')
        await writeFile(
            revisionFile,
            ['services:', '    backend:', '        environment:', '            SMOKE_REVISION: "2"', ''].join('\n'),
        )
        await compose.withFile(revisionFile).run(['up', '-d', '--pull', 'missing', '--wait'])
        expect((await request(`${BASE_URL}/api/setup/status`)).status).toBe(200)
        expect(await compose.containerId('backend')).not.toBe(oldId)
    })
})
