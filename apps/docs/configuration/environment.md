# Environment variables

This page lists every setting mailer reads from its environment: what it does, whether you must set it, its default, and whether the production compose file already fixes it for you. After reading it you can fill in `.env` without looking anything up elsewhere.

## Where the settings live

All settings are plain `KEY=value` lines in one file named `.env`.

- **Production (Docker Compose):** `.env` sits next to `compose.yml`, for example in `/opt/mailer/.env`. You create it by copying `deploy/.env.example`. Compose reads it for two jobs: it fills the `${…}` placeholders inside `compose.yml` (the [compose variables](#compose-variables) below), and it hands the whole file to the `backend` container, so every [backend variable](#backend-variables) you add is passed on.
- **Local development:** `.env` sits in the repository root. You create it by copying `.env.example`, whose values already match the Docker services that `dev/docker-compose.yml` starts.

Every table has the same columns.

- **Required** is `yes` when the backend refuses to start without a value. When the production compose file sets the value itself, you do not have to.
- **Default** is what the backend uses when the variable is absent. `–` means there is no default.
- **Set by compose** is the exact value `deploy/compose.yml` fixes for the `backend` service. A value in `.env` for such a variable has **no effect**, because compose sets it directly on the container and that wins over the `.env` file. `–` means compose leaves the variable to you.

An empty value (`KEY=`) counts as unset for the optional text settings, such as `REDIS_USERNAME`, `REDIS_PASSWORD` and `SMTP_TLS_SERVERNAME`. Boolean settings take `true` or `false`.

::: tip
When a required variable is missing or a value does not fit (a port outside 1 to 65535, a secret shorter than 32 characters), the backend stops at startup and says which variable is wrong. Read it with `docker compose logs backend`.
:::

## Compose variables

These variables are read by `compose.yml` itself, not by the backend. They exist only in production.

| Variable           | Required | Default  | Set by compose | Description                                                                                                                                                                                                                                 |
| ------------------ | -------- | -------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SITE_ADDRESS`     | yes      | –        | –              | The domain the admin UI and the API are served on, for example `app.example.com`. The proxy (Caddy) obtains a Let's Encrypt certificate for it. Compose refuses to start while it is empty. It must differ from `MAIL_HOSTNAME`.            |
| `MAIL_HOSTNAME`    | yes      | –        | –              | The name of the bundled mail server, for example `mx.example.com`. Also the platform's sending domain and the name on the mail server's TLS certificate. See [Mail server](#mail-server). Compose refuses to start while it is empty.       |
| `MAIL_PASSWORD`    | yes      | –        | –              | The password of the mailbox `bounce@MAIL_HOSTNAME`. Compose passes it to the backend as `SMTP_PASSWORD` and `IMAP_PASSWORD`. You create the mailbox with this same password during the first deploy, and change both together to rotate it. |
| `IMAGE_TAG`        | no       | `latest` | –              | The tag of the backend image `ghcr.io/schwarzdavid/mailer` to run. For production, pin a release version or `sha-<7 characters>` so the image always matches the `compose.yml` next to it. It does not affect the other images.             |
| `HTTP_PORT`        | no       | `80`     | –              | The host port that forwards to the proxy's port 80. Change it only when port 80 is taken on the host.                                                                                                                                       |
| `HTTPS_PORT`       | no       | `443`    | –              | The host port that forwards to the proxy's port 443, used for both TCP and UDP (HTTP/3).                                                                                                                                                    |
| `SMTP_PUBLIC_PORT` | no       | `25`     | –              | The host port that forwards to the mail server's port 25, where other mail servers deliver bounces to you. Other mail servers always connect to port 25, so change it only for testing.                                                     |

## Backend variables

The tables below follow the groups of `.env.example`. Every one of these variables is read by the backend.

### General

| Variable      | Required | Default       | Set by compose | Description                                                                                                                                                                                                                              |
| ------------- | -------- | ------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`    | no       | `development` | `production`   | One of `development`, `test` or `production`. In `production` the backend serves the built admin UI (and refuses to start when its files are missing) and turns off the Swagger UI at `/docs`. The Docker image and compose both set it. |
| `PORT`        | no       | `8000`        | `8000`         | The port the backend listens on inside its container. The proxy forwards to `backend:8000`, so leave it alone with Docker Compose.                                                                                                       |
| `TRUST_PROXY` | no       | unset (off)   | `1`            | How many reverse proxies stand in front of the backend, so rate limits count the real visitor address. See [TRUST_PROXY](#trust-proxy).                                                                                                  |
| `LOG_LEVEL`   | no       | `info`        | –              | The lowest log level that is written: `fatal`, `error`, `warn`, `info`, `debug`, `trace` or `silent`. See [LOG_LEVEL](#log-level).                                                                                                       |

### Database

mailer needs a PostgreSQL database. The bundled `postgres` container needs only the three required values.

| Variable                     | Required | Default     | Set by compose | Description                                                                                                                                                                                                  |
| ---------------------------- | -------- | ----------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DB_HOST`                    | no       | `localhost` | `postgres`     | The host name of the database server. Change it only when you use an external Postgres.                                                                                                                      |
| `DB_PORT`                    | no       | `5432`      | `5432`         | The port of the database server.                                                                                                                                                                             |
| `DB_USERNAME`                | yes      | –           | –              | The database user. Compose also creates this user in the bundled Postgres.                                                                                                                                   |
| `DB_PASSWORD`                | yes      | –           | –              | The database password. The bundled Postgres applies it only when it first initialises an empty volume, so editing `.env` later without also changing the password inside the database locks the backend out. |
| `DB_DATABASE`                | yes      | –           | –              | The database name, for example `mailer`. Compose also creates it in the bundled Postgres.                                                                                                                    |
| `DB_SSL`                     | no       | `false`     | –              | Connect to Postgres over TLS. Leave it off for the bundled Postgres, which speaks plain TCP on the internal network. See [Database TLS](#database-tls).                                                      |
| `DB_SSL_REJECT_UNAUTHORIZED` | no       | `true`      | –              | Whether the backend verifies the Postgres server certificate. It has an effect only when `DB_SSL` is `true`. Set `false` only as a last resort, because it turns verification off.                           |
| `DB_POOL_MAX`                | no       | `10`        | –              | The most connections the backend keeps open to Postgres. Keep it below the server's `max_connections` divided by the number of backend instances you run.                                                    |

### Redis

Redis holds the delivery queue for inbound forms and the rate-limit counters. The backend does not work without it.

| Variable               | Required | Default     | Set by compose | Description                                                                                                                              |
| ---------------------- | -------- | ----------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `REDIS_HOST`           | no       | `127.0.0.1` | `redis`        | The host name of the Redis server. Change it only when you use an external Redis.                                                        |
| `REDIS_PORT`           | no       | `6379`      | `6379`         | The port of the Redis server.                                                                                                            |
| `REDIS_USERNAME`       | no       | unset       | –              | The user for a Redis that requires an ACL login. Leave it empty for the bundled Redis.                                                   |
| `REDIS_PASSWORD`       | no       | unset       | –              | The password for a Redis that requires a login. Leave it empty for the bundled Redis.                                                    |
| `REDIS_TLS`            | no       | `false`     | –              | Connect to Redis over TLS. See [Redis TLS and persistence](#redis-tls-and-persistence).                                                  |
| `REDIS_TLS_SERVERNAME` | no       | unset       | –              | The host name the Redis certificate was issued for, when it differs from `REDIS_HOST`. It has an effect only when `REDIS_TLS` is `true`. |

### Secrets

Both secrets must be at least 32 characters. Generate each with `openssl rand -base64 48`, and use two different values.

| Variable                    | Required | Default | Set by compose | Description                                                                                                                                                                                                                                |
| --------------------------- | -------- | ------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `BACKEND_JWT_SECRET`        | yes      | –       | –              | Signs the login tokens of the admin UI. Changing it signs every user out.                                                                                                                                                                  |
| `BACKEND_ENCRYPTION_SECRET` | yes      | –       | –              | Encrypts secrets stored in the database: DKIM private keys and reCAPTCHA secrets. It also derives the key that signs form tokens (HKDF). Back it up separately. If you lose or change it, those stored secrets can no longer be decrypted. |

### Mail server

| Variable        | Required | Default | Set by compose | Description                                                                                                                                                                                                                                                 |
| --------------- | -------- | ------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MAIL_HOSTNAME` | yes      | –       | –              | The single sending domain of the platform, for example `mx.example.com`. It must be a fully qualified domain name (it contains a dot) and is lower-cased. The backend uses it as the sending domain, and the app asks you only for the server IP addresses. |

With Docker Compose this is the same variable as in the [compose variables](#compose-variables); you set it once, in `.env`. The compose file also derives the mail server's host name and the bounce mailbox from it.

### SMTP

SMTP is how the backend hands outgoing mail to a mail server. With Docker Compose it is the bundled `mail` service on its submission port, so compose sets nearly everything.

| Variable                 | Required | Default | Set by compose            | Description                                                                                                                                                                                          |
| ------------------------ | -------- | ------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SMTP_HOST`              | yes      | –       | `mail`                    | The host name of the SMTP server.                                                                                                                                                                    |
| `SMTP_PORT`              | yes      | –       | `587`                     | The port of the SMTP server, a number from 1 to 65535.                                                                                                                                               |
| `SMTP_SECURE`            | no       | `false` | `false`                   | `true` connects with TLS from the first byte (the usual port 465). `false` connects in plain text and then upgrades with STARTTLS, which is how port 587 works.                                      |
| `SMTP_REQUIRE_TLS`       | no       | `true`  | `true`                    | Refuse to send mail to a server that does not offer STARTTLS. See [SMTP_REQUIRE_TLS](#smtp-require-tls).                                                                                             |
| `SEND_REQUIRE_VALID_DNS` | no       | `true`  | –                         | Refuse to send from a sender domain until it is ready to send: an active DKIM key and valid DNS records. See [SEND_REQUIRE_VALID_DNS](#send-require-valid-dns).                                      |
| `SMTP_USER`              | no       | empty   | `bounce@${MAIL_HOSTNAME}` | The login for the SMTP server. When it is empty, the backend connects without logging in.                                                                                                            |
| `SMTP_PASSWORD`          | no       | empty   | `${MAIL_PASSWORD}`        | The password for `SMTP_USER`.                                                                                                                                                                        |
| `SMTP_TLS_SERVERNAME`    | no       | unset   | `${MAIL_HOSTNAME}`        | The name the SMTP server's certificate must match, when it differs from `SMTP_HOST`. Compose needs it because the backend reaches the server as `mail`, while its certificate names `MAIL_HOSTNAME`. |

### IMAP

IMAP is how the backend reads the bounce mailbox: the automatic replies that come back when a mail could not be delivered. Without `IMAP_HOST`, bounces are not read and the backend logs that polling is disabled.

| Variable              | Required                | Default | Set by compose            | Description                                                                                                      |
| --------------------- | ----------------------- | ------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `IMAP_HOST`           | no                      | unset   | `mail`                    | The host name of the IMAP server. Leaving it unset turns bounce reading off.                                     |
| `IMAP_PORT`           | no                      | `993`   | `143`                     | The port of the IMAP server.                                                                                     |
| `IMAP_SECURE`         | no                      | `true`  | `false`                   | `true` connects with TLS from the first byte (port 993). `false` connects in plain text first, as port 143 does. |
| `IMAP_USER`           | when `IMAP_HOST` is set | unset   | `bounce@${MAIL_HOSTNAME}` | The mailbox login. The backend refuses to start when `IMAP_HOST` is set and this is empty.                       |
| `IMAP_PASSWORD`       | when `IMAP_HOST` is set | unset   | `${MAIL_PASSWORD}`        | The mailbox password. The backend refuses to start when `IMAP_HOST` is set and this is empty.                    |
| `IMAP_TLS_SERVERNAME` | no                      | unset   | `${MAIL_HOSTNAME}`        | The name the IMAP server's certificate must match, when it differs from `IMAP_HOST`.                             |

### Rate limits

Rate limits cap how often a caller may use the public endpoints. Each setting comes as a pair: how many requests are allowed (`…_LIMIT`) within one window, and how long that window lasts in milliseconds (`…_TTL`). See [Rate limit pairs](#rate-limit-pairs).

| Variable                 | Required | Default  | Set by compose | Description                                                                                                                      |
| ------------------------ | -------- | -------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `PUBLIC_API_RATE_LIMIT`  | no       | `60`     | –              | Requests one API key may make to the send API per window. Each client IP is also capped at 10 times this number across all keys. |
| `PUBLIC_API_RATE_TTL`    | no       | `60000`  | –              | The window of the send API limit, in milliseconds (60000 is one minute).                                                         |
| `FORM_SUBMIT_RATE_LIMIT` | no       | `5`      | –              | Submissions one client IP may send to one inbound form per window.                                                               |
| `FORM_SUBMIT_RATE_TTL`   | no       | `600000` | –              | The window of the form submission limit, in milliseconds (600000 is ten minutes).                                                |
| `FORM_TOKEN_RATE_LIMIT`  | no       | `5`      | –              | Token requests one client IP may make for one inbound form per window. The embedded form requests a token before it submits.     |
| `FORM_TOKEN_RATE_TTL`    | no       | `600000` | –              | The window of the form token limit, in milliseconds (600000 is ten minutes).                                                     |

## Runtime variables read by Node

These are not mailer settings. The Node.js runtime inside the backend container reads them itself, so mailer's own startup check does not list them.

| Variable              | Required | Default | Set by compose | Description                                                                                                                                                                                                                                        |
| --------------------- | -------- | ------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_EXTRA_CA_CERTS` | no       | unset   | –              | The path of a file with extra certificate authorities (CAs), in PEM format. Node trusts them in addition to its built-in list. Use it when your managed Postgres or Redis uses a certificate from a private CA. See [Database TLS](#database-tls). |

## TRUST_PROXY

Rate limits on public form submissions, first setup and the send API (its per-IP limit) are counted per client IP address, and the login limit per client IP address plus e-mail address. Behind a reverse proxy, every request arrives from the proxy's own address, so all visitors would share one limit. `TRUST_PROXY` tells the backend how many proxies it may believe when they report the real client address in the `X-Forwarded-For` header. Its value is passed to Express's [`trust proxy`](https://expressjs.com/en/guide/behind-proxies.html) setting.

| Setup                                                      | `TRUST_PROXY`                             |
| ---------------------------------------------------------- | ----------------------------------------- |
| No proxy, the backend is reached directly                  | leave unset                               |
| One reverse proxy (nginx, Traefik, Caddy, a load balancer) | `1`                                       |
| A chain of N proxies                                       | `N`                                       |
| Trust proxies by address instead of by position            | `loopback` or a subnet, e.g. `10.0.0.0/8` |

When it is unset, empty or `false`, the backend ignores `X-Forwarded-For`.

::: danger
Do not set `TRUST_PROXY=true` unless the backend can only be reached through the proxy. It then trusts the left-most address in `X-Forwarded-For`, which any visitor can forge to get around the rate limits.
:::

With Docker Compose, `TRUST_PROXY` is fixed to `1` in `compose.yml`, because Caddy is the single proxy hop, and a value in `.env` does not override it. If you put another proxy or a CDN in front of Caddy, change the value in `compose.yml` to match the number of proxies, and also list the CDN's address ranges as `trusted_proxies` in the Caddyfile, because Caddy otherwise replaces the incoming `X-Forwarded-For`. [Reverse proxy](/configuration/reverse-proxy#put-a-cdn-or-another-proxy-in-front-of-caddy) shows both edits.

Rate-limit counters are stored in Redis, so all backend instances must use the same Redis. If Redis is unreachable, login and first-user setup answer `503`, so that nobody can guess passwords while the limit is down. Every other rate-limited route is let through without a limit, and the backend logs a warning. The exception is forms with the timed token, which refuse submissions with `403 Form token could not be verified` until Redis is back.

## Database TLS

The bundled Postgres container speaks plain TCP on the internal Docker network, so leave `DB_SSL` unset with it.

To use a managed Postgres instead:

1. Set `DB_USERNAME`, `DB_PASSWORD` and `DB_DATABASE` in `.env`. Compose fixes `DB_HOST` and `DB_PORT`, so change those two lines under `backend.environment` in `compose.yml` instead.
2. Set `DB_SSL=true` in `.env`. The backend then verifies the server certificate.
3. If the provider's certificate comes from a private CA, put the CA file (PEM format) on the backend container and set `NODE_EXTRA_CA_CERTS` in `.env` to its path inside the container. The backend container's file system is read-only, so add a volume to the `backend` service in `compose.yml`:

    ```yaml
    volumes:
        - /opt/mailer/ca.pem:/certs/ca.pem:ro
    ```

    and set `NODE_EXTRA_CA_CERTS=/certs/ca.pem`.

4. Use `DB_SSL_REJECT_UNAUTHORIZED=false` only as a last resort, because it turns certificate verification off and leaves the connection open to impersonation.

`DB_POOL_MAX` (default `10`) caps the connections the backend keeps open. Keep it below the server's `max_connections` divided by the number of backend instances.

## Redis TLS and persistence

The delivery queue for inbound forms lives in Redis. A Redis outage only delays deliveries, but Redis must never drop queued jobs to free memory. The bundled Redis therefore runs with `--appendonly yes` (it writes every change to disk and survives a restart) and `--maxmemory-policy noeviction` (when it is full it refuses new data instead of deleting old data).

To use a managed Redis instead:

1. Set `REDIS_HOST` and `REDIS_PORT`. Compose fixes both, so change those two lines under `backend.environment` in `compose.yml` instead.
2. Add `REDIS_PASSWORD` in `.env` when it requires a login, and `REDIS_USERNAME` for an ACL user.
3. Set `REDIS_TLS=true` when it speaks TLS. The backend then verifies the server certificate against `REDIS_HOST`, or against `REDIS_TLS_SERVERNAME` when the certificate names a different host.
4. When the certificate comes from a private CA, `NODE_EXTRA_CA_CERTS` covers it as well. Use the same file as for Postgres, or one file that holds both CAs.
5. Configure that Redis with `maxmemory-policy noeviction` and with persistence, as the bundled one has.

## SMTP_REQUIRE_TLS

STARTTLS is the command that upgrades a plain SMTP connection to an encrypted one. With `SMTP_REQUIRE_TLS=true` (the default), the backend refuses to hand mail to an SMTP server that does not offer STARTTLS, so credentials and mail never cross the network in clear text. It has no effect when `SMTP_SECURE=true`, because that connection is encrypted from the start.

The production compose file sets it to `true` for the bundled mail server. Set it to `false` only when you deliberately use an SMTP server without STARTTLS, such as the MailHog test server in local development, which is why `.env.example` sets it to `false`.

## SEND_REQUIRE_VALID_DNS

With `SEND_REQUIRE_VALID_DNS=true` (the default), mailer sends only from a sender domain that is **ready to send**. A domain is ready to send when all of these hold:

- it has an active DKIM key, the key mailer signs its mail with (a domain without one cannot send at all; the gate itself checks the records);
- it has at least one DNS record;
- every one of its DNS records has the status **Valid**.

Only the From domain's own records count, whether it is a customer domain or `MAIL_HOSTNAME` itself assigned to a project; the records of every other domain are not looked at.

The statuses come from the DNS check, which runs every 15 minutes and once after each start of the backend, or from **Check again** on the domain's page. A record you have just published therefore keeps the domain from sending until one of these checks has run.

When a domain is not ready:

- the send API answers `422` with the code `FROM_DOMAIN_NOT_READY`, see [Send API](/admin-guide/send-api#what-from-domain-not-ready-checks);
- a form delivery stays `pending` and is retried for about two hours, then becomes `failed` with the error `Domain 3 (mail.example.net) has DNS records that are not valid yet`, see [Deliveries](/admin-guide/inbound-forms/deliveries#a-domain-that-is-not-ready-to-send).

No mail is recorded on **Sent mail** while the gate refuses it. [Domains](/admin-guide/domains#sending-needs-valid-records) describes how to get a domain ready.

Set it to `false` only to send without valid records, for example in local development or in a test stack, where no real DNS zone exists. That is why `.env.example` and the test stacks set it to `false`, while `deploy/.env.example` lists it as `true`. With `false`, the gate is off and the backend does not run the extra DNS check at start.

## LOG_LEVEL

The backend writes its log to standard output. With `NODE_ENV=production`, as in the Docker image, it writes one JSON object per line, ready for `docker compose logs backend` or a log shipper. In every other environment the same entries are printed in a readable one-line form.

`LOG_LEVEL` picks the lowest level that is written: `fatal`, `error`, `warn`, `info`, `debug`, `trace` or `silent`, from least to most verbose. The default is `info`; `.env.example` for local development sets `debug`. Set it in `.env` next to `compose.yml`, then run `docker compose up -d backend` to apply it.

Every request gets a random request id. The backend returns it in the `X-Request-Id` response header, and every log entry written while handling that request carries it as `reqId`, so an error a user reports with that id leads straight to the matching log lines. After each request the backend logs one `request completed` entry with the method, the path, the client address, the status code and the response time. Health checks are not logged. Entries never contain the query string, headers or request bodies, so API keys passed as `?key=…` never reach the log.

Log messages name records by their id instead of by e-mail address, for example `Sent mail message <id>`, and a failed login is logged only as `Login failed`. Look up the address in the admin UI when you need it.

## Rate limit pairs

Every rate limit is a pair of variables: a count and a window. When a caller exceeds the count within the window, the backend answers `429 Too Many Requests` until the window has passed.

| Limit               | Variables                                        | Counted per                | Default          |
| ------------------- | ------------------------------------------------ | -------------------------- | ---------------- |
| Send API, per key   | `PUBLIC_API_RATE_LIMIT`, `PUBLIC_API_RATE_TTL`   | API key                    | 60 per minute    |
| Send API, per IP    | the same pair, count multiplied by 10            | client IP, across all keys | 600 per minute   |
| Form submissions    | `FORM_SUBMIT_RATE_LIMIT`, `FORM_SUBMIT_RATE_TTL` | form and client IP         | 5 per 10 minutes |
| Form token requests | `FORM_TOKEN_RATE_LIMIT`, `FORM_TOKEN_RATE_TTL`   | form and client IP         | 5 per 10 minutes |

The login has its own limit that you cannot change: 10 attempts per minute, followed by a block of 5 minutes.

The counters depend on the real client address, so set `TRUST_PROXY` correctly (see [TRUST_PROXY](#trust-proxy)); otherwise all visitors behind a proxy share one limit.
