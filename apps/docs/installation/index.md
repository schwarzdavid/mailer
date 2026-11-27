# Installation

This page takes a fresh server to a running mailer that waits for you in its setup wizard. You download one script, answer a few questions, and keep the recovery kit it prints. The examples use `app.example.com` for the admin UI, `mx.example.com` for the mail server and `203.0.113.10` for the server's address; replace them with yours.

## Before you start

- **A Linux server** (`amd64`, about 2 GB RAM) with a fixed public IPv4 address and nothing else listening on ports 25, 80 and 443.
- **Docker Engine with Compose 2.23.1 or newer**, and `curl`. See Docker's [installation guide](https://docs.docker.com/engine/install/). Run the commands below as a user that may use Docker, usually `root`.
- **Outbound port 25.** Many providers block it for new accounts (Hetzner Cloud, for example) and unblock it on request. Everything installs without it, but no mail leaves the server until it is open.
- **Two DNS names pointing at the server.** Create an `A` record for both `app.example.com` and `mx.example.com` with the server's IPv4 address, and an `AAAA` record for each if the server has IPv6. Caddy requests the TLS certificates on the first start, so the records must resolve before you start the stack. With Cloudflare or a similar provider, set them to **DNS only**, not proxied.

The other mail records (MX, SPF, DKIM, DMARC and the reverse DNS) come later: the setup wizard lists them with the exact values once mailer has generated its DKIM key.

## Download mailer.sh and run the setup

Everything mailer needs on the server lives in one directory; the data itself lives in Docker volumes. The only file you download yourself is the launcher `mailer.sh`. It runs the setup wizard from the mailer image, then starts the stack.

```bash
mkdir -p /opt/mailer
cd /opt/mailer
curl -fsSLO https://github.com/schwarzdavid/mailer/releases/latest/download/mailer.sh
sh mailer.sh setup
```

`mailer.sh` pulls the image `ghcr.io/schwarzdavid/mailer:latest`, runs the wizard in it and writes `compose.yml` and a fresh copy of `mailer.sh` next to your answers. The wizard pins the version of the image it ran from as `IMAGE_TAG` in `.env`, so an update never happens by accident. To install a specific release instead, add `--image-tag 1.0.0` (the version without the leading `v`): `sh mailer.sh setup --image-tag 1.0.0`.

## What the wizard asks

