import { spawn, type ChildProcess } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { once } from 'node:events'

export interface ProcessOptions {
    cwd: string
    env?: Record<string, string>
    logFile: string
}

export interface ServerProcess {
    stop: () => Promise<void>
}

export async function freePort(): Promise<number> {
    const server = createServer()
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    server.close()
    if (address === null || typeof address === 'string') {
        throw new Error('Could not determine a free port')
    }
    return address.port
}

async function logTail(logFile: string): Promise<string> {
    const content = await readFile(logFile, 'utf8').catch(() => '')
    return content.split('\n').slice(-40).join('\n')
}

export async function waitForLogLine(logFile: string, pattern: RegExp, timeoutMs = 10_000): Promise<RegExpExecArray> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
        const content = await readFile(logFile, 'utf8').catch(() => '')
        const match = pattern.exec(content)
        if (match) {
            return match
        }
        await new Promise((resolve) => setTimeout(resolve, 100))
    }
    throw new Error(`${pattern} not found in ${logFile} after ${timeoutMs}ms. Log tail:\n${await logTail(logFile)}`)
}

function pipeToLog(child: ChildProcess, logFile: string): void {
    const log = createWriteStream(logFile)
    child.stdout?.pipe(log)
    child.stderr?.pipe(log)
}

export async function runCommand(command: string, options: ProcessOptions): Promise<void> {
    const child = spawn(command, {
        cwd: options.cwd,
        env: { ...process.env, ...options.env },
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe'],
    })
    pipeToLog(child, options.logFile)

    const [exitCode] = (await once(child, 'exit')) as [number | null]
    if (exitCode !== 0) {
        throw new Error(
            `"${command}" exited with ${exitCode}. Log (${options.logFile}):\n${await logTail(options.logFile)}`,
        )
    }
}

export async function startServer(
    args: string[],
    readyUrl: string,
    options: ProcessOptions,
    timeoutMs = 60_000,
): Promise<ServerProcess> {
    const child = spawn(process.execPath, args, {
        cwd: options.cwd,
        env: { ...process.env, ...options.env },
        stdio: ['ignore', 'pipe', 'pipe'],
    })
    pipeToLog(child, options.logFile)

    const stop = async () => {
        if (child.exitCode !== null || child.signalCode !== null) {
            return
        }
        const exited = once(child, 'exit')
        child.kill()
        await exited
    }

    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
        if (child.exitCode !== null) {
            throw new Error(
                `${args.join(' ')} exited early. Log (${options.logFile}):\n${await logTail(options.logFile)}`,
            )
        }
        const response = await fetch(readyUrl).catch(() => null)
        if (response?.ok) {
            return { stop }
        }
        await new Promise((resolve) => setTimeout(resolve, 250))
    }

    await stop()
    throw new Error(
        `${readyUrl} not ready after ${timeoutMs}ms. Log (${options.logFile}):\n${await logTail(options.logFile)}`,
    )
}
