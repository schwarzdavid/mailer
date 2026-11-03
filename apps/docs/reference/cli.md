# CLI

This page lists every command line tool the documentation uses on a running installation: the migration tool inside the backend image and the mail server's account, queue and mailbox commands. Each command is written out as the full `docker compose` line you paste on the server.

All commands run on the server in the install directory:

```bash
cd /opt/mailer
```

Commands that need a value from `.env`, such as `MAIL_HOSTNAME`, read the file in a subshell: `(set -a; . ./.env; …)`. `set -a` exports every variable the file sets, but only inside the parentheses, so nothing stays exported in your shell. A variable exported in your own shell would otherwise override later edits to `.env` in every following `docker compose` call.

## Migrations

A **migration** is a numbered step that changes the database schema, for example `020-create-locks`. The backend applies pending migrations itself every time it starts, so you never need these commands for an installation or an update. Use them to see what a release changed, and to revert migrations before a [rollback](/operations/rollback).

The tool is `node dist/migrate.js` in the backend image. `docker compose run --rm backend` starts a one-off container of the `backend` service for it, with the same `.env` and the same `IMAGE_TAG` as the running backend, and removes the container afterwards. Compose starts `postgres` and `redis` first if they are not running.

| Command                                                                 | What it does                                                                                                                                                              |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docker compose run --rm backend node dist/migrate.js executed`         | Lists the migrations that are applied, oldest first.                                                                                                                      |
| `docker compose run --rm backend node dist/migrate.js pending`          | Lists the migrations of this image that are not applied yet. Empty on a running installation, because the backend applies them when it starts.                            |
| `docker compose run --rm backend node dist/migrate.js up`               | Applies every pending migration. The same as what the backend does when it starts; running the tool without a command does the same.                                      |
| `docker compose run --rm backend node dist/migrate.js down`             | Reverts only the newest applied migration.                                                                                                                                |
| `docker compose run --rm backend node dist/migrate.js down --to <name>` | Reverts the migration `<name>` and every migration applied after it, for example `down --to 021-example`. Use the name as `executed` prints it, without a file extension. |

To save or compare the output of `executed` or `pending`, add `-T` after `run`, so Docker does not mix terminal control characters into it:

```bash
docker compose run --rm -T backend node dist/migrate.js executed > migrations-now.txt
```

How the tool behaves:

- **One transaction per run.** Every `up` or `down` runs all its migrations in a single database transaction. If one of them fails, the whole run is rolled back and the database is exactly as it was before; the error names the migration.
- **One run at a time.** Each run first takes a Postgres advisory lock, a lock the database holds until the run's transaction ends. A second run, or a backend that starts meanwhile, waits for it.
- **Only the image knows its migrations.** The tool can revert only migrations whose code is in the image `IMAGE_TAG` names. Revert a newer version's migrations while `IMAGE_TAG` still names that newer version, then switch the image, as [Roll back an update](/operations/rollback#revert-the-newer-migrations) describes.
- **Stop the backend before you revert.** `docker compose stop backend` first, so nothing writes to tables that are about to be dropped.

::: danger Reverting a migration deletes data
A migration that added a table or a column drops it again when you revert it, with everything stored in it. Dump the database first, as on [Backup and restore](/operations/backup-restore#back-up-the-database).
:::

The tool needs only the `DB_*` variables and `BACKEND_ENCRYPTION_SECRET`; it does not start the app. Without Docker, the same commands are `pnpm --filter backend migrate:prod <command>`, see [Without Docker](/configuration/without-docker#migrations).

## Mail server accounts

The `mail` service is docker-mailserver, whose `setup` command manages the mailboxes and aliases. mailer needs exactly one mailbox, `bounce@` plus `MAIL_HOSTNAME`, and one alias, `postmaster@` plus `MAIL_HOSTNAME`. Both are stored in the `mail-config` volume.

Create the bounce mailbox with the password from `MAIL_PASSWORD`. On the first start of the stack, wait until `docker compose ps` shows `mail` as `Up` (it restarts until Caddy has its certificate), then run it and the alias command below within two minutes, as on [Docker Compose](/installation/docker-compose#create-the-bounce-mailbox); if you miss the window, run them again once the container is back up:

```bash
(set -a; . ./.env; docker compose exec mail setup email add "bounce@$MAIL_HOSTNAME" "$MAIL_PASSWORD")
```

Point `postmaster@` at the bounce mailbox:

```bash
(set -a; . ./.env; docker compose exec mail setup alias add "postmaster@$MAIL_HOSTNAME" "bounce@$MAIL_HOSTNAME")
```

Set a new password on the bounce mailbox after you changed `MAIL_PASSWORD` in `.env`, then recreate the backend so it uses the new value too ([Rotating secrets](/operations/rotating-secrets#mail-password)):

```bash
(set -a; . ./.env; docker compose exec mail setup email update "bounce@$MAIL_HOSTNAME" "$MAIL_PASSWORD")
docker compose up -d backend
```

List the mailboxes; the list must contain `bounce@mx.example.com`:

```bash
docker compose exec mail setup email list
```

If `docker compose exec` answers that the container is restarting or not running, wait until `docker compose ps mail` shows it as `Up` and run the command again.

## Mail queue

The mail server keeps mail it could not deliver yet in a queue and retries it on its own.

Show the queue. `Mail queue is empty` is the normal answer; otherwise each entry ends with the reason the receiving server gave:

```bash
docker compose exec mail postqueue -p
```

Retry every queued mail now instead of waiting for the next attempt:

```bash
docker compose exec mail postqueue -f
```

## Bounce mailbox

The backend marks every bounce report it has processed as read and never deletes it, so the bounce mailbox only grows. These commands purge read reports by hand; [Bounces](/admin-guide/bounces#the-bounce-mailbox-only-grows) explains when and why. Back up the `mail-data` volume first if you want to keep the reports.

Show how much space the mailbox takes:

```bash
docker compose exec mail du -sh /var/mail
```

List the read reports older than 30 days. Each line of the output is one mail; no output means nothing to remove:

```bash
(set -a; . ./.env; docker compose exec mail doveadm search -u "bounce@$MAIL_HOSTNAME" mailbox INBOX SEEN savedbefore 30d)
```

Delete exactly these reports:

```bash
(set -a; . ./.env; docker compose exec mail doveadm expunge -u "bounce@$MAIL_HOSTNAME" mailbox INBOX SEEN savedbefore 30d)
```

`SEEN` limits both commands to mails the backend has already processed; unread reports wait for the next poll and are never touched. Change `30d` to keep a longer or shorter history.
