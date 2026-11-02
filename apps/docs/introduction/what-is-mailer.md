# What is mailer

mailer is a self-hosted mail service for websites. After reading this page you know what it does, who it is for, what it deliberately does not do, and under which licence you run it.

::: warning Work in progress
mailer is under active development. Features, APIs and the database schema can still change between releases, and the project does not yet call itself ready for production. Pin the version you run (see [Docker Compose](/installation/docker-compose)) and read the release notes before every update.
:::

## What it does

mailer lets websites send email reliably without a backend of their own. You run it on your own server, next to a mail server it brings along, and your websites talk to it over HTTPS.

It has two halves:

- **The admin UI**, a web app where you configure everything: projects, sender domains, forms, templates, API keys, users and roles. It is served by mailer itself, for example at `https://app.example.com`.
- **The public API**, which your websites and your own code call:
    - **Inbound forms.** A static website posts its contact form straight to a public endpoint. mailer checks the submission (reCAPTCHA, a CSRF-style timed token, a honeypot field, the websites allowed to post), stores it and emails it to the receivers you set up, rendered from a versioned Handlebars template that you edit with a live preview.
    - **The send API.** Your server-side code sends a transactional mail (a password reset, an order confirmation) with one HTTP request, authenticated with a project API key. See the [API overview](/api/overview).

Around those two features mailer handles what makes mail actually arrive:

- **Domains and DNS.** You register the domains your mail is sent from. mailer generates a DKIM key for each one (a signing key that lets receivers check that a mail really comes from your domain), lists the DNS records the domain needs, and checks them every 15 minutes so you see when a record is missing or wrong.
- **Bounce handling.** When a recipient's mail server rejects a mail, mailer records the bounce. Addresses that bounce permanently, or bounce temporarily too often, are blocked automatically, so you stop sending to them. You can review and lift blocks in the admin UI.
- **Projects, users and roles.** A project groups the forms and domains of one website. Users get a global role (Super admin, Admin, User or a custom one) and a project role in each project they work on (Viewer, Editor, Maintainer, Owner or a custom one).

The terms used here (DKIM, bounce and the rest) are explained on [How it works](/introduction/how-it-works).

## Who it is for

mailer is for people who run websites and want contact forms and transactional mail to go out from their own infrastructure: agencies hosting many small static sites, developers who do not want a third-party form or mail service in the loop, and operators who prefer one small server they control. You need a server you can install Docker on and access to the DNS of the domains you send from. [Requirements](/introduction/requirements) has the full list.

## What it is not

- **Not a mailbox host.** mailer does not give you inboxes to read mail in. Its mail server accepts mail only for its own bounce mailbox. Form submissions go out to addresses you already have elsewhere.
- **Not a newsletter tool.** There are no mailing lists, subscriber management, unsubscribe handling or campaigns. Each request sends one mail to the recipients it names.
- **Not a relay for others.** The bundled mail server refuses to relay mail for anyone else. Only mailer's backend can send through it, and only from domains you registered in the admin UI.

## Licence

mailer is free software under the GNU Affero General Public License, version 3 only (AGPL-3.0-only). You may run, study, change and share it. If you run a modified version as a service that other people use over a network, the AGPL requires you to offer them the source code of your modified version. mailer comes without any warranty. The full licence text is in the `LICENSE` file of the [repository](https://github.com/schwarzdavid/mailer).

## Next steps

1. Read [How it works](/introduction/how-it-works) for the moving parts.
2. Check [Requirements](/introduction/requirements) before you rent or prepare a server.
3. Start the installation with [Prepare the server](/installation/prepare-server).
