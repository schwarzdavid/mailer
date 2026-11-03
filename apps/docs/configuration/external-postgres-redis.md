# External Postgres and Redis

This page moves mailer's database and Redis from the bundled containers to services you run elsewhere, for example a managed PostgreSQL and a managed Redis from your hosting provider. At the end the backend talks to them over TLS, and the `postgres` and `redis` containers are gone from the stack.

You can move only one of the two; every section below says which service it is about.

## What the services must offer

**PostgreSQL.** The bundled container runs PostgreSQL 17. Create an empty database and a user that owns it, for example both named `mailer`. The backend creates every table itself when it starts, so the user needs the right to create tables in that database.

**Redis.** The bundled container runs Redis 8. mailer keeps three things in it: the queue of inbound-form deliveries, the [rate-limit](/configuration/rate-limits) counters and a short-lived cache. It always uses database `0` and connects to a single Redis endpoint; Redis Cluster is not supported. Two settings are required:

- **`maxmemory-policy noeviction`.** When Redis is full, it must refuse new data instead of deleting old data to make room. Any other policy can silently delete queued form deliveries.
- **Persistence**, such as append-only files (AOF) or snapshots, so a restart of Redis does not empty the queue. The bundled Redis runs with `--appendonly yes`.

Most managed Redis offers let you pick both in their control panel. If yours accepts the `CONFIG` command, you can check the policy with `redis-cli`; use `--tls` only when the service speaks TLS:

```bash
redis-cli -h redis.example.com -p 6379 --tls --user default --pass 'your-redis-password' CONFIG GET maxmemory-policy
```

```text
1) "maxmemory-policy"
2) "noeviction"
```

Do not share this Redis with applications that rely on Redis evicting their data, because `noeviction` applies to the whole instance.

## If mailer already runs

A new, empty database is enough for a fresh installation. If mailer already holds data, copy the database before you switch. Stop the backend first, so nothing changes during the copy:

```bash
cd /opt/mailer
docker compose stop backend
(set -a; . ./.env; docker compose exec -T postgres pg_dump -U "$DB_USERNAME" -d "$DB_DATABASE" --format=custom --no-owner) > mailer.dump
```

Restore it into the new database with your provider's host name, user and database. `pg_restore` must be version 17 or newer, because the dump comes from PostgreSQL 17; this command runs it from the same image as the bundled database, so nothing needs to be installed, and asks for the password:

```bash
docker run --rm -it -v "$PWD":/backup postgres:17-alpine pg_restore --no-owner -h db.example.com -p 5432 -U mailer -d mailer /backup/mailer.dump
```

The Redis data does not need to be copied. The database is the record of every form delivery; when the backend finds a delivery that is still `pending` but no longer in the queue, it queues it again once its next retry is due: two minutes after the row was last updated, plus the pause before its next attempt. Rate-limit counters and the cache simply start empty.

## Point the backend at the new services

The production `compose.yml` fixes the host and port of both services for the backend, so a `DB_HOST` or `REDIS_HOST` in `.env` has no effect. You change those lines in `compose.yml` and everything else in `.env`.

### Host and port in `compose.yml`

Open `/opt/mailer/compose.yml`. Under `backend.environment`, change the four lines to your services' addresses:

```yaml
DB_HOST: postgres
DB_PORT: '5432'
REDIS_HOST: redis
REDIS_PORT: '6379'
```

becomes, for example:

```yaml
DB_HOST: db.example.com
DB_PORT: '5432'
REDIS_HOST: redis.example.com
REDIS_PORT: '6379'
```

Change only the two lines of the service you move.

### Credentials and TLS in `.env`

