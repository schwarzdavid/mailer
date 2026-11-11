# Glossary

This page explains, in a sentence or two each, the terms used across the documentation. Each term links to the page that explains it in full.

## Mail and DNS

**Block.** A temporary stop on sending to one address after it bounced: at once after a permanent bounce, or after 3 transient bounces within 7 days. It runs out on its own after 7, 30, 90 or 365 days. See [When an address is blocked](/admin-guide/bounces#when-an-address-is-blocked).

**Bounce.** The report that a mail could not be delivered. A **permanent** bounce (a `5xx` reply, for example "no such user") means the address will not work; a **transient** one (a `4xx` reply or a delayed delivery, for example "mailbox full") means it may work later. See [Bounces](/admin-guide/bounces).

**Bounce mailbox.** The mailbox `bounce@` plus `MAIL_HOSTNAME` on mailer's mail server, where bounce reports arrive and where the backend reads them every 60 seconds. See [How bounces reach mailer](/admin-guide/bounces#how-bounces-reach-mailer).

**DKIM** (DomainKeys Identified Mail). mailer signs every mail with a private key of the `From` domain and publishes the matching public key as a TXT record at `s1._domainkey.<domain>`, so receivers can check that the mail is genuine and unchanged. See [Publish the three records](/admin-guide/domains#publish-the-three-records).

**DMARC** (Domain-based Message Authentication, Reporting and Conformance). A TXT record at `_dmarc.<domain>` that tells receivers what to do with mail failing SPF and DKIM: nothing (`p=none`), spam folder (`p=quarantine`) or rejection (`p=reject`). See [Tighten DMARC step by step](/installation/going-live#tighten-dmarc-step-by-step).

**DSN** (delivery status notification). The machine-readable bounce report a receiving server sends back, naming each failed recipient, the action (`failed` or `delayed`) and a status code such as `5.1.1`. See [How bounces reach mailer](/admin-guide/bounces#how-bounces-reach-mailer).

**Envelope sender, return path.** The hidden address a mail carries besides the visible `From:`, to which bounces are returned; receivers store it as the `Return-Path` header. mailer uses `bounce@` plus `MAIL_HOSTNAME` for every mail. See [Mail terms in two sentences each](/introduction/how-it-works#mail-terms-in-two-sentences-each).

**IP warm-up.** Raising the number of mails a new IP address sends per day slowly over the first weeks, so large providers build trust in it instead of filing its mail as spam. See [Warm up the IP address](/installation/going-live#warm-up-the-ip-address).

**MX record.** The DNS record that names the mail server accepting mail for a domain. `MAIL_HOSTNAME` points to itself, so bounce reports reach your server. See [Step 2: DNS records](/installation/first-run-setup#step-2-dns-records).

**PTR record, reverse DNS.** The record that maps your server's IP address back to a name, `MAIL_HOSTNAME`. You set it at your hosting provider, not in your DNS zone. See [Set the reverse DNS](/installation/prepare-server#set-the-reverse-dns-ptr-record).

**Ready to send.** The state a sender domain needs before mailer sends from it: an active DKIM key, at least one DNS record and every record **Valid**. See [Sending needs valid records](/admin-guide/domains#sending-needs-valid-records).

**Registrable domain.** The part of a name you buy at a registrar, for example `example.net` for `mail.example.net`. mailer keeps one domain per registrable domain. See [Choose the domain name](/admin-guide/domains#choose-the-domain-name).

**Sender domain.** A customer domain that your websites' mail comes from, for example `mail.example.net`, added under **Domains** and assigned to projects. See [Domains](/admin-guide/domains).

**Sending domain.** The server's own mail identity, the single name in `MAIL_HOSTNAME`, for example `mx.example.com`. It is the mail server's name, the domain of the return path and the SPF include of every sender domain. See [Settings](/admin-guide/settings).

**SPF** (Sender Policy Framework). A TXT record that lists the servers allowed to send mail for a domain. The sending domain lists your server's IP addresses; each sender domain includes the sending domain's record. See [Publish the three records](/admin-guide/domains#publish-the-three-records).

**STARTTLS.** The command that switches a plain mail connection to an encrypted one. The backend requires it when it hands mail to the mail server, and the mail server offers it on port 25. See [SMTP_REQUIRE_TLS](/configuration/environment#smtp-require-tls).

**VERP** (variable envelope return path). A separate return path per mail, which would let mailer link a bounce to the mail that caused it. mailer does not use it yet. See [Roadmap](/reference/roadmap#link-bounces-to-the-mail-that-caused-them).

## mailer

**API key.** A secret starting with `sdm_` that lets your own server send mail through the send API for one project. It is shown once when created. See [Create an API key](/admin-guide/send-api#create-an-api-key).

**Delivery.** One e-mail for one receiver of one form submission. It is `pending` until mailer's mail server accepts it (`sent`) or mailer gives up (`failed`). See [Deliveries](/admin-guide/inbound-forms/deliveries).

**Form key.** The random value at the end of a form's endpoint URL, for example `3f9a0c1e7b2d4a6f8e5c9b0d1a2f4e6c` in `/api/v1/forms/3f9a0c1e7b2d4a6f8e5c9b0d1a2f4e6c`. mailer sets it when the form is created; it cannot be changed, and its casing in the URL does not matter. See [Create the form](/admin-guide/inbound-forms/create#create-the-form).

**Honeypot.** A form input that people never see and leave empty, while bots fill it in; mailer treats a filled-in honeypot as spam. See [Honeypot](/admin-guide/inbound-forms/security#honeypot).

**Inbound form.** mailer's side of a contact form on a website: a public endpoint the website posts to, with fields, security checks and receivers. See [Create a form](/admin-guide/inbound-forms/create).

**Member, project role.** A user given access to one project, with exactly one project role there (**Viewer**, **Editor**, **Maintainer**, **Owner** or a custom one). See [Project roles](/admin-guide/users-and-roles#project-roles).

**Project.** The group of everything that belongs to one website: its forms, sender domains, members, API keys and sent mail. See [Projects](/admin-guide/projects).

**Receiver.** One e-mail that goes out for every accepted form submission, from a sender address on the form's domain to a recipient. See [Receivers and templates](/admin-guide/inbound-forms/receivers-and-templates).

**Recovery sweep.** The job that, every minute, queues form deliveries again that are still `pending` but no longer waiting for a retry, for example after Redis was down. See [The recovery sweep](/admin-guide/inbound-forms/deliveries#the-recovery-sweep).

**Send API.** The endpoint `POST /api/v1/send`, through which your own server sends one mail per request with an API key. See [Send API](/admin-guide/send-api).

**Setup token.** A one-time value the backend writes to its log while no user exists; the setup wizard asks for it before it creates the first account. See [Read the setup token](/installation/first-run-setup#read-the-setup-token).

**Template.** The subject and HTML body of a receiver's e-mail, written in Handlebars, with placeholders for the submitted fields. See [Write the template](/admin-guide/inbound-forms/receivers-and-templates#write-the-template).

**Timed token.** A token the website requests before it submits a form; it becomes valid after a minimum delay, expires, and works once. See [Timed token](/admin-guide/inbound-forms/security#timed-token).

## Operations

**Advisory lock.** A lock that Postgres holds on behalf of mailer until a transaction ends. It keeps two migration runs, or two bounce polls, from running at the same time. See [Background jobs run on one instance](/operations/scaling#background-jobs-run-on-one-instance).

**Lease.** A row in the `locks` table that names the backend instance running a background job, renewed every 10 seconds and expiring 30 seconds after the last renewal, so each job runs on one instance only. See [Background jobs run on one instance](/operations/scaling#background-jobs-run-on-one-instance).

**Liveness, readiness.** The two health endpoints: `/api/health` checks that the backend reaches its database, `/api/health/ready` also checks Redis and the mail server. See [Health checks](/configuration/health-checks).

**Migration.** A numbered step that changes the database schema. The backend applies pending migrations itself every time it starts. See [Migrations run on start](/operations/updating#migrations-run-on-start) and [CLI](/reference/cli#migrations).

**Rate limit.** A cap on how many requests one caller may make within a time window; requests over it get `429`. See [Rate limits](/configuration/rate-limits).

**Request id.** A random id the backend gives every request, returns in the `X-Request-Id` header and writes into every log entry of that request as `reqId`. See [Follow one request](/configuration/logging#follow-one-request).

**`TRUST_PROXY`.** The setting that tells the backend how many proxies in front of it report the real visitor address, so rate limits count visitors and not the proxy. See [TRUST_PROXY](/configuration/reverse-proxy#trust-proxy).
