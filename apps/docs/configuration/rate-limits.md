# Rate limits

This page lists every rate limit in mailer: which routes it covers, how many requests it allows in which window, who it counts, which ones you can change, what a client sees when it hits one and what happens while Redis is down. After reading it you can tune the limits for your websites and tell a real attack from a misconfigured proxy.

A rate limit counts requests from one caller within a time window. When the caller goes over the count, the backend refuses further requests for a while with HTTP `429 Too Many Requests`. mailer keeps the counters in Redis, so every backend instance sees the same counts.

## Every limit

| Route                                | Limit                                                                 | Window                                                    | Counted per                                      | Set by                                | When Redis is down |
| ------------------------------------ | --------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------ | ------------------------------------- | ------------------ |
| `POST /api/auth/login`               | 10 attempts, then a block of 5 minutes                                | 1 minute                                                  | client IP and the e-mail address entered         | fixed in the code, not configurable   | `503`, fail closed |
| `POST /api/setup/user`               | 10 requests                                                           | 1 minute                                                  | client IP                                        | fixed in the code (the general limit) | `503`, fail closed |
| `POST /api/setup/finish`             | 10 requests                                                           | 1 minute                                                  | client IP                                        | fixed in the code (the general limit) | let through        |
| `POST /api/v1/send`, per key         | `PUBLIC_API_RATE_LIMIT` (default `60`)                                | `PUBLIC_API_RATE_TTL` ms (default `60000`, one minute)    | API key                                          | `.env`                                | let through        |
| `POST /api/v1/send`, per IP          | 10 × `PUBLIC_API_RATE_LIMIT` (default `600`)                          | `PUBLIC_API_RATE_TTL` ms                                  | client IP, across all keys                       | `.env` (the factor 10 is fixed)       | let through        |
| `POST /api/public/form/<slug>/token` | `FORM_TOKEN_RATE_LIMIT` (default `5`), and the general 10 per minute  | `FORM_TOKEN_RATE_TTL` ms (default `600000`, ten minutes)  | form and client IP; the general limit: client IP | `.env` (the general limit is fixed)   | let through        |
| `POST /api/public/form/<slug>`       | `FORM_SUBMIT_RATE_LIMIT` (default `5`), and the general 10 per minute | `FORM_SUBMIT_RATE_TTL` ms (default `600000`, ten minutes) | form and client IP; the general limit: client IP | `.env` (the general limit is fixed)   | let through        |

Everything else has no rate limit:

- the admin API used by the admin UI, which requires a login token (JWT), apart from `POST /api/setup/finish` above;
- `GET /api/setup/status`;
- `GET /api/public/form/client.js`, the script your websites embed;
- the health endpoints `/api/health` and `/api/health/ready`;
- the admin UI's own files.

A few details the table leaves out:

- **Login** counts every attempt, successful or not, because the limit is checked before the password. The counter is kept per pair of client IP and e-mail address (trimmed and lower-cased), so one visitor guessing passwords for one account is blocked without locking that account out for everyone else. The 11th attempt within a minute starts a block of 5 minutes for that pair.
- **The send API** counts per key only when the request carries something shaped like an API key (`sdm_…`), in the `Authorization: Bearer` header or the `key` query parameter. A request without one is counted per client IP in its place. The limit is checked before the key itself, so requests with wrong keys count too.
- **Forms** are counted per form, identified by its slug in the URL, and per client IP. The token request and the submission each have their own counter. The general limit of 10 per minute per client IP counts each of the two routes separately, across all forms.
- **Client IP** means the address the backend sees after applying `TRUST_PROXY`. Behind a proxy that is not counted correctly, every visitor shares the proxy's address and therefore one counter; see [Reverse proxy](/configuration/reverse-proxy#trust-proxy). For IPv6 visitors, the per-IP counters of the send API, of first-user registration and the general limit count the whole `/64` network, which is what one household or one server usually gets.

## Change a limit

