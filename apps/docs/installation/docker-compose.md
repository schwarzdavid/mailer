# Docker Compose

This page downloads mailer's compose file, fills in the settings file `.env`, starts the stack and creates the bounce mailbox. At the end all five containers run and the backend waits for you in the setup wizard.

Work in the install directory for the whole page:

```bash
cd /opt/mailer
```

## Download the compose file and the settings template

mailer is released on GitHub. Each release has a tag such as `v1.0.0`, and the files for that release live at:

```text
https://raw.githubusercontent.com/schwarzdavid/mailer/<tag>/deploy/compose.yml
https://raw.githubusercontent.com/schwarzdavid/mailer/<tag>/deploy/.env.example
```

`<tag>` is the release tag you install, exactly as it appears on the repository's releases page, for example `v1.0.0`. Always take both files from the same tag as the image you run, so the compose file matches what the backend expects.

Set the tag once and download both files. `compose.yml` keeps its name, `.env.example` is saved as `.env`:

```bash
TAG=v1.0.0
curl -fsSLO "https://raw.githubusercontent.com/schwarzdavid/mailer/$TAG/deploy/compose.yml"
curl -fsSL -o .env "https://raw.githubusercontent.com/schwarzdavid/mailer/$TAG/deploy/.env.example"
chmod 600 .env
```

`chmod 600` makes `.env` readable only by `root`, because it is about to hold your secrets.

The image itself, `ghcr.io/schwarzdavid/mailer`, is public; you do not need to log in to any registry.

## Fill in `.env`

`.env` holds every setting compose and the backend need. The template contains only the keys below, in this order; the required ones must have a value before the first start. Optional settings such as `LOG_LEVEL` or the [rate limits](/configuration/rate-limits) keep their defaults until you add them; all of them are on [Environment variables](/configuration/environment).

### Generate the secrets

Four keys are secrets you generate rather than choose. Each needs a long random value, which this command creates (64 characters):

```bash
openssl rand -base64 48
```

The following loop writes a fresh value into each of the four keys in one go:

```bash
for key in DB_PASSWORD BACKEND_JWT_SECRET BACKEND_ENCRYPTION_SECRET MAIL_PASSWORD; do
    sed -i "s|^$key=.*|$key=$(openssl rand -base64 48)|" .env
done
```

### Set the names, the addresses and the version

Set your two host names, the server's public IP address and the image version. Replace the example values with yours; `IMAGE_TAG` is the release tag without the leading `v`:

```bash
sed -i 's|^SITE_ADDRESS=.*|SITE_ADDRESS=app.example.com|' .env
sed -i 's|^MAIL_HOSTNAME=.*|MAIL_HOSTNAME=mx.example.com|' .env
sed -i 's|^MAIL_SERVER_IPV4=.*|MAIL_SERVER_IPV4=203.0.113.10|' .env
sed -i 's|^IMAGE_TAG=.*|IMAGE_TAG=1.0.0|' .env
```

If the server has a public IPv6 address and you created the AAAA record for `mx.example.com`, add it as well:

```bash
echo 'MAIL_SERVER_IPV6=2001:db8::10' >> .env
```

You can also edit the file by hand with `nano .env`.

### Every key in the template

