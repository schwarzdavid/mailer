# Health checks

This page explains mailer's two health endpoints: what each one checks, how fast it answers, why the container health check uses only one of them, and how to wire an uptime monitor to them. After reading it you know which URL to watch and what each answer means.

## The two endpoints

| Endpoint                | Checks                                                                                                         | Timeouts                          | Use                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------- | --------------------------------------------------- |
| `GET /api/health`       | **Liveness:** the database answers `SELECT 1`                                                                  | database 3 s                      | Is the process up? The Docker health check uses it. |
| `GET /api/health/ready` | **Readiness:** the database answers `SELECT 1`, Redis answers `PING`, and the SMTP server accepts a connection | database 3 s, Redis 3 s, SMTP 5 s | Can the backend do all of its work right now?       |

The SMTP check is a full connection test: the backend connects to the SMTP server it sends through (`SMTP_HOST`, the `mail` service with Docker Compose), upgrades the connection with STARTTLS and logs in, the same handshake it uses to send mail. A wrong `MAIL_PASSWORD` therefore shows up here.

Both endpoints:

- answer HTTP `200` with `"status": "ok"` when every check passes, and HTTP `503` with `"status": "error"` when one fails;
- need no login and have no rate limit;
- are not written to the request log (see [Logging](/configuration/logging#what-is-never-logged)) and are not part of the [API reference](/api/reference/).

The exact answers, a passing one for each endpoint and a failing readiness check, are shown on [Verify the installation](/installation/verify#health-endpoints). In short, `details` lists every check as `up` or `down`, `info` repeats the passing ones and `error` the failing ones:

```json
{
    "status": "error",
    "info": {
        "database": { "status": "up" },
        "redis": { "status": "up" }
    },
    "error": {
        "smtp": { "status": "down", "message": "Error (code ESOCKET)" }
    },
    "details": {
        "database": { "status": "up" },
        "redis": { "status": "up" },
        "smtp": { "status": "down", "message": "Error (code ESOCKET)" }
    }
}
```

A failed check reports only the error's type and code, never its full text, because error texts can contain addresses or host details. A check that gets no answer in time reports `Timed out after 3000 ms` (database, Redis) or `Timed out after 5000 ms` (SMTP).

## Cached answers

Health checks are cheap on purpose, so a burst of probes cannot overload the database or the mail server:

- **Liveness** reuses its result for **2 seconds** after each run, so a flood of `/api/health` requests costs at most one database query every 2 seconds.
- **Readiness** reuses its result for **10 seconds** after each run, so it opens at most one SMTP connection every 10 seconds.
- While a run is still going, every request that arrives waits for that same run instead of starting another one.

The cache starts when a run has finished. A change in a dependency, a failure or a recovery, can therefore show up a few seconds late: up to 2 seconds for liveness, up to 10 seconds for readiness, plus the time the run itself takes.

## The container health check

The `backend` service in `compose.yml` checks itself from inside the container, against liveness:

```yaml
healthcheck:
    test:
        - CMD
        - node
        - -e
        - fetch('http://127.0.0.1:8000/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))
    interval: 10s
    timeout: 5s
    retries: 6
    start_period: 60s
```

Docker calls `/api/health` every 10 seconds and marks the container `unhealthy` after 6 failures in a row, that is after about a minute. During the first 60 seconds after a start, which include the database migrations, failures do not count.

It uses liveness, not readiness, for two reasons:

- **Readiness fails whenever the mail server is down**, even though the admin UI and the API keep working and form submissions wait in the queue. A container health check that fails for an outside reason would only mark a working backend as broken.
- **The stack would never start.** The `proxy` service waits until `backend` is healthy. The `mail` service needs the certificate that `proxy` obtains for `MAIL_HOSTNAME`. If the backend's health depended on the mail server, the backend would wait for `mail`, `mail` for the certificate, and the certificate for `proxy`, which waits for the backend.

Never make `/api/health/ready` the container health check. Use it for monitoring and diagnosis instead.

## Wire an uptime monitor

An uptime monitor is an outside service (for example Uptime Kuma, Better Stack or UptimeRobot) that calls a URL at intervals and alerts you when the answer is wrong. Set up two checks:

| Check     | URL                                        | Healthy answer | Interval       | Alert                                                      |
| --------- | ------------------------------------------ | -------------- | -------------- | ---------------------------------------------------------- |
| Liveness  | `https://app.example.com/api/health`       | HTTP `200`     | 1 minute       | at once: mailer is down for everyone                       |
| Readiness | `https://app.example.com/api/health/ready` | HTTP `200`     | 1 to 5 minutes | after 2 or 3 failures in a row: mail or forms are affected |

If your monitor can check the response body as well, look for the text `"status":"ok"`.

What a failing answer tells you:

| Answer                              | Meaning                                                                                                                                                                                   |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `503` from `/api/health`            | The backend runs but cannot reach the database. Check `docker compose ps postgres` and `docker compose logs postgres`.                                                                    |
| `503` from `/api/health/ready` only | The body names the failing check: `database`, `redis` or `smtp`. Check that service with `docker compose ps` and `docker compose logs <service>` (the SMTP server is the `mail` service). |
| `502`                               | Caddy runs but cannot reach the backend, usually while it restarts or after it crashed. Check `docker compose ps backend` and `docker compose logs backend`.                              |
| No answer, or a TLS error           | Caddy or the server is unreachable, or the certificate for `SITE_ADDRESS` expired. Check `docker compose ps proxy` and `docker compose logs proxy`.                                       |

A failing readiness check with the other services up for longer than a few minutes is worth a look even when no user complains: while `smtp` is `down`, the send API answers `502` and form deliveries wait for their next retry; while `redis` is `down`, logins answer `503` (see [Rate limits](/configuration/rate-limits#when-redis-is-down)).

To try both endpoints from the server, run:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://app.example.com/api/health
curl -s -o /dev/null -w '%{http_code}\n' https://app.example.com/api/health/ready
```

```text
200
200
```
