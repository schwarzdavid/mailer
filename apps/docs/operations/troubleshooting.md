# Troubleshooting

This page lists the problems operators run into most, each as symptom, cause and fix, with the command that confirms the cause. Find your symptom among the headings, run the check, and apply the fix.

All commands run on the server in the install directory:

```bash
cd /opt/mailer
```

Two commands give a first picture of almost every problem:

```bash
docker compose ps --format "table {{.Service}}\t{{.Status}}"
curl -s https://app.example.com/api/health/ready
```

The first shows which service is not `healthy` (or, for `proxy`, not `Up`); the second names the failing dependency (`database`, `redis` or `smtp`). Read the log of the service in question with `docker compose logs <service>`, for example `docker compose logs --tail 100 backend`.

## `mail` keeps restarting

**Symptom.** `docker compose ps` shows `mail` as `Restarting` or `unhealthy`, especially right after the installation or after changing `MAIL_HOSTNAME`.

**Cause.** The mail server uses the TLS certificate that Caddy obtains for `MAIL_HOSTNAME` and restarts until that certificate exists. Caddy cannot get it while the A record of `mx.example.com` does not point to this server, or while ports 80 and 443 are blocked.

**Check.** List the certificates Caddy has; the mail server needs a folder named after `MAIL_HOSTNAME`:

```bash
docker compose exec proxy ls /data/caddy/certificates/acme-v02.api.letsencrypt.org-directory/
docker compose logs proxy | grep -i error
dig +short A mx.example.com @1.1.1.1
```

