import http from 'node:http'

export interface HttpResponse {
    status: number
    headers: Record<string, string>
    body: string
}

export interface RequestOptions {
    headers?: Record<string, string>
    body?: string
}

function send(url: string, method: string, options: RequestOptions): Promise<HttpResponse> {
    return new Promise((resolve, reject) => {
        const clientRequest = http.request(url, { method, headers: options.headers }, (response) => {
            const chunks: Buffer[] = []
            response.on('data', (chunk: Buffer) => chunks.push(chunk))
            response.on('error', reject)
            response.on('end', () => {
                const headers: Record<string, string> = {}
                for (const [name, value] of Object.entries(response.headers)) {
                    if (value !== undefined) {
                        headers[name] = Array.isArray(value) ? value.join(', ') : value
                    }
                }
                resolve({
                    status: response.statusCode ?? 0,
                    headers,
                    body: Buffer.concat(chunks).toString('utf8'),
                })
            })
        })
        clientRequest.on('error', reject)
        clientRequest.end(options.body)
    })
}

export async function request(url: string, method = 'GET', options: RequestOptions = {}): Promise<HttpResponse> {
    const response = await send(url, method, options)
    expect(response.headers['x-robots-tag']?.toLowerCase()).toBe('noindex, nofollow')
    return response
}

export async function statusOf(url: string): Promise<number | undefined> {
    try {
        return (await send(url, 'GET', {})).status
    } catch {
        return undefined
    }
}
