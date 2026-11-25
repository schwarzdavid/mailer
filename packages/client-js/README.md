# @schwarzdavid/mailer-client

Browser and Node client for the [mailer](https://github.com/schwarzdavid/mailer) form and send APIs. Zero runtime dependencies, ESM only, Node 22 or newer.

```bash
pnpm add @schwarzdavid/mailer-client
```

## Forms

`MailerForm` submits to a form by its `formKey`. With `timedToken` it also fetches the form's timed token and places it where your form template expects it (`body`, `header` or `query`).

```ts
import { MailerForm } from '@schwarzdavid/mailer-client'

const form = new MailerForm({
    baseUrl: 'https://app.example.com',
    formKey: 'your-form-key',
    timedToken: { key: 'token', location: 'body' },
})

document.querySelector('form')?.addEventListener('focusin', () => form.prepare(), { once: true })

await form.submit({ data: { email: 'jane@example.org', message: 'Hello' } })
```

`prepare()` starts fetching the token in the background; call it when the visitor first touches the form so the token's wait time has passed by the time they submit. `submit()` fetches a token itself when none is ready. The token is never requested in the constructor, and nothing is requested at all without `timedToken`.

`submit()` accepts `data`, and optionally `security` (extra security fields), `headers` and `query`. It resolves with `{ status: 'accepted' }`.

For full control use the low-level client:

```ts
import { createFormClient } from '@schwarzdavid/mailer-client'

const client = createFormClient({ baseUrl: 'https://app.example.com' })
const token = await client.getToken('your-form-key')
await client.submit('your-form-key', {
    data: { email: 'jane@example.org' },
    security: { token },
})
```

`getToken` waits out the token's `waitMs` before it resolves, and concurrent calls for the same form share one request. The `key` and `location` you place the token under must match the form's timed-token check.

## Send

`MailerSender` sends a transactional mail with an API key. Keep the key on a server.

```ts
import { MailerSender } from '@schwarzdavid/mailer-client'

const sender = new MailerSender({
    baseUrl: 'https://app.example.com',
    apiKey: process.env.MAILER_API_KEY!,
})

const { mailMessageId, status } = await sender.send({
    from: 'hello@example.org',
    to: 'jane@example.org',
    subject: 'Welcome',
    html: '<p>Hello Jane</p>',
    text: 'Hello Jane',
})
```

The key is sent as `Authorization: Bearer <apiKey>`. Constructing a `MailerSender` where a browser `document` exists throws, because the key would be exposed. If exposing it is an accepted risk, pass `dangerouslyAllowBrowser: true`. Such a sender only works from the same origin as mailer or through your own proxy, because the send API sends no CORS headers.

## Options

All clients take `baseUrl` (absolute `http(s)` URL of your mailer without query string or fragment, for example `https://app.example.com`), optionally `fetch` (a custom implementation) and `timeoutMs` (default 30000; a positive, finite number, otherwise the constructor throws a `TypeError`).

## Errors

Every failed request throws a `MailerError`:

| Field           | Meaning                                                                                                                                        |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `status`        | HTTP status, or `0` for a network error or timeout                                                                                             |
| `code`          | Machine code when the server sends one, for example `FROM_DOMAIN_NOT_ALLOWED`, `FROM_DOMAIN_NOT_READY`, `RECIPIENT_BLOCKED`, `DELIVERY_FAILED` |
| `messages`      | Error messages from the server                                                                                                                 |
| `mailMessageId` | Id of the logged mail, when one was created                                                                                                    |
| `retryable`     | `true` for status `0`, `429`, `502` and `503`: the same request may succeed later                                                              |

`retryLater` below stands for your own retry or queue helper; the client never retries by itself.

```ts
import { MailerError } from '@schwarzdavid/mailer-client'

try {
    await sender.send(request)
} catch (error) {
    if (error instanceof MailerError && error.retryable) {
        await retryLater(request)
    }
}
```

## Compatibility

Use the client version that matches your mailer server's version.

## Documentation

[https://schwarzdavid.github.io/mailer/api/client](https://schwarzdavid.github.io/mailer/api/client)

## Licence

MIT. The mailer server itself is AGPL-3.0-only.
