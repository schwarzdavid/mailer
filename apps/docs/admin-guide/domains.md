# Domains

This page walks you through adding a customer sending domain, the domain your websites' mail comes from, and publishing its three DNS records. At the end the domain shows **Valid** in the admin UI and is ready to be assigned to a project.

In the admin UI these domains are called **sender domains**. Do not confuse them with the **sending domain** under **Settings**: that is the server's own mail identity, the name in `MAIL_HOSTNAME` (for example `mx.example.com`), which you set up during the [first-run setup](/installation/first-run-setup). This page uses `mail.example.net` as the customer's sender domain.

## Before you start

- You need the global permissions **View domains** and **Create domains**, and **Update domains** to trigger a DNS check by hand. [Users and roles](/admin-guide/users-and-roles) explains permissions.
- You need access to the DNS zone of the domain, or someone who has it.
- The first-run setup must be finished. Adding a domain before the sending domain exists fails with `No sending domain configured.`

## Choose the domain name

**Use a subdomain that only sends mail**, such as `mail.example.net`, rather than the customer's main domain `example.net`. The main domain usually has its own mail, with its own SPF and DMARC records; a dedicated subdomain keeps form mail and regular mail apart, and its records do not clash with existing ones. When you enter a main domain, the dialog warns **Use a subdomain if you can**, but lets you continue.

**mailer keeps one domain per registrable domain.** The registrable domain is the part you buy at a registrar: `example.net` for `mail.example.net`, `example.co.uk` for `mail.example.co.uk`. Once `mail.example.net` exists, mailer refuses `news.example.net` or `example.net` with the error:

```text
A domain for example.net already exists
```

