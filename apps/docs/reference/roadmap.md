# Roadmap

This page lists the work planned for mailer and the limits it has today, in operator terms and with the workaround for each. Use it to judge whether a gap affects your installation and how to live with it until it is closed.

::: warning Planned work is not current behaviour
Nothing under [Planned work](#planned-work) exists in the current release. The items carry no dates; check the release notes of each release for what it actually ships. Everything under [Known limits](#known-limits) describes how mailer behaves today.
:::

## Planned work

### Link bounces to the mail that caused them

_Planned, not current behaviour._ Every mail mailer sends uses the same return path, `bounce@` plus `MAIL_HOSTNAME`, so a bounce report names the recipient but not the project, form delivery or API request it belongs to. A separate return path per mail (VERP) would link them.

Today: **Bounces** is one list for the whole installation, and the entry on **Sent mail** stays **Sent**. Find the mail behind a bounce by searching its recipient on **Sent mail** ([Bounces are not linked to the mail that caused them](/admin-guide/bounces#bounces-are-not-linked-to-the-mail-that-caused-them)).

### Remove old bounce records automatically

_Planned, not current behaviour._ Recorded bounces stay in the database for good.

Today: they only take database space; the **Bounces** list is paginated and searchable, so it stays usable.

### Clean up the bounce mailbox

_Planned, not current behaviour._ The backend marks every processed bounce report as read and never deletes it, so the `mail-data` volume only grows.

Today: purge read reports by hand with `doveadm`, as on [The bounce mailbox only grows](/admin-guide/bounces#the-bounce-mailbox-only-grows) and [CLI](/reference/cli#bounce-mailbox).

### Create a domain in one step

_Planned, not current behaviour._ Adding a domain, or creating the sending domain, stores the domain, its DKIM key and its DNS records in separate steps. When a later step fails, mailer removes the domain again; only a backend that stops between the steps can leave a domain without a DKIM key behind.

Today: such a domain answers the send API with `422 FROM_DOMAIN_NOT_READY`. Delete it under **Domains** and add it again ([Delete a domain](/admin-guide/domains#delete-a-domain)).

### Branding settings

_Planned, not current behaviour._ Colours and a logo for the admin UI and the setup wizard. Today the admin UI has no branding options.

### First-run setup from the command line

_Planned, not current behaviour._ A command run inside the backend container would create the first Super admin without the web wizard, so the web setup and its setup token could be switched off in production.

Today: the backend logs a setup token while no user exists, and the first account is created in the browser ([First-run setup](/installation/first-run-setup#read-the-setup-token)). Run a single backend instance until then.

### Rate limits per form

_Planned, not current behaviour._ Each inbound form would get its own submission and token limits, with today's values as the fallback. The variable names `FORM_SUBMIT_RATE_LIMIT`, `FORM_SUBMIT_RATE_TTL`, `FORM_TOKEN_RATE_LIMIT` and `FORM_TOKEN_RATE_TTL` may change with it; the release notes will say so.

Today: the four variables apply to every form alike. If one website needs more, raise them for the whole installation ([Change a limit](/configuration/rate-limits#change-a-limit)).

### SendGrid-compatible send endpoint

_Planned, not current behaviour._ An endpoint that accepts the SendGrid v3 mail-send request, so applications that already use a SendGrid client library could send through mailer by changing only the base URL and the key.

Today: applications call `POST /api/v1/send` with mailer's own request format ([Send API](/admin-guide/send-api#request-fields)).

## Known limits

These describe the current release. Each one is explained in full on the page it links to.

### One domain per registrable domain

mailer stores at most one domain per registrable domain, and the sending domain counts too: with `MAIL_HOSTNAME=mx.example.com`, no sender domain under `example.com` can be added (`A domain for example.com already exists`). Send from a domain under another registrable domain, for example `mail.example.net` ([Choose the domain name](/admin-guide/domains#choose-the-domain-name)).

### No new DKIM key for an existing domain, and no way back from a lost encryption secret

mailer cannot re-encrypt its stored secrets with a new `BACKEND_ENCRYPTION_SECRET`, and it has no action that generates a new DKIM key for an existing domain. A lost or changed secret therefore means deleting and re-adding every sender domain and re-entering every reCAPTCHA secret. Back up `.env` together with the database ([If the secret is lost or leaked](/operations/rotating-secrets#if-the-secret-is-lost-or-leaked)).

### Failed form deliveries have no resend button and no list

The admin UI shows form e-mails only on **Sent mail** and has neither a list of deliveries nor a way to resend a `failed` one. List them and resend them with SQL ([List failed deliveries](/admin-guide/inbound-forms/deliveries#list-failed-deliveries), [Resend a failed delivery](/admin-guide/inbound-forms/deliveries#resend-a-failed-delivery)).

### The send API sends one plain mail per request

One recipient, no display names, no copies, attachments or custom headers, and no idempotency key, so a retry after a timeout can send a mail twice. Send one request per recipient and check **Sent mail** before you retry a timed-out request ([Request fields](/admin-guide/send-api#request-fields), [Retries in your application](/admin-guide/send-api#retries-in-your-application)).

### No password reset and no sending cap

Users cannot reset a forgotten password or change their own profile without **Update users**; an administrator with that permission sets a new password ([Log in](/admin-guide/overview#log-in)). mailer has no setting that caps the number of mails per day; control the volume during the IP warm-up by moving websites over one at a time ([Warm up the IP address](/installation/going-live#warm-up-the-ip-address)).
