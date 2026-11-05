# First-run setup

This page walks you through the setup wizard that opens on the first visit: you create the first administrator and publish the mail DNS records mailer generated for `MAIL_HOSTNAME` and the server addresses from `.env`. At the end you are signed in to the admin UI and your server has a complete mail identity.

## Read the setup token

While no user exists, anybody who reaches `https://app.example.com` could create the first account. To make sure that is you, the backend writes a one-time **setup token** to its log, and the wizard asks for it. Read it on the server:

```bash
cd /opt/mailer
docker compose logs backend | grep "Setup token"
```

The token is the 32 hexadecimal characters after `Setup token:`:

```text
mailer-backend-1  | {"level":30,…,"context":"SetupTokenService","msg":"No user exists yet. Setup token: 3f9a0c6e1b7d4e28a5c0f1e9d2b7a6c4"}
```

How the token behaves:

- **It lives only in memory.** It is not stored anywhere. Every start of the backend while no user exists creates a new token and logs it again; an older token stops working. If the command prints several lines, use the **last** one.
- **It is logged only while no user exists.** Once the first account is created, the backend no longer prints it, and creating another first account is refused.
- **Each backend instance has its own token.** With the bundled compose file there is exactly one instance. If you run several, keep it to one until the first account exists, or the token you read may belong to a different instance than the one answering your browser.

## Open the wizard

Open `https://app.example.com` in your browser. While setup is not finished, every page leads to the wizard. The bar at the top shows its two steps: **Admin account** and **DNS records**.

### Step 1: Admin account

![The Admin account step of the setup wizard with the fields Setup token, First name, Last name, Email address and Password](/screenshots/installation/onboarding-account.png)

_The first step, **Welcome to Mail Admin**, creates the first administrator._

Under **Create the admin account**, fill in:

| Field             | What to enter                                                                                       |
| ----------------- | --------------------------------------------------------------------------------------------------- |
| **Setup token**   | The token from the log, without spaces.                                                             |
| **First name**    | Your first name.                                                                                    |
| **Last name**     | Your last name.                                                                                     |
| **Email address** | The address you will log in with. It must be a valid address; mailer does not send mail to it here. |
| **Password**      | At least 8 characters.                                                                              |

Click **Create account**. The account becomes the first **Super admin**, the role that may do everything, and you are signed in right away. You can add more users after setup.

If the wizard shows **Couldn't create the account** with `Invalid setup token`, the token is wrong or from an earlier start: read the log again and use the last token. The form allows 10 attempts per minute from one IP address; if Redis is down it answers with an error instead of trying, so check `docker compose ps` first.

### Step 2: DNS records

![The DNS records step listing the A and MX records for mx.example.com with their host and value and the status Invalid](/screenshots/installation/onboarding-records.png)

_The second step, **Publish the DNS records**, lists every record with a copy button for its host and value._

The backend created these records when it started: a DKIM key for `MAIL_HOSTNAME` and one record set built from `MAIL_HOSTNAME`, `MAIL_SERVER_IPV4` and, if set, `MAIL_SERVER_IPV6`. The card is titled with the name, for example `mx.example.com`, and the **A** record shows the IPv4 address.

Each record shows its name (**A**, **MX**, **SPF** and so on), its type, what it is for, a **Host** and a **Value** with a copy button each (the **MX** record also has a **Priority** with its own copy button, because DNS providers ask for it in a separate field), and a status: **Valid** once mailer finds exactly that value in DNS, **Invalid** until then. Above the list you see how many records are valid and when they were last checked.

