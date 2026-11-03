# Without Docker

This page runs mailer straight on a server with Node.js, without Docker Compose. At the end the backend runs as a system service, serves the admin UI and the API behind your own HTTPS reverse proxy, and sends and receives mail through a mail server you provide.

The Docker Compose installation brings Postgres, Redis, the reverse proxy and the mail server along, ready to use. Without Docker you provide each of them yourself, so choose this way only if you already run these services. Everything else in this documentation assumes Docker Compose, so translate its `docker compose` commands to your setup as you go.

## What you need

- **A Linux server** with `git`, `curl`, the PostgreSQL command line client `psql` and Node.js 24.12 or newer (the admin UI's build requires it). The Docker image uses Node.js 24.22.1; the version is set in the repository's `Dockerfile`.
- **PostgreSQL** with an empty database and a user that owns it, for example both named `mailer`. The Docker stack uses PostgreSQL 17.
- **Redis** with `maxmemory-policy noeviction` and persistence. The Docker stack uses Redis 8. [External Postgres and Redis](/configuration/external-postgres-redis#what-the-services-must-offer) explains both settings and how to check them.
- **An HTTPS reverse proxy** such as Caddy or nginx, with a certificate for the admin UI's name, for example `app.example.com`.
- **A mail server** that relays your outgoing mail and holds the bounce mailbox; see [Bring your own mail server](#bring-your-own-mail-server) below.
- The DNS records from [DNS records](/installation/dns) and the reverse DNS from [Prepare the server](/installation/prepare-server#set-the-reverse-dns-ptr-record). If the mail server and the backend run on different machines, the A/AAAA records of `MAIL_HOSTNAME` and the reverse DNS point at the mail server, and those of `SITE_ADDRESS` at the machine that runs the reverse proxy in front of the backend.

## Build

mailer is built from its source code. Run the commands on this page as `root`; only the running backend gets its own, unprivileged user. Download the release you want to run (here `v1.0.0`) into `/opt/mailer`:

```bash
git clone --branch v1.0.0 --depth 1 https://github.com/schwarzdavid/mailer.git /opt/mailer
cd /opt/mailer
```

The repository pins its package manager, pnpm. Corepack, which ships with Node.js 24, installs that exact version; answer `Y` when it asks whether to download it:

```bash
corepack enable
pnpm install --frozen-lockfile
```

Build the admin UI. The build first builds the backend and the API client the admin UI depends on, so this one command builds everything:

```bash
pnpm build --filter frontend
```

## Put the admin UI where the backend serves it

With `NODE_ENV=production`, the backend serves the admin UI from `apps/backend/public` and refuses to start when `apps/backend/public/index.html` is missing. Copy the built admin UI there, replacing any older copy:

```bash
rm -rf apps/backend/public
cp -r apps/frontend/dist apps/backend/public
```

Repeat these two commands after every build.

## Create `.env`

The backend reads its settings from the file `.env` in the repository root, `/opt/mailer/.env`. Variables set in the environment of the process take precedence over the file. Start from the development template and replace its values:

```bash
cp .env.example .env
chmod 600 .env
```

The backend will run as its own user, which gets read access to this file [below](#run-the-backend-as-a-service).

Then edit `.env`, for example with `nano .env`, until it holds at least these lines with your values. [Environment variables](/configuration/environment) describes every variable; those not listed here can keep their defaults.

```text
NODE_ENV=production
PORT=8000
TRUST_PROXY=loopback
LOG_LEVEL=info

DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=mailer
DB_PASSWORD=the-database-password
DB_DATABASE=mailer

REDIS_HOST=127.0.0.1
REDIS_PORT=6379

BACKEND_JWT_SECRET=output-of-openssl-rand-base64-48
BACKEND_ENCRYPTION_SECRET=a-second-output-of-openssl-rand-base64-48

MAIL_HOSTNAME=mx.example.com

SMTP_HOST=mx.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_REQUIRE_TLS=true
SMTP_USER=bounce@mx.example.com
SMTP_PASSWORD=the-mailbox-password

IMAP_HOST=mx.example.com
IMAP_PORT=993
IMAP_SECURE=true
IMAP_USER=bounce@mx.example.com
IMAP_PASSWORD=the-mailbox-password
```

Generate each of the two secrets with `openssl rand -base64 48`, and use two different values. Remove the line `SMTP_REQUIRE_TLS=false` that the template contains for local development, or set it to `true` as above.

The lines in detail:

- **`NODE_ENV=production`** is required here. It makes the backend serve the admin UI, write its log as JSON lines and turn off the developer API browser at `/docs`.
- **`TRUST_PROXY=loopback`** trusts the client address that a reverse proxy on the same server reports, and only that one. If your proxy runs on another machine, use the number of proxies or their subnet instead; see [Reverse proxy](/configuration/reverse-proxy#trust-proxy).
- **`DB_*` and `REDIS_*`** point at your database and Redis. For TLS and private certificate authorities see [External Postgres and Redis](/configuration/external-postgres-redis#credentials-and-tls-in-env). Without Docker, `NODE_EXTRA_CA_CERTS` does **not** work in `.env`: Node.js reads it from the process environment when it starts, before the backend loads `.env`. Set it in the service unit instead, as shown in [Run the backend as a service](#run-the-backend-as-a-service).
- **`SMTP_*` and `IMAP_*`** are explained in the next section.

## Bring your own mail server

The backend does not deliver mail to recipients itself. It hands each mail to an SMTP server, which delivers it, and it reads the bounces, the automatic replies about undeliverable mail, from an IMAP mailbox. The Docker stack runs docker-mailserver for both jobs; without Docker your mail server takes them over.

Your mail server must:

- **Run under the name `MAIL_HOSTNAME`** (here `mx.example.com`) and on the IP addresses you enter in the setup wizard. The DNS records the admin UI asks for make `MAIL_HOSTNAME` its own mail exchanger (`MX`) and allow only those addresses to send for it (`SPF`).
- **Accept submitted mail** from the backend on `SMTP_HOST`/`SMTP_PORT`, logging in as `SMTP_USER` with `SMTP_PASSWORD`. The backend sends every mail with the return address (envelope sender) `bounce@mx.example.com` and a visible `From` address in your customers' domains, so the server must allow that login to use both. The backend signs every mail with DKIM itself; the server must not change the mail's content.
- **Offer STARTTLS** on the submission port, the command that encrypts a plain connection. With `SMTP_REQUIRE_TLS=true`, the default, the backend refuses to send through a server without it. Use `SMTP_PORT=465` with `SMTP_SECURE=true` instead for a server that speaks TLS from the first byte. Set `SMTP_REQUIRE_TLS=false` only for a test server on the same machine.
- **Hold the mailbox `bounce@mx.example.com`** and accept mail for it from the internet on port 25, because bounces come back to the return address. The backend reads that mailbox over IMAP with `IMAP_USER` and `IMAP_PASSWORD`: `IMAP_PORT=993` with `IMAP_SECURE=true` for TLS from the start, or `IMAP_PORT=143` with `IMAP_SECURE=false` for STARTTLS. Without `IMAP_HOST`, the backend reads no bounces at all and logs that polling is disabled.
- **Present a valid certificate** for the name the backend connects to. If that differs from the name on the certificate, set `SMTP_TLS_SERVERNAME` and `IMAP_TLS_SERVERNAME` to the certificate's name.

The backend marks bounce mails it has processed as read and never deletes them, so the bounce mailbox only grows. Clean it up from time to time with your mail server's own tools.

## Databases migrated by very old versions

Skip this section for a new database.

Very old versions of mailer stored the names of applied migrations with a `.ts` extension. If your database comes from such a version, every migration looks new to the current backend, which would then fail. Check the names first:

```bash
(set -a; . ./.env; PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d "$DB_DATABASE" -c 'SELECT name FROM "SequelizeMeta" ORDER BY name;')
```

If the names end in `.ts`, for example `001-create-users.ts`, remove the extension once, before the first start of the new version:

```bash
(set -a; . ./.env; PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d "$DB_DATABASE") <<'SQL'
UPDATE "SequelizeMeta" SET name = regexp_replace(name, '\.ts$', '');
SQL
```

## Migrations

The backend brings its database schema up to date by itself every time it starts, before it accepts requests. All pending migrations run in one transaction: if one fails, all of them are rolled back, the database is left as it was, and the backend exits with `Migration <name> (up) failed` in its log. Several backend instances starting at once are safe, because a database lock lets one of them migrate while the others wait.

You can also run the migrations without starting the backend, for example to see what an update will change. This command line tool needs only the `DB_*` variables and `BACKEND_ENCRYPTION_SECRET` from `.env`:

```bash
pnpm --filter backend migrate:prod pending
pnpm --filter backend migrate:prod executed
pnpm --filter backend migrate:prod up
```

`pending` lists the migrations that have not run yet, `executed` those that have, and `up` applies the pending ones. `down --to <name>` reverts the named migration and every one after it; do that only while the newer code that knows them is still installed.

## Run the backend as a service

A system service starts the backend at boot and restarts it when it stops. This example uses systemd and a dedicated user without a login shell. The backend only reads its files and writes its log to systemd, so the user needs no write access to `/opt/mailer`.

1. Create the user and let it read `.env`, which stays closed to everyone else:

    ```bash
    useradd --system --no-create-home --shell /usr/sbin/nologin mailer
    chown root:mailer /opt/mailer/.env
    chmod 640 /opt/mailer/.env
    ```

2. Create the service file:

    ```bash
    cat > /etc/systemd/system/mailer.service <<'EOF'
    [Unit]
    Description=mailer backend
    After=network-online.target
    Wants=network-online.target

    [Service]
    User=mailer
    WorkingDirectory=/opt/mailer/apps/backend
    ExecStart=/usr/bin/env node dist/main.js
    Restart=on-failure

    [Install]
    WantedBy=multi-user.target
    EOF
    ```

    If your Postgres or Redis uses a certificate from a private CA, save the CA file as `/opt/mailer/ca.pem`, make it readable with `chmod 644 /opt/mailer/ca.pem`, and add this line to the `[Service]` section, below `Restart=on-failure`:

    ```text
    Environment=NODE_EXTRA_CA_CERTS=/opt/mailer/ca.pem
    ```

    It must go here, not into `.env`: Node.js reads `NODE_EXTRA_CA_CERTS` from the process environment when it starts, before the backend loads `.env`.

3. Start it and enable it at boot:

    ```bash
    systemctl daemon-reload
    systemctl enable --now mailer
    ```

4. Read its log, which is the backend's JSON log described on [Logging](/configuration/logging):

    ```bash
    journalctl -u mailer -f
    ```

The backend listens on `PORT` (here `8000`) on every network interface of the server. Block that port in your firewall, so the backend is reachable only through the reverse proxy.

## Put an HTTPS reverse proxy in front

The backend speaks plain HTTP. Put a reverse proxy in front that terminates HTTPS for `app.example.com` and forwards every path to `http://127.0.0.1:8000`. With Caddy, the complete Caddyfile is below. Its global `log default` block replaces the `key` query parameter with `REDACTED` in every URL Caddy logs, including the error entries it writes when the backend does not answer, as the Docker stack's Caddyfile does:

```text
{
    log default {
        format filter {
            request>uri query {
                replace key REDACTED
            }
        }
    }
}

app.example.com {
    encode zstd gzip
    header X-Robots-Tag "noindex, nofollow"
    reverse_proxy 127.0.0.1:8000
}
```

Whatever proxy you use:

- it must pass the client address in `X-Forwarded-For`, and `TRUST_PROXY` must match it (see [Create `.env`](#create-env)). Caddy does this on its own; nginx only with `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` in the `location` that forwards to the backend. Without it, every visitor shares one rate-limit counter;
- it must accept request bodies of at least 8 MB, because the send API accepts large mails; nginx needs `client_max_body_size 8m;` or more;
- its access and error logs must not record the `key` query parameter, which can hold an API key. nginx, for example, writes the request line with the query string into both; [Reverse proxy](/configuration/reverse-proxy#turn-on-caddy-access-logs) shows the Caddy filter for access logs.

## Update

To update, stop the service, check out the new release, build, copy the admin UI again and start the service. The backend applies the new migrations when it starts.

```bash
systemctl stop mailer
cd /opt/mailer
git fetch --depth 1 origin tag v1.1.0
git checkout v1.1.0
pnpm install --frozen-lockfile
pnpm build --filter frontend
rm -rf apps/backend/public
cp -r apps/frontend/dist apps/backend/public
systemctl start mailer
```

Compare `.env.example` of the new release with your `.env` for new or renamed variables before you start.

## How you know it worked

- The service is running:

    ```bash
    systemctl is-active mailer
    ```

    ```text
    active
    ```

- Its log reports the start. On a new database it first lists each migration with `migrated <name>`, then:

    ```bash
    journalctl -u mailer --since today | grep 'Application is running on'
    ```

    The line ends with `"context":"Bootstrap","msg":"Application is running on: http://[::1]:8000"`; the address part depends on your server.

- The health endpoints answer through the proxy with `"status":"ok"`, and readiness lists `database`, `redis` and `smtp` as `up`:

    ```bash
    curl -s https://app.example.com/api/health
    curl -s https://app.example.com/api/health/ready
    ```

- `https://app.example.com` shows the setup wizard on a new installation, or the login page otherwise. Continue with [First-run setup](/installation/first-run-setup), reading the setup token with `journalctl -u mailer | grep "Setup token"` instead of `docker compose logs`.
- The log does not contain `IMAP_HOST is not configured, bounce mailbox polling is disabled`:

    ```bash
    journalctl -u mailer | grep -c 'bounce mailbox polling is disabled'
    ```

    ```text
    0
    ```
