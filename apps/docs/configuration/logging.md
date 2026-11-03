# Logging

This page shows what mailer writes to its logs, how to read the log of each service, how long Docker keeps it, what never appears in it and how to change the log level. After reading it you can follow a single request through the log and hand the logs to another system.

## The backend's log format

The backend writes its log to standard output, which Docker collects. With `NODE_ENV=production`, as in the Docker image, every entry is one JSON object on one line. After each request the backend writes one `request completed` entry like this:

```text
{"level":30,"time":1792740468748,"pid":7,"hostname":"3f9a2c1d7b4e","reqId":"1b000e55-3363-46c9-b18b-79ec557ea0ff","req":{"id":"1b000e55-3363-46c9-b18b-79ec557ea0ff","method":"POST","url":"/api/v1/send","remoteAddress":"198.51.100.23"},"res":{"statusCode":202},"responseTime":412,"msg":"request completed"}
```

| Field             | Meaning                                                                                                                                                                                                                |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `level`           | The severity as a number: `10` trace, `20` debug, `30` info, `40` warn, `50` error, `60` fatal.                                                                                                                        |
| `time`            | When the entry was written, in milliseconds since 1 January 1970 (UTC).                                                                                                                                                |
| `pid`, `hostname` | The process id and the host name; in Docker, the host name is the container id.                                                                                                                                        |
| `reqId`           | The request id: a random UUID per request. The backend also returns it to the client in the `X-Request-Id` response header.                                                                                            |
| `req`             | The request: its id again, the method, the path **without** the query string, and `remoteAddress`, the client address as the backend sees it after applying [`TRUST_PROXY`](/configuration/reverse-proxy#trust-proxy). |
| `res`             | The response, only its `statusCode`.                                                                                                                                                                                   |
| `responseTime`    | How long the request took, in milliseconds.                                                                                                                                                                            |
| `msg`             | The message: `request completed`, or `request errored` for responses with a status of 500 or higher.                                                                                                                   |

Every other entry written while the backend handles a request carries the same `reqId`, plus `context`, the part of the backend that wrote it. A mail sent through the send API, for example, adds this entry before the `request completed` line:

```text
{"level":30,"time":1792740468745,"pid":7,"hostname":"3f9a2c1d7b4e","reqId":"1b000e55-3363-46c9-b18b-79ec557ea0ff","context":"MailService","msg":"Sent mail message 42"}
```

Entries outside a request, such as startup, migrations and background jobs, have `context` but no `reqId`.

In every environment other than `production` the backend prints the same entries in a readable one-line form instead of JSON.

## Read the logs

Every service of the stack logs to Docker, and `docker compose logs` reads it. Run the commands in the install directory:

```bash
cd /opt/mailer
```

| Service    | What it logs                                                                           | Command                        |
| ---------- | -------------------------------------------------------------------------------------- | ------------------------------ |
| `backend`  | Requests, sent mails, form deliveries, bounces, DNS checks, migrations, startup errors | `docker compose logs backend`  |
| `proxy`    | Caddy: certificates (obtained, renewed, failed) and requests it could not forward      | `docker compose logs proxy`    |
| `mail`     | docker-mailserver: outgoing deliveries to other mail servers, incoming bounces, logins | `docker compose logs mail`     |
| `postgres` | Database startup, errors and failed logins                                             | `docker compose logs postgres` |
| `redis`    | Redis startup and persistence messages                                                 | `docker compose logs redis`    |

Useful options, which work with every service:

```bash
docker compose logs -f backend
docker compose logs --tail 100 backend
docker compose logs --since 1h mail
docker compose logs --no-log-prefix backend
```

`-f` keeps following new lines until you press Ctrl+C, `--tail 100` shows only the last 100 lines, `--since 1h` the last hour, and `--no-log-prefix` leaves out the `backend-1  |` prefix, so each line is pure JSON.

### Follow one request

When a user reports an error, ask for the value of the `X-Request-Id` response header (in the browser's developer tools, under Network), then search for it:

```bash
docker compose logs --no-log-prefix backend | grep '1b000e55-3363-46c9-b18b-79ec557ea0ff'
```

### Show only warnings and errors

With [`jq`](https://jqlang.org/) installed (`apt-get install -y jq` on Debian and Ubuntu), filter the backend log by level. `-R` and `fromjson?` skip any line that is not JSON:

```bash
docker compose logs --no-log-prefix backend | jq -cR 'fromjson? | select(.level >= 40)'
```

## Log rotation

Docker keeps each container's log in files on the host. `compose.yml` sets the same limits for all five services, in the block `x-logging`:

```yaml
x-logging: &logging
    driver: json-file
    options:
        max-size: 10m
        max-file: '5'
```

Each container keeps at most five files of 10 MB, so at most 50 MB per container and 250 MB for the stack. When the newest file is full, Docker starts a new one and deletes the oldest. `docker compose logs` reads only these files, so older entries are gone for good. Recreating a container (for example on an update) also starts a fresh log.

To keep more, raise `max-size` or `max-file` in `compose.yml` and recreate the stack with `docker compose up -d`. Remember to apply the same edit to the `compose.yml` of each new release.

The `mail` service additionally writes its own log files into the volume `mail-logs` (`/var/log/mail` inside the container). Docker's limits do not apply to them.

## What is never logged

- **Query strings.** The request entry keeps the path only, so an API key sent as `?key=…` never reaches the backend log. Caddy replaces the `key` parameter with `REDACTED` in its own log, see [Reverse proxy](/configuration/reverse-proxy#what-caddy-does).
- **Headers and bodies.** The request entry contains no request or response headers and no bodies: no `Authorization` header, no cookies, and none of the submitted form data or mail content.
- **Health checks.** Requests to `/api/health` and `/api/health/ready` are not logged at all, so a monitor that polls every few seconds does not fill the log.
- **E-mail addresses.** Log messages name records by their id: a sent mail is `Sent mail message <id>`, bounces and blocked addresses appear with their ids, and a failed login is logged only as `Login failed`. Look the id up in the admin UI when you need the address.
- **Error texts that can contain addresses.** Where an error can carry an address (SMTP errors do), the log names only the error's type and code, for example `Error (code EENVELOPE, responseCode 550)`.

## Change the log level

`LOG_LEVEL` picks the lowest severity that is written. The values, from quietest to most verbose, are `silent` (nothing), `fatal`, `error`, `warn`, `info` (the default), `debug` and `trace`. See [LOG_LEVEL](/configuration/environment#log-level) on the variable reference.

The template `.env` from the installation already contains `LOG_LEVEL=info`. To log more while you look for a problem:

```bash
cd /opt/mailer
sed -i 's|^LOG_LEVEL=.*|LOG_LEVEL=debug|' .env
docker compose up -d backend
```

Set it back to `info` the same way when you are done, because `debug` and `trace` produce far more lines and fill the rotated files faster. `LOG_LEVEL` affects only the backend; the other services keep their own defaults.

## Send logs to another system

The handover point is Docker's `json-file` driver: every container's log lives on the host under `/var/lib/docker/containers/<container id>/<container id>-json.log`, one JSON object per line, with the backend's own JSON entry inside its `log` field. Point a log shipper that reads Docker's log files at that directory, or replace the `json-file` driver in the `x-logging` block of `compose.yml` with another Docker logging driver.