**Fix.** Right after the first start, wait a few minutes: `mail` comes up on its own once the certificate is there ([Why mail restarts at first](/installation/docker-compose#why-mail-restarts-at-first)). If there is no folder for `mx.example.com` after ten minutes, make the A record point to the server's address and open ports 80 and 443 ([Open the firewall](/installation/prepare-server#open-the-firewall)); Caddy retries by itself.

## Nothing is delivered

**Symptom.** The send API answers `202` and **Sent mail** shows **Sent**, but the mail never arrives. Or the mail server's queue keeps growing.

**Cause.** **Sent** means only that mailer's own mail server accepted the mail. It then delivers it to the recipient's server on port 25. Two things commonly stop that: the hosting provider blocks outgoing connections to port 25, or the receiving server refuses mail from an IP address without a matching PTR (reverse DNS) record, the record that maps the IP back to `mx.example.com`.

**Check.** The mail server's log and queue name the reason:

```bash
docker compose logs --since 1h mail | grep -E 'status=(deferred|bounced)'
docker compose exec mail postqueue -p
```

If the first command prints nothing although mail is stuck, read the mail server's own log file in the `mail-logs` volume instead:

```bash
docker compose exec mail grep -E 'status=(deferred|bounced)' /var/log/mail/mail.log
```

`connect to …:25: Connection timed out` means port 25 is blocked. Test it directly, and check the PTR record:

```bash
timeout 10 bash -c 'echo > /dev/tcp/gmail-smtp-in.l.google.com/25' && echo "port 25 open" || echo "port 25 blocked"
dig +short -x 203.0.113.10
```

The second command must print `mx.example.com.`.

**Fix.** Ask your provider to unblock outbound port 25 ([Make sure outbound port 25 is open](/installation/prepare-server#make-sure-outbound-port-25-is-open)), and set the PTR record in the provider's console ([Set the reverse DNS](/installation/prepare-server#set-the-reverse-dns-ptr-record)). Mail still in the queue is retried by the mail server on its own; to retry at once:

```bash
docker compose exec mail postqueue -f
```

## The backend restarts after an update

**Symptom.** After `docker compose up -d`, `backend` shows `Restarting` or `unhealthy`, and the site answers `502`.

**Cause.** Usually a database migration failed. The backend applies pending migrations when it starts and does not start if one fails. Less often, a value in `.env` is missing or invalid; the backend checks every setting at start and names the key it refuses. A release that adds a required key does this until you add it: the release that moved the server addresses into `.env` needs `MAIL_SERVER_IPV4` (and `MAIL_SERVER_IPV6` if you used IPv6), the addresses you entered on **Settings** before.

**Check.**

```bash
docker compose logs --tail 50 backend | grep -E 'Migration |Config validation|Must be'
```

`MigrationError: Migration <name> (up) failed: …` names the failed migration.

**Fix.** A failed migration run is rolled back as a whole, so the database is unchanged. Go back to the previous version or fix forward, as on [If a migration fails](/operations/updating#if-a-migration-fails). If the log names a setting instead, correct it in `.env` (see [Environment variables](/configuration/environment)) and run `docker compose up -d`.

## No setup token in the log

**Symptom.** `docker compose logs backend | grep "Setup token"` prints nothing, or the wizard rejects the token with `Invalid setup token`.

**Cause.** The backend logs a setup token only while no user exists, once at every start. Either a user exists already, so the wizard is no longer needed, or you used a token from an earlier start, or several backend instances run and each has its own token.

**Check.** Count the users and the backend instances:

```bash
(set -a; . ./.env; docker compose exec postgres psql -U "$DB_USERNAME" -d "$DB_DATABASE" -c 'SELECT count(*) FROM users;')
docker compose ps backend
```

**Fix.**

- A count above `0`: log in at `https://app.example.com/login` with that account instead.
- A count of `0`: use the token of the latest start, which this prints:

    ```bash
    docker compose logs backend | grep "Setup token" | tail -n 1
    ```

- More than one `backend` line in `docker compose ps`: go back to one instance, then take the new token:

    ```bash
    docker compose up -d --scale backend=1
    ```

## DNS records stay invalid

**Symptom.** Records on a domain's page or on **Settings** stay **Invalid** or **Not checked yet**, long after you created them.

**Cause.** DNS has not caught up yet, the record was created with a different host or value, the name has several SPF records, or the SPF record lacks the include. mailer marks DKIM **Valid** only when DNS returns exactly the value it generated, SPF when it is the only SPF record and contains the generated mechanisms, and DMARC when it carries a `p=` tag. It checks every 15 minutes, or when you click **Check again**.

**Check.** Ask a public resolver and compare with the value on the domain's page. DKIM, A, AAAA, MX and PTR must match character for character; SPF and DMARC are checked by content, as described above:

```bash
dig +short TXT mail.example.net @1.1.1.1
dig +short TXT s1._domainkey.mail.example.net @1.1.1.1
dig +short TXT _dmarc.mail.example.net @1.1.1.1
```

To see what the backend itself gets from its resolver:

```bash
docker compose exec backend node -e "require('node:dns').promises.resolveTxt('_dmarc.mail.example.net').then((r) => console.log(r.map((p) => p.join(''))))"
```

**Fix.**

- No answer: the record is missing, or your DNS provider added the zone to the host a second time (`_dmarc.mail.example.net.example.net`). Many providers expect only the part before the zone name, for example `_dmarc.mail` in the zone `example.net`.
- A different value: for DKIM, replace it with the value from the domain's page using the copy button.
- Several SPF records: the domain shows **Several SPF records were found.** Merge them into one record; a name may have only one.
- The SPF record lacks the include: the domain shows **Found a different value**. Open it and copy the merged value under **This domain already has an SPF record. Keep it and add the mailer include; this is the merged value:** into your existing record.
- Several DMARC records: the domain shows **Several DMARC records were found.** Merge them into one record at `_dmarc.mail.example.net`; a name may have only one.
- A DMARC record without a `p=` tag: add `p=none`, `p=quarantine` or `p=reject`. Any policy is valid ([Going live](/installation/going-live#tighten-dmarc-step-by-step)).
- The right value: wait for the record's TTL to run out, then click **Check again**.

[Domains](/admin-guide/domains#check-the-records) explains every state.

## `422 FROM_DOMAIN_NOT_READY`, or deliveries stay pending with "DNS records that are not valid yet"

**Symptom.** The send API answers `422` with the code `FROM_DOMAIN_NOT_READY`, or form deliveries stay `pending` with the error `Domain 3 (mail.example.net) has DNS records that are not valid yet` and end up `failed` after about two hours.

**Cause.** mailer sends only from a domain that is ready to send: an active DKIM key and every DNS record **Valid**. At least one record of the `From` domain is **Invalid** or **Not checked yet**, or a change of `MAIL_HOSTNAME` has made the SPF records of the customer domains invalid. The statuses change only with the check every 15 minutes, after a start of the backend, or with **Check again**.

**Check.** Open the domain under **Domains** and look for records that are not **Valid**. The pending deliveries and their errors:

```bash
(set -a; . ./.env; docker compose exec postgres psql -U "$DB_USERNAME" -d "$DB_DATABASE" -c "SELECT \"inboundFormDeliveryId\", attempts, error FROM inbound_form_delivery WHERE status = 'pending' AND error LIKE '%not valid yet%'")
```

**Fix.** Repair the invalid records as described under [DNS records stay invalid](#dns-records-stay-invalid) and click **Check again** on the domain's page; waiting deliveries then go out on their next attempt, and failed ones can be resent ([Resend a failed delivery](/admin-guide/inbound-forms/deliveries#resend-a-failed-delivery)). After a `MAIL_HOSTNAME` change every customer must publish the new SPF include ([Change MAIL_HOSTNAME](/admin-guide/settings#change-mail-hostname)). To send without this rule, set `SEND_REQUIRE_VALID_DNS=false` ([SEND_REQUIRE_VALID_DNS](/configuration/environment#send-require-valid-dns)); receivers are then likely to reject the mail.

## Form deliveries stay `pending`

**Symptom.** Form submissions answer `accepted`, but no mail arrives, and the deliveries stay `pending`.

**Cause.** Deliveries wait in a queue in Redis and go out through the mail server. While Redis is down they cannot be queued; while the mail server is down each attempt fails and is retried, up to 8 attempts over about two hours. A delivery that is waiting for its next retry is `pending` as well.

**Check.** List the waiting deliveries with their attempts, and look at the readiness check:

```bash
(set -a; . ./.env; docker compose exec postgres psql -U "$DB_USERNAME" -d "$DB_DATABASE" -c "SELECT \"inboundFormDeliveryId\", attempts, error, \"updatedAt\" FROM inbound_form_delivery WHERE status = 'pending' ORDER BY \"updatedAt\"")
curl -s https://app.example.com/api/health/ready
docker compose logs --since 1h backend | grep 'Delivery '
```

**Fix.** Bring back what readiness reports as `down` (`docker compose ps redis mail`, `docker compose up -d`). Nothing else is needed: every minute the recovery sweep queues deliveries that are still `pending` once their retry pause is over, and they go out within a few minutes. A delivery that ran out of attempts is `failed`; resend it with the SQL on [Resend a failed delivery](/admin-guide/inbound-forms/deliveries#resend-a-failed-delivery).

## Login answers 503

**Symptom.** Logging in to the admin UI fails, and `POST /api/auth/login` answers `503` with `Rate limiting is temporarily unavailable`.

**Cause.** Redis is down. The login and the creation of the first user count every attempt in Redis; without it they refuse all attempts, so nobody can guess passwords while the limit is off. Every other route keeps working without a limit, except forms with the timed token, which refuse submissions with `403 Form token could not be verified` until Redis is back.

**Check.**

```bash
docker compose ps redis
docker compose logs --tail 50 redis
docker compose logs --since 1h backend | grep 'Rate limit not enforced'
```

**Fix.** Start Redis again with `docker compose up -d redis`. If its log reports a full disk or a failed write of its append-only file, free disk space first ([Disk space](/operations/monitoring#disk-space)). Logins work as soon as Redis answers. [Rate limits](/configuration/rate-limits#when-redis-is-down) has the details.

## Readiness answers 503 while the site works

**Symptom.** `https://app.example.com/api/health/ready` answers `503`, but the admin UI loads and `https://app.example.com/api/health` answers `200`.

**Cause.** Readiness also checks Redis and the mail server, which the site does not need to load. The answer's `error` part names the failing check. The usual one is `smtp`: the mail server restarts, has no certificate yet, or refuses the login of `bounce@mx.example.com` because the mailbox does not exist or `MAIL_PASSWORD` differs from the account's password.

**Check.**

```bash
curl -s https://app.example.com/api/health/ready
docker compose ps mail
docker compose exec mail setup email list
```

An `smtp` message with the code `EAUTH` means the login was refused. `setup email list` must list `bounce@mx.example.com`.

**Fix.**

- `mail` not `healthy`: see [`mail` keeps restarting](#mail-keeps-restarting).
- The mailbox is missing: create it ([Create the bounce mailbox](/installation/docker-compose#create-the-bounce-mailbox)).
- `EAUTH` with an existing mailbox: set the password from `.env` on the account again, as on [Rotating secrets](/operations/rotating-secrets#mail-password).
- `redis` down: see [Login answers 503](#login-answers-503).

Readiness reuses its result for 10 seconds, so a fix shows up after that.

## Mail lands in spam

**Symptom.** Mail arrives, but in the recipients' spam folder.

**Cause.** Failing SPF, DKIM or DMARC, a missing PTR record, an IP address on a blocklist, a volume that rose too fast for a new IP, or the content itself.

**Check.** Open a received mail's original source (in Gmail: **Show original**) and look for `spf=pass`, `dkim=pass` and `dmarc=pass` in `Authentication-Results`. Check the PTR record and the blocklists:

```bash
dig +short -x 203.0.113.10
IP=203.0.113.10
REV=$(echo "$IP" | awk -F. '{print $4"."$3"."$2"."$1}')
for list in zen.spamhaus.org b.barracudacentral.org bl.spamcop.net; do
    echo "$list: $(dig +short "$REV.$list" | tr '\n' ' ')"
done
```

**Fix.** Work through [When mail lands in spam](/installation/going-live#when-mail-lands-in-spam), in its order.

## `A domain for example.com already exists`

**Symptom.** Adding a sender domain under **Domains** fails with `A domain for <root> already exists` (HTTP `409`), for example `A domain for example.com already exists` when you add `mail.example.com`.

**Cause.** mailer keeps one domain per registrable domain, the part you register at a registrar (`example.com` for `mail.example.com` and `news.example.com`). The platform sending domain `mx.example.com` counts as well, so no sender domain can use `example.com` at all.

**Check.** List the registrable domains in use:

```bash
(set -a; . ./.env; docker compose exec postgres psql -U "$DB_USERNAME" -d "$DB_DATABASE" -c 'SELECT fqdn, "rootDomain" FROM domains ORDER BY "rootDomain";')
```

**Fix.** Send from a domain under a different registrable domain, for example `mail.example.net`. If a sender domain under the same registrable domain already exists, send from that one, or delete it first ([Delete a domain](/admin-guide/domains#delete-a-domain)). [Choose the domain name](/admin-guide/domains#choose-the-domain-name) explains the rule.

## The backend does not start after changing `MAIL_HOSTNAME`

**Symptom.** After you changed `MAIL_HOSTNAME` in `.env` and ran `docker compose up -d`, `backend` keeps restarting.

**Cause.** The backend switches the sending domain to the new name when it starts, and refuses before it changes anything when the new name is registered as a sender domain or sits under the registrable domain of an existing sender domain. The old sending domain and every customer record stay as they were.

**Check.**

```bash
docker compose logs --tail 50 backend | grep 'MAIL_HOSTNAME'
```

```text
mailer-backend-1  | Error: MAIL_HOSTNAME mx.example.net shares the registrable domain example.net with the customer domain mail.example.net. Rename MAIL_HOSTNAME or delete that domain before switching.
```

The other refusal reads `MAIL_HOSTNAME mx.example.net is registered as a customer domain. Delete that domain before switching the sending domain to it.`

**Fix.** Set `MAIL_HOSTNAME` in `.env` back to the old name and run `docker compose up -d`; mailer starts as before. Then either pick a name outside every sender domain's registrable domain, or delete the sender domain the message names under **Domains** ([Delete a domain](/admin-guide/domains#delete-a-domain)), and follow [Change MAIL_HOSTNAME](/admin-guide/settings#change-mail-hostname) again.