::: tip Wrong name or address?
Fix it now, before you publish any records. A wrong address: correct `MAIL_SERVER_IPV4` or `MAIL_SERVER_IPV6` in `.env`, run `docker compose up -d` and reload the wizard; the backend generates the records again and keeps the DKIM key. A wrong name: create the A record for the new name as on [DNS records](/installation/dns), change `MAIL_HOSTNAME` in `.env`, run `docker compose up -d`, create the bounce mailbox for the new name as on [Docker Compose](/installation/docker-compose#create-the-bounce-mailbox), set the PTR record of your IP addresses to the new name at your hosting provider, and reload the wizard. Until Caddy has obtained the certificate for the new name, `mail` restarts again, exactly as on the first start.
:::

Create the records in your DNS zone. With the example values, the full set looks like this:

| Record in the wizard | Host                           | Type   | Value                                           | Where you set it        |
| -------------------- | ------------------------------ | ------ | ----------------------------------------------- | ----------------------- |
| **A**                | `mx.example.com`               | `A`    | `203.0.113.10`                                  | DNS zone (done already) |
| **AAAA**             | `mx.example.com`               | `AAAA` | `2001:db8::10`                                  | DNS zone (done already) |
| **MX**               | `mx.example.com`               | `MX`   | `mx.example.com`, priority `10`                 | DNS zone                |
| **SPF**              | `mx.example.com`               | `TXT`  | `v=spf1 ip4:203.0.113.10 ip6:2001:db8::10 -all` | DNS zone                |
| **DKIM**             | `s1._domainkey.mx.example.com` | `TXT`  | `v=DKIM1; k=rsa; p=<public key>`                | DNS zone                |
| **DMARC**            | `_dmarc.mx.example.com`        | `TXT`  | `v=DMARC1; p=none;`                             | DNS zone                |
| **PTR (IPv4)**       | `203.0.113.10`                 | `PTR`  | `mx.example.com`                                | Hosting provider        |
| **PTR (IPv6)**       | `2001:db8::10`                 | `PTR`  | `mx.example.com`                                | Hosting provider        |

Without `MAIL_SERVER_IPV6` the wizard lists six records: the **AAAA** and **PTR (IPv6)** rows are left out, and the SPF value is `v=spf1 ip4:203.0.113.10 -all`.

In zone-file notation (the DKIM key shortened):

```dns
mx.example.com.                300  IN  MX   10 mx.example.com.
mx.example.com.                300  IN  TXT  "v=spf1 ip4:203.0.113.10 ip6:2001:db8::10 -all"
s1._domainkey.mx.example.com.  300  IN  TXT  "v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA…"
_dmarc.mx.example.com.         300  IN  TXT  "v=DMARC1; p=none;"
```

What each record does:

- **MX** sends mail addressed to `mx.example.com`, such as bounce reports to `bounce@mx.example.com`, to your server. The wizard shows the priority `10` and the mail server `mx.example.com` as separate fields, as DNS provider forms ask for them; in a zone file they form one value, `10 mx.example.com.`.
- **SPF** says that only your server's addresses may send mail with an envelope sender at `mx.example.com`, and that receivers should reject anything else (`-all`).
- **DKIM** publishes the public half of the key the backend signs mail with. `s1` is the selector, the name of the key. The value is generated for your installation: copy it from the wizard with the copy button, never from this page. It is about 400 characters long; most DNS providers accept it in one piece, while zone files split it into several quoted strings of at most 255 characters, which is fine, because mailer joins them when it checks.
- **DMARC** with `p=none` only observes: receivers take no action on mail that fails SPF and DKIM, and because the record names no report address, they send no reports either. [Going live](/installation/going-live) explains when to tighten it.
- **PTR (IPv4)** and **PTR (IPv6)** are the reverse DNS records you set at your hosting provider on [Prepare the server](/installation/prepare-server#set-the-reverse-dns-ptr-record).

::: warning Copy the values exactly
Use the copy buttons. DKIM is **Valid** only when DNS returns exactly the generated value; SPF and DMARC are checked by content. If a record shows **Found a different value**, open it to see what DNS returns and follow the advice. If `mx.example.com` already has an SPF record, merge the two into one: a name may have only one SPF record, and the admin UI suggests the merged value.
:::

After creating the records, click **Check again** to look them up immediately. DNS changes can take a while to show up, from minutes to, rarely, a day.

You do not have to wait for every record. Click **Finish setup** at any time: mailer keeps checking every 15 minutes and lists records that still need attention on the dashboard and in **Settings**.

## If you leave in the middle

The wizard remembers how far you got. If you close the browser after creating the account, open `https://app.example.com` again, log in with the account you created and the wizard continues at the step you reached.

## How you know it worked

After **Finish setup** the admin UI opens the **Dashboard**, which greets a new installation with a **Get started** list of four steps for your first website. Visiting `https://app.example.com/setup` now leads to the dashboard instead of the wizard.

Once DNS has caught up, the records you published resolve with exactly the values from the wizard. Check them on the server:

```bash
dig +short MX mx.example.com @1.1.1.1
dig +short TXT mx.example.com @1.1.1.1
dig +short TXT _dmarc.mx.example.com @1.1.1.1
dig +short TXT s1._domainkey.mx.example.com @1.1.1.1
```

```text
10 mx.example.com.
"v=spf1 ip4:203.0.113.10 ip6:2001:db8::10 -all"
"v=DMARC1; p=none;"
"v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA…"
```

In the admin UI, open **Settings** and click **Check again** on the DNS records: when every record is **Valid**, the card shows **All 8 records are valid** (6 without IPv6).

Continue with [Verify the installation](/installation/verify).
