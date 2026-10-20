interface InboundFormClientTarget {
    InboundForm?: unknown
    fetch: typeof fetch
    setTimeout: typeof setTimeout
}

interface IssuedTokenBody {
    token: string
    waitMs: number
}

export function installInboundFormClient(target: InboundFormClientTarget, scriptSrc: string | null | undefined): void {
    const base = (scriptSrc || '').replace(/\/client\.js(?:[?#].*)?$/, '')
    const pending = new Map<string, Promise<string>>()

    function requestToken(slug: string): Promise<string> {
        return target
            .fetch(base + '/' + encodeURIComponent(slug) + '/token', { method: 'POST', credentials: 'omit' })
            .then(function (response) {
                if (!response.ok) {
                    throw Object.assign(new Error('Form token request failed with status ' + response.status), {
                        status: response.status,
                    })
                }
                return response.json()
            })
            .then(function (body: IssuedTokenBody) {
                return new Promise<string>(function (resolve) {
                    target.setTimeout(
                        function () {
                            resolve(body.token)
                        },
                        Math.max(0, Number(body.waitMs) || 0),
                    )
                })
            })
    }

    function getToken(slug: string): Promise<string> {
        const existing = pending.get(slug)
        if (existing) {
            return existing
        }
        const request = requestToken(slug).then(
            function (token) {
                pending.delete(slug)
                return token
            },
            function (error: unknown) {
                pending.delete(slug)
                throw error
            },
        )
        pending.set(slug, request)
        return request
    }

    target.InboundForm = { getToken: getToken }
}

export const INBOUND_FORM_CLIENT_SCRIPT = `(${installInboundFormClient.toString()})(window, document.currentScript && document.currentScript.src)\n`
