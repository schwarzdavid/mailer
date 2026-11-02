# Monitoring

This page lists what to watch on a running installation: the health endpoints for an uptime monitor, the container states, the logs, the DNS alert in the admin UI, the pages that show whether mail gets through, and the disk space the volumes take. At the end you have a short routine that catches problems before your users report them.

All commands run on the server in the install directory:

```bash
cd /opt/mailer
```

## Uptime monitor

mailer has two public health endpoints. Point an outside uptime monitor (for example Uptime Kuma, Better Stack or UptimeRobot) at both:

| Check     | URL                                        | Healthy | Failing                                             | Alert                                                          |
| --------- | ------------------------------------------ | ------- | --------------------------------------------------- | -------------------------------------------------------------- |
| Liveness  | `https://app.example.com/api/health`       | `200`   | `503` (no database), `502` (backend down)           | At once: mailer is down for everyone.                          |
| Readiness | `https://app.example.com/api/health/ready` | `200`   | `503`, the body names `database`, `redis` or `smtp` | After 2 or 3 failures in a row: sending or forms are affected. |

Liveness only asks the database; it is what Docker's own health check of the `backend` container uses. Readiness also checks Redis and the mail server, so it fails while the site itself still works, for example while `mail` restarts. Neither endpoint needs a login, counts against a rate limit or appears in the request log, so a probe every minute costs nothing. [Health checks](/configuration/health-checks) explains every answer and why readiness must never become the container health check.

To see the answer yourself:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://app.example.com/api/health
curl -s https://app.example.com/api/health/ready
```

## Container states

```bash
docker compose ps --format "table {{.Service}}\t{{.Status}}"
```

```text
SERVICE    STATUS
backend    Up 3 days (healthy)
mail       Up 3 days (healthy)
postgres   Up 3 days (healthy)
proxy      Up 3 days
redis      Up 3 days (healthy)
```

`backend`, `mail`, `postgres` and `redis` have health checks and must show `healthy`. `proxy` has none and shows only `Up`. A service that shows `Restarting`, `unhealthy` or a much shorter uptime than the others has crashed or been restarted; its log says why. Every service restarts on its own after a crash and after a reboot of the server (`restart: unless-stopped`).

## Logs

Every service logs to Docker, and `docker compose logs` reads it. The format, the rotation (at most 50 MB per container) and what is never logged are on [Logging](/configuration/logging).

**The backend** writes one JSON object per line. Show only warnings and errors of the last day, with `jq` installed (`apt-get install -y jq`):

```bash
docker compose logs --since 24h --no-log-prefix backend | jq -cR 'fromjson? | select(.level >= 40)'
```

`level` 40 is a warning, 50 an error, 60 fatal. Entries name records by id, for example `Sent mail message 42` or `Delivery 12 attempt 2 failed: …`; look the id up in the admin UI.

**Follow one request.** Every answer of the backend carries a request id in the header `X-Request-Id`, and every log entry written for that request carries it as `reqId`. When a user reports an error, ask for that header from the browser's developer tools (Network tab) and search for it:

```bash
docker compose logs --no-log-prefix backend | grep '1b000e55-3363-46c9-b18b-79ec557ea0ff'
```

**The mail server** logs every delivery attempt to another mail server. Mail that could not be delivered yet (`deferred`) or was refused for good (`bounced`) shows up with:

```bash
docker compose logs --since 24h mail | grep -E 'status=(deferred|bounced)'
```

If that prints nothing although mail is stuck, read the mail server's own log file in the `mail-logs` volume instead:

```bash
docker compose exec mail grep -E 'status=(deferred|bounced)' /var/log/mail/mail.log
```

Mail the server still holds for a later attempt is in its queue:

```bash
docker compose exec mail postqueue -p
```

`Mail queue is empty` is the normal answer. A queue that keeps growing means receivers refuse or cannot be reached: the reason is at the end of each entry.

**The proxy** logs certificate events and requests it could not forward to the backend:

```bash
docker compose logs --since 24h proxy | grep -i error
```

## The DNS alert in the admin UI

The backend looks up the DNS records of every domain every 15 minutes. When a record of the platform sending domain `mx.example.com` is no longer valid, a dot appears next to **Settings** in the navigation for users with **View settings**. Under **Needs attention**, the **Dashboard** shows **_n_ sending-domain records are invalid** for the sending domain and **_domain_ can't send yet** for each sender domain whose records are not valid; the **Domains** list shows each sender domain's state.

A record that turns **Invalid** after it was **Valid** means someone changed or removed it in DNS. Mail from that domain may then fail SPF, DKIM or DMARC at the receiver. [The DNS health alert](/admin-guide/overview#the-dns-health-alert) describes the dot, [Domains](/admin-guide/domains#check-the-records) the record states.

## Delivery: Sent mail and Bounces

Two pages of the admin UI show whether mail actually gets through:

- **Sent mail** on each project page lists every mail the project sent, through the send API and through forms, with its status: **Sent** (the mail server accepted it), **Failed** (with the error below the subject) or **Blocked** (the recipient is blocked after bounces). A run of **Failed** entries points to the mail server or the network; see [Sent mail](/admin-guide/projects#sent-mail).
- **Bounces** lists the bounce reports for the whole installation: **Permanent** ones (the address does not exist) and **Transient** ones (a full mailbox, a temporary refusal). A sudden rise, or reports that mention spam, blocklists or reputation, means receivers distrust your mail; see [Bounces](/admin-guide/bounces) and [Going live](/installation/going-live#when-mail-lands-in-spam).

Form deliveries that fail before they reach the mail server, such as a deleted receiver, appear on neither page. Check for failed and long-pending deliveries from time to time with the query on [Deliveries](/admin-guide/inbound-forms/deliveries#list-failed-deliveries).

## Disk space

The database, the bounce mailbox and the logs grow over time. Show how much each volume takes:

```bash
docker system df -v | grep -E '^(VOLUME NAME|mailer_)'
```

```text
VOLUME NAME            LINKS     SIZE
mailer_caddy-config    1         0B
mailer_caddy-data      2         28.4kB
mailer_mail-config     1         2.1kB
mailer_mail-data       1         3.6MB
mailer_mail-logs       1         1.2MB
mailer_mail-state      1         4.9MB
mailer_postgres-data   1         62.3MB
mailer_redis-data      1         1.1MB
```

And how much room is left on the disk that holds Docker's data:

```bash
df -h /var/lib/docker
```

- `mailer_mail-data` only grows: the backend marks processed bounce reports as read and never deletes them. Purge old reports as described on [Bounces](/admin-guide/bounces#the-bounce-mailbox-only-grows).
- `mailer_mail-logs` holds the mail server's own log files, which Docker's rotation does not cover.
- `mailer_postgres-data` grows with every sent mail and bounce, which mailer keeps.
- Database dumps in `/opt/mailer` and old images count as well; `docker image prune -f` removes images no container uses.

When the disk fills up, Postgres and Redis stop accepting writes, and the backend can neither record submissions nor queue deliveries.

## A weekly routine

1. `docker compose ps`: every service `healthy` or `Up`, no unexpected restarts.
2. The backend's warnings and errors of the past week (`--since 168h` in the `jq` command above).
3. **Dashboard**: nothing under **Needs attention**.
4. **Bounces**: no unusual rise.
5. `docker compose exec mail postqueue -p`: the queue is empty or short.
6. `df -h /var/lib/docker`: enough free space; the latest database dump exists off the server.
