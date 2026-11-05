# Verify the installation

This page checks the running installation from the outside in: the containers, the mail server's certificate, the health endpoints, the DNS state in the admin UI and a real test mail. When every check passes, mailer is ready for your websites. Run the same checks after every update.

All commands run on the server in the install directory:

```bash
cd /opt/mailer
```

## Containers

```bash
docker compose ps --format "table {{.Service}}\t{{.Status}}"
```

```text
SERVICE    STATUS
backend    Up 10 minutes (healthy)
mail       Up 8 minutes (healthy)
postgres   Up 10 minutes (healthy)
proxy      Up 9 minutes
redis      Up 10 minutes (healthy)
```

- `postgres`, `redis`, `backend` and `mail` must be `healthy`.
- `proxy` must be `Up`. It has no health check, so it never shows `healthy`.

**If it fails:** a service that shows `Restarting` or `unhealthy` tells you where to look. Read its log with `docker compose logs <service>`, for example `docker compose logs backend`. `mail` restarting means Caddy has no certificate for `MAIL_HOSTNAME` yet (see [Docker Compose](/installation/docker-compose#why-mail-restarts-at-first)); `backend` restarting usually means a wrong value in `.env`, which the backend names in its log. The [Troubleshooting](/operations/troubleshooting) page under Operations covers more cases.

## Mail server certificate

The mail server must present a Let's Encrypt certificate for `MAIL_HOSTNAME` on port 25, so other mail servers can encrypt the connection with STARTTLS, the command that switches a plain mail connection to an encrypted one. Check it with `openssl`, which connects like a mail server would:

```bash
(. ./.env; openssl s_client -starttls smtp -connect "$MAIL_HOSTNAME:25" -servername "$MAIL_HOSTNAME" </dev/null 2>/dev/null | openssl x509 -noout -issuer -subject)
```

```text
issuer=C=US, O=Let's Encrypt, CN=R11
subject=CN=mx.example.com
```

The issuer names Let's Encrypt (the last part, here `R11`, varies) and the subject is your `MAIL_HOSTNAME`.

**If it fails:** no output at all means the connection to port 25 failed: check that port 25 is open inbound in your provider's firewall and that `mx.example.com` resolves to this server. Any other issuer or subject means the mail server is not serving the certificate Caddy obtained for `MAIL_HOSTNAME`; wait until `mail` is `healthy` and try again.

## Health endpoints

mailer has two health endpoints, both public, without login:

| Endpoint                | Checks                                                                                                    | Use it for                                                                                    |
| ----------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `GET /api/health`       | **Liveness:** the database answers within 3 seconds.                                                      | "Is mailer up?" Docker's health check for `backend` uses it, and so should an uptime monitor. |
| `GET /api/health/ready` | **Readiness:** the database, Redis (within 3 seconds) and the mail server's SMTP port (within 5 seconds). | "Can mailer do all of its work right now?" A diagnostic, not a container health check.        |

Call the liveness endpoint:

```bash
curl -s https://app.example.com/api/health
```

```json
{
    "status": "ok",
    "info": { "database": { "status": "up" } },
    "error": {},
    "details": { "database": { "status": "up" } }
}
```

Call the readiness endpoint:

```bash
curl -s https://app.example.com/api/health/ready
```

```json
{
    "status": "ok",
    "info": {
        "database": { "status": "up" },
        "redis": { "status": "up" },
        "smtp": { "status": "up" }
    },
    "error": {},
    "details": {
        "database": { "status": "up" },
        "redis": { "status": "up" },
        "smtp": { "status": "up" }
    }
}
```

`curl` prints the JSON on one line; it is formatted here for reading. Both answer HTTP `200` when every check passes.

**If it fails:** a failing check turns the answer into HTTP `503` with `"status": "error"`, lists the failing check under `error` with `"status": "down"` and the error's type and code (never its full text), and keeps the passing checks under `info`. For example, while the mail server is down, the connection to it fails at once and the message names the error type and code; the exact code depends on how the connection failed, and a check that gets no answer within its time limit reports `Timed out after 5000 ms` instead:

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

Readiness depends on the mail server, so it reports `503` while `mail` is down even though the admin UI still works; that is why it is not used as the container's health check. Readiness reuses its result for 10 seconds, so a fix can take up to 10 seconds to show. If `curl` cannot connect at all, Caddy is not reachable: check the `proxy` service and ports 80 and 443.

## DNS state in the admin UI

Log in at `https://app.example.com` and look at the **Dashboard**:

- The **Delivery health** card shows the **Sending domain** with how many of its records are valid.
- **Needs attention** lists every sending-domain record that is still invalid. When nothing is wrong it shows **Nothing needs you**.

**Settings** shows the same records in detail. Click **Check again** to look them up right away instead of waiting for the next automatic check (every 15 minutes).

**If it fails:** a record that stays **Invalid** for more than a day is missing or has a different value. Open it: **Found a different value** shows what DNS returns; **No record found at this host yet.** means there is no record at all. [First-run setup](/installation/first-run-setup#step-2-dns-records) lists the expected values.

## Send a test mail

The last check sends a real mail through the whole chain. The quickest way is the send API, which needs a sender domain, a project and an API key. Each step is a few clicks in the admin UI; the Admin guide pages on [domains](/admin-guide/domains), [projects](/admin-guide/projects) and [the send API](/admin-guide/send-api) describe them in full.

1. **Add a sender domain.** Open **Domains**, click **New domain**, enter the domain your test mail should come from, for example `mail.example.net`, and click **Add domain**. It must not be `MAIL_HOSTNAME` or another name under the same domain (`example.com` here), because mailer allows one domain per registrable domain and the sending domain already uses `example.com`.
2. **Publish its three records** in that domain's DNS zone. The domain's page lists them with copy buttons; with the example names they are:

    | Record | Host                             | Type  | Value                                |
    | ------ | -------------------------------- | ----- | ------------------------------------ |
    | SPF    | `mail.example.net`               | `TXT` | `v=spf1 include:mx.example.com ~all` |
    | DKIM   | `s1._domainkey.mail.example.net` | `TXT` | `v=DKIM1; k=rsa; p=<public key>`     |
    | DMARC  | `_dmarc.mail.example.net`        | `TXT` | `v=DMARC1; p=none;`                  |

    The DKIM value is generated for this domain; copy it from the domain's page. Click **Check again** on the domain's page and wait until its records show **Valid**: mailer refuses to send from a domain whose records are not all valid ([Sending needs valid records](/admin-guide/domains#sending-needs-valid-records)).

3. **Create a project.** Open **Projects**, click **New project**, enter a name and click **Create project**.
4. **Assign the domain.** On the project's page, in **Sender domains**, click **Assign domain**, choose `mail.example.net` and click **Assign domain**.
5. **Create an API key.** On the same page, in **API keys**, click **New API key**, enter a name and click **Create key**. Copy the key shown under **Copy your API key**; it starts with `sdm_` and is shown only once.
6. **Send.** Replace the key and the recipient with yours (use a mailbox you can read at another provider):

    ```bash
    curl -sS -X POST https://app.example.com/api/v1/send \
      -H "Authorization: Bearer sdm_xxxxxxxx_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
      -H "Content-Type: application/json" \
      -d '{"from":"test@mail.example.net","to":"inbox@example.org","subject":"mailer test","html":"<p>It works.</p>","text":"It works."}'
    ```

    ```json
    { "mailMessageId": 1, "status": "sent" }
    ```

The request waits until the mail server has accepted the mail and answers HTTP `202`. Within a minute the mail arrives in the recipient's inbox. On the project's page, **Sent mail** lists it with the status **Sent**.

In the received mail, open the original source (in Gmail: **Show original**). It should report `SPF: PASS`, `DKIM: PASS` and `DMARC: PASS`; other mail clients show the same results in the `Authentication-Results` header.

**If it fails:**

- `403` with the code `FROM_DOMAIN_NOT_ALLOWED`: the `from` address does not use a domain assigned to the key's project.
- `422` with the code `FROM_DOMAIN_NOT_READY`: a record of the domain is not **Valid** yet. Fix it, click **Check again** on the domain's page and send again.
- `502` with the code `DELIVERY_FAILED`: the mail server did not accept the mail. Check `docker compose ps` and the readiness endpoint above.
- The API answers `202` but no mail arrives: check the spam folder, then the mail server's log with `docker compose logs mail`. A line with `connect to …:25: Connection timed out` means outbound port 25 is still blocked by your provider (see [Prepare the server](/installation/prepare-server#make-sure-outbound-port-25-is-open)).
- The mail arrives in spam or fails SPF, DKIM or DMARC: check that all records show **Valid** and the PTR record is set, and read [Going live](/installation/going-live).

Every error code of the send API is on [Errors](/api/errors).

## How you know it worked

- `docker compose ps` shows `postgres`, `redis`, `backend` and `mail` as `healthy` and `proxy` as `Up`.
- The `openssl` check prints a Let's Encrypt issuer and `subject=CN=mx.example.com`.
- `https://app.example.com/api/health` and `https://app.example.com/api/health/ready` both answer `"status":"ok"`.
- **Settings** shows every record of `mx.example.com` as **Valid**.
- The test mail arrived, passed SPF, DKIM and DMARC, and is listed as **Sent** on the project's **Sent mail** page.

Before you point real websites at mailer, read [Going live](/installation/going-live).