Only the send API and form limits are configurable. Each is a pair of a count (`…_LIMIT`) and a window in milliseconds (`…_TTL`); both must be positive whole numbers. The full descriptions are on [Environment variables](/configuration/environment#rate-limits).

1. Edit the pair in `/opt/mailer/.env`; the template from the installation already contains all six keys. For example, to allow 300 sends per key and minute:

    ```bash
    cd /opt/mailer
    sed -i 's|^PUBLIC_API_RATE_LIMIT=.*|PUBLIC_API_RATE_LIMIT=300|' .env
    ```

2. Recreate the backend so it reads the new value:

    ```bash
    docker compose up -d backend
    ```

3. Check the new limit in the response headers, as shown under [What a client sees](#what-a-client-sees): `x-ratelimit-limit-publicapi` now reads `300`.

Raising `PUBLIC_API_RATE_LIMIT` also raises the per-IP limit of the send API, which is always ten times as high.

The login and setup limits cannot be changed.

## How a window works

Each counter starts with the first request and lasts one window. Within it, the backend counts every request. The request that goes over the count is refused, and from that moment the caller stays blocked:

- for 5 minutes on the login;
- for one full window on every other route, for example 10 minutes on a form with the default settings.

When the block has passed, the counter starts again from one.

## What a client sees

A refused request gets HTTP `429` with this body. It carries `statusCode` and `message`, but, unlike most other errors, no `error` field:

```json
{ "statusCode": 429, "message": "ThrottlerException: Too Many Requests" }
```

The response also tells the client how many seconds the block lasts, in a header whose name depends on the limit that was hit:

| Limit hit                                                      | Header                    |
| -------------------------------------------------------------- | ------------------------- |
| Login, first-user registration, the general limit of 10/minute | `Retry-After`             |
| Send API, per key                                              | `Retry-After-publicApi`   |
| Send API, per IP                                               | `Retry-After-publicApiIp` |
| Form submission                                                | `Retry-After-formSubmit`  |
| Form token request                                             | `Retry-After-formToken`   |

Requests that are let through carry the current state of each limit that applies, in seconds and counts: `X-RateLimit-Limit`, `X-RateLimit-Remaining` and `X-RateLimit-Reset`, with the same suffix as above for the named limits (for example `X-RateLimit-Remaining-publicApi`). A program that sends many mails can read `X-RateLimit-Remaining-publicApi` to slow down before it is refused.

To see them, send a request with your key and print only the headers:

```bash
curl -s -o /dev/null -D - -X POST https://app.example.com/api/v1/send \
  -H "Authorization: Bearer sdm_xxxxxxxx_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{}' | grep -i -E '^(x-ratelimit|retry-after)'
```

```text
x-ratelimit-limit-publicapi: 60
x-ratelimit-remaining-publicapi: 59
x-ratelimit-reset-publicapi: 60
x-ratelimit-limit-publicapiip: 600
x-ratelimit-remaining-publicapiip: 599
x-ratelimit-reset-publicapiip: 60
```

Header names are not case-sensitive; over HTTPS, `curl` usually speaks HTTP/2, which prints them in lower case. The empty body makes the request fail after the limits are counted, so no mail is sent: with a valid key the answer is `400`, with a wrong one `401`.

In the admin UI, a refused login shows the message from the response, `ThrottlerException: Too Many Requests`, above the login form.

## When Redis is down

Without Redis the backend cannot count. What it does then depends on the route:

- **Fail closed:** `POST /api/auth/login` and `POST /api/setup/user` answer `503` until Redis is back, so nobody can guess passwords or setup tokens while the limit is off:

    ```json
    { "message": "Rate limiting is temporarily unavailable", "error": "Service Unavailable", "statusCode": 503 }
    ```

    Nobody can log in to the admin UI or register the first user during that time.

- **Fail open:** every other limited route is let through without a limit, so websites can still send mail and forms, except forms with the timed token, which refuse submissions with `403 Form token could not be verified` until Redis is back. The backend logs a warning for each such request whose message starts with `Rate limit not enforced, Redis throttler storage unavailable`.

Redis is also where inbound-form deliveries wait, so check it first when this happens: `docker compose ps redis` and `docker compose logs redis`.

## Signs that a limit is wrong

- **Many different visitors get `429` on a form at the same time:** they are counted as one address. `TRUST_PROXY` does not match the number of proxies in front of the backend; see [Reverse proxy](/configuration/reverse-proxy#trust-proxy).
- **One server that sends for many websites gets `429` on the send API although each key is below its limit:** it hits the per-IP limit of 10 × `PUBLIC_API_RATE_LIMIT`. Raise `PUBLIC_API_RATE_LIMIT`.
- **A form behind a shared office network is refused after a few submissions:** five submissions per ten minutes is counted for the whole network address. Raise `FORM_SUBMIT_RATE_LIMIT`, and `FORM_TOKEN_RATE_LIMIT` with it when the form uses the timed token, because the embedded script then requests one token per submission.