| Key                         | Required         | Put in it                                                                                                                                                                                                                                                                                     |
| --------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SITE_ADDRESS`              | Required         | The host name of the admin UI and API, for example `app.example.com`. Only the name: no `https://`, no path. Compose refuses to start while it is empty.                                                                                                                                      |
| `IMAGE_TAG`                 | Optional, pin it | The version of the mailer image to run: the release tag without the `v`, for example `1.0.0` for `v1.0.0`. The template says `latest`; replace it, so the running image always matches the `compose.yml` you downloaded. A tag of the form `sha-<7 characters>` (the commit) also works.      |
| `DB_DATABASE`               | Required         | The name of the database. Keep `mailer`.                                                                                                                                                                                                                                                      |
| `DB_USERNAME`               | Required         | The database user. Keep `mailer`.                                                                                                                                                                                                                                                             |
| `DB_PASSWORD`               | Required         | A generated secret. The bundled Postgres creates the database with it on the very first start only. Changing it later in `.env` alone locks the backend out of the database; the [Rotating secrets](/operations/rotating-secrets#db-password) page under Operations shows the full procedure. |
| `BACKEND_JWT_SECRET`        | Required         | A generated secret of at least 32 characters. It signs the login sessions of the admin UI; changing it signs everybody out.                                                                                                                                                                   |
| `BACKEND_ENCRYPTION_SECRET` | Required         | A generated secret of at least 32 characters, different from the JWT secret. It encrypts the DKIM private keys and reCAPTCHA secrets stored in the database. **Back it up now**, see below.                                                                                                   |
| `MAIL_HOSTNAME`             | Required         | The name of the mail server and mailer's sending domain, for example `mx.example.com`. It must differ from `SITE_ADDRESS`. Compose refuses to start while it is empty.                                                                                                                        |
| `MAIL_SERVER_IPV4`          | Required         | The public IPv4 address of the server, for example `203.0.113.10`: the address the A record of `mx.example.com` points to. mailer builds the A, SPF and PTR records of the sending domain from it. The backend refuses to start while it is empty.                                            |
| `MAIL_PASSWORD`             | Required         | A generated secret: the password of the bounce mailbox `bounce@mx.example.com`. You create the mailbox with this password further down; compose passes it to the backend for sending and for reading bounces.                                                                                 |

Everything else the backend needs (database host, Redis, the mail server connection) is set by `compose.yml` itself; a value for those keys in `.env` has no effect. [Environment variables](/configuration/environment) lists which.

Check the result:

```bash
cat .env
```

```text
SITE_ADDRESS=app.example.com
IMAGE_TAG=1.0.0

DB_DATABASE=mailer
DB_USERNAME=mailer
DB_PASSWORD=Vt2c…

BACKEND_JWT_SECRET=q9Lm…
BACKEND_ENCRYPTION_SECRET=Hc4W…

MAIL_HOSTNAME=mx.example.com
MAIL_SERVER_IPV4=203.0.113.10
MAIL_PASSWORD=Zr8k…
```

The four secrets show your own 64-character values. No line may end with a bare `=`.

::: danger Back up BACKEND_ENCRYPTION_SECRET now
mailer encrypts every DKIM private key and every reCAPTCHA secret in the database with `BACKEND_ENCRYPTION_SECRET`. If you lose it, or change it, a database backup is worthless for those values: the keys cannot be decrypted, and every domain needs a new DKIM key and new DNS records. Copy the whole `.env` file to a password manager or another safe place outside this server now, and keep it with your database backups. Print it with:

```bash
cat /opt/mailer/.env
```

:::

## Start the stack

Download the images and start all services in the background:

```bash
docker compose pull && docker compose up -d
```

`up -d` returns once the backend reports healthy, which takes up to a minute or two on the first start: the backend first creates its database schema (it applies the migrations itself every time it starts), then Caddy starts and requests the certificates for your two names.

## Create the bounce mailbox

Create the bounce mailbox and the `postmaster` alias as soon as the mail server runs. The `mail` service restarts until Caddy has obtained the certificate for `MAIL_HOSTNAME`, so first wait until `docker compose ps` shows `mail` as `Up`. From then on docker-mailserver waits two minutes for its first account and then restarts, so run both commands within those two minutes; if you miss the window, run them again once the container is back up. The accounts persist in the `mail-config` volume. The commands read `.env` in a subshell: values exported into your own shell would override later edits to `.env` in every following `docker compose` call.

```bash
(set -a; . ./.env; docker compose exec mail setup email add "bounce@$MAIL_HOSTNAME" "$MAIL_PASSWORD")
(set -a; . ./.env; docker compose exec mail setup alias add "postmaster@$MAIL_HOSTNAME" "bounce@$MAIL_HOSTNAME")
```

The first command creates the mailbox `bounce@mx.example.com`, which receives bounce reports and which the backend uses to send and to read bounces. The second makes `postmaster@mx.example.com`, an address every mail server is expected to have, deliver into the same mailbox.

If `docker compose exec` answers that the container is restarting or not running, wait until `docker compose ps mail` shows it as `Up` and run both commands again.

## Why `mail` restarts at first

The mail server encrypts its connections with the certificate Caddy obtains for `MAIL_HOSTNAME`, read from Caddy's data volume. On the very first start Caddy does not have it yet: Caddy starts only after the backend is healthy, and then needs a few seconds to a few minutes to get the certificate from Let's Encrypt. Until then `mail` restarts and shows as unhealthy. It comes up on its own once the certificate is there; you do not need to do anything.

Caddy renews the certificate about every 60 days, and the mail server picks up the renewed certificate without a restart.

If `mail` is still restarting after ten minutes, Caddy could not get the certificate. The usual causes are an A record for `mx.example.com` that does not point to this server yet, or port 80 or 443 blocked by a firewall. Check the proxy's log:

```bash
docker compose logs proxy | grep -i error
```

## How you know it worked

A few minutes after `up -d`, list the services:

```bash
docker compose ps --format "table {{.Service}}\t{{.Status}}"
```

```text
SERVICE    STATUS
backend    Up 4 minutes (healthy)
mail       Up 2 minutes (healthy)
postgres   Up 4 minutes (healthy)
proxy      Up 3 minutes
redis      Up 4 minutes (healthy)
```

`backend`, `mail`, `postgres` and `redis` are `healthy`; `proxy` is `Up` without a health state because it defines no health check. The order of the lines may differ.

The backend has written a setup token to its log, which the next page needs:

```bash
docker compose logs backend | grep "Setup token"
```

The output contains `No user exists yet. Setup token:` followed by 32 hexadecimal characters.

Continue with [First-run setup](/installation/first-run-setup).
