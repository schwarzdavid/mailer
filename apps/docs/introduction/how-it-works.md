# How it works

This page explains the parts mailer runs on your server and what happens to a mail from the moment a website hands it over. After reading it you can place every later installation step and every error message in the picture.

## The stack

mailer runs as one Docker Compose project with five services, all defined in a single `compose.yml`:

![Diagram of the mailer stack: browsers and websites reach the Caddy proxy over HTTPS; Caddy forwards to the backend; the backend uses Postgres and Redis, sends through the mail server and reads bounces from it; the mail server talks to recipients' mail servers on port 25.](/diagrams/stack.svg)

_The five services of the `mailer` compose project and the ports between them._

| Service    | What it is                                  | What it does                                                                                                                                                                                                                                     |
| ---------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `proxy`    | Caddy, a web server                         | Answers on ports 80 and 443, obtains and renews free TLS certificates from Let's Encrypt for your two host names, and forwards every request to the backend. It is the only way into the backend.                                                |
| `backend`  | mailer itself (Node.js)                     | Serves the admin UI and the API under `/api`, sends mail, runs the delivery queue worker and the background jobs. It applies database migrations itself every time it starts.                                                                    |
| `postgres` | PostgreSQL 17                               | Stores everything: users, projects, domains and their DKIM keys, forms, submissions, sent mail and bounces.                                                                                                                                      |
| `redis`    | Redis 8                                     | Holds the queue of form deliveries waiting to be sent, and the rate-limit counters. It runs with persistence on and never evicts data, so queued deliveries survive a restart.                                                                   |
| `mail`     | docker-mailserver, a packaged Postfix setup | Hands mail over to recipients' mail servers on port 25 and receives bounces for its own mailbox there. The backend submits mail to it on port 587 and reads the bounce mailbox on port 143; those two ports are reachable only inside the stack. |

You need two host names in DNS, both pointing at the server:

- **`SITE_ADDRESS`**, for example `app.example.com`: the address of the admin UI and the API.
- **`MAIL_HOSTNAME`**, for example `mx.example.com`: the name of the mail server. It is also the platform's own **sending domain**, the identity every outgoing mail carries in its envelope, whichever website it is for.

Caddy gets a certificate for both names. The mail server reuses Caddy's certificate for `MAIL_HOSTNAME` to encrypt its connections, which is why it can only start properly once Caddy has that certificate.

## Mail terms in two sentences each

You meet these terms throughout the installation. Each one is a DNS record or a mechanism that receiving mail servers use to decide whether your mail is genuine.

- **Envelope sender and return path.** Besides the `From:` address a reader sees, every mail carries a hidden envelope sender, the address bounces are returned to; the receiving server stores it as the `Return-Path` header. mailer always uses `bounce@mx.example.com` (`bounce@` plus your `MAIL_HOSTNAME`) as the envelope sender, so all bounces come back to its own mailbox.
- **SPF** (Sender Policy Framework). A TXT record on a domain that lists the servers allowed to send mail for it. Receivers check it against the envelope sender's domain, so `MAIL_HOSTNAME` lists your server's IP addresses, and each customer domain includes `MAIL_HOSTNAME`'s list.
- **DKIM** (DomainKeys Identified Mail). The backend signs every mail with a private key that belongs to the `From:` domain, and publishes the matching public key as a TXT record. Receivers verify the signature with it and know the mail was not altered and really comes from a server the domain trusts.
- **DMARC** (Domain-based Message Authentication, Reporting and Conformance). A TXT record at `_dmarc.<domain>` that tells receivers what to do with mail that fails SPF and DKIM for that domain: nothing (`p=none`), the spam folder (`p=quarantine`) or rejection (`p=reject`).
- **PTR record (reverse DNS).** The record that maps your server's IP address back to a name. Large mail providers reject or junk mail from an IP whose reverse DNS does not point to the name the server introduces itself with, here `MAIL_HOSTNAME`. You set it at your hosting provider, not in your DNS zone.
- **MX record.** Names the mail server that accepts mail for a domain. `MAIL_HOSTNAME` gets an MX record pointing to itself, so bounces addressed to `bounce@mx.example.com` reach your server.
- **Bounce.** A message saying a mail could not be delivered. A **permanent** bounce (a `5xx` reply, for example "no such user") means the address will not work; a **transient** one (a `4xx` reply, for example "mailbox full") means it may work later.
- **STARTTLS.** A command that switches an unencrypted mail connection to an encrypted one. The backend requires it on both of its connections to the mail server, and the mail server offers it to other mail servers on port 25.

## The life of a form submission

1. A visitor submits the contact form on your website. The browser posts it to `https://app.example.com/api/public/form/<slug>`, where `<slug>` is the form's short name.
2. The backend checks the form's security settings, validates the fields and stores the submission together with one `pending` delivery per receiver, in one database transaction.
3. Each delivery is put on the queue in Redis, and the endpoint answers right away. The visitor does not wait for any mail server.
4. The queue worker inside the backend picks up the delivery, renders the receiver's template, signs the mail with the DKIM key of the receiver's sender domain and submits it to the `mail` service on port 587.
5. The mail server delivers it to the recipient's mail server on port 25.

When something goes wrong along the way:

- **A temporary failure** (the relay answers with a `4xx`, the connection fails) is retried. A delivery gets up to 8 attempts in total with growing pauses, starting at one minute and adding up to about two hours.
- **A permanent failure** (a `5xx` rejection, a blocked recipient, a receiver or template deleted in the meantime) marks the delivery `failed` at once.
- **Redis down or a job lost in a restart** only delays a delivery. Forms with the timed token are the exception: they refuse submissions with `403 Form token could not be verified` until Redis is back. The delivery row in the database is the source of truth: a recovery sweep runs every minute and puts every delivery back on the queue that is still `pending` two minutes after the retry pause of its last attempt has ended.
- **The backend dies right after the mail server accepted a mail** but before the delivery was marked as sent: the delivery is sent a second time. A rare duplicate is the price for never losing a mail.

## The life of an API send

The send API is synchronous. Your code calls `POST https://app.example.com/api/v1/send` with an API key, the backend checks that the `from` address uses a domain of the key's project, signs the mail with that domain's DKIM key and submits it to the mail server while the request waits. It answers `202` with the id of the stored mail once the mail server has accepted it, and `502` with the code `DELIVERY_FAILED` when it has not. There is no queue and no automatic retry for API sends: your code retries a failed request itself. Every error code is on [Errors](/api/errors).

## The bounce loop

Bounces reach mailer in two ways:

- **At send time.** When the mail server refuses a recipient address while the backend hands the mail over (a `5xx` reply to `RCPT TO` whose enhanced status code says the address does not exist or is invalid: `5.1.1`, `5.1.2`, `5.1.3`, `5.1.6` or `5.1.10`), the backend records a permanent bounce immediately.
- **Later, by mail.** When a recipient's server accepts the mail first and then fails to deliver it, it sends a bounce report to the envelope sender, `bounce@mx.example.com`. The mail server stores it in the bounce mailbox, and the backend reads that mailbox over IMAP every 60 seconds.

An address with a permanent bounce is blocked at once, and an address with 3 transient bounces within 7 days is blocked too. mailer sends nothing to a blocked address. A block runs out on its own: the first one lasts 7 days, the next ones for the same address 30, 90 and then 365 days. An admin can lift a block earlier in the admin UI.

::: tip
The bounce mailbox only grows. The backend marks the bounce reports it has processed as read and never deletes them. The mailbox lives in the `mail-data` volume; it is small, but there is no automatic cleanup yet.
:::

## Background jobs

The backend runs these jobs on its own. You never start them by hand.

| Job                 | Interval         | What it does                                                                                     |
| ------------------- | ---------------- | ------------------------------------------------------------------------------------------------ |
| DNS check           | every 15 minutes | Looks up every DNS record of every domain and marks each one **Valid** or **Invalid** in the UI. |
| Bounce poller       | every 60 seconds | Reads new bounce reports from the bounce mailbox and records them.                               |
| Delivery recovery   | every minute     | Re-queues form deliveries that are still `pending` and no longer waiting for a retry pause.      |
| Project trash purge | every hour       | Permanently deletes projects (and their forms) that were deleted more than 30 days ago.          |

If you run several backend instances against one database, each job still runs on only one instance at a time. Most jobs use a lease in the database: the instance that holds it runs the job, and another one takes over 30 seconds after that instance stops renewing it. The bounce poller instead takes a Postgres advisory lock for each round, and an instance that finds it taken skips the round. A run that is still going when the next interval comes is skipped, never started twice. A single server with the bundled compose file runs one instance, so you do not need to think about this for a normal installation.

## Next steps

Check [Requirements](/introduction/requirements) before you prepare a server.
