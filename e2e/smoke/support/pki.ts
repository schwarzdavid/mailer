import { randomBytes } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { execa } from 'execa'
import type { Compose } from './compose.js'

const caConfig = `[req]
prompt = no
distinguished_name = dn
x509_extensions = ca_ext

[dn]
CN = Mailer Smoke CA

[ca_ext]
basicConstraints = critical, CA:true
keyUsage = critical, keyCertSign, cRLSign
subjectKeyIdentifier = hash
`

function leafConfig(hostname: string): string {
    return `[req]
prompt = no
distinguished_name = dn

[dn]
CN = ${hostname}

[leaf_ext]
basicConstraints = critical, CA:false
keyUsage = critical, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = DNS:${hostname}
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid
`
}

const imapSerialScript = `openssl s_client -starttls imap -connect 127.0.0.1:143 -servername "$(hostname -f)" </dev/null 2>/dev/null |
    openssl x509 -noout -serial 2>/dev/null`

export async function createCa(pkiDir: string, caDir: string): Promise<void> {
    const configFile = join(pkiDir, 'ca.cnf')
    await writeFile(configFile, caConfig)
    await execa('openssl', [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-days',
        '2',
        '-config',
        configFile,
        '-keyout',
        join(pkiDir, 'ca.key'),
        '-out',
        join(caDir, 'ca.crt'),
    ])
}

export async function issueLeaf(pkiDir: string, caDir: string, outDir: string, hostname: string): Promise<void> {
    const configFile = join(pkiDir, 'leaf.cnf')
    const csrFile = join(pkiDir, 'leaf.csr')
    await writeFile(configFile, leafConfig(hostname))
    await execa('openssl', [
        'req',
        '-new',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-config',
        configFile,
        '-keyout',
        join(outDir, `${hostname}.key`),
        '-out',
        csrFile,
    ])
    await execa('openssl', [
        'x509',
        '-req',
        '-in',
        csrFile,
        '-CA',
        join(caDir, 'ca.crt'),
        '-CAkey',
        join(pkiDir, 'ca.key'),
        '-set_serial',
        `0x${randomBytes(16).toString('hex')}`,
        '-days',
        '2',
        '-extfile',
        configFile,
        '-extensions',
        'leaf_ext',
        '-out',
        join(outDir, `${hostname}.crt`),
    ])
}

export async function serialOf(certFile: string): Promise<string> {
    const { stdout } = await execa('openssl', ['x509', '-noout', '-serial', '-in', certFile])
    return stdout.replaceAll('\r', '').trim()
}

export async function servedSmtpSerial(port: number, hostname: string): Promise<string> {
    const handshake = await execa(
        'openssl',
        ['s_client', '-starttls', 'smtp', '-connect', `localhost:${port}`, '-servername', hostname],
        { input: '', reject: false },
    )
    if (handshake.failed) {
        return ''
    }
    const serial = await execa('openssl', ['x509', '-noout', '-serial'], {
        input: handshake.stdout,
        reject: false,
    })
    return serial.failed ? '' : serial.stdout.replaceAll('\r', '').trim()
}

export async function servedImapSerial(compose: Compose): Promise<string> {
    const { stdout } = await compose.run(['exec', '-T', 'mail', 'sh', '-c', imapSerialScript], { reject: false })
    return stdout.trim()
}
