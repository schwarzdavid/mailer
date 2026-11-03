# Update mailer

This page updates a running Docker Compose installation to a new release: it takes the new release's files, records what runs now so you can go back, pulls the new images and restarts the stack. At the end the new version runs, its database migrations are applied, and you know what to do if a migration fails.

All commands run on the server in the install directory:

```bash
cd /opt/mailer
```

The examples update from `v1.0.0` to `v1.1.0`. Replace both with your versions. A release tag such as `v1.1.0` belongs to the image tag `1.1.0`: the release pipeline publishes every release image under the version without the `v`, under `sha-<first 7 characters of the commit>` and, unless the release is a pre-release, under `latest`.

## Before you start

- **Read the release notes** of every release between your version and the new one on the repository's releases page. They name changes that need your attention.
- **Take a database backup**, so you can go back even if something goes wrong that a rollback cannot undo:

    ```bash
    (set -a; . ./.env; docker compose exec -T postgres pg_dump -U "$DB_USERNAME" -d "$DB_DATABASE" -Fc) > "mailer-$(date +%F)-before-update.dump"
    ```

    [Backup and restore](/operations/backup-restore) explains the dump and how to restore it.

## Record what runs now

A rollback needs three things from the current installation: the commit of the running image, the list of applied migrations and the current `compose.yml`. Record them before you change anything.

The image carries its commit as the label `org.opencontainers.image.revision`. Print it and save it to a file:

```bash
docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$(docker compose images -q backend | head -n 1)" | tee revision-before-update.txt
```

```text
3f9a2c1d7b4e8a6f0c5d2e1b9a8f7c6d5e4b3a21
```

The output is the full commit id (40 characters); its first 7 characters form the image tag `sha-3f9a2c1`, which names the same image as the version tag. Write down the current `IMAGE_TAG` too:

```bash
grep '^IMAGE_TAG=' .env
```

```text
IMAGE_TAG=1.0.0
```

Save the list of applied migrations, which a [rollback](/operations/rollback) compares with the list after the update:

```bash
docker compose run --rm -T backend node dist/migrate.js executed > migrations-before-update.txt
tail -n 1 migrations-before-update.txt
```

The last line is the newest migration the current version applied, for example `020-create-locks`.

Keep a copy of the current `compose.yml`. You need it for a rollback, and it shows any edits you made to it, such as for an [external database](/configuration/external-postgres-redis):

```bash
cp compose.yml compose.yml.before-update
```

## Take the new release's files

Every release ships its own `compose.yml` and `.env.example`. Always run an image with the `compose.yml` of the same release, because the compose file and the backend change together.

Download the new `compose.yml` over the old one, and the new template next to your `.env`:

```bash
TAG=v1.1.0
curl -fsSLO "https://raw.githubusercontent.com/schwarzdavid/mailer/$TAG/deploy/compose.yml"
curl -fsSL -o .env.example "https://raw.githubusercontent.com/schwarzdavid/mailer/$TAG/deploy/.env.example"
```

If you had edited `compose.yml`, see what differs and apply your edits to the new file again:

```bash
diff compose.yml.before-update compose.yml
```

Compare the keys of the new template with your `.env`. The command compares only the names, so your secrets are not printed:

```bash
diff <(grep -o '^[A-Z_0-9]*=' .env | sort) <(grep -o '^[A-Z_0-9]*=' .env.example | sort)
```

- No output: the template has no new keys.
- A line starting with `>` is a key that is new in the release, for example `> NEW_SETTING=`. Add it to `.env` with a value; [Environment variables](/configuration/environment) describes every key.
- A line starting with `<` is a key that your `.env` has and the template does not. That is normal for optional keys you added yourself, such as `DB_SSL` or `NODE_EXTRA_CA_CERTS`. If the release notes say a key was renamed, rename it in `.env`.

## Pin the new version

Set `IMAGE_TAG` to the new version, without the `v`:

```bash
sed -i 's|^IMAGE_TAG=.*|IMAGE_TAG=1.1.0|' .env
grep '^IMAGE_TAG=' .env
```

```text
IMAGE_TAG=1.1.0
```

Do not run `latest` in production: `latest` moves with every release, so a later `docker compose pull` could start an image that does not match your `compose.yml`.

## Pull and restart

```bash
docker compose pull
docker compose up -d --remove-orphans
docker image prune -f
```

- `pull` downloads the images named in the new `compose.yml`: the backend in the new version and the pinned versions of Caddy, Postgres, Redis and the mail server.
- `up -d` recreates every container whose image or settings changed and leaves the others running. The site is unavailable while the new backend starts and migrates, usually well under a minute; Caddy answers `502` meanwhile.
- `--remove-orphans` removes containers of services that the new `compose.yml` no longer has.
- `docker image prune -f` deletes old images that no container uses any more, to free disk space. A rollback downloads its image again.

## Migrations run on start

