# Send API

This page shows how an application of yours sends mail through mailer: you create an API key for a project, call `POST /api/v1/send` with it, and read every answer the endpoint can give. At the end, your application sends from `mail.example.net` and knows which failures to retry.

The **send API** is a single HTTP endpoint for your own servers, for example a web shop that sends order confirmations. It sends one mail per request, from a sender domain of the key's project. Mail from inbound forms does not use it; forms deliver through their receivers (see [Receivers and templates](/admin-guide/inbound-forms/receivers-and-templates)).

## Before you start

- A sender domain, here `mail.example.net`, added on **Domains** and showing **Valid** (see [Domains](/admin-guide/domains)).
- A project with that domain assigned under **Sender domains** (see [Assign sender domains](/admin-guide/projects#assign-sender-domains)).
- The permission **Manage API keys** on that project, to create the key.

## Create an API key

1. Open **Projects** and click the project, for example **Acme Website**.
2. In **API keys**, click **New API key**.
3. Enter a **Name** of at most 100 characters, named after the application that will use the key, for example `Website`.
4. Click **Create key**.
5. The dialog **Copy your API key** shows the key. Copy it with the copy button, store it where your application reads its secrets, then click **Done**.

::: warning The key is shown only once
mailer stores only a hash of the key. If you lose it, create a new key and revoke the old one as described under [Revoke an API key](/admin-guide/projects#revoke-an-api-key).
:::

A key has the form `sdm_`, 8 letters or digits, an underscore and 43 more characters, for example `sdm_xxxxxxxx_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`. It belongs to exactly one project and may send from every sender domain assigned to that project. A revoked key, or a key of a project in **Recently deleted**, is answered with `401 Invalid API key`.

## Send a mail

Replace the key with yours and run:

```bash
curl -sS -i -X POST https://app.example.com/api/v1/send \
  -H "Authorization: Bearer sdm_xxxxxxxx_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{"from":"news@mail.example.net","to":"reader@example.org","replyTo":"support@mail.example.net","subject":"Your order","html":"<p>Thank you for your order.</p>","text":"Thank you for your order."}'
```

A successful call answers `202 Accepted` with this body:

```json
{ "mailMessageId": 42, "status": "sent" }
```

| Field           | Meaning                                                                                                                                                                            |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mailMessageId` | The id of the mail's entry on the project's **Sent mail** page. Store it if you want to match your own records with mailer's.                                                      |
| `status`        | Always `sent`: mailer's mail server accepted the mail for delivery. It does not mean the mail reached the inbox; a later rejection comes back as a [bounce](/admin-guide/bounces). |

## Request fields

The body is a JSON object with exactly these fields. Any other field, for example `cc`, is rejected with `400`.

| Field     | Required | Rule                                                                                       |
| --------- | -------- | ------------------------------------------------------------------------------------------ |
| `from`    | Required | One e-mail address whose domain is exactly a sender domain of the key's project, see below |
| `to`      | Required | One e-mail address                                                                         |
| `replyTo` | Optional | One e-mail address, set as the `Reply-To` header                                           |
| `subject` | Required | A string of 1 to 998 characters                                                            |
| `html`    | Required | The HTML body, a string of 1 to 1,000,000 characters                                       |
| `text`    | Optional | The plain-text body, a string of up to 1,000,000 characters                                |

Each address is a bare address such as `news@mail.example.net`; a display name (`Acme <news@mail.example.net>`) fails validation. mailer has no fields for several recipients, copies, attachments or custom headers: send one request per recipient.

The domain of `from` must match a sender domain by its full name: `news@mail.example.net` works for the domain `mail.example.net`, while `news@example.net` and `news@shop.mail.example.net` do not.

The JSON body of this endpoint may be about 8 MB large, enough for `html` and `text` at their maximum length even with characters of 4 bytes each. A larger body is refused with `413`.

## Authenticate with the header or the query string

Send the key in the header `Authorization: Bearer sdm_…`, as in the example. For clients that cannot set headers, the key may instead go into the query string:

```bash
curl -sS -i -X POST "https://app.example.com/api/v1/send?key=sdm_xxxxxxxx_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{"from":"news@mail.example.net","to":"reader@example.org","subject":"Hello","html":"<p>Hi</p>"}'
```

Prefer the header. URLs end up in logs, browser histories and monitoring tools. mailer's backend logs request paths without the query string, and the bundled proxy replaces the `key` parameter with `REDACTED` in its own log, but proxies, load balancers and HTTP libraries on your side may log the full URL. When both are present, the header wins.

The endpoint is meant for server-to-server calls. It sends no CORS headers, so a browser script on your website cannot call it, and it must not: the key would be visible to every visitor. Websites use [inbound forms](/admin-guide/inbound-forms/create) instead.

## Responses and errors

Every error body has `statusCode` and `message`. Errors from the send checks add a stable `code` to branch on; [Errors](/api/errors) shows the full shapes.

| Status | `code`                    | `message` and cause                                                                                                                                                                                                                                                     | Recorded on **Sent mail** |
| ------ | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `202`  | none                      | Accepted by mailer's mail server.                                                                                                                                                                                                                                       | yes, **Sent**             |
| `400`  | none                      | Validation failed: a field is missing, too long, not an address, or not in the table above. `message` is a list with one entry per problem.                                                                                                                             | no                        |
| `401`  | none                      | `Missing API key`: neither the header nor `?key=` carries a key. `Invalid API key`: the key is malformed, unknown, revoked, or its project is deleted.                                                                                                                  | no                        |
| `403`  | `FROM_DOMAIN_NOT_ALLOWED` | `The from address must use a domain of this project`: the domain of `from` is not a sender domain, or is not assigned to the key's project.                                                                                                                             | no                        |
| `413`  | none                      | The body is larger than about 8 MB.                                                                                                                                                                                                                                     | no                        |
| `422`  | `FROM_DOMAIN_NOT_READY`   | `The from domain has no active DKIM key` or `The from domain has DNS records that are not valid yet`, see below.                                                                                                                                                        | no                        |
| `422`  | `RECIPIENT_BLOCKED`       | `The recipient is blocked after previous bounces`: `to` is on **Blocked addresses**, see [Bounces](/admin-guide/bounces).                                                                                                                                               | yes, **Blocked**          |
| `429`  | none                      | `ThrottlerException: Too Many Requests`: a rate limit was hit, see below.                                                                                                                                                                                               | no                        |
| `502`  | `DELIVERY_FAILED`         | `The mail could not be delivered to the relay`: the attempt failed after it was recorded, mostly because mailer's mail server refused the mail or could not be reached in time, rarely because of a fault on mailer's side such as a DKIM key that cannot be decrypted. | yes, **Failed**           |

`RECIPIENT_BLOCKED` and `DELIVERY_FAILED` also carry `mailMessageId`, the entry on **Sent mail** that records the attempt. On that page, a **Failed** entry shows the mail server's error below the subject. A failure inside mailer before the attempt is recorded, for example a database outage, is answered with `500` and leaves no entry.

### What FROM_DOMAIN_NOT_READY checks

mailer checks three things about the `from` domain, in this order:

1. The domain is a sender domain on **Domains** and is assigned to the key's project. If not: `403 FROM_DOMAIN_NOT_ALLOWED`.
2. The domain has an active DKIM key, the key mailer signs its mail with. If not: `422 FROM_DOMAIN_NOT_READY` with the message `The from domain has no active DKIM key`. mailer generates the key when you add the domain and removes the domain again if that fails, so in normal operation this message does not occur.
3. The domain has at least one DNS record and every record is **Valid**. If not: `422 FROM_DOMAIN_NOT_READY` with the message `The from domain has DNS records that are not valid yet`. This check applies while [`SEND_REQUIRE_VALID_DNS`](/configuration/environment#send-require-valid-dns) is `true`, its default.

The DNS statuses are those on the domain's page, refreshed every 15 minutes, once after each start of the backend and by **Check again**. After you have fixed a record, click **Check again** and retry; see [Sending needs valid records](/admin-guide/domains#sending-needs-valid-records). Publishing records does not fix the DKIM cause: delete the domain and add it again, which creates a new key, as the `FROM_DOMAIN_NOT_READY` entry on [Errors](/api/errors) says. Either way, do not parse the `message` text. Nothing is recorded on **Sent mail** for a refused request.

## Rate limits

Two limits apply to every request, whether its key is valid or not. A request without anything shaped like a key is counted per client IP in place of the per-key counter; [Rate limits](/configuration/rate-limits#every-limit) has the details.

- **Per API key:** `PUBLIC_API_RATE_LIMIT` requests per `PUBLIC_API_RATE_TTL` milliseconds, by default 60 per 60,000 ms (one minute).
- **Per client IP:** ten times the per-key limit in the same window, counted across all keys, by default 600 per minute.

A refused request gets `429` with this body and a `Retry-After-publicApi` or `Retry-After-publicApiIp` header that gives the wait in seconds:

```json
{ "statusCode": 429, "message": "ThrottlerException: Too Many Requests" }
```

Successful requests carry `X-RateLimit-Remaining-publicApi`, so a program that sends in bulk can slow down before it is refused. [Rate limits](/configuration/rate-limits) explains the headers and how to raise the limits in `.env`. When Redis is down, the send API is not rate limited at all.

## The call is synchronous

The request stays open while the backend hands the mail to mailer's mail server, and answers once that server has accepted or refused it. There is no queue behind the send API and no automatic retry: a refused mail is answered with `502` at once and is not sent later.

When the mail server is slow or down, the backend waits up to 10 seconds to open a connection, up to 10 more for the server's greeting, and gives up on an open connection after 120 seconds without any data. Set the HTTP timeout of your client above 120 seconds, so that it does not give up while the backend is still waiting.

### Retries in your application

| Answer                            | What your application does                                                                                |
| --------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `502`, `500`, a network error     | Retry after a pause, with a growing wait (for example 1, 5, 30 minutes) and a maximum number of attempts. |
| `429`                             | Wait the number of seconds in the `Retry-After-…` header, then retry.                                     |
| `400`, `401`, `403`, `413`, `422` | Do not retry the same request. Fix the request, the key, the project's domains or the address first.      |

Every `502` creates a new **Failed** entry on **Sent mail**, so a retried mail shows up once per attempt. A `502` caused by a recipient that does not exist (an `RCPT TO` rejection with `5.1.1` and similar codes, see [Recipient rejections at send time](/admin-guide/domains#recipient-rejections-at-send-time)) also blocks the address, so the retry answers `422 RECIPIENT_BLOCKED`; stop retrying then.

::: warning A timed-out request may still have been sent
mailer has no idempotency key, a request id that would let it recognise a repeated request and answer it without sending again. If your client gives up or loses the connection before the answer arrives, the mail may have been sent anyway, and a retry sends it a second time. Before you retry after a timeout, search the recipient on the project's **Sent mail** page; an entry with **Sent** means the first attempt went through.
:::

## How you know it worked

The `curl` command under [Send a mail](#send-a-mail) prints the status `202` and the body with `"status":"sent"`. On the project's page, **Sent mail** lists the mail with the recipient `reader@example.org`, the source **API** and the status **Sent**, and the key's row under **API keys** shows **Last used** instead of **Never used** (the time is updated at most once a minute, so it can lag by up to a minute). The mail arrives in the recipient's inbox; if it does not, look for the address on **Bounces**.
