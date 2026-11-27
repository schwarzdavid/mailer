# Backup and restore

This page says what of a mailer installation you must back up and why, how to take the backups, and how to restore them on a fresh server. At the end you have a backup routine and a tested way back from a lost server.

All commands run on the server in the install directory:

```bash
cd /opt/mailer
```

## What to back up

Three things cannot be recreated if the server is lost:

- **The database** in the volume `postgres-data`: users, roles, projects, domains with their DKIM keys, forms, templates, API keys, sent mail, bounces and blocked addresses.
- **The file `.env`**, above all `BACKEND_ENCRYPTION_SECRET`. mailer encrypts every DKIM private key and every reCAPTCHA secret in the database with it. A database backup restored with a different secret has no usable DKIM keys and no usable reCAPTCHA secrets.
- **The mail server's accounts** in the volume `mail-config`: the bounce mailbox `bounce@mx.example.com` and the alias `postmaster@mx.example.com`. They are small and `sh mailer.sh setup` recreates them, so backing them up is optional unless you added accounts or aliases of your own.

`compose.yml` and `mailer.sh` come with the release, so note its version (`IMAGE_TAG` in `.env`, or `sh mailer.sh version`) instead of saving them. Keep your `compose.override.yml` if you have one ([Changing the compose file](/installation/advanced-configuration#changing-the-compose-file)).

`compose.yml` has eight volumes. Docker names each volume `mailer_` plus its name in the file, for example `mailer_postgres-data`:

| Volume          | Holds                                                                                            | Back up  | Why                                                                                                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `postgres-data` | The PostgreSQL database                                                                          | Yes      | All of mailer's data. Back it up with `pg_dump` (below), not by copying the volume while Postgres runs.                                                                            |
| `mail-config`   | docker-mailserver's accounts and aliases                                                         | Optional | The bounce mailbox and the `postmaster` alias; `sh mailer.sh setup` recreates them.                                                                                                |
| `redis-data`    | Redis: the queue of form deliveries waiting to be sent, rate-limit counters, a short-lived cache | No       | The database is the record of every delivery: on a new server, the recovery sweep queues deliveries that are still `pending` again. Counters and cache start empty.                |
| `caddy-data`    | Caddy's TLS certificates and keys for `SITE_ADDRESS` and `MAIL_HOSTNAME`                         | No       | Caddy obtains new certificates from Let's Encrypt on the first start of a new server, once DNS points to it.                                                                       |
| `caddy-config`  | Caddy's own saved configuration                                                                  | No       | The Caddyfile lives in `compose.yml`; Caddy rebuilds this on every start.                                                                                                          |
| `mail-data`     | The bounce mailbox: every bounce report the mail server received                                 | No       | The backend reads each report once a minute and stores the result in the database. Already processed reports are only kept, never read again.                                      |
| `mail-state`    | docker-mailserver's runtime state, including the queue of outgoing mail it has not delivered yet | No       | It holds no settings. On a planned move, let the queue drain first (see [Move to a new server](#move-to-a-new-server)); after a crash, mail still in the queue is lost either way. |
| `mail-logs`     | docker-mailserver's own log files                                                                | No       | Logs only.                                                                                                                                                                         |

## Back up the database

`pg_dump` writes a consistent copy of the database while mailer keeps running. It runs inside the `postgres` container, so nothing needs to be installed on the server:

```bash
sh mailer.sh compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "mailer-$(date +%F).dump"
```

This writes a compressed dump such as `mailer-2026-10-23.dump` into `/opt/mailer`. `-Fc` selects PostgreSQL's custom format, which `pg_restore` reads. `-T` keeps Docker from adding terminal control characters to the output. The shell inside the container reads the database user and name from the container's own environment, so neither `.env` nor a password appears on the command line.

Check that the dump is complete; `pg_restore --list` prints its table of contents and fails on a broken file:

```bash
sh mailer.sh compose exec -T postgres pg_restore --list < "mailer-$(date +%F).dump" | head -n 5
```

### Dump every night

A cron job takes the dump every night at 03:15 and deletes dumps older than 14 days, so about two weeks of dumps stay:

```bash
mkdir -p /opt/mailer/backups
cat > /etc/cron.d/mailer-backup <<'CRON'
15 3 * * * root cd /opt/mailer && sh mailer.sh compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "backups/mailer-$(date +\%F).dump" && find backups -name 'mailer-*.dump' -mtime +14 -delete
CRON
```

The `%` sign is escaped as `\%` because cron treats a bare `%` as the end of the command. Copy the dumps off the server as well, for example with `scp` or your provider's backup storage: a dump on the same disk does not survive the loss of that server.

With an [external Postgres](/installation/advanced-configuration#database-tls) the bundled database server stays unused. Run `pg_dump` from a one-off container of the `postgres` service instead: `--no-deps` keeps the database server from starting, so the container only runs the client, and Compose hands it the credentials from `.env` or your secret manager, so the password is on no command line. Replace `db.example.com` with your database host:

```bash
sh mailer.sh compose run --rm -T --no-deps postgres sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -h db.example.com -p 5432 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "mailer-$(date +%F).dump"
```

The nightly cron job takes the same form:

```bash
mkdir -p /opt/mailer/backups
cat > /etc/cron.d/mailer-backup <<'CRON'
15 3 * * * root cd /opt/mailer && sh mailer.sh compose run --rm -T --no-deps postgres sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -h db.example.com -p 5432 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "backups/mailer-$(date +\%F).dump" && find backups -name 'mailer-*.dump' -mtime +14 -delete
CRON
```

With a [secrets wrapper](/installation/advanced-configuration#secrets-from-a-secret-manager), the cron job runs under that wrapper too, without a terminal and without you: it needs a wrapper that works unattended, for example one that authenticates with a service account token instead of an interactive sign-in.

## Back up `.env` and the mail accounts

Copy `.env` to a safe place outside the server, for example a password manager, once after the installation and again after every change. Print it with:

```bash
cat /opt/mailer/.env
```

`sh mailer.sh recovery-kit` prints the four secrets and the fingerprint of the encryption secret, which is enough to rebuild the secrets of `.env`; keep it together with the rest of `.env`. If you keep the secrets in a [secret manager](/installation/advanced-configuration#secrets-from-a-secret-manager), they are not in `.env`, and the manager is their backup.

::: danger A dump without its BACKEND_ENCRYPTION_SECRET is incomplete
If the server is lost and the `.env` file with it, a database dump alone brings back users, projects and forms, but not the DKIM keys and reCAPTCHA secrets: they cannot be decrypted without the original `BACKEND_ENCRYPTION_SECRET`. Every sender domain then needs a new DKIM key and new DNS records, and every reCAPTCHA check its secret again. Keep `.env` together with the dumps.
:::

If you want the mail server's accounts as well, pack the `mail-config` volume into an archive:

```bash
docker run --rm -v mailer_mail-config:/data:ro -v "$PWD":/backup alpine tar czf /backup/mail-config.tar.gz -C /data .
```

## Restore on a new server

The procedure sets up a new server from the backups: the same `.env`, the same release, the database restored before the backend starts for the first time.

::: danger Restore into an empty database only
The backend creates every table itself the first time it starts. If it starts before the restore, the restore collides with those tables and fails. Start only `postgres` until the restore is done. Never restore into the database of a running installation; on the old server, `sh mailer.sh compose down -v` would delete all its volumes, including the database, so never run it there while you still need its data.
:::

1. **Prepare the server and DNS** as on [Installation](/installation/#before-you-start): Docker, outbound port 25, and the A and AAAA records of `app.example.com` and `mx.example.com` pointing to the new server. Set the PTR record of the new IP address to `mx.example.com` at your hosting provider.

2. **Download the same release** that wrote the dump, with the tag from your notes. Take `compose.yml` and `mailer.sh` of that tag, because you bring your own `.env` and need `compose.yml` to start Postgres alone. The release must ship `mailer.sh`; for a dump of an older release, use the first one that does, and the backend then applies the newer migrations itself when it starts:

    ```bash
    mkdir -p /opt/mailer
    cd /opt/mailer
    TAG=v1.0.0
    curl -fsSLO "https://raw.githubusercontent.com/schwarzdavid/mailer/$TAG/deploy/compose.yml"
    curl -fsSLO "https://raw.githubusercontent.com/schwarzdavid/mailer/$TAG/deploy/mailer.sh"
    ```

3. **Put the saved `.env` back** as `/opt/mailer/.env` and make it readable only by `root`:

    ```bash
    chmod 600 /opt/mailer/.env
    grep -c '^BACKEND_ENCRYPTION_SECRET=.\+' /opt/mailer/.env
    ```

    The `grep` prints `1`: the secret is set. It must be exactly the value of the old server.

4. **Copy the dump** to `/opt/mailer`, for example as `mailer.dump`.

5. **Start only Postgres** and wait until it is healthy:

    ```bash
    sh mailer.sh compose pull
    sh mailer.sh compose up -d postgres
    sh mailer.sh compose ps postgres
    ```

    The `STATUS` column shows `healthy` after a few seconds. Postgres has now created the empty database `mailer` with the user and password from `.env`.

6. **Restore the dump** into it:

    ```bash
    sh mailer.sh compose exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner' < mailer.dump
    ```

    No output means success. `--no-owner` gives every restored object to the database user from `.env`, so the restore also works if the user name changed.

    If the new installation uses an external Postgres instead of the bundled one, restore into that database from a one-off container of the `postgres` service before you start the backend:

    ```bash
    sh mailer.sh compose run --rm -T --no-deps postgres sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_restore -h db.example.com -p 5432 -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner' < mailer.dump
    ```

7. **Restore the mail accounts, if you backed them up.** Skip this step if you did not; step 8 recreates them instead. The archive must go into the volume before `mail` starts for the first time. `sh mailer.sh compose create mail` creates the `mail` container and its volumes without starting it; copy `mail-config.tar.gz` to `/opt/mailer` and unpack it into the volume:

    ```bash
    sh mailer.sh compose create mail
    docker run --rm -v mailer_mail-config:/data -v "$PWD":/backup alpine tar xzf /backup/mail-config.tar.gz -C /data
    ```

8. **Start the rest of the stack** with the setup, as on the first installation. It reads your `.env`, so it asks nothing:

    ```bash
    sh mailer.sh setup --yes
    ```

    The backend applies no migrations, because the restored database already has them, and logs no setup token, because users exist. `mail` restarts until Caddy has obtained the certificate for `mx.example.com` ([What setup does next](/installation/#what-setup-does-next)); the setup waits for it. It then creates the bounce mailbox and the `postmaster` alias, or, if you restored the mail accounts in step 7, sets the password from `.env` on the restored mailbox.

9. **Update the server addresses** if the new server has a different IP address: in the admin UI, follow [Change the server IP addresses](/admin-guide/settings#change-the-server-ip-addresses). The SPF record of `mx.example.com` lists the addresses, so it must be updated too.

## Move to a new server

A planned move is a restore with a fresh dump. On the old server, in this order:

1. Stop the backend, so nothing changes after the dump: `sh mailer.sh compose stop backend`.
2. Let the mail server deliver what it still holds. Repeat until it prints `Mail queue is empty`:

    ```bash
    sh mailer.sh compose exec mail postqueue -p
    ```

3. Take the dump as above and copy it and `.env` to the new server.
4. Stop the old stack with `sh mailer.sh compose down`, without `-v`, so its volumes stay until the new server runs well.

Then follow [Restore on a new server](#restore-on-a-new-server). Form submissions and API calls fail between step 1 and the end of the restore, so plan a quiet moment.

## How you know it worked

- `sh mailer.sh compose ps` shows `postgres`, `redis`, `backend` and `mail` as `healthy` and `proxy` as `Up`:

    ```bash
    sh mailer.sh compose ps --format "table {{.Service}}\t{{.Status}}"
    ```

- The backend logged no setup token, because the restored database has users. This answers `No setup token in the backend log; a user already exists or the backend has not started.`:

    ```bash
    sh mailer.sh token
    ```

- You can log in to `https://app.example.com` with your existing account, and **Projects**, **Domains** and **Bounces** show your data.
- A test mail through the send API from one of your sender domains arrives and passes DKIM ([Send API](/admin-guide/send-api#send-a-mail)). This proves that the backend can decrypt the DKIM keys, so `BACKEND_ENCRYPTION_SECRET` is the right one. A wrong secret shows up as **Failed** on the project's **Sent mail** page and `502` with `DELIVERY_FAILED` from the send API.
- `pg_restore --list` on your latest nightly dump prints its table of contents, so the routine keeps producing usable backups.
