---
layout: home

hero:
    name: mailer
    text: Your websites send mail. From your server.
    tagline: Contact forms and transactional mail for static sites, DKIM-signed and delivered by a mail server you own. One Docker Compose stack, one setup script, no third-party mail service in the loop.
    image:
        src: /logo.svg
        alt: ''
    actions:
        - theme: brand
          text: Get started
          link: /installation/
        - theme: alt
          text: Admin guide
          link: /admin-guide/overview
        - theme: alt
          text: API
          link: /api/overview

features:
    - icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h6"/></svg>
      title: Inbound forms
      details: A static site posts its contact form straight to mailer. Honeypot, timed token, reCAPTCHA and allowed origins keep bots out; every submission goes out from a versioned template with automatic retries.
    - icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
      title: Send API
      details: Password resets, order confirmations, anything your backend needs to send. One HTTP request with a project API key, answered once the mail server has taken the mail.
    - icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/></svg>
      title: DKIM, SPF and DMARC done for you
      details: mailer generates the keys and the exact DNS records every domain needs, checks them every 15 minutes and tells you which one is off.
    - icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>
      title: Bounces handled
      details: Rejected addresses are recorded at send time or picked up from the bounce mailbox, and blocked automatically, so a dead address stops hurting your reputation.
    - icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
      title: Projects and roles
      details: One project per website. Global and per-project roles, including your own, decide who may edit forms, domains and keys.
    - icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
      title: Self-hosted, AGPL
      details: Your server, your data, your IP reputation. Free software under the AGPL-3.0, no account, no per-mail pricing.
---

## Three steps to your first mail

<div class="mailer-steps">

1. **Point two names at your server:** `app.example.com` for the admin UI and API, `mx.example.com` for the mail server.
2. **Download `mailer.sh` and run `sh mailer.sh setup`:** it asks for the names, generates the secrets, starts the stack and creates the bounce mailbox.
3. **Finish the wizard:** create the first admin and publish the DNS records it shows you.

</div>

Everything else, sender domains, forms, templates and API keys, is clicks in the admin UI.

## How it fits together

![Diagram of the mailer stack: browsers and websites reach the Caddy proxy over HTTPS; Caddy forwards to the backend; the backend uses Postgres and Redis, sends through the mail server and reads bounces from it; the mail server talks to recipients' mail servers on port 25.](/diagrams/stack.svg)

Caddy terminates HTTPS and obtains the certificates. The backend serves the admin UI and the API, signs every mail with the DKIM key of its sender domain and hands it to the bundled mail server, which delivers it on port 25. Form deliveries wait in a Redis queue and are retried for about two hours; the send API answers synchronously and leaves retries to your code. Bounces come back to `bounce@mx.example.com` and are read every minute.

## What you need

- A Linux server (`amd64`) with a fixed public IPv4 address, about 2 GB RAM and Docker Compose 2.23.1 or newer.
- Ports 25, 80 and 443 free on that server, and outbound port 25 not blocked by your provider.
- Access to the DNS zone of a domain you own, and to the reverse DNS of the server's IP address.

## What it is not

mailer is not a mailbox host, not a newsletter tool and not an open relay. Its mail server accepts mail only for its own bounce mailbox, each request sends one mail, and only domains you registered can send through it.

::: warning Work in progress
mailer is under active development. Pin the version you run and read the release notes before every update.
:::
