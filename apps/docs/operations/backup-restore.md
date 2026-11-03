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
- **The mail server's accounts** in the volume `mail-config`: the bounce mailbox `bounce@mx.example.com` and the alias `postmaster@mx.example.com`. They are small and quick to recreate with two commands, so backing them up is optional unless you added accounts or aliases of your own.

Keep `compose.yml` as well, or note the release tag it came from, so you can download the same file again.

`compose.yml` has eight volumes; the [Compose stack](/reference/compose-stack) page in the Reference section describes them together with every service. Docker names each volume `mailer_` plus its name in the file, for example `mailer_postgres-data`:

| Volume          | Holds                                                                                            | Back up  | Why                                                                                                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `postgres-data` | The PostgreSQL database                                                                          | Yes      | All of mailer's data. Back it up with `pg_dump` (below), not by copying the volume while Postgres runs.                                                                            |
| `mail-config`   | docker-mailserver's accounts and aliases                                                         | Optional | The bounce mailbox and the `postmaster` alias; recreating them takes two commands.                                                                                                 |
| `redis-data`    | Redis: the queue of form deliveries waiting to be sent, rate-limit counters, a short-lived cache | No       | The database is the record of every delivery: on a new server, the recovery sweep queues deliveries that are still `pending` again. Counters and cache start empty.                |
| `caddy-data`    | Caddy's TLS certificates and keys for `SITE_ADDRESS` and `MAIL_HOSTNAME`                         | No       | Caddy obtains new certificates from Let's Encrypt on the first start of a new server, once DNS points to it.                                                                       |
| `caddy-config`  | Caddy's own saved configuration                                                                  | No       | The Caddyfile lives in `compose.yml`; Caddy rebuilds this on every start.                                                                                                          |
| `mail-data`     | The bounce mailbox: every bounce report the mail server received                                 | No       | The backend reads each report once a minute and stores the result in the database. Already processed reports are only kept, never read again.                                      |
| `mail-state`    | docker-mailserver's runtime state, including the queue of outgoing mail it has not delivered yet | No       | It holds no settings. On a planned move, let the queue drain first (see [Move to a new server](#move-to-a-new-server)); after a crash, mail still in the queue is lost either way. |
| `mail-logs`     | docker-mailserver's own log files                                                                | No       | Logs only.                                                                                                                                                                         |

## Back up the database

`pg_dump` writes a consistent copy of the database while mailer keeps running. It runs inside the `postgres` container, so nothing needs to be installed on the server:

```bash
(set -a; . ./.env; docker compose exec -T postgres pg_dump -U "$DB_USERNAME" -d "$DB_DATABASE" -Fc) > "mailer-$(date +%F).dump"
```

This writes a compressed dump such as `mailer-2026-10-23.dump` into `/opt/mailer`. `-Fc` selects PostgreSQL's custom format, which `pg_restore` reads. `-T` keeps Docker from adding terminal control characters to the output. The command reads `.env` in a subshell, so no variable stays exported in your shell.

Check that the dump is complete; `pg_restore --list` prints its table of contents and fails on a broken file:

```bash
docker compose exec -T postgres pg_restore --list < "mailer-$(date +%F).dump" | head -n 5
```

### Dump every night

A cron job takes the dump every night at 03:15 and deletes dumps older than 14 days, so about two weeks of dumps stay:

```bash
mkdir -p /opt/mailer/backups
cat > /etc/cron.d/mailer-backup <<'CRON'
15 3 * * * root cd /opt/mailer && (set -a; . ./.env; docker compose exec -T postgres pg_dump -U "$DB_USERNAME" -d "$DB_DATABASE" -Fc) > "backups/mailer-$(date +\%F).dump" && find backups -name 'mailer-*.dump' -mtime +14 -delete
CRON
```

The `%` sign is escaped as `\%` because cron treats a bare `%` as the end of the command. Copy the dumps off the server as well, for example with `scp` or your provider's backup storage: a dump on the same disk does not survive the loss of that server.

With an [external Postgres](/configuration/external-postgres-redis) there is no `postgres` container. Run `pg_dump` from a throwaway `postgres:17-alpine` container instead, the same way that page runs `pg_restore` and `psql`, with your database host in place of `db.example.com`, and use this form in the cron line too:

```bash
(set -a; . ./.env; docker run --rm -i -e PGPASSWORD="$DB_PASSWORD" postgres:17-alpine pg_dump -h db.example.com -p 5432 -U "$DB_USERNAME" -d "$DB_DATABASE" -Fc) > "mailer-$(date +%F).dump"
```

## Back up `.env` and the mail accounts

Copy `.env` to a safe place outside the server, for example a password manager, once after the installation and again after every change. Print it with:

```bash
cat /opt/mailer/.env
```

