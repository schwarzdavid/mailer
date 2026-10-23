import { readFile } from 'node:fs/promises'
import { setTimeout as sleep } from 'node:timers/promises'
import { execa } from 'execa'
import { lastWord } from './logs.js'
import { PROJECT_NAME } from './stack.js'
import type { SmokeStack } from './stack.js'

export interface RunOptions {
    input?: string
    env?: Record<string, string>
    reject?: boolean
}

export interface RunResult {
    stdout: string
    stderr: string
    exitCode: number | undefined
}

async function docker(args: string[], options: RunOptions = {}): Promise<RunResult> {
    const result = await execa('docker', args, {
        input: options.input,
        env: options.env,
        reject: options.reject ?? true,
    })
    return {
        stdout: result.stdout.replaceAll('\r', ''),
        stderr: result.stderr.replaceAll('\r', ''),
        exitCode: result.exitCode,
    }
}

export class Compose {
    readonly stack: SmokeStack
    readonly extraFiles: string[]

    constructor(stack: SmokeStack, extraFiles: string[] = []) {
        this.stack = stack
        this.extraFiles = extraFiles
    }

    withFile(file: string): Compose {
        return new Compose(this.stack, [...this.extraFiles, file])
    }

    run(args: string[], options: RunOptions = {}): Promise<RunResult> {
        const files = [this.stack.composeFile, this.stack.overrideFile, ...this.extraFiles].flatMap((file) => [
            '-f',
            file,
        ])
        return docker(
            ['compose', '-p', PROJECT_NAME, '--project-directory', this.stack.dir, ...files, ...args],
            options,
        )
    }

    async services(): Promise<string[]> {
        const { stdout } = await this.run(['config', '--services'])
        return stdout.split('\n').filter((line) => line !== '')
    }

    async containerId(service: string): Promise<string> {
        const { stdout } = await this.run(['ps', '-q', service])
        return stdout.trim()
    }

    async health(service: string): Promise<string> {
        const id = await this.containerId(service)
        if (id === '') {
            return 'absent'
        }
        const result = await docker(
            ['inspect', '--format', '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}', id],
            { reject: false },
        )
        return result.exitCode === 0 ? result.stdout.trim() : 'absent'
    }

    async waitHealthy(service: string, timeoutMs: number): Promise<boolean> {
        const deadline = Date.now() + timeoutMs
        while (Date.now() < deadline) {
            if ((await this.health(service)) === 'healthy') {
                return true
            }
            await sleep(2_000)
        }
        return false
    }

    async inspect(containerId: string, format: string): Promise<string> {
        const { stdout } = await docker(['inspect', '--format', format, containerId])
        return stdout.trim()
    }

    async logs(service?: string): Promise<string> {
        const services = service === undefined ? [] : [service]
        const { stdout, stderr } = await this.run(['logs', '--no-color', '--no-log-prefix', ...services])
        return stdout + stderr
    }

    async psql(sql: string): Promise<string> {
        const { stdout } = await this.run([
            'exec',
            '-T',
            'postgres',
            'psql',
            '-U',
            'mailer',
            '-d',
            'mailer',
            '-tAc',
            sql,
        ])
        return stdout.trim()
    }

    async execNode(scriptFile: string, env: Record<string, string>): Promise<string> {
        const script = await readFile(scriptFile, 'utf8')
        const envArgs = Object.entries(env).flatMap(([key, value]) => ['-e', `${key}=${value}`])
        const { stdout } = await this.run(
            ['exec', '-T', ...envArgs, 'backend', 'node', '--input-type=module-typescript'],
            { input: script },
        )
        return stdout
    }

    async publishedPort(service: string, port: number): Promise<string> {
        const id = await this.containerId(service)
        if (id === '') {
            return ''
        }
        const { stdout } = await docker(['port', id, String(port)], { reject: false })
        return stdout.split('\n')[0]?.trim() ?? ''
    }

    async configHash(service: string, envFile: string, composeFile?: string): Promise<string> {
        const { stdout } = await docker([
            'compose',
            '-p',
            PROJECT_NAME,
            '--project-directory',
            this.stack.dir,
            '-f',
            composeFile ?? this.stack.composeFile,
            '-f',
            this.stack.overrideFile,
            '--env-file',
            envFile,
            'config',
            '--hash',
            service,
        ])
        return lastWord(stdout)
    }
}
