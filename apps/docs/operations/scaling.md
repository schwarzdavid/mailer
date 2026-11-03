# Scaling

This page explains how to run more than one backend instance on the same database and Redis, what the production `compose.yml` supports for that, and how mailer keeps its background jobs from running twice. At the end you know whether a second instance helps you and what to watch when you run one.

One backend instance handles the traffic of most installations. Add instances when one is busy all the time, not for availability: `compose.yml` runs every service on one server, so a second instance does not protect you against the loss of that server.

## What the instances share

Apart from the setup token (below), a backend instance keeps no state of its own; everything that must be the same for all of them lives in two places:

- **PostgreSQL** holds all data, the leases of the background jobs (below) and the migration lock.
- **Redis** holds the queue of form deliveries, the rate-limit counters and a short-lived cache. All instances must use the same Redis, or each counts its own limits and only one sees a queued delivery.

Every instance takes form deliveries from the shared queue (up to 5 at a time each), answers requests, and checks the database schema when it starts: a Postgres advisory lock lets one instance apply pending migrations while the others wait and then find nothing left to do.

## Run a second instance with Docker Compose

`compose.yml` gives the `backend` service no fixed container name and no published port, so Docker Compose can run several containers of it:

```bash
cd /opt/mailer
docker compose up -d --scale backend=2
```

What `compose.yml` provides and what it does not:

- **Requests go to the name `backend`.** Caddy forwards to `backend:8000`, a single upstream. Docker's internal DNS answers that name with the addresses of all backend containers, but nothing in the Caddyfile balances between them: there is no load-balancing policy and no health check per instance, and Caddy reuses open connections, so how evenly requests spread is not configured and can be very uneven.
- **Health checks** run per container: each instance has its own `healthy` state in `docker compose ps`.
- **`--scale` does not stick.** `compose.yml` sets no number of instances, so every `docker compose up -d` without `--scale backend=2`, for example during an [update](/operations/updating), goes back to one instance. Add the flag to every `up -d` while you run two.
- **No rolling updates.** `compose.yml` defines no update order for the instances, so expect the same short interruption during an update as with one instance.

Check the result:

```bash
docker compose ps backend --format "table {{.Name}}\t{{.Status}}"
```

```text
NAME               STATUS
mailer-backend-1   Up 5 minutes (healthy)
mailer-backend-2   Up 1 minute (healthy)
```

Running instances on several servers needs a Postgres and a Redis that all of them reach ([External Postgres and Redis](/configuration/external-postgres-redis)), a proxy in front of all of them, and SMTP and IMAP access to the one mail server. The production `compose.yml` covers none of this.

## Background jobs run on one instance

Four jobs run in the background. With several instances, each job still runs on only one instance at a time:

| Job                           | Every      | How it stays on one instance                            |
| ----------------------------- | ---------- | ------------------------------------------------------- |
| DNS check of all domains      | 15 minutes | Lease `domain:dns-check:owner` in the `locks` table     |
| Purge of trashed projects     | 1 hour     | Lease `project:purge:owner` in the `locks` table        |
| Recovery sweep for deliveries | 1 minute   | Lease `inbound-form:delivery-recovery:owner` in `locks` |
| Bounce mailbox poll           | 1 minute   | A Postgres advisory lock for each round                 |

**Leases.** A lease is a row in the database table `locks` that names the instance that runs a job and when its claim expires; its key is the job's name followed by `:owner`. The first instance that reaches a job's interval takes the lease and keeps renewing it every 10 seconds while it runs; the lease lasts 30 seconds from each renewal. The other instances find the lease taken and skip the job on every tick.

- **When the owner stops normally** (an update, `docker compose stop`), it gives the lease back, and another instance takes the job over at its next interval.
- **When the owner crashes**, its lease expires 30 seconds after the last renewal. The next instance whose interval comes after that takes the job over.

**No overlapping runs.** While a run lasts, it also holds a run lock, a second row whose key is the bare job name, for example `domain:dns-check`. A run that is still going when the job's next interval comes is not started a second time, neither on the same instance nor on another; that tick is skipped. The run lock is released when the run ends.

**The bounce poller** works differently: each round takes a Postgres advisory lock, a lock the database holds until that round's transaction ends. An instance that finds the lock taken skips the round, so only one instance reads the bounce mailbox at a time. A round that is still going on the same instance is skipped as well.

You can see the leases in the database:

```bash
(set -a; . ./.env; docker compose exec postgres psql -U "$DB_USERNAME" -d "$DB_DATABASE" -c 'SELECT key, owner, expires_at FROM locks ORDER BY key;')
```

The query returns up to two rows per job; the run-lock row appears after the first run. A `…:owner` row with an `expires_at` in the future is the lease of a running instance; an empty `owner` there means the lease was given back. The row with the bare job name is the run lock: it has an owner only while a run lasts and is empty between runs, which is normal.

## The setup token needs a single instance

While no user exists, each instance creates its own setup token and logs it at start. The wizard's request to create the first user can reach any instance, and only the token of that instance is accepted; with the token of another one, the backend answers `403` with `Invalid setup token`. Run a single backend instance until the first user exists, as the [installation](/installation/first-run-setup) does.

## Database connections per instance

`DB_POOL_MAX` (default `10`) is the most connections one instance keeps open to Postgres. Every instance has its own pool, so the database needs room for

```text
DB_POOL_MAX × number of backend instances
```

plus the connections of your own tools. The bundled Postgres allows 100 connections unless configured otherwise; ask it with:

```bash
(set -a; . ./.env; docker compose exec postgres psql -U "$DB_USERNAME" -d "$DB_DATABASE" -c 'SHOW max_connections;')
```

Managed databases often allow fewer; see [Size the connection pool](/configuration/external-postgres-redis#size-the-connection-pool). To change `DB_POOL_MAX`, set it in `.env` and recreate the backend with `docker compose up -d --scale backend=2`.
