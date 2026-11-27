# Update mailer

This page updates a running Docker Compose installation to a new release with one command: `sh mailer.sh update --to <version>` takes a snapshot of your files, replaces `compose.yml` and `mailer.sh` with the new release's, pulls the new images and restarts the stack. At the end the new version runs, its database migrations are applied, and you know what to do if something fails.

All commands run on the server in the install directory:

```bash
cd /opt/mailer
```

The examples update from `v1.0.0` to `v1.1.0`. Replace both with your versions. A release tag such as `v1.1.0` belongs to the image tag `1.1.0`: the release pipeline publishes every release image under the version without the `v`, under `sha-<first 7 characters of the commit>` and, unless the release is a pre-release, under `latest`. `--to` accepts both spellings.

## Before you start

- **Read the release notes** of every release between your version and the new one on the repository's releases page. They name changes that need your attention.
- **Take a database backup.** An update takes no database dump by itself, so make one first, to go back even if something goes wrong that a rollback cannot undo:

    ```bash
    sh mailer.sh compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "mailer-$(date +%F)-before-update.dump"
    ```

    [Backup and restore](/operations/backup-restore) explains the dump and how to restore it.

## Record what runs now

A [rollback](/operations/rollback) needs two things from the current installation besides the snapshot that the update takes: the commit of the running image and the list of applied migrations. Record them before you change anything.

The image carries its commit as the label `org.opencontainers.image.revision`. Print it and save it to a file:

```bash
docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$(sh mailer.sh compose images -q backend | head -n 1)" | tee revision-before-update.txt
```

```text
3f9a2c1d7b4e8a6f0c5d2e1b9a8f7c6d5e4b3a21
```

The output is the full commit id (40 characters); its first 7 characters form the image tag `sha-3f9a2c1`, which names the same image as the version tag.

Save the list of applied migrations, which a rollback compares with the list after the update:

```bash
sh mailer.sh compose run --rm -T backend node dist/migrate.js executed > migrations-before-update.txt
tail -n 1 migrations-before-update.txt
```

The last line is the newest migration the current version applied, for example `020-create-locks`. `sh mailer.sh version` prints the version that runs now.

## Run the update

```bash
sh mailer.sh update --to 1.1.0
```

The command:

