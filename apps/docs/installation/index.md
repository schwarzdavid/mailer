# Installation

This page takes a fresh server to a running mailer that waits for you in its setup wizard. The examples use `app.example.com` for the admin UI, `mx.example.com` for the mail server and `203.0.113.10` for the server's address; replace them with yours.

## Before you start

- **A Linux server** (`amd64`, about 2 GB RAM) with a fixed public IPv4 address and nothing else listening on ports 25, 80 and 443.
- **Docker Engine with Compose 2.23.1 or newer.** See Docker's [installation guide](https://docs.docker.com/engine/install/).
- **Outbound port 25.** Many providers block it for new accounts (Hetzner Cloud, for example) and unblock it on request. Everything installs without it, but no mail leaves the server until it is open.
- **Two DNS names pointing at the server.** Create an `A` record for both `app.example.com` and `mx.example.com` with the server's IPv4 address, and an `AAAA` record for each if the server has IPv6. Caddy requests the TLS certificates on the first start, so the records must resolve before you start the stack. With Cloudflare or a similar provider, set them to **DNS only**, not proxied.

The other mail records (MX, SPF, DKIM, DMARC and the reverse DNS) come later: the setup wizard lists them with the exact values once mailer has generated its DKIM key.

## Create the install directory

Everything mailer needs on the server lives in one directory; the data itself lives in Docker volumes.

```bash
mkdir -p /opt/mailer
cd /opt/mailer
```

## Copy the files

Save these three files in `/opt/mailer` under the names on the tabs: the stack, its settings, and the script that completes the settings and creates the bounce mailbox.

::: code-group

<<< @/../../deploy/compose.yml [compose.yml]

<<< @/../../deploy/.env.example{dotenv} [.env]

<<< @/../../deploy/setup.sh [setup.sh]

:::

Then make `.env` readable only by `root`, because it is about to hold your secrets:

```bash
chmod 600 .env
```

## Fill in `.env`

| Key                | What to put in                                                                                                                                                                                                                         |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SITE_ADDRESS`     | The name of the admin UI and the API, for example `app.example.com`. Only the name: no `https://`, no path. Your websites post their forms here.                                                                                       |
| `IMAGE_TAG`        | The mailer version to run. Replace `latest` with the release you install, without the leading `v` (`1.0.0` for `v1.0.0`), so an update never happens by accident.                                                                      |
| `DB_DATABASE`      | The database name. Keep `mailer`.                                                                                                                                                                                                      |
| `DB_USERNAME`      | The database user. Keep `mailer`.                                                                                                                                                                                                      |
| `MAIL_HOSTNAME`    | The name of the mail server, for example `mx.example.com`. It must differ from `SITE_ADDRESS`. It is also mailer's own sending domain: every mail leaves with the envelope sender `bounce@mx.example.com`, so bounces come back to it. |
| `MAIL_SERVER_IPV4` | The server's public IPv4 address, the one the `A` record of `mx.example.com` points to. mailer builds the A, SPF and PTR records of its sending domain from it.                                                                        |
| `MAIL_SERVER_IPV6` | Optional; add the line yourself. The server's public IPv6 address, if you created an `AAAA` record for `mx.example.com`. mailer then adds it to the SPF record and lists an AAAA and a second PTR record.                              |

Leave the four secrets empty: `DB_PASSWORD`, `BACKEND_JWT_SECRET`, `BACKEND_ENCRYPTION_SECRET` and `MAIL_PASSWORD`. `setup.sh` fills every empty one with a random value and never touches one that is already set.

::: warning Choose MAIL_HOSTNAME with your sender domains in mind
mailer keeps one domain per registrable domain (the part you buy at a registrar), and its own sending domain already occupies the one of `MAIL_HOSTNAME`. With `mx.example.com`, no sender domain under `example.com` can be added later. Put `MAIL_HOSTNAME` under a domain your websites will not send from, and use another one for their sender domains, for example `mail.example.net`.
:::

Every other setting keeps its default until you add it; [Advanced configuration](/installation/advanced-configuration) lists them all.

## Start mailer

```bash
sh setup.sh
```

The script generates the empty secrets, starts the stack with `docker compose up -d`, waits for the mail server and then creates the bounce mailbox `bounce@mx.example.com` and the alias `postmaster@mx.example.com`. The first start takes a few minutes. The `mail` service restarts until Caddy has obtained the certificate for `MAIL_HOSTNAME`, which it reuses; that is expected, and the script waits up to ten minutes for it.

If it stops with `the mail service did not accept the account within 10 minutes`, Caddy could not get a certificate, usually because a DNS record does not point at the server yet. `docker compose logs proxy` shows why; run `sh setup.sh` again once it is fixed. Running it again is always safe.

::: danger Back up .env now
`BACKEND_ENCRYPTION_SECRET` encrypts the DKIM keys and reCAPTCHA secrets in the database. Without it, a database backup cannot restore them, and changing it later makes them unreadable. Copy the whole `.env` to a password manager or another safe place outside this server, and never change that secret.
:::

## Get the setup token

While no user exists, the backend writes a one-time setup token to its log, so only someone with access to the server can create the first account:

```bash
docker compose logs backend | grep "Setup token"
```

The token is the 32 hexadecimal characters after `Setup token:`. Every restart of the backend before the first account exists creates a new one, so if there are several lines, use the last.

Open `https://app.example.com` and continue with the [first-run setup](/installation/first-run-setup).
