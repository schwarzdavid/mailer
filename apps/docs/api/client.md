# JavaScript client

This page shows how to call mailer from JavaScript or TypeScript with the npm package `@schwarzdavid/mailer-client` instead of hand-written `fetch` calls: to submit an inbound form from a website, and to send a mail from a server. After reading it you can install the package, configure it with your mailer's address and handle its errors.

The package has no runtime dependencies, works in browsers and in Node 22 or newer, and ships its own TypeScript types. Everything is imported from `@schwarzdavid/mailer-client`; a bundler drops the parts a website does not use. Websites without a bundler can use [the script tag](#script-tag) instead.

## Install

```bash
npm install @schwarzdavid/mailer-client
```

## Configuration

Every client takes an options object. The only required option is `baseUrl`:

| Option      | Required | What to enter                                                                                                                                      |
| ----------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `baseUrl`   | Required | The address your mailer is served at, for example `https://app.example.com`. The client appends `/api/v1/…`.                                       |
| `timeoutMs` | Optional | Per request, default `30000`; a positive, finite number of milliseconds. A request that takes longer fails with a `MailerError` with `status` `0`. |
| `fetch`     | Optional | A replacement for the platform's `fetch`, for tests or unusual runtimes.                                                                           |

`baseUrl` is `https://` followed by your `SITE_ADDRESS`, for example `https://app.example.com`, not the API root. A trailing slash is tolerated; a query string or fragment is not. The client throws a `TypeError` at construction for a `baseUrl` that is not an absolute `http(s)` URL and for a `timeoutMs` that is not a positive finite number.

## Forms

`MailerForm` is bound to one [inbound form](/admin-guide/inbound-forms/create) by its form key and submits to it. For a form with the timed token check, pass `timedToken` with the check's key and location; the info button of the check on the form's page shows both:

```ts
import { MailerForm } from '@schwarzdavid/mailer-client'

const form = new MailerForm({
    baseUrl: 'https://app.example.com',
    formKey: '3f9a0c1e7b2d4a6f8e5c9b0d1a2f4e6c',
    timedToken: { key: 'formToken', location: 'body' },
})

formElement.addEventListener('focusin', () => form.prepare())

const result = await form.submit({
    data: { name, email, message },
    security: { website: '' },
})
```

`submit` resolves with `{ status: 'accepted' }`. Besides `data` it takes `security` for the other checks with the location **Body**, `headers` for checks with the location **Header** and `query` for checks with the location **Query parameter**. The client puts the timed token where `timedToken.location` says, under `timedToken.key`.

- **`timedToken` switches the token handling on.** Without it, the client never asks for a token, which is right for a form without the timed token check: the token endpoint answers `404` `Unknown form` for such a form.
- **`prepare()` is optional but recommended.** It starts requesting the token in the background and never throws. Call it when the visitor first touches the form, so the token's minimum delay (3 seconds by default) has passed by the time they click send. Without `prepare()`, `submit` requests the token itself and waits out the delay, so sending takes that long.
- **The client never requests a token on its own.** Token requests are limited to 5 per 10 minutes per form and visitor IP address, see [Limits](./overview#limits); a client that asked for one on every page load would hit `429` after five pages.
- **A token works once.** The client keeps it after `400`, `404`, `413` and `429`, which mailer sends before it uses the token, so the visitor can correct a field or wait and send again with the same token. After any other answer, and when no answer arrives, it drops the token and fetches a new one. It also asks for a new one when the cached token has expired, so a form that stayed open for hours still works.

`MailerForm` takes optional type arguments for `data` and `security`, so you can type your own form. The client does not validate them.

For custom flows there is a low-level client that does no token handling for you:

```ts
import { createFormClient } from '@schwarzdavid/mailer-client'

const forms = createFormClient({ baseUrl: 'https://app.example.com' })
const token = await forms.getToken('3f9a0c1e7b2d4a6f8e5c9b0d1a2f4e6c')
await forms.submit('3f9a0c1e7b2d4a6f8e5c9b0d1a2f4e6c', {
    data: { name, email, message },
    security: { website: '', formToken: token },
})
```

`getToken` resolves with the token string once its minimum delay has passed, and concurrent calls for the same form share one request. Requests to the form endpoints carry no cookies.

A complete page with the checks of the example form is on [Embed the form](/admin-guide/inbound-forms/embed).

## Send

`MailerSender` sends a mail through the [send API](/api/reference/public-send) with an API key:

```ts
import { MailerSender } from '@schwarzdavid/mailer-client'

const sender = new MailerSender({
    baseUrl: 'https://app.example.com',
    apiKey: process.env.MAILER_API_KEY!,
})

const { mailMessageId, status } = await sender.send({
    from: 'news@mail.example.net',
    to: 'reader@example.org',
    subject: 'Hello',
    html: '<p>Hi</p>',
})
```

The request takes the fields of [Request fields](./overview#request-fields): `from`, `to`, `subject` and `html` are required, `replyTo` and `text` are optional. The key is sent as `Authorization: Bearer <apiKey>` and never in the query string.

::: warning Keep the API key on a server
An API key in a web page's code is readable by every visitor. The `MailerSender` constructor therefore throws where a browser `document` exists. If exposing the key is an accepted risk, for example in an internal tool, pass `dangerouslyAllowBrowser: true`. Workers and Deno have no `document` and need no override. A sender created with `dangerouslyAllowBrowser` only works from the same origin as mailer or through your own proxy, because the send API sends no CORS headers.
:::

## Errors

Every non-2xx answer and every network failure rejects with a `MailerError`:

| Field           | Meaning                                                                                                                                                     |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `status`        | The HTTP status, or `0` for a network failure or a timeout.                                                                                                 |
| `code`          | The stable code of the send endpoint: `FROM_DOMAIN_NOT_ALLOWED`, `FROM_DOMAIN_NOT_READY`, `RECIPIENT_BLOCKED` or `DELIVERY_FAILED`. Empty for other errors. |
| `messages`      | The server's `message` as a list. Empty when the answer has no JSON body, as with `413`.                                                                    |
| `mailMessageId` | The id of the entry on the **Sent mail** page, present on `RECIPIENT_BLOCKED` and `DELIVERY_FAILED`.                                                        |
| `retryable`     | `true` for `0`, `429`, `502` and `503`, `false` otherwise.                                                                                                  |
| `cause`         | The original error of a network failure.                                                                                                                    |

`retryable` follows the list on [Which errors to retry](./errors#which-errors-to-retry). The client never retries by itself; your code decides:

```ts
import { MailerError } from '@schwarzdavid/mailer-client'

try {
    await sender.send(request)
} catch (error) {
    if (error instanceof MailerError && error.code === 'FROM_DOMAIN_NOT_ALLOWED') {
        throw error
    }
    if (error instanceof MailerError && error.retryable) {
        await retryLater(request)
    }
}
```

The statuses and codes are explained on [Errors](./errors). Branch on `status` and `code`, not on the text of `messages`.

## Script tag

A website without a bundler loads the package's script build, `dist/client.iife.js`, for example from the CDN jsDelivr, with your mailer's version in place of `1.4.0`. It is the same package built as one file, and it defines the global `MailerClient` with exactly the package's exports: `MailerForm`, `createFormClient`, `MailerSender` and `MailerError`. Everything on this page applies unchanged, with the `MailerClient.` prefix instead of an `import`:

```html
<script src="https://cdn.jsdelivr.net/npm/@schwarzdavid/mailer-client@1.4.0/dist/client.iife.js"></script>
<script>
    const form = new MailerClient.MailerForm({
        baseUrl: 'https://app.example.com',
        formKey: '3f9a0c1e7b2d4a6f8e5c9b0d1a2f4e6c',
        timedToken: { key: 'formToken', location: 'body' },
    })
</script>
```

Load it with a normal `<script src="…">` tag, not `type="module"`, so that `MailerClient` becomes a global. Keep the version in the URL: without it jsDelivr serves the newest release. To load nothing from a CDN, host the file from the npm package on your own website. `MailerSender` is in the script too, but its browser guard applies there as well: an API key belongs on a server.

## Versions

Use the client version that equals your mailer's version: the package is published with every release of mailer under the same version number, and nothing checks the match at runtime. This applies to the script build as well.

## Licence

The package is released under the MIT licence. The rest of mailer is AGPL-3.0-only.