1. Stops with `Already on 1.1.0.` when that version runs already.
2. Refuses a new major version unless you say `update major` (see [New major versions](#new-major-versions)).
3. Pulls the image `ghcr.io/schwarzdavid/mailer:1.1.0`. When the registry cannot be reached, it uses the image on the server if there is one.
4. Runs the project migration of the new image. It takes a [snapshot](#the-snapshot), brings `.env` and the install directory to the format of the new release if that changed, replaces `compose.yml` and `mailer.sh` with the new release's, and sets `IMAGE_TAG` to the new version (the old one moves to `MAILER_PREVIOUS_IMAGE_TAG`).
5. Starts the stack with the new files, `up -d --pull missing --remove-orphans`, and waits up to five minutes for the backend to become healthy. The site is unavailable while the new backend starts and migrates, usually well under a minute; Caddy answers `502` meanwhile.
6. Checks the bounce mailbox and sets its password from the secrets again.

```text
Snapshot: backups/snapshots/20261127T101500Z
…
Updated from 1.0.0 to 1.1.0.
```

Always run an image with the `compose.yml` of the same release, because the compose file and the backend change together; the update takes care of that. Your `.env` stays, with the keys listed in step 4 changed, and so does your `compose.override.yml`, which mailer never touches. If a release needs a new key in `.env`, its project migration adds it or the release notes name it; [Advanced configuration](/installation/advanced-configuration) describes every key.

After the update, remove the images nothing uses any more to free disk space. A rollback downloads its image again:

```bash
docker image prune -f
```

### New major versions

A change of the major version, for example `1.4.0` to `2.0.0`, may remove or change things. `update` stops until you have decided:

```text
mailer.sh: 2.0.0 is a new major version. Read its release notes, then run: sh mailer.sh update major --to 2.0.0
```

Read the release notes of the new major version, then repeat the command with `major`:

```bash
sh mailer.sh update major --to 2.0.0
```

### The snapshot

Before it changes a file, the update copies `compose.yml`, `.env` and `mailer.sh` into `backups/snapshots/<UTC timestamp>/` in the install directory, for example `backups/snapshots/20261127T101500Z/`. Every update adds a directory. The snapshot is what you put back to [roll back](/operations/rollback); if the project migration itself fails, it puts the files back from it by itself. The directory is readable only by its owner, because the copy of `.env` holds your secrets (unless you keep them in a [secret manager](/installation/advanced-configuration#secrets-from-a-secret-manager)). Delete old snapshots you no longer need, and treat the rest like `.env`.

The update lock `.update-lock` keeps two updates from running at once. It exists only while an update runs. If a session was killed and left it behind, `Another update is running. If none is, remove .update-lock and try again.` tells you to remove it.

### When the update needs manual action

An update that ends with exit code `3` changed nothing: it needs a step that mailer cannot do for you. It says why, for example `This directory was not set up by mailer.sh; run: sh mailer.sh setup` (a directory from the manual installation, see [Coming from a manual installation](/installation/#coming-from-a-manual-installation)) or `This installation is newer than the image; a downgrade is not supported.` (you named an older version than the one that runs; use [Roll back](/operations/rollback)). The release notes name the manual steps when a release needs some. [The mailer.sh command](/operations/mailer-sh#update) lists the other messages.

## Migrations run on start

The backend brings the database schema up to date by itself every time it starts, before it accepts requests. There is no separate migration step. All pending migrations of one start run in a single transaction, and a Postgres advisory lock (a lock the database holds until that transaction ends) makes sure only one backend migrates at a time.

Each applied migration writes two log lines:

```bash
sh mailer.sh compose logs backend | grep '"context":"Migrations"'
```

```text
backend-1  | {"level":30,"time":1792740468748,"pid":7,"hostname":"3f9a2c1d7b4e","context":"Migrations","msg":"migrating 021-example"}
backend-1  | {"level":30,"time":1792740468760,"pid":7,"hostname":"3f9a2c1d7b4e","context":"Migrations","msg":"migrated 021-example (0.012s)"}
```

No such lines means the new version brought no new migrations.

## If a migration fails

When a migration fails, the backend does not start. Docker restarts it, it tries again and fails again, so the site is down until you act. After five minutes the update gives up with `the update to 1.1.0 did not come up. The previous files are in backups/snapshots/; see the rollback page of the documentation.` The log names the migration:

```bash
sh mailer.sh compose logs backend | grep 'Migration '
```

```text
backend-1  | MigrationError: Migration 021-example (up) failed: Original error: …
```

The text after `Original error:` is the database's error message.

The failed run is rolled back as a whole: every migration of that start is undone together with its entry in the migration table, so the database is exactly as it was before the update. You have two options:

- **Go back to the previous version.** Put the files of the snapshot back and start the stack, as on [Put the snapshot back](/operations/rollback#put-the-snapshot-back). The old version finds the database as it left it. Nothing needs to be reverted, because the failed migrations were never applied. Report the log line from above as an issue on the repository.

- **Fix forward.** If a newer release fixes the migration, update to that release instead with `sh mailer.sh update --to <version>`; the unfinished update has already replaced the files, so there is nothing to put back first.

The update has already set `IMAGE_TAG` to the new version, so the same `update --to` answers `Already on 1.1.0.`. When you have fixed the cause outside mailer, for example a full disk, `sh mailer.sh start` starts the stack again.

## Databases migrated by very old versions

Skip this section unless your installation dates from a very old version. Very old versions stored the names of applied migrations with a `.ts` extension, so the current backend would take every migration for new and fail on the first one. Check the names while the old version still runs:

```bash
sh mailer.sh compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
SELECT name FROM "SequelizeMeta" ORDER BY name;
SQL
```

If the names end in `.ts`, for example `001-create-users.ts`, remove the extension once, right before you run the update. Stop the backend first, so the old version does not start against the renamed list:

```bash
sh mailer.sh compose stop backend
sh mailer.sh compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
UPDATE "SequelizeMeta" SET name = regexp_replace(name, '\.ts$', '');
SQL
```

`psql` answers `UPDATE` followed by the number of renamed rows. Then continue with [Run the update](#run-the-update); the update starts the backend again. A database created by a current version never needs this.

## Caddy and the mail server are updated with releases

The images of the reverse proxy (`caddy:2.11.7-alpine`) and of the mail server (`ghcr.io/docker-mailserver/docker-mailserver:16.0.1`) are pinned in `compose.yml`, and `IMAGE_TAG` does not change them. A release that moves to a newer Caddy or docker-mailserver ships a `compose.yml` with the new tag, and the update brings it. Do not change these tags yourself: the next update would replace your edit.

The normal update already rolls them: `up -d --pull missing` downloads the new image and recreates the container. To roll only one of them again, for example after a failed pull:

```bash
sh mailer.sh compose pull mail && sh mailer.sh compose up -d mail
```

For the proxy:

```bash
sh mailer.sh compose pull proxy && sh mailer.sh compose up -d proxy
```

While `mail` restarts (compose gives it up to a minute to shut down), it accepts no mail on port 25; other mail servers retry later, so no bounce report is lost. The send API answers `502` with `DELIVERY_FAILED` during that time, and form deliveries wait for their next retry. While `proxy` restarts, the site does not answer for a few seconds. The certificates stay in the `caddy-data` volume, so neither service needs new ones.

## How you know it worked

- The running image is the new one. The same command as before the update prints a different commit id:

    ```bash
    docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$(sh mailer.sh compose images -q backend | head -n 1)"
    ```

- `sh mailer.sh compose ps` shows `postgres`, `redis`, `backend` and `mail` as `healthy` and `proxy` as `Up`:

    ```bash
    sh mailer.sh compose ps --format "table {{.Service}}\t{{.Status}}"
    ```

- The list of applied migrations ends with the newest migration of the new release:

    ```bash
    sh mailer.sh compose run --rm -T backend node dist/migrate.js executed | tail -n 1
    ```

- `https://app.example.com/api/health/ready` answers `"status":"ok"`, and a test mail through the [send API](/admin-guide/send-api#send-a-mail) arrives.

If the new version misbehaves after a successful start, [roll back](/operations/rollback).
