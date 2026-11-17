# API overview

This page tells you how to call mailer's public HTTP API from your own code: where it lives, how to authenticate, what you can send and how fast. The [Send API](./reference/public-send) and [Form endpoints](./reference/public-form) references list every field, and every response code is on [Errors](./errors).

## Base URL

The API lives under `/api` on the address your mailer is served at. In all examples the address is `https://app.example.com`, so the base URL is:

```text
https://app.example.com/api
```

Replace `app.example.com` with the `SITE_ADDRESS` of your installation. Requests and responses are JSON (`Content-Type: application/json`).

## Two kinds of callers

| Caller                                       | Authentication                            | Endpoints                                 |
| -------------------------------------------- | ----------------------------------------- | ----------------------------------------- |
| Your backend systems that send mail          | An API key, `Authorization: Bearer sdm_…` | [Send API](./reference/public-send)       |
| Browsers on your websites that submit a form | None                                      | [Form endpoints](./reference/public-form) |

Every other endpoint under `/api` belongs to the admin UI and is not a public contract. The form endpoints are what the embedded form script calls; [Embed the form](/admin-guide/inbound-forms/embed) shows how to put it on a website.

## Send a mail with an API key

Create an API key on a project page in the admin UI (**API keys**, then **New API key**). The full key is shown once, so copy it right away. A key looks like `sdm_` followed by 8 characters, an underscore and 43 more characters.

Send a mail from any sender domain that is assigned to the key's project:

```bash
curl -X POST https://app.example.com/api/v1/send \
  -H "Authorization: Bearer sdm_xxxxxxxx_…" \
  -H "Content-Type: application/json" \
  -d '{"from":"news@mail.example.net","to":"reader@example.org","subject":"Hello","html":"<p>Hi</p>"}'
```

A successful call answers `202 Accepted`:

```json
{ "mailMessageId": 42, "status": "sent" }
```

`mailMessageId` is the id of the entry on the project's **Sent mail** page. The call is synchronous: it returns once the mail was handed to the mail relay, and it answers `502` with the code `DELIVERY_FAILED` if the relay did not accept it. Your code is responsible for retrying failed requests.

### Send with the JavaScript client

From Node, use the npm package instead of `curl`; see [JavaScript client](./client#send) for the details:

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

It resolves with the same body as above and rejects with a `MailerError` for every error answer. Keep the key on a server: the constructor refuses to run in a browser.

### Request fields

| Field     | Required | Rule                                                    |
| --------- | -------- | ------------------------------------------------------- |
| `from`    | yes      | A valid e-mail address on a domain of the key's project |
| `to`      | yes      | One valid e-mail address                                |
| `replyTo` | no       | A valid e-mail address                                  |
| `subject` | yes      | 1 to 998 characters                                     |
| `html`    | yes      | 1 to 1,000,000 characters                               |
| `text`    | no       | Up to 1,000,000 characters                              |

Unknown fields are rejected with `400`. The exact schema is in the [Send API reference](./reference/public-send).

### The query-string fallback

For clients that cannot set headers, the key may be passed as `?key=sdm_…` instead. Prefer the header: query strings tend to end up in logs. mailer's backend logs request paths without their query string, and the bundled proxy replaces the `key` parameter with `REDACTED` in its own log entries, but your own proxies and clients may not.

## Limits

| Limit                                          | Value                                                                                                      |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `html` and `text` length                       | 1,000,000 characters each                                                                                  |
| JSON body of `/api/v1/send`                    | About 8 MB, enough for both fields at up to 4 bytes per character                                          |
| JSON body of every other call                  | 100 kB (the framework default)                                                                             |
| Requests per API key                           | `PUBLIC_API_RATE_LIMIT` per `PUBLIC_API_RATE_TTL` milliseconds, by default 60 per 60,000 ms (one minute)   |
| Requests per client IP on send                 | 10 times the per-key limit in the same window, counted across all keys, by default 600 per minute          |
| Form submissions per form and client IP        | `FORM_SUBMIT_RATE_LIMIT` per `FORM_SUBMIT_RATE_TTL` milliseconds, by default 5 per 600,000 ms (10 minutes) |
| Form token requests per form and client IP     | `FORM_TOKEN_RATE_LIMIT` per `FORM_TOKEN_RATE_TTL` milliseconds, by default 5 per 600,000 ms (10 minutes)   |
| Form token and submit endpoints, per client IP | A general limit of 10 per minute applies in addition                                                       |

A request over a limit is answered with `429`. The rate-limit variables are described on [Advanced configuration](/installation/advanced-configuration#rate-limits).

## CORS

Browsers only call endpoints on a different origin if the server allows it. mailer sends no CORS headers anywhere, because the admin UI is served from the same origin, with one exception: everything under `/api/v1/forms/` is open to every origin (`Access-Control-Allow-Origin: *`, no credentials). That is what lets the embedded form script run on your websites. The send endpoint is for server-to-server use and cannot be called from a browser on another origin.