::: danger A dump without its BACKEND_ENCRYPTION_SECRET is incomplete
If the server is lost and the `.env` file with it, a database dump alone brings back users, projects and forms, but not the DKIM keys and reCAPTCHA secrets: they cannot be decrypted without the original `BACKEND_ENCRYPTION_SECRET`. Every sender domain then needs a new DKIM key and new DNS records, and every reCAPTCHA check its secret again ([Rotating secrets](/operations/rotating-secrets#backend-encryption-secret) shows what that involves). Keep `.env` together with the dumps.
:::

If you want the mail server's accounts as well, pack the `mail-config` volume into an archive:

```bash
docker run --rm -v mailer_mail-config:/data:ro -v "$PWD":/backup alpine tar czf /backup/mail-config.tar.gz -C /data .
```

## Restore on a new server

The procedure sets up a new server from the backups: the same `.env`, the same release, the database restored before the backend starts for the first time.

::: danger Restore into an empty database only
The backend creates every table itself the first time it starts. If it starts before the restore, the restore collides with those tables and fails. Start only `postgres` until the restore is done. Never restore into the database of a running installation; on the old server, `docker compose down -v` would delete all its volumes, including the database, so never run it there while you still need its data.
:::

1. **Prepare the server and DNS** as on [Prepare the server](/installation/prepare-server): Docker, the firewall, outbound port 25 and the PTR record for the new IP address. Point the A and AAAA records of `app.example.com` and `mx.example.com` to the new server ([DNS records](/installation/dns)).

2. **Download the same release** that wrote the dump, with the tag from your notes. Take only `compose.yml` this time, because you bring your own `.env`:

    ```bash
    mkdir -p /opt/mailer
    cd /opt/mailer
    TAG=v1.0.0
    curl -fsSLO "https://raw.githubusercontent.com/schwarzdavid/mailer/$TAG/deploy/compose.yml"
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
    docker compose pull
    docker compose up -d postgres
    docker compose ps postgres
    ```

    The `STATUS` column shows `healthy` after a few seconds. Postgres has now created the empty database `mailer` with the user and password from `.env`.

6. **Restore the dump** into it:

    ```bash
    (set -a; . ./.env; docker compose exec -T postgres pg_restore -U "$DB_USERNAME" -d "$DB_DATABASE" --no-owner) < mailer.dump
    ```

    No output means success. `--no-owner` gives every restored object to the database user from `.env`, so the restore also works if the user name changed.

    If the new installation uses an external Postgres instead of the bundled one, restore into that database with the `docker run --rm -it -v "$PWD":/backup postgres:17-alpine pg_restore …` command on [External Postgres and Redis](/configuration/external-postgres-redis#if-mailer-already-runs), before you start the backend.

7. **Restore the mail accounts, if you backed them up.** Skip this step if you did not; step 9 recreates them instead. The archive must go into the volume before `mail` starts for the first time. `docker compose create mail` creates the `mail` container and its volumes without starting it; copy `mail-config.tar.gz` to `/opt/mailer` and unpack it into the volume:

    ```bash
    docker compose create mail
    docker run --rm -v mailer_mail-config:/data -v "$PWD":/backup alpine tar xzf /backup/mail-config.tar.gz -C /data
    ```

8. **Start the rest of the stack:**

    ```bash
    docker compose up -d
    ```

    The backend applies no migrations, because the restored database already has them, and logs no setup token, because users exist.

9. **Recreate the bounce mailbox** within two minutes of the start, exactly as on the first installation. Skip this step if you restored the mail accounts in step 7:

    ```bash
    (set -a; . ./.env; docker compose exec mail setup email add "bounce@$MAIL_HOSTNAME" "$MAIL_PASSWORD")
    (set -a; . ./.env; docker compose exec mail setup alias add "postmaster@$MAIL_HOSTNAME" "bounce@$MAIL_HOSTNAME")
    ```

    `mail` restarts until Caddy has obtained the certificate for `mx.example.com`, as on the first installation ([Why mail restarts at first](/installation/docker-compose#why-mail-restarts-at-first)).

10. **Update the server addresses** if the new server has a different IP address: in the admin UI, follow [Change the server IP addresses](/admin-guide/settings#change-the-server-ip-addresses). The SPF record of `mx.example.com` lists the addresses, so it must be updated too.

## Move to a new server

A planned move is a restore with a fresh dump. On the old server, in this order:

1. Stop the backend, so nothing changes after the dump: `docker compose stop backend`.
2. Let the mail server deliver what it still holds. Repeat until it prints `Mail queue is empty`:

    ```bash
    docker compose exec mail postqueue -p
    ```

3. Take the dump as above and copy it and `.env` to the new server.
4. Stop the old stack with `docker compose down`, without `-v`, so its volumes stay until the new server runs well.

Then follow [Restore on a new server](#restore-on-a-new-server). Form submissions and API calls fail between step 1 and the end of the restore, so plan a quiet moment.

## How you know it worked

- `docker compose ps` shows `postgres`, `redis`, `backend` and `mail` as `healthy` and `proxy` as `Up`:

    ```bash
    docker compose ps --format "table {{.Service}}\t{{.Status}}"
    ```

- The backend logged no setup token, because the restored database has users. This prints nothing:

    ```bash
    docker compose logs backend | grep "Setup token"
    ```

- You can log in to `https://app.example.com` with your existing account, and **Projects**, **Domains** and **Bounces** show your data.
- A test mail through the send API from one of your sender domains arrives and passes DKIM ([Verify the installation](/installation/verify#send-a-test-mail)). This proves that the backend can decrypt the DKIM keys, so `BACKEND_ENCRYPTION_SECRET` is the right one. A wrong secret shows up as **Failed** on the project's **Sent mail** page and `502` with `DELIVERY_FAILED` from the send API.
- `pg_restore --list` on your latest nightly dump prints its table of contents, so the routine keeps producing usable backups.
