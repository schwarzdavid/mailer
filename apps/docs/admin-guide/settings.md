# Settings

This page explains the **Settings** page, which holds the platform sending domain: the server's own mail identity. It walks you through changing the server's IP addresses and explains what happens when `MAIL_HOSTNAME` changes. At the end the sending domain's DNS records match your server again and the page shows them all as valid.

The **platform sending domain** is the host name your server sends mail as, the value of `MAIL_HOSTNAME` in `.env`, for example `mx.example.com`. There is exactly one. mailer uses it as the name of the mail server, as the address bounce reports go to (`bounce@mx.example.com`) and as the SPF include of every customer's sender domain. The customer domains themselves are on [Domains](/admin-guide/domains).

You need **View settings** to open the page and **Update settings** to change anything on it.

## The Settings page

Open **Settings** under **Administration**.

![The Settings page with the Sending domain card showing mx.example.com and the server addresses 203.0.113.10 and 2001:db8::10, and below it the DNS records card with 0 of 8 records valid](/screenshots/admin-guide/settings.png)

_**Settings** with the **Sending domain** card and the **DNS records** card below it._

### The Sending domain card

- **Domain name** shows `MAIL_HOSTNAME`. It cannot be edited here; the hint below says so: **Set by MAIL_HOSTNAME in the server configuration. Change it there and restart the server to switch.** See [When MAIL_HOSTNAME changes](#when-mail-hostname-changes).
- **Server IPv4 address** (required) and **Server IPv6 address (optional)** are the public addresses your server sends from. You entered them in the [first-run setup](/installation/first-run-setup#step-2-sending-domain). mailer builds the A, AAAA, SPF and PTR records from them.

Users without **Update settings** see the same values read-only.

### The DNS records card

**DNS records** lists every record the sending domain needs, with **Host**, **Value**, copy buttons and a status, as in the first-run setup: **A**, **MX**, **SPF**, **PTR (IPv4)**, **DKIM** and **DMARC**, plus **AAAA** and **PTR (IPv6)** when an IPv6 address is set. That is 8 records, or 6 without IPv6. [First-run setup](/installation/first-run-setup#step-3-dns-records) lists every record with example values and explains each one. The PTR records are set at your hosting provider, all others in your DNS zone.

mailer checks the records every 15 minutes. **Check again** looks them up right away. When every record is valid, the card shows **All 8 records are valid** with **mx.example.com is fully set up for reliable delivery.** DKIM, A, AAAA, MX and PTR must match the value in the card exactly; SPF and DMARC are checked by content ([Publish the three records](/admin-guide/domains#publish-the-three-records)).

While a record is not valid, the navigation shows a dot next to **Settings** and the dashboard lists the invalid records under **Needs attention**; [Admin guide overview](/admin-guide/overview#the-dns-health-alert) explains the alert. The dashboard's **Delivery health** card offers the same check as **Check now**.

## Change the server IP addresses

Do this when the server gets a new IP address, for example after moving to another machine with the same `MAIL_HOSTNAME`. The example changes the IPv4 address from `203.0.113.10` to `203.0.113.20`.

1. **Update the address records.** In your DNS zone, change the A record of `mx.example.com` to the new address (and the AAAA record if the IPv6 address changes). At your hosting provider, set the PTR record of the new address to `mx.example.com`, as on [Prepare the server](/installation/prepare-server#set-the-reverse-dns-ptr-record).
2. **Save the new address in mailer.** On **Settings**, enter the new **Server IPv4 address** (and **Server IPv6 address (optional)**) and click **Save**. Confirm the dialog **Change the server addresses?** with **Change addresses**.
3. **Update the SPF record.** The SPF value in **DNS records** now lists the new address, for example `v=spf1 ip4:203.0.113.20 ip6:2001:db8::10 -all`. Replace the SPF record of `mx.example.com` in your DNS zone with it, using the copy button.
4. **Check.** Once DNS has caught up, click **Check again**.

What mailer does when you save: it generates every record of the sending domain again from the new addresses and looks them up once right away. The DKIM key stays the same, so the DKIM record does not change. Your customers' sender domains are not affected: their SPF records include `mx.example.com` instead of naming addresses, so mailer leaves their records and statuses as they are and they keep sending.

::: warning Mail may be rejected in between
Until the A, SPF and PTR records point to the new address, receivers see mail from an address your DNS does not name, and may reject it or file it as spam. Change DNS first and keep the gap short.
:::

## When MAIL_HOSTNAME changes

`MAIL_HOSTNAME` is read from `.env` when the backend starts. If it differs from the stored sending domain, the backend switches the sending domain on that start, before it answers requests. With several backend instances, a database lock (a Postgres advisory lock) makes sure only one of them does it.

What the switch does:

- **It refuses to start if the new name is a customer domain.** If the new name is registered under **Domains**, the backend stops with:

    ```text
    MAIL_HOSTNAME mx2.example.com is registered as a customer domain. Delete that domain before switching the sending domain to it.
    ```

- **It refuses to start if the new name sits under a customer's registrable domain**, as the danger box below describes.
- **It replaces the sending domain.** It removes the old sending domain with its DKIM key and records, and creates the new one with a **new DKIM key** and new records for all 8 (or 6) entries, using the IP addresses stored in **Settings**. It checks the new records once right away.
- **It rewrites the SPF include of every customer domain** to the new name, for example `v=spf1 include:mx2.example.com ~all` for `mail.example.net`, and marks those records **Invalid**. Their DKIM and DMARC records stay as they are. mailer sends only from domains whose records are all valid ([Sending needs valid records](/admin-guide/domains#sending-needs-valid-records)), so with `SEND_REQUIRE_VALID_DNS=true`, the default, every customer domain stops sending until its owner has published the new include and a check has run.

From then on mail goes out as the new name, and bounce reports go to `bounce@` plus the new name.

::: danger Pick a name outside your customers' domains
The new name must not sit under the same registrable domain as an existing sender domain, for example `mx.example.net` while `mail.example.net` exists, because mailer keeps one domain per registrable domain (see [Domains](/admin-guide/domains#choose-the-domain-name)). The backend checks this before it changes anything and refuses to start with:

```text
MAIL_HOSTNAME mx.example.net shares the registrable domain example.net with the customer domain mail.example.net. Rename MAIL_HOSTNAME or delete that domain before switching.
```

`backend` then keeps restarting and the admin UI and the APIs are down. Nothing is deleted: the old sending domain, its DKIM key and records and the customers' SPF values stay as they were.

To recover, set `MAIL_HOSTNAME` in `.env` back to the old name and run `docker compose up -d`; mailer starts with the old sending domain as before. Then either choose a new name outside every sender domain's registrable domain, or, if you really want the name, delete the conflicting domain under **Domains** first ([Delete a domain](/admin-guide/domains#delete-a-domain)), which stops all sending from it. Then follow [Change MAIL_HOSTNAME](#change-mail-hostname) again.
:::

## Change MAIL_HOSTNAME

The example renames the sending domain from `mx.example.com` to `mx2.example.com`. You need shell access to the server, access to the DNS zone of the new name and to the reverse DNS settings at your hosting provider, and **Update settings** in the admin UI. All commands run in the install directory:

```bash
cd /opt/mailer
```

The platform stops sending at step 4 and sends again after step 5; until the records of step 7 are published, receivers may reject mail or file it as spam. With `SEND_REQUIRE_VALID_DNS=true` (the default), each customer domain sends again only once its SPF record carries the new include and a check has run, as the warning below explains. Plan a quiet moment.

::: warning Every customer domain stops sending after the switch
The switch marks the SPF record of every customer domain **Invalid**, and mailer sends only from domains whose records are all valid. From step 4 on, with `SEND_REQUIRE_VALID_DNS=true` (the default), every customer domain stops sending (the send API answers `422 FROM_DOMAIN_NOT_READY`, form deliveries wait and fail after about two hours) until its owner has published the new SPF include and a check has run. Announce the switch to your customers before you start, with the new value `v=spf1 include:mx2.example.com ~all` and the time of the switch, so they can update their zone right after it.
:::

::: tip Let customers publish the new include beforehand
Ask your customers to add the new include **alongside** the old one before the switch, for example `v=spf1 include:mx.example.com include:mx2.example.com ~all` for `mail.example.net`. mailer checks SPF by content and accepts extra mechanisms, so their domain is **Valid** again with the first check after the restart and sending resumes right away. They can drop the old include once the switch is done.
:::

1. **Check for a conflict.** Open **Domains** and make sure no sender domain sits under the registrable domain of the new name (for `mx2.example.com` that is `example.com`), and that the new name itself is not listed. Otherwise the backend refuses to start at step 4. For example, a rename to `mx.example.net` while the sender domain `mail.example.net` exists stops with:

    ```text
    MAIL_HOSTNAME mx.example.net shares the registrable domain example.net with the customer domain mail.example.net. Rename MAIL_HOSTNAME or delete that domain before switching.
    ```

    If one is listed, choose another name or delete that domain first; see the danger box above.

2. **Create the address records of the new name.** In the DNS zone, create an A record for `mx2.example.com` pointing to `203.0.113.10`, and an AAAA record pointing to `2001:db8::10` if you use IPv6. Wait until it resolves:

    ```bash
    dig +short A mx2.example.com @1.1.1.1
    ```

    ```text
    203.0.113.10
    ```

    This must be done before the restart: Caddy obtains the TLS certificate for `MAIL_HOSTNAME` from Let's Encrypt, which only works when the name points to this server, and the mail server reads that certificate. Without it, `mail` keeps restarting.

3. **Change `.env`.** Set the new name:

    ```bash
    sed -i 's/^MAIL_HOSTNAME=.*/MAIL_HOSTNAME=mx2.example.com/' .env
    grep '^MAIL_HOSTNAME=' .env
    ```

    ```text
    MAIL_HOSTNAME=mx2.example.com
    ```

4. **Restart the stack** with the new name:

    ```bash
    docker compose up -d
    ```

    The backend switches the sending domain while it starts. Caddy obtains the certificate for `mx2.example.com`; until it has it, `mail` restarts, which takes a few seconds to a few minutes. Wait until `docker compose ps mail` shows it as `Up`.

5. **Create the bounce mailbox for the new name** and its `postmaster` alias. The backend logs in to the mail server as `bounce@` plus `MAIL_HOSTNAME` to send and to read bounces, so every send fails until this mailbox exists:

    ```bash
    (set -a; . ./.env; docker compose exec mail setup email add "bounce@$MAIL_HOSTNAME" "$MAIL_PASSWORD")
    (set -a; . ./.env; docker compose exec mail setup alias add "postmaster@$MAIL_HOSTNAME" "bounce@$MAIL_HOSTNAME")
    ```

    The commands read `.env` in a subshell, so nothing stays exported in your shell. If `docker compose exec` answers that the container is restarting or not running, wait until `docker compose ps mail` shows `Up` and run both again. The mailbox of the old name stays in place but is no longer read.

6. **Set the PTR records.** At your hosting provider, set the reverse DNS of `203.0.113.10` (and `2001:db8::10`) to `mx2.example.com`, as on [Prepare the server](/installation/prepare-server#set-the-reverse-dns-ptr-record).
7. **Publish the new records.** Open **Settings**: **Domain name** shows `mx2.example.com` and **DNS records** lists its records. Create the MX, SPF, DKIM and DMARC records in the DNS zone of the new name with the copy buttons; the DKIM value is new. Once DNS has caught up, click **Check again**. The records of `mx.example.com` are no longer used; delete them once the new ones are valid.
8. **Notify your customers.** Every sender domain's SPF record must now read `v=spf1 include:mx2.example.com ~all`. Each domain's page under **Domains** shows the new value; send it to the owner of each zone, and click **Check again** on the domain once they have changed it.

## How you know it worked

On **Settings**, the **DNS records** card shows **All 8 records are valid** (6 without IPv6) after **Check again**, and the navigation shows no dot next to **Settings**.

After changing the IP address, the records resolve with the new values:

```bash
dig +short A mx.example.com @1.1.1.1
dig +short TXT mx.example.com @1.1.1.1
dig +short -x 203.0.113.20 @1.1.1.1
```

```text
203.0.113.20
"v=spf1 ip4:203.0.113.20 ip6:2001:db8::10 -all"
mx.example.com.
```

After changing `MAIL_HOSTNAME`, **Domain name** on **Settings** shows the new name and the backend log names the switch:

```bash
cd /opt/mailer
docker compose logs backend | grep -i "sending domain"
```

```text
mailer-backend-1  | {"level":40,…,"context":"SettingsService","msg":"Sending domain mx.example.com does not match MAIL_HOSTNAME mx2.example.com, reconfiguring it"}
mailer-backend-1  | {"level":30,…,"context":"DomainService","msg":"Created sending domain mx2.example.com"}
mailer-backend-1  | {"level":30,…,"context":"SettingsService","msg":"Configured sending domain mx2.example.com"}
```

The new name's records resolve with the values from **Settings**, and the reverse DNS points to it:

```bash
dig +short A mx2.example.com @1.1.1.1
dig +short MX mx2.example.com @1.1.1.1
dig +short TXT mx2.example.com @1.1.1.1
dig +short TXT s1._domainkey.mx2.example.com @1.1.1.1
dig +short TXT _dmarc.mx2.example.com @1.1.1.1
dig +short -x 203.0.113.10 @1.1.1.1
```

```text
203.0.113.10
10 mx2.example.com.
"v=spf1 ip4:203.0.113.10 ip6:2001:db8::10 -all"
"v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA…"
"v=DMARC1; p=none;"
mx2.example.com.
```

The mail server presents the certificate for the new name, and the backend reaches it again:

```bash
(. ./.env; openssl s_client -starttls smtp -connect "$MAIL_HOSTNAME:25" -servername "$MAIL_HOSTNAME" </dev/null 2>/dev/null | openssl x509 -noout -subject)
curl -s https://app.example.com/api/health/ready
```

```text
subject=CN=mx2.example.com
{"status":"ok","info":{"database":{"status":"up"},"redis":{"status":"up"},"smtp":{"status":"up"}},"error":{},"details":{"database":{"status":"up"},"redis":{"status":"up"},"smtp":{"status":"up"}}}
```
