# Roll back an update

This page takes an installation back to the version it ran before an update that started successfully but misbehaves. You revert the newer database migrations, then put back the files that the update saved in its snapshot. At the end the previous version runs again, on a database whose schema matches it. `sh mailer.sh update` does not roll back by itself.

If the update did not start at all because a migration failed, you do not need this page: the failed migrations were rolled back automatically, and [If a migration fails](/operations/updating#if-a-migration-fails) shows how to start the previous version again with the same snapshot.

All commands run on the server in the install directory:

```bash
cd /opt/mailer
```

The examples go back from `v1.1.0` to `v1.0.0`. You need what [Update mailer](/operations/updating#record-what-runs-now) had you record, the commit in `revision-before-update.txt` and the file `migrations-before-update.txt`, and the snapshot that the update printed as `Snapshot: backups/snapshots/…` and kept in `backups/snapshots/` ([The snapshot](/operations/updating#the-snapshot)).

## Why migrations come first

Migrations that the newer version applied stay applied when you start an older image, and the older backend does not know them. It starts anyway, because it only looks for migrations of its own that are not applied yet, but its code does not expect the newer schema and can fail in ways that are hard to see. To revert those migrations you need the code that knows how to undo them, and that is only in the **current**, newer image. So revert the migrations first, while `IMAGE_TAG` still names the current version, and put the previous files back afterwards.

If the newer version applied no migrations, skip to [Put the snapshot back](#put-the-snapshot-back).

## Take a backup

Reverting a migration undoes what it changed in the database. A migration that added a table or a column drops it again, together with everything written into it since the update.

::: danger Data written since the update can be lost
Everything the newer version stored in tables or columns that its migrations created is deleted when you revert them. Dump the database first, so you can get it back:

```bash
sh mailer.sh compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "mailer-$(date +%F)-before-rollback.dump"
```

:::

## Revert the newer migrations

1. Stop the backend, so nothing writes to the database while you work. The site answers `502` until the end of this page:

    ```bash
    sh mailer.sh compose stop backend
    ```

2. List the applied migrations and compare them with the list from before the update:

    ```bash
    sh mailer.sh compose run --rm -T backend node dist/migrate.js executed > migrations-now.txt
    diff migrations-before-update.txt migrations-now.txt
    ```

    ```text
    20a21,22
    > 021-example
    > 022-another-example
    ```

    The lines starting with `>` are the migrations the newer version applied. No output means it applied none; skip to the next section.

    If you did not save the list before the update, run the first command alone and look at its last lines: the migrations listed after the newest one of the previous release are the newer version's. The release notes name the migrations a release adds.

3. Revert them. `--to` names the **oldest** migration to revert, the first `>` line above; it reverts that migration and every one after it, all in one transaction, so either all of them are reverted or none:

    ```bash
    sh mailer.sh compose run --rm backend node dist/migrate.js down --to 021-example
    ```

    The command prints a `reverting` and a `reverted` line for each migration. If one of them fails, the whole run is rolled back and the database stays as it was; the error names the migration.

4. Check that the list matches the one from before the update again. `diff` prints nothing:

    ```bash
    sh mailer.sh compose run --rm -T backend node dist/migrate.js executed > migrations-now.txt
    diff migrations-before-update.txt migrations-now.txt
    ```

## Put the snapshot back

The update saved the previous `compose.yml`, `.env` and `mailer.sh` in a directory named after its start time. Use the one the update printed as `Snapshot: backups/snapshots/<name>`; it is the newest directory under `backups/snapshots/` if no later update ran:

```bash
ls backups/snapshots/
```

```text
20261105T083012Z  20261127T101500Z
```

Copy its three files back over the current ones and start the stack:

```bash
SNAPSHOT=backups/snapshots/20261127T101500Z
cp "$SNAPSHOT/compose.yml" "$SNAPSHOT/.env" "$SNAPSHOT/mailer.sh" .
sh mailer.sh compose pull
sh mailer.sh compose up -d --remove-orphans
```

The restored `.env` names the previous `IMAGE_TAG` and its project format again, and the restored `mailer.sh` is the previous launcher. Everything you changed in `.env` after the update is gone, so make that change again. `compose.override.yml` is not part of the snapshot and stays as it is. Your data stays in the volumes.

If the previous `IMAGE_TAG` was `latest`, or you only know the commit, use the commit tag instead: the first 7 characters of the recorded revision, for example `IMAGE_TAG=sha-3f9a2c1` for `3f9a2c1d7b4e…`. Set it right after the copy, before you pull and start:

```bash
sed -i "s|^IMAGE_TAG=.*|IMAGE_TAG=sha-$(cut -c1-7 revision-before-update.txt)|" .env
```

Without the snapshot, take `compose.yml` and `mailer.sh` of the previous release from the repository, with that release's tag, and set `IMAGE_TAG` in `.env` back to the previous version (the update saved it as `MAILER_PREVIOUS_IMAGE_TAG`). Leave `MAILER_FORMAT_VERSION` alone unless the release notes say that the newer release changed the project format:

```bash
TAG=v1.0.0
curl -fsSLO "https://raw.githubusercontent.com/schwarzdavid/mailer/$TAG/deploy/compose.yml"
curl -fsSLO "https://raw.githubusercontent.com/schwarzdavid/mailer/$TAG/deploy/mailer.sh"
```

If the newer release added keys to `.env` and you keep the current `.env`, you can leave them; the previous version ignores keys it does not know.

Free the disk space of the newer images once the previous version runs well:

```bash
docker image prune -f
```

## How you know it worked

- The running image is the previous one: the revision matches the recorded one:

    ```bash
    docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$(sh mailer.sh compose images -q backend | head -n 1)"
    cat revision-before-update.txt
    ```

    Both commands print the same commit id.

- The applied migrations match the list from before the update, so `diff` prints nothing:

    ```bash
    sh mailer.sh compose run --rm -T backend node dist/migrate.js executed | diff migrations-before-update.txt -
    ```

- `sh mailer.sh compose ps` shows `postgres`, `redis`, `backend` and `mail` as `healthy` and `proxy` as `Up`, and the backend log shows no `Migration` errors:

    ```bash
    sh mailer.sh compose ps --format "table {{.Service}}\t{{.Status}}"
    sh mailer.sh compose logs backend | grep 'Migration '
    ```

- `https://app.example.com/api/health/ready` answers `"status":"ok"`, and a test mail through the [send API](/admin-guide/send-api#send-a-mail) arrives.
