# API overview

This page tells you how to call mailer's HTTP API from your own code: where it lives, how to authenticate, what you can send and how fast. Every endpoint has a page in the [reference](./reference/), and every response code is listed on [Errors](./errors).

## Base URL

The API lives under `/api` on the address your mailer is served at. In all examples the address is `https://app.example.com`, so the base URL is:

```text
https://app.example.com/api
```

Replace `app.example.com` with the `SITE_ADDRESS` of your installation. Requests and responses are JSON (`Content-Type: application/json`).

## Three kinds of callers

mailer has one API with three authentication modes. Which one applies depends on the endpoint.

| Caller                                          | Authentication                                       | Endpoints                                        |
| ----------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------ |
| Your backend systems that send mail             | An API key, `Authorization: Bearer sdm_…`            | [Public send API](./reference/public-send)       |
| Browsers on your websites that submit a form    | None                                                 | [Public form endpoints](./reference/public-form) |
| The admin UI (and scripts that act like a user) | A JWT from `POST /api/auth/login` as a Bearer header | Every other tag in the [reference](./reference/) |

Most integrations only need the first row. The admin endpoints are what the admin UI itself uses; they are documented in the reference so you can script them, but they are not a stable public contract in the way the send endpoint is.

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

### Request fields

| Field     | Required | Rule                                                    |
| --------- | -------- | ------------------------------------------------------- |
| `from`    | yes      | A valid e-mail address on a domain of the key's project |
| `to`      | yes      | One valid e-mail address                                |
| `replyTo` | no       | A valid e-mail address                                  |
| `subject` | yes      | 1 to 998 characters                                     |
| `html`    | yes      | 1 to 1,000,000 characters                               |
| `text`    | no       | Up to 1,000,000 characters                              |

Unknown fields are rejected with `400`. The exact schema is in the [Public send API reference](./reference/public-send).

### The query-string fallback

For clients that cannot set headers, the key may be passed as `?key=sdm_…` instead. Prefer the header: query strings tend to end up in logs. mailer's backend logs request paths without their query string, and the bundled proxy replaces the `key` parameter with `REDACTED` in its own log entries, but your own proxies and clients may not.

## Limits

| Limit                                                                      | Value                                                                                                      |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `html` and `text` length                                                   | 1,000,000 characters each                                                                                  |
| JSON body of `/api/v1/send`                                                | About 8 MB, enough for both fields at up to 4 bytes per character                                          |
| JSON body of every other call                                              | 100 kB (the framework default)                                                                             |
| Requests per API key                                                       | `PUBLIC_API_RATE_LIMIT` per `PUBLIC_API_RATE_TTL` milliseconds, by default 60 per 60,000 ms (one minute)   |
| Requests per client IP on send                                             | 10 times the per-key limit in the same window, counted across all keys, by default 600 per minute          |
| Form submissions per form and client IP                                    | `FORM_SUBMIT_RATE_LIMIT` per `FORM_SUBMIT_RATE_TTL` milliseconds, by default 5 per 600,000 ms (10 minutes) |
| Form token requests per form and client IP                                 | `FORM_TOKEN_RATE_LIMIT` per `FORM_TOKEN_RATE_TTL` milliseconds, by default 5 per 600,000 ms (10 minutes)   |
| Form token and submit endpoints and first-user registration, per client IP | A general limit of 10 per minute applies in addition                                                       |
| Logins, per client IP and e-mail address                                   | 10 attempts per minute, successful ones included, then blocked for 5 minutes                               |

The rate-limit variables are described on [Environment variables](../configuration/environment). A request over a limit is answered with `429`. The other admin endpoints, which use a JWT, are not rate limited, with one exception: `POST /api/setup/finish`, the last step of the first-run wizard, is under the general limit of 10 per minute per client IP, and lets requests through without a limit while Redis is down. [Rate limits](../configuration/rate-limits) lists every limit.

## CORS

Browsers only call endpoints on a different origin if the server allows it. mailer sends no CORS headers anywhere, because the admin UI is served from the same origin, with one exception: everything under `/api/v1/forms/` is open to every origin (`Access-Control-Allow-Origin: *`, no credentials). That is what lets the embedded form script run on your websites. The send endpoint is for server-to-server use and cannot be called from a browser on another origin.

## The OpenAPI document

The [reference](./reference/) is generated from the OpenAPI document that the backend builds from its own code. Operation ids are the controller method names, for example `sendMail` and `createProject`.

## How you know it worked

Run the `curl` command above with a real key and a sender address on one of the project's domains. You get `202` and a JSON body with `status` set to `sent`, and a new row appears on the project's **Sent mail** page.