The platform sending domain counts too: it already occupies the registrable domain of `MAIL_HOSTNAME`. With `MAIL_HOSTNAME=mx.example.com`, no sender domain under `example.com` can be added, and the attempt answers `A domain for example.com already exists`. Choose the subdomain with this in mind, because the first name you add under a registrable domain is the only one. If you need a different name later, delete the domain (see [Delete a domain](#delete-a-domain)) and add the new one.

The name must be a public domain under a real top-level domain; otherwise the dialog refuses it.

## Add the domain

1. Open **Domains** in the navigation and click **New domain**.
2. In the dialog **New sender domain**, enter the **Domain name**, for example `mail.example.net`.
3. Click **Add domain**.

mailer opens the domain's page. In the background it has:

- generated a DKIM key pair for the domain: a 2048-bit RSA key with the selector `s1`. The private key is stored encrypted with `BACKEND_ENCRYPTION_SECRET`; the public key goes into the DKIM record.
- built the three DNS records the domain needs, all with the status **Invalid** and **Not checked yet**. mailer does not look them up until the next scheduled check or until you click **Check again**.

![The page of the domain mail.example.net with the DNS records card: SPF, DKIM and DMARC records, each with host, value, copy buttons and the status Invalid](/screenshots/admin-guide/domain-detail.png)

_The domain's page before its records are published: three records, all **Invalid**, and the **Check again** button in the top right of the card._

## Publish the three records

The card **DNS records** lists each record with its **Host** and **Value**, each with a copy button. Create them in the DNS zone of `example.net`. With the example names they are:

| Record | Host                             | Type  | Value                                |
| ------ | -------------------------------- | ----- | ------------------------------------ |
| SPF    | `mail.example.net`               | `TXT` | `v=spf1 include:mx.example.com ~all` |
| DKIM   | `s1._domainkey.mail.example.net` | `TXT` | `v=DKIM1; k=rsa; p=<public key>`     |
| DMARC  | `_dmarc.mail.example.net`        | `TXT` | `v=DMARC1; p=none;`                  |

In zone-file notation (the DKIM key shortened):

```dns
mail.example.net.                300  IN  TXT  "v=spf1 include:mx.example.com ~all"
s1._domainkey.mail.example.net.  300  IN  TXT  "v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA…"
_dmarc.mail.example.net.         300  IN  TXT  "v=DMARC1; p=none;"
```

What each record protects:

- **SPF** (Sender Policy Framework) lists the servers allowed to send mail for the domain. `include:mx.example.com` points to the SPF record of your platform sending domain, which lists your server's IP addresses, so the customer's record stays correct even when your server's addresses change. `~all` asks receivers to treat mail from any other server with suspicion rather than reject it outright.
- **DKIM** (DomainKeys Identified Mail) publishes the public key that matches the private key mailer signs every mail from this domain with. A receiver uses it to check that the mail really comes from your server and was not changed on the way. The value is generated for this domain only: copy it from the domain's page, never from this page or from another domain.
- **DMARC** (Domain-based Message Authentication, Reporting and Conformance) tells receivers what to do with mail that claims to come from the domain but fails SPF and DKIM. `p=none` only observes: receivers take no action and, because the record names no report address, send no reports. Tighten it once the domain has sent mail without problems for a while; [Going live](/installation/going-live#tighten-dmarc-step-by-step) explains the steps.

::: warning One SPF record per name
A name may have only one SPF record. If `mail.example.net` already has one, keep it and add the include to it instead of creating a second record. mailer checks SPF by content: the record is **Valid** when it is the only SPF record at the name and contains the generated `include:` (or `ip4:`/`ip6:`) mechanisms. The qualifier of the closing `all` term (`~all`, `-all`) and any further mechanisms do not matter. This is one more reason to use a dedicated subdomain without an SPF record of its own.

DMARC is checked by content too: the record must start with `v=DMARC1` and carry a `p=` tag; any policy is accepted. DKIM must match the generated value; DKIM values longer than 255 characters may be split into several quoted strings in a zone file, and mailer joins them before it compares.
:::

## Check the records

mailer checks the DNS records of every domain, sender domains and the sending domain alike, every 15 minutes. With several backend instances, only one of them runs the check.

To check right away, click **Check again** on the domain's page. This is the domain's refresh action; it needs **Update domains**. If nothing changed and records are still missing, a message says **All records are still invalid**. DNS changes can take from minutes to, rarely, a day to show up.

What the statuses mean:

- **Valid**: DNS returned a record that passes the check: the generated value for DKIM, a record with the required content for SPF and DMARC.
- **Invalid** with **No record found at this host yet.**: there is no record of this type at the host.
- **Invalid** with **Found a different value**: there is a record, but it does not pass. Open it to see what DNS returns, together with advice:
    - For DKIM: **Replace the existing record with the value above.**
    - For SPF without the include: **This domain already has an SPF record. Keep it and add the mailer include; this is the merged value:** followed by the existing record with the missing mechanisms inserted before its `all` term, ready to copy.
    - For DMARC without a policy: **Keep your DMARC record and make sure it has a policy tag: p=none, p=quarantine or p=reject.**
- **Invalid** with **Several SPF records were found. A name may have only one; merge them into one record.**: the name has more than one SPF record. Merge them into one.

The badge next to the domain's name sums the three up: **Valid** when all three are valid, **Invalid** when none is, and for example **2 of 3 valid** in between. The **Domains** list shows the same badge and when the records were last checked.

mailer looks the records up through the DNS resolver of the server it runs on. A resolver that caches an old answer can delay the change by the record's TTL, the time a DNS answer may be cached.

## Sending needs valid records

mailer sends from a sender domain only when it is **ready to send**: the domain has an active DKIM key and at least one DNS record, and every record shows **Valid**. The rule is set by [`SEND_REQUIRE_VALID_DNS`](/configuration/environment#send-require-valid-dns), which is `true` unless you changed it. Besides this, the backend checks that the `From` address uses exactly the domain's name (`anything@mail.example.net`, not `@example.net` or `@news.mail.example.net`) and that the domain is assigned to the sending project.

What happens while a domain is not ready:

- **Send API.** The request is refused with `422` and the code `FROM_DOMAIN_NOT_READY`; the message is `The from domain has DNS records that are not valid yet` (or `The from domain has no active DKIM key`, which does not occur in normal operation). Nothing is recorded on **Sent mail**.
- **Form deliveries.** The e-mail stays `pending` and is retried for about two hours, 8 attempts in all. If the domain is still not ready at the last attempt, the delivery becomes `failed` with the error `Domain 3 (mail.example.net) has DNS records that are not valid yet`. A resend by hand is possible afterwards ([Deliveries](/admin-guide/inbound-forms/deliveries#a-domain-that-is-not-ready-to-send)).

To speed things up, fix the records that are **Invalid** and click **Check again** on the domain's page. The statuses otherwise change only with the 15-minute check, so a record you have just corrected can keep the domain from sending for up to 15 minutes. The check also runs once after each start of the backend.

The same rule means that a change of `MAIL_HOSTNAME` stops sending for every customer domain until its owner has updated the SPF record and a check has run ([Change MAIL_HOSTNAME](/admin-guide/settings#change-mail-hostname)).

The admin UI words the same rule softly: the dialog for assigning a domain to a project states **Unverified domains can be assigned, but forms can't send from them until their DNS records are valid.**, and the dashboard lists such a domain as **mail.example.net can't send yet**. Both describe what the backend enforces.

## How customer domains use the sending domain

Every mail from `mail.example.net` goes out through your server, whose own identity is the platform sending domain `mx.example.com`:

- **From** is the address your website or form uses, for example `contact@mail.example.net`.
- **DKIM** signs the mail with the key of `mail.example.net`, the domain in the `From` address. The signature's domain therefore matches the `From` domain, which is what DMARC requires.
- **Return path**, the envelope sender address that bounce reports go to, is `bounce@mx.example.com`. Bounce reports for every customer domain therefore land in the one bounce mailbox of your server, where mailer reads them; the [Bounces](/admin-guide/bounces) page of this guide explains what happens next.
- **SPF** of `mail.example.net` includes `mx.example.com`, so it lists your server through the sending domain's record.

A change of the server's IP addresses does not touch the sender domains, because their SPF records name `mx.example.com`, not addresses. If `MAIL_HOSTNAME` changes, mailer rewrites the SPF value of every sender domain to include the new name, and every customer must update the SPF record in their zone. [Settings](/admin-guide/settings#when-mail-hostname-changes) describes the switch.

## Recipient rejections at send time

When mailer hands a mail to the mail server, the server may refuse a recipient right away. mailer records such a refusal as a **permanent bounce**, which blocks the address for future mail, only when all of these hold:

- the refusal comes in reply to the `RCPT TO` command, the step that names the recipient;
- the reply code is 5xx, a permanent error;
- the reply carries one of the enhanced status codes `5.1.1` (mailbox does not exist), `5.1.2` (domain does not exist or accepts no mail), `5.1.3` (malformed address), `5.1.6` (mailbox has moved) or `5.1.10` (domain explicitly accepts no mail).

Any other refusal marks the mail **Failed** on the project's **Sent mail** page without recording a bounce. Recipients that the receiving server rejects later, after your mail server has accepted the mail, come back as bounce reports to `bounce@mx.example.com`; the [Bounces](/admin-guide/bounces) page of this guide covers both kinds.

## Assign the domain to a project

A domain sends nothing until it is assigned to a project: open the project, click **Assign domain** in **Sender domains** and choose the domain. [Projects](/admin-guide/projects#assign-sender-domains) has the details. The domain's page lists the projects using it under **Used by**.

## Delete a domain

You need **Delete domains**. On the domain's page, in **Delete domain**, click **Delete domain…** and confirm with **Delete domain**. The button is disabled while a project uses the domain (**mail.example.net is used by Acme Website. Unassign it there before you can delete it.**); the backend also refuses while a form still sends from it.

Deleting removes the domain and its DKIM key for good. If you add the same name again, mailer generates a new key, and the DKIM record in DNS must be replaced with the new value.

## How you know it worked

On the domain's page, the badge next to `mail.example.net` shows **Valid**, the card reads **3 of 3 records valid**, and each record shows **Valid**. The **Domains** list shows the same badge, and the dashboard no longer lists **mail.example.net can't send yet** under **Needs attention**.

From any machine, the three records resolve with exactly the values from the domain's page:

```bash
dig +short TXT mail.example.net @1.1.1.1
dig +short TXT s1._domainkey.mail.example.net @1.1.1.1
dig +short TXT _dmarc.mail.example.net @1.1.1.1
```

```text
"v=spf1 include:mx.example.com ~all"
"v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA…"
"v=DMARC1; p=none;"
```

Next, assign the domain to a project as described on [Projects](/admin-guide/projects#assign-sender-domains).
