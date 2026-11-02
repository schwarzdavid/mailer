---
layout: home

hero:
    name: mailer
    text: Self-hosted mail service for websites
    tagline: Let static websites send contact forms and transactional mail through your own server.
    actions:
        - theme: brand
          text: Install
          link: /introduction/requirements
        - theme: alt
          text: Admin guide
          link: /admin-guide/overview
        - theme: alt
          text: API
          link: /api/overview

features:
    - title: Inbound forms
      details: Define a form with its fields, security checks and receivers, and let a static website POST it to a public endpoint. Each submission goes out as a DKIM-signed email rendered from a versioned template.
    - title: Send API
      details: Send transactional mail from your own backend through a public HTTP API, authenticated with project API keys.
    - title: Domains and DNS
      details: Register sender domains, get generated DKIM keys and the DNS records each domain needs, and let a scheduled job report their health.
    - title: Bounce handling
      details: A bounce mailbox is polled over IMAP and permanent rejections are recorded at send time, so recipients that bounce are blocked automatically.
    - title: Projects and roles
      details: Projects group forms and domains, and global and project roles with fine-grained permissions control who can do what.
---