The backend brings the database schema up to date by itself every time it starts, before it accepts requests. There is no separate migration step. All pending migrations of one start run in a single transaction, and a Postgres advisory lock (a lock the database holds until that transaction ends) makes sure only one backend migrates at a time.

Each applied migration writes two log lines:

```bash
docker compose logs backend | grep '"context":"Migrations"'
```

```text
backend-1  | {"level":30,"time":1792740468748,"pid":7,"hostname":"3f9a2c1d7b4e","context":"Migrations","msg":"migrating 021-example"}
backend-1  | {"level":30,"time":1792740468760,"pid":7,"hostname":"3f9a2c1d7b4e","context":"Migrations","msg":"migrated 021-example (0.012s)"}
```

No such lines means the new version brought no new migrations.

## If a migration fails

When a migration fails, the backend does not start. Docker restarts it, it tries again and fails again, so the site is down until you act. `docker compose up -d` can end with an error saying that `backend` is unhealthy. The log names the migration:

```bash
docker compose logs backend | grep 'Migration '
```

```text
backend-1  | MigrationError: Migration 021-example (up) failed: Original error: …
```

The text after `Original error:` is the database's error message.

The failed run is rolled back as a whole: every migration of that start is undone together with its entry in the migration table, so the database is exactly as it was before the update. You have two options:

- **Go back to the previous version.** Put the old `compose.yml` back, set `IMAGE_TAG` to the value you wrote down and start the stack. The old version finds the database as it left it:

    ```bash
    cp compose.yml.before-update compose.yml
    sed -i 's|^IMAGE_TAG=.*|IMAGE_TAG=1.0.0|' .env
    docker compose pull
    docker compose up -d --remove-orphans
    ```

    Nothing needs to be reverted, because the failed migrations were never applied. Report the log line from above as an issue on the repository.

- **Fix forward.** If a newer release fixes the migration, update to that release instead, with the steps on this page.

## Databases migrated by very old versions

Skip this section unless your installation dates from a very old version. Very old versions stored the names of applied migrations with a `.ts` extension, so the current backend would take every migration for new and fail on the first one. Check the names while the old version still runs:

```bash
(set -a; . ./.env; docker compose exec postgres psql -U "$DB_USERNAME" -d "$DB_DATABASE" -c 'SELECT name FROM "SequelizeMeta" ORDER BY name;')
```

If the names end in `.ts`, for example `001-create-users.ts`, remove the extension once, right before you pull and restart. Stop the backend first, so the old version does not start against the renamed list:

```bash
docker compose stop backend
(set -a; . ./.env; docker compose exec -T postgres psql -U "$DB_USERNAME" -d "$DB_DATABASE") <<'SQL'
UPDATE "SequelizeMeta" SET name = regexp_replace(name, '\.ts$', '');
SQL
```

`psql` answers `UPDATE` followed by the number of renamed rows. Then continue with [Pull and restart](#pull-and-restart). A database created by a current version never needs this.

## Caddy and the mail server are updated with releases

The images of the reverse proxy (`caddy:2.11.7-alpine`) and of the mail server (`ghcr.io/docker-mailserver/docker-mailserver:16.0.1`) are pinned in `compose.yml`, and `IMAGE_TAG` does not change them. A release that moves to a newer Caddy or docker-mailserver ships a `compose.yml` with the new tag. You pick it up by taking the release's `compose.yml` as above; do not change these tags yourself.

The normal update already rolls them: `docker compose pull` downloads the new image and `docker compose up -d` recreates the container. To roll only one of them, for example after taking a release's `compose.yml` whose only change is the mail server's tag:

```bash
docker compose pull mail && docker compose up -d mail
```

For the proxy:

```bash
docker compose pull proxy && docker compose up -d proxy
```

While `mail` restarts (compose gives it up to a minute to shut down), it accepts no mail on port 25; other mail servers retry later, so no bounce report is lost. The send API answers `502` with `DELIVERY_FAILED` during that time, and form deliveries wait for their next retry. While `proxy` restarts, the site does not answer for a few seconds. The certificates stay in the `caddy-data` volume, so neither service needs new ones.

## How you know it worked

- The running image is the new one. The same command as before the update prints a different commit id:

    ```bash
    docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$(docker compose images -q backend | head -n 1)"
    ```

- `docker compose ps` shows `postgres`, `redis`, `backend` and `mail` as `healthy` and `proxy` as `Up`:

    ```bash
    docker compose ps --format "table {{.Service}}\t{{.Status}}"
    ```

- The list of applied migrations ends with the newest migration of the new release:

    ```bash
    docker compose run --rm -T backend node dist/migrate.js executed | tail -n 1
    ```

- `https://app.example.com/api/health/ready` answers `"status":"ok"`, and a test mail as on [Verify the installation](/installation/verify#send-a-test-mail) arrives.

Run the remaining checks of [Verify the installation](/installation/verify) after every update. If the new version misbehaves after a successful start, [roll back](/operations/rollback).
