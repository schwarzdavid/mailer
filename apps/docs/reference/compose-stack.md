# Compose stack

This page describes every part of the production `compose.yml`: each service, volume, network and published port, what it holds and whether you back it up. Use it to find where something lives before you change the file, move a service out or plan a backup.

The file is the one you downloaded on [Docker Compose](/installation/docker-compose), in `/opt/mailer/compose.yml`. Its first line, `name: mailer`, names the Compose project. Docker therefore names the containers `mailer-<service>-1` and the volumes `mailer_<volume>`, for example `mailer_postgres-data`.

## Services

| Service    | Image                                                | What it does                                                                                                                                                                                             | Health check                                            | Starts after                       |
| ---------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------- |
| `postgres` | `postgres:17-alpine`                                 | The database. It creates the database `DB_DATABASE` and the user `DB_USERNAME` with `DB_PASSWORD` when its volume is empty.                                                                              | `pg_isready` every 5 s                                  | –                                  |
| `redis`    | `redis:8-alpine`                                     | The delivery queue of inbound forms, the rate-limit counters and a short-lived cache. Runs with `--appendonly yes` (writes every change to disk) and `--maxmemory-policy noeviction` (never drops data). | `redis-cli ping` every 5 s                              | –                                  |
| `backend`  | `ghcr.io/schwarzdavid/mailer:${IMAGE_TAG}`           | mailer itself: the admin UI, the API under `/api`, the delivery worker and the background jobs. Applies pending migrations every time it starts.                                                         | `GET /api/health` every 10 s, after a 60 s grace period | `postgres` and `redis` are healthy |
| `proxy`    | `caddy:2.11.7-alpine`                                | Caddy: obtains and renews the TLS certificates for `SITE_ADDRESS` and `MAIL_HOSTNAME`, compresses responses, adds `X-Robots-Tag` and forwards every request for `SITE_ADDRESS` to `backend:8000`.        | none                                                    | `backend` is healthy               |
| `mail`     | `ghcr.io/docker-mailserver/docker-mailserver:16.0.1` | docker-mailserver: delivers outgoing mail to recipients' servers, receives bounce reports on port 25, and serves the bounce mailbox to the backend.                                                      | the image's own                                         | –                                  |