Set the values in `/opt/mailer/.env`. The variables are described in full on [Environment variables](/configuration/environment#database) and [Redis](/configuration/environment#redis).

| Variable               | Required                    | Value                                                                                                                 |
| ---------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `DB_USERNAME`          | yes                         | The database user, for example `mailer`.                                                                              |
| `DB_PASSWORD`          | yes                         | That user's password.                                                                                                 |
| `DB_DATABASE`          | yes                         | The database name, for example `mailer`.                                                                              |
| `DB_SSL`               | yes, for a managed Postgres | `true`, so the backend connects over TLS and verifies the server's certificate.                                       |
| `DB_POOL_MAX`          | optional                    | How many connections the backend keeps open, default `10`. See [Size the connection pool](#size-the-connection-pool). |
| `REDIS_PASSWORD`       | when Redis requires a login | The Redis password.                                                                                                   |
| `REDIS_USERNAME`       | optional                    | The user name, when the service uses Redis ACL users. Leave it out for a password-only login.                         |
| `REDIS_TLS`            | yes, when Redis speaks TLS  | `true`. The backend then verifies the certificate against `REDIS_HOST`.                                               |
| `REDIS_TLS_SERVERNAME` | optional                    | The name on the Redis certificate, when it differs from `REDIS_HOST`.                                                 |

For example, the lines in `.env` for a managed Postgres and a managed Redis that both speak TLS:

```text
DB_USERNAME=mailer
DB_PASSWORD=the-password-from-your-provider
DB_DATABASE=mailer
DB_SSL=true
REDIS_PASSWORD=the-redis-password-from-your-provider
REDIS_TLS=true
```

Keep the values on single lines without quotes or spaces around `=`.

### A private certificate authority

A certificate authority (CA) is whoever signed the server's TLS certificate. The backend trusts the public CAs built into Node.js. Some providers sign their database certificates with their own, private CA; the backend then refuses the connection with an error such as `SELF_SIGNED_CERT_IN_CHAIN` or `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` until you give it that CA.

1. Download the CA certificate from your provider (a PEM file, text starting with `-----BEGIN CERTIFICATE-----`) and save it as `/opt/mailer/ca.pem`. If both Postgres and Redis use a private CA, put both certificates into this one file, one after the other.
2. Make it readable for the backend, which runs as the user `node` inside the container:

    ```bash
    chmod 644 /opt/mailer/ca.pem
    ```

3. The backend container's file system is read-only (`read_only: true` in `compose.yml`), so the file has to come in as a volume. Add a `volumes` entry to the `backend` service in `/opt/mailer/compose.yml`, at the same level as `environment`:

    ```yaml
    volumes:
        - /opt/mailer/ca.pem:/certs/ca.pem:ro
    ```

4. Tell Node.js to trust it by adding `NODE_EXTRA_CA_CERTS` to `/opt/mailer/.env`:

    ```bash
    echo 'NODE_EXTRA_CA_CERTS=/certs/ca.pem' >> /opt/mailer/.env
    ```

Node.js reads `NODE_EXTRA_CA_CERTS` once, when the backend starts.

::: danger
`DB_SSL_REJECT_UNAUTHORIZED=false` makes the backend accept any certificate from the database server, which lets anyone between your server and the database read and change the traffic, passwords included. Use it only as a last resort, when your provider offers no CA file at all.
:::

### Size the connection pool

`DB_POOL_MAX` (default `10`) is the most connections one backend instance keeps open to Postgres. Managed databases often allow only a few dozen connections in total, shared by everything that connects. Keep

```text
DB_POOL_MAX × number of backend instances
```

below the server's connection limit, with some room for your own tools and for the provider's monitoring. You can ask the server for its limit:

```bash
docker run --rm -it postgres:17-alpine psql -h db.example.com -p 5432 -U mailer -d mailer -c 'SHOW max_connections;'
```

With one backend instance, the default of `10` fits almost every plan.

## Remove the bundled services

Delete these parts of `/opt/mailer/compose.yml` for each service you moved. Change nothing else.

| Moved      | Remove the service block                      | Remove from `backend.depends_on`                      | Remove from the top-level `volumes` |
| ---------- | --------------------------------------------- | ----------------------------------------------------- | ----------------------------------- |
| PostgreSQL | `postgres:` with everything indented under it | `postgres:` and its `condition: service_healthy` line | `postgres-data:`                    |
| Redis      | `redis:` with everything indented under it    | `redis:` and its `condition: service_healthy` line    | `redis-data:`                       |

If you moved both, `depends_on` is empty afterwards; remove the `depends_on:` line as well.

Then apply the changes. `--remove-orphans` stops and removes the containers of the services that are no longer in the file:

```bash
cd /opt/mailer
docker compose up -d --remove-orphans
```

Removing a volume from `compose.yml` does not delete its data. Once the new setup has run well for a while, delete the old volume of each service you moved for good. For PostgreSQL:

```bash
docker volume rm mailer_postgres-data
```

For Redis:

```bash
docker volume rm mailer_redis-data
```

Each time you update mailer, apply the same edits to the new release's `compose.yml`.

## How you know it worked

- `docker compose ps` lists `backend` as `healthy` and no longer lists the services you moved:

    ```bash
    docker compose ps --format "table {{.Service}}\t{{.Status}}"
    ```

    ```text
    SERVICE   STATUS
    backend   Up 2 minutes (healthy)
    mail      Up 2 minutes (healthy)
    proxy     Up 2 minutes
    ```

- The readiness endpoint reports `database` and `redis` as `up`:

    ```bash
    curl -s https://app.example.com/api/health/ready
    ```

    ```text
    {"status":"ok","info":{"database":{"status":"up"},"redis":{"status":"up"},"smtp":{"status":"up"}},"error":{},"details":{"database":{"status":"up"},"redis":{"status":"up"},"smtp":{"status":"up"}}}
    ```

- On a new, empty database, the backend log shows the migrations that created the tables, ending with the newest one:

    ```bash
    docker compose logs backend | grep '"context":"Migrations"' | tail -n 2
    ```

    The last line contains `migrated` and the name of a migration, for example `"msg":"migrated 020-create-locks (0.012s)"`.

- You can log in to the admin UI and see your data, and a test mail sent as on [Verify the installation](/installation/verify#send-a-test-mail) arrives.