| Question                                                                      | What to answer                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SITE_ADDRESS`                                                                | The name of the admin UI and the API, for example `app.example.com`. Only the name: no `https://`, no path. Your websites post their forms here.                                                                                                                                                                        |
| `MAIL_HOSTNAME`                                                               | The name of the mail server, for example `mx.example.com`. It must differ from `SITE_ADDRESS`. It is also mailer's own sending domain: every mail leaves with the envelope sender `bounce@mx.example.com`, so bounces come back to it. The wizard says so when the name does not resolve yet; create its records first. |
| `MAIL_SERVER_IPV4`                                                            | The server's public IPv4 address, the one the `A` record of `mx.example.com` points to. The wizard offers the address the name resolves to. mailer builds the A, SPF and PTR records of its sending domain from it.                                                                                                     |
| `MAIL_SERVER_IPV6`                                                            | Optional; leave it empty without IPv6. The server's public IPv6 address, if you created an `AAAA` record for `mx.example.com`. mailer then adds it to the SPF record and lists an AAAA and a second PTR record.                                                                                                         |
| How should the secrets be provided? (shown only when a secret is still empty) | **Generate them into `.env`** (the default), **type them in** (the wizard asks for each one and generates the ones you leave empty) or **keep them outside `.env`** with a [secrets wrapper](/installation/advanced-configuration#secrets-from-a-secret-manager).                                                       |

The wizard never overwrites a secret that is already set in `.env`, and it never changes `BACKEND_ENCRYPTION_SECRET`. It also writes `DB_DATABASE=mailer` and `DB_USERNAME=mailer` when they are missing. Every other setting keeps its default until you add it; [Advanced configuration](/installation/advanced-configuration) lists them all.

::: warning Choose MAIL_HOSTNAME with your sender domains in mind
mailer keeps one domain per registrable domain (the part you buy at a registrar), and its own sending domain already occupies the one of `MAIL_HOSTNAME`. With `mx.example.com`, no sender domain under `example.com` can be added later. Put `MAIL_HOSTNAME` under a domain your websites will not send from, and use another one for their sender domains, for example `mail.example.net`. The wizard shows this warning before it asks for `MAIL_HOSTNAME`.
:::

## What setup does next

After the wizard has written `.env`, `compose.yml` and `mailer.sh`, the launcher starts the stack with `docker compose up -d --pull missing`, waits for the mail server and then creates the bounce mailbox `bounce@mx.example.com` and the alias `postmaster@mx.example.com`:

```text
Waiting for the mail service (it restarts until Caddy has the certificate for mx.example.com)...
Created the mailbox bounce@mx.example.com.
Created the alias postmaster@mx.example.com -> bounce@mx.example.com.
mailer runs at https://app.example.com. Setup token for the first login: sh mailer.sh token
```

The first start takes a few minutes. The `mail` service restarts until Caddy has obtained the certificate for `MAIL_HOSTNAME`, which it reuses; that is expected, and the launcher waits up to ten minutes for it.

The launcher does not use docker-mailserver's `setup email` command for the mailbox, because that would put the password on a command line inside the container. It sends the password to a small script in the `mail` container through standard input; the script hashes it with `doveadm` and writes the account line (the address in lower case) into `postfix-accounts.cf` on the `mail-config` volume. If the hash cannot be made, the launcher stops with `could not hash the mailbox password`.

If it stops with `the mail service did not accept the account within 10 minutes`, Caddy could not get a certificate, usually because a DNS record does not point at the server yet. `sh mailer.sh compose logs proxy mail` shows why; run `sh mailer.sh setup` again once it is fixed. Running it again is always safe: it shows your current answers as the defaults, never overwrites a secret and sets the mailbox password from `.env` again.

## Keep the recovery kit

When the wizard has generated secrets, it prints the recovery kit before the stack starts:

```text
Site: app.example.com
Mail hostname: mx.example.com
Version: 1.0.0
DB_PASSWORD=…
BACKEND_JWT_SECRET=…
BACKEND_ENCRYPTION_SECRET=…
MAIL_PASSWORD=…
Encryption secret fingerprint: 3f9a2c1d7b4e8a60
Store this recovery kit in a password manager. A database backup is worthless without BACKEND_ENCRYPTION_SECRET.
```

::: danger Store the recovery kit now
`BACKEND_ENCRYPTION_SECRET` encrypts the DKIM keys and reCAPTCHA secrets in the database. Without it, a database backup cannot restore them, and changing it later makes them unreadable. Copy the whole kit to a password manager or another safe place outside this server, and never change that secret. mailer does not write the kit to a file.
:::

The fingerprint identifies the encryption secret without revealing it: after a restore you compare it with the one in your kit to see that you hold the right secret. Print the kit again at any time:

```bash
sh mailer.sh recovery-kit
```

With a secrets wrapper, a secret that the wrapper provides is read from the environment, and the kit shows `(not available)` for one that neither the wrapper nor `.env` provides.

## Get the setup token

While no user exists, the backend writes a one-time setup token to its log, so only someone with access to the server can create the first account:

```bash
sh mailer.sh token
```

```text
3f9a2c1d7b4e8a6f0c5d2e1b9a8f7c6d
```

The token is the 32 hexadecimal characters the command prints. Every restart of the backend before the first account exists creates a new one; the command prints the newest. If it answers `No setup token in the backend log; a user already exists or the backend has not started.`, see [Troubleshooting](/operations/troubleshooting#no-setup-token-in-the-log).

Open `https://app.example.com` and continue with the [first-run setup](/installation/first-run-setup).

## Unattended installation

For a script, a provisioning tool or a cloud-init file, prepare `.env` before you run the setup. With the three required settings filled, the wizard asks nothing:

```bash
mkdir -p /opt/mailer
cd /opt/mailer
curl -fsSLO https://github.com/schwarzdavid/mailer/releases/latest/download/mailer.sh
cat > .env <<'ENV'
SITE_ADDRESS=app.example.com
IMAGE_TAG=latest

DB_DATABASE=mailer
DB_USERNAME=mailer
DB_PASSWORD=

BACKEND_JWT_SECRET=
BACKEND_ENCRYPTION_SECRET=

MAIL_HOSTNAME=mx.example.com
MAIL_SERVER_IPV4=203.0.113.10
MAIL_PASSWORD=
ENV
chmod 600 .env
sh mailer.sh setup --yes
```

Empty secrets are generated, set ones are kept, `IMAGE_TAG=latest` is replaced by the version of the image, and `MAIL_SERVER_IPV6` is optional. `--yes` accepts every default and never prompts, so the run also works without a terminal. The recovery kit is printed at the end, so capture the output of the run.

Every answer also has an option, which wins over `.env`: `--site-address`, `--mail-hostname`, `--mail-ipv4`, `--mail-ipv6`, `--image-tag`, `--secrets generate|prompt|external` and `--secrets-wrapper <command>`. A run without a terminal that lacks a required setting stops with `Missing settings: …`.

## Coming from a manual installation

Installations made with the older instructions have a hand-copied `compose.yml`, a `.env` and a `setup.sh`. `sh mailer.sh setup` adopts such a directory; your data stays in the Docker volumes.

1. Take a [database backup](/operations/backup-restore#back-up-the-database) first.
2. The wizard runs inside the image named by `IMAGE_TAG` in your `.env`, and only the releases from the one that introduced `mailer.sh` onward contain the wizard. If your `.env` pins an older version, set `IMAGE_TAG` to `latest` (or to a newer release) first. The wizard then replaces `latest` with the version of the image, so the adoption also brings mailer to that version, and the backend applies its database migrations when it starts:

    ```bash
    cd /opt/mailer
    sed -i 's|^IMAGE_TAG=.*|IMAGE_TAG=latest|' .env
    ```

3. Download `mailer.sh` into the existing install directory and run the setup there:

    ```bash
    curl -fsSLO https://github.com/schwarzdavid/mailer/releases/latest/download/mailer.sh
    sh mailer.sh setup
    ```

4. The wizard shows the values of your `.env` as its defaults. It keeps your secrets, writes the new `compose.yml` and `mailer.sh`, pins `IMAGE_TAG` and removes `setup.sh`.
5. If you had edited `compose.yml`, the wizard keeps your file as `compose.yml.legacy` and tells you to move the differences you still need into `compose.override.yml` ([how](/installation/advanced-configuration#changing-the-compose-file)). A `compose.yml` identical to a released one is simply replaced.

From here on, [update](/operations/updating) with `sh mailer.sh update --to <version>`.