`IMAGE_TAG` defaults to `latest`; pin a release version in `.env` ([Environment variables](/configuration/environment#compose-variables)). The tags of the other four images are fixed in the file and change only with a new release's `compose.yml` ([Update mailer](/operations/updating#caddy-and-the-mail-server-are-updated-with-releases)). Every service restarts on its own after a crash or a reboot (`restart: unless-stopped`).

### backend

- **Settings:** reads the whole `.env` (`env_file: .env`) and then sets these variables itself, which a value in `.env` cannot override: `NODE_ENV=production`, `PORT=8000`, `TRUST_PROXY=1`, `DB_HOST=postgres`, `DB_PORT=5432`, `REDIS_HOST=redis`, `REDIS_PORT=6379`, and the `SMTP_*` and `IMAP_*` connection to the `mail` service on ports 587 and 143 with STARTTLS, logging in as `bounce@` plus `MAIL_HOSTNAME` with `MAIL_PASSWORD`. [Environment variables](/configuration/environment) lists every value.
- **Serves:** the built admin UI from `/app/public` at the root and the API under `/api`. Files under `/assets/` are cached for a year (`Cache-Control: public, max-age=31536000, immutable`); every other file, and the `index.html` that client routes of the admin UI fall back to, is sent with `no-cache`. A missing `/assets/` file and an unknown `/api/` path answer `404`, never the admin UI. `/docs` falls back to the admin UI too, because `NODE_ENV=production` turns the Swagger UI off.
- **Hardening:** a read-only file system (`read_only: true`) with only `/tmp` writable, in memory (`tmpfs`), and a minimal init process (`init: true`). The image runs as the unprivileged user `node`.
- **No published port and no fixed container name,** so it is reachable only through `proxy` and can run as several containers ([Scaling](/operations/scaling)).

### proxy

- **Configuration:** the Caddyfile is the block `x-proxy-caddyfile` at the top of the file, mounted as `/etc/caddy/Caddyfile` through the config `proxy-caddyfile`. [Reverse proxy](/configuration/reverse-proxy) explains every line.
- **`MAIL_HOSTNAME`** answers every web request with `404`; the site exists only so that Caddy obtains a certificate for that name, which `mail` reads.

### mail

- **Settings:** `hostname` is `MAIL_HOSTNAME`. The environment turns off everything mailer does not need (`ENABLE_OPENDKIM`, `ENABLE_OPENDMARC`, `ENABLE_POLICYD_SPF`, `ENABLE_AMAVIS`, `ENABLE_RSPAMD`, `ENABLE_CLAMAV`, `ENABLE_FAIL2BAN`, `ENABLE_POP3`, `ENABLE_UPDATE_CHECK` all `0`; the backend signs with DKIM itself), trusts no other container as a mail source (`PERMIT_DOCKER: none`) and turns on spoof protection (`SPOOF_PROTECTION: '1'`), so the backend's login may send only with its own address as the envelope sender.
- **Certificate:** `SSL_TYPE: manual` with `SSL_CERT_PATH` and `SSL_KEY_PATH` pointing at the files Caddy keeps for `MAIL_HOSTNAME` in the `caddy-data` volume, which is mounted read-only at `/caddy`. Until Caddy has that certificate, `mail` restarts ([Why mail restarts at first](/installation/docker-compose#why-mail-restarts-at-first)).
- **Postfix setting:** the block `x-mail-postfix-main`, mounted as `/tmp/docker-mailserver/postfix-main.cf` through the config `mail-postfix-main`, sets `mydestination = localhost.$mydomain, localhost`. Postfix's default list of local destinations would also contain the server's own name, `MAIL_HOSTNAME`; leaving it out lets mail to `bounce@` plus `MAIL_HOSTNAME` reach the mailbox created with `setup email add`.
- **Shutdown:** `stop_grace_period: 1m` gives the mail server up to a minute to finish open deliveries when it stops.
- **Accounts:** the bounce mailbox and the `postmaster` alias are created by hand after the first start ([CLI](/reference/cli#mail-server-accounts)).

## Volumes

Every volume is a named Docker volume, created on the first `docker compose up -d` and kept by `docker compose down` (only `docker compose down -v` deletes them). The **Back up** column matches [Backup and restore](/operations/backup-restore#what-to-back-up).

| Volume          | Docker name            | Mounted in                                         | Holds                                                                                                                                           | Back up                                                              |
| --------------- | ---------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `postgres-data` | `mailer_postgres-data` | `postgres` at `/var/lib/postgresql/data`           | The whole database: users, roles, projects, domains with their DKIM keys, forms, templates, API keys, sent mail, bounces and blocked addresses. | Yes, with `pg_dump`, never by copying the volume while Postgres runs |
| `redis-data`    | `mailer_redis-data`    | `redis` at `/data`                                 | Redis's append-only file: queued form deliveries, rate-limit counters, the cache.                                                               | No; the database is the record of every delivery                     |
| `caddy-data`    | `mailer_caddy-data`    | `proxy` at `/data`, `mail` at `/caddy` (read-only) | The TLS certificates and keys for `SITE_ADDRESS` and `MAIL_HOSTNAME`, and Caddy's Let's Encrypt account.                                        | No; Caddy obtains new certificates on a new server                   |
| `caddy-config`  | `mailer_caddy-config`  | `proxy` at `/config`                               | Caddy's own saved configuration, rebuilt on every start.                                                                                        | No                                                                   |
| `mail-data`     | `mailer_mail-data`     | `mail` at `/var/mail`                              | The bounce mailbox: every bounce report received, processed ones included.                                                                      | No                                                                   |
| `mail-state`    | `mailer_mail-state`    | `mail` at `/var/mail-state`                        | docker-mailserver's runtime state, including the queue of outgoing mail not delivered yet.                                                      | No; let the queue drain before a planned move                        |
| `mail-logs`     | `mailer_mail-logs`     | `mail` at `/var/log/mail`                          | docker-mailserver's own log files, which Docker's log rotation does not cover.                                                                  | No                                                                   |
| `mail-config`   | `mailer_mail-config`   | `mail` at `/tmp/docker-mailserver`                 | docker-mailserver's accounts and aliases: `bounce@` and `postmaster@` plus `MAIL_HOSTNAME`.                                                     | Optional; two commands recreate them                                 |

Besides the volumes, back up `.env`: it holds `BACKEND_ENCRYPTION_SECRET`, without which the DKIM keys and reCAPTCHA secrets in a database dump cannot be decrypted. [Monitoring](/operations/monitoring#disk-space) shows how much space each volume takes.

## Networks

| Network   | Docker name      | Services                                | Purpose                                                                                                                                                                                      |
| --------- | ---------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `default` | `mailer_default` | `postgres`, `redis`, `backend`, `proxy` | The backend reaches Postgres and Redis, and Caddy reaches the backend, by their service names.                                                                                               |
| `mail`    | `mailer_mail`    | `backend`, `mail`                       | The backend submits mail on port 587 and reads the bounce mailbox on port 143. Only these two services are on it, so no other container reaches the mail server's submission and IMAP ports. |

`mail` is on the `mail` network only, and `postgres`, `redis` and `proxy` on `default` only. The backend reaches the mail server by the service name `mail` and checks its certificate against `MAIL_HOSTNAME`. `MAIL_HOSTNAME` is deliberately not a network alias of the `mail` service, so inside the stack it still resolves through public DNS, and the DNS checks of the domains see the same records as the rest of the world.

## Published ports

Only these ports are reachable from outside the server. The host side of each is a [compose variable](/configuration/environment#compose-variables) in `.env`.

| Host port          | Default | Service and port | Protocol | Used for                                                                                                        |
| ------------------ | ------- | ---------------- | -------- | --------------------------------------------------------------------------------------------------------------- |
| `HTTP_PORT`        | `80`    | `proxy`, 80      | TCP      | Let's Encrypt's certificate checks and the redirect from HTTP to HTTPS.                                         |
| `HTTPS_PORT`       | `443`   | `proxy`, 443     | TCP      | The admin UI and the API over HTTPS.                                                                            |
| `HTTPS_PORT`       | `443`   | `proxy`, 443     | UDP      | HTTP/3. Optional; browsers fall back to TCP.                                                                    |
| `SMTP_PUBLIC_PORT` | `25`    | `mail`, 25       | TCP      | Other mail servers deliver bounce reports. Accepts mail for the server's own addresses only and relays nothing. |

`postgres`, `redis` and `backend` publish no ports, and the mail server's ports 587 and 143 stay on the internal `mail` network. Change a host port only when the default is taken on the host and something else forwards the public port to it ([Reverse proxy](/configuration/reverse-proxy#host-ports)).

## Configs and logging

| Block                 | Used as                                                                                                                                   | Content                                                                      |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `x-proxy-caddyfile`   | Config `proxy-caddyfile`, mounted in `proxy` at `/etc/caddy/Caddyfile`; also the label `mailer.caddyfile` on `proxy`                      | The Caddyfile, with `SITE_ADDRESS` and `MAIL_HOSTNAME` filled in from `.env` |
| `x-mail-postfix-main` | Config `mail-postfix-main`, mounted in `mail` at `/tmp/docker-mailserver/postfix-main.cf`; also the label `mailer.postfix-main` on `mail` | The `mydestination` setting described above                                  |
| `x-logging`           | `logging` of all five services                                                                                                            | Docker's `json-file` driver, at most five files of 10 MB per container       |

Compose 2.23.1 or newer is required because the two configs are written inline with `configs.content`. [Logging](/configuration/logging#log-rotation) explains the log limits.

When you edit `compose.yml`, for example for an [external database](/configuration/external-postgres-redis) or a [CDN in front of Caddy](/configuration/reverse-proxy#put-a-cdn-or-another-proxy-in-front-of-caddy), apply the same edits to the `compose.yml` of every new release.
