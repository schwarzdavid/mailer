# Roll back an update

This page takes an installation back to the version it ran before an update that started successfully but misbehaves. At the end the previous version runs again, on a database whose schema matches it.

If the update did not start at all because a migration failed, you do not need this page: the failed migrations were rolled back automatically, and [If a migration fails](/operations/updating#if-a-migration-fails) shows how to start the previous version again.

All commands run on the server in the install directory:

```bash
cd /opt/mailer
```

The examples go back from `v1.1.0` to `v1.0.0`. You need what [Update mailer](/operations/updating#record-what-runs-now) had you record: the previous `IMAGE_TAG` (or the commit in `revision-before-update.txt`), the file `migrations-before-update.txt` and the copy `compose.yml.before-update`.

## Why migrations come first

Migrations that the newer version applied stay applied when you start an older image, and the older backend does not know them. It starts anyway, because it only looks for migrations of its own that are not applied yet, but its code does not expect the newer schema and can fail in ways that are hard to see. To revert those migrations you need the code that knows how to undo them, and that is only in the **current**, newer image. So revert the migrations first, while `IMAGE_TAG` still names the current version, and switch the image afterwards.

If the newer version applied no migrations, skip to [Switch back to the previous version](#switch-back-to-the-previous-version).

## Take a backup

Reverting a migration undoes what it changed in the database. A migration that added a table or a column drops it again, together with everything written into it since the update.

::: danger Data written since the update can be lost
Everything the newer version stored in tables or columns that its migrations created is deleted when you revert them. Dump the database first, so you can get it back:

```bash
(set -a; . ./.env; docker compose exec -T postgres pg_dump -U "$DB_USERNAME" -d "$DB_DATABASE" -Fc) > "mailer-$(date +%F)-before-rollback.dump"
```

:::

## Revert the newer migrations

1. Stop the backend, so nothing writes to the database while you work. The site answers `502` until the end of this page:

    ```bash
    docker compose stop backend
    ```

2. List the applied migrations and compare them with the list from before the update:

    ```bash
    docker compose run --rm -T backend node dist/migrate.js executed > migrations-now.txt
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
    docker compose run --rm backend node dist/migrate.js down --to 021-example
    ```

    The command prints a `reverting` and a `reverted` line for each migration. If one of them fails, the whole run is rolled back and the database stays as it was; the error names the migration. The [CLI](/reference/cli#migrations) page in the Reference section lists every command of the migration tool.

4. Check that the list matches the one from before the update again. `diff` prints nothing:

    ```bash
    docker compose run --rm -T backend node dist/migrate.js executed > migrations-now.txt
    diff migrations-before-update.txt migrations-now.txt
    ```

## Switch back to the previous version

Put the previous `compose.yml` back and set `IMAGE_TAG` to the previous version:

```bash
cp compose.yml.before-update compose.yml
sed -i 's|^IMAGE_TAG=.*|IMAGE_TAG=1.0.0|' .env
```

If you ran `latest` before, or only know the commit, use the commit tag instead: the first 7 characters of the recorded revision, for example `IMAGE_TAG=sha-3f9a2c1` for `3f9a2c1d7b4e…`:

```bash
sed -i "s|^IMAGE_TAG=.*|IMAGE_TAG=sha-$(cut -c1-7 revision-before-update.txt)|" .env
```

Without the saved `compose.yml`, download the previous release's file again, as on [Take the new release's files](/operations/updating#take-the-new-release-s-files), with that release's tag.

If the newer release added keys to `.env`, you can leave them; the previous version ignores keys it does not know.

Then pull and start, with the same commands as an update:

```bash
docker compose pull
docker compose up -d --remove-orphans
docker image prune -f
```

## How you know it worked

- The running image is the previous one: the revision matches the recorded one:

    ```bash
    docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$(docker compose images -q backend | head -n 1)"
    cat revision-before-update.txt
    ```

    Both commands print the same commit id.

- The applied migrations match the list from before the update, so `diff` prints nothing:

    ```bash
    docker compose run --rm -T backend node dist/migrate.js executed | diff migrations-before-update.txt -
    ```

- `docker compose ps` shows `postgres`, `redis`, `backend` and `mail` as `healthy` and `proxy` as `Up`, and the backend log shows no `Migration` errors:

    ```bash
    docker compose ps --format "table {{.Service}}\t{{.Status}}"
    docker compose logs backend | grep 'Migration '
    ```

- `https://app.example.com/api/health/ready` answers `"status":"ok"`, and the checks on [Verify the installation](/installation/verify) pass.
