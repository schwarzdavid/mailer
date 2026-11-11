# Rotating secrets

This page replaces the four secrets in `.env`: the mail password, the database password, the login secret `BACKEND_JWT_SECRET` and the encryption secret `BACKEND_ENCRYPTION_SECRET`. For each one it says what changes for users and what can go wrong. At the end the new value is in use and nothing depends on the old one.

All commands run on the server in the install directory:

```bash
cd /opt/mailer
```

Each new value comes from the same command as during the installation, which prints 64 random characters:

```bash
openssl rand -base64 48
```

Take a database backup before you start ([Backup and restore](/operations/backup-restore#back-up-the-database)), and copy the changed `.env` to your safe place again when you are done.

| Secret                      | What it protects                                                                    | Rotate                                                                      |
| --------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `MAIL_PASSWORD`             | The bounce mailbox, which the backend uses to send and to read bounce reports       | Any time; two commands                                                      |
| `DB_PASSWORD`               | The database user                                                                   | Any time; change it in the database too                                     |
| `BACKEND_JWT_SECRET`        | The login sessions of the admin UI                                                  | Any time; signs every user out                                              |
| `BACKEND_ENCRYPTION_SECRET` | The DKIM private keys and reCAPTCHA secrets stored in the database, and form tokens | **Cannot be rotated** without losing the stored keys and secrets; see below |

## MAIL_PASSWORD

The mail server keeps its own copy of the password in its account list, and compose hands `MAIL_PASSWORD` to the backend as the SMTP and IMAP password. Both must change together.

1. Write a new value into `.env`:

    ```bash
    sed -i "s|^MAIL_PASSWORD=.*|MAIL_PASSWORD=$(openssl rand -base64 48)|" .env
    ```

2. Set it on the mail account, then recreate the backend so it uses the new value:

    ```bash
    (set -a; . ./.env; docker compose exec mail setup email update "bounce@$MAIL_HOSTNAME" "$MAIL_PASSWORD")
    docker compose up -d backend
    ```

Between the two commands the backend still logs in with the old password and fails: sends through the API answer `502` with `DELIVERY_FAILED` and form deliveries wait for their next retry. Run both commands right after each other.

## DB_PASSWORD

The Postgres image applies `DB_PASSWORD` only when it creates the database in an empty volume. Afterwards the password lives in the database, so editing `.env` alone locks the backend out. Change it in both places.

1. Write a new value into `.env`:

    ```bash
    sed -i "s|^DB_PASSWORD=.*|DB_PASSWORD=$(openssl rand -base64 48)|" .env
    ```

2. Set it in the database, then recreate the backend:

    ```bash
    (set -a; . ./.env; docker compose exec postgres psql -U "$DB_USERNAME" -d "$DB_DATABASE" -c "ALTER USER \"$DB_USERNAME\" PASSWORD '$DB_PASSWORD'")
    docker compose up -d backend
    ```

    `psql` answers `ALTER ROLE`. Inside the container it logs in without a password, so the command works even though the password in the database is still the old one.

    `docker compose up -d backend` recreates `postgres` as well, because its `POSTGRES_PASSWORD` comes from `DB_PASSWORD` and has changed. That restarts the database for a few seconds; its data stays in the volume, and the image ignores `POSTGRES_PASSWORD` for a database that already exists, so the password you just set stays in force.

Between the two commands the backend still has the old password: connections it already holds keep working, but every new connection fails, so run both commands right after each other. With an [external Postgres](/configuration/external-postgres-redis), change the password in your provider's control panel instead of with `ALTER USER`, then recreate the backend.

## BACKEND_JWT_SECRET

The backend signs the login session of every admin UI user with `BACKEND_JWT_SECRET`. A session token is valid for 31 days. Rotate the secret when you suspect it leaked, or to sign every user out at once, for example after removing someone's access.

```bash
sed -i "s|^BACKEND_JWT_SECRET=.*|BACKEND_JWT_SECRET=$(openssl rand -base64 48)|" .env
docker compose up -d backend
```

What changes:

- **Every user is signed out.** Tokens signed with the old secret are refused with `401`; the admin UI then sends the user to the login page. They log in again with their usual password.
- **Nothing else changes.** API keys, inbound forms, DKIM keys and passwords do not depend on this secret.

The secret must be at least 32 characters long; the backend refuses to start with a shorter one and names the key in its log.

## BACKEND_ENCRYPTION_SECRET

`BACKEND_ENCRYPTION_SECRET` encrypts the secrets mailer stores in the database:

- the **DKIM private key** of every domain, the platform sending domain and every sender domain;
- the **secret key** of every Google reCAPTCHA check on an inbound form.

It is also the key from which mailer derives the signature of the timed tokens that forms request before they submit.

mailer has no way to re-encrypt the stored values with a new secret. If the value in `.env` changes, the backend still starts, but it can no longer decrypt what it stored:

- every mail from a sender domain fails, because the backend cannot read the domain's DKIM key: the send API answers `502` with `DELIVERY_FAILED`, and the project's **Sent mail** page lists the mail as **Failed**;
- every form with a reCAPTCHA check refuses submissions with `Captcha is not configured`, and the backend logs `Stored reCAPTCHA secret of form <id> could not be decrypted; check BACKEND_ENCRYPTION_SECRET`;
- timed tokens issued before the change are refused; visitors with a form open submit again after reloading the page.

::: danger Do not rotate BACKEND_ENCRYPTION_SECRET
Treat the secret as permanent. Keep it in your safe place together with your database backups, and restore it with the database on a new server ([Backup and restore](/operations/backup-restore)). Changing it is only worth the work below when it has leaked together with the database, or when it is lost.
:::

### If the secret is lost or leaked

If you have to start with a new value, every stored secret must be replaced, because none of them can be read any more. mailer has no button to generate a new DKIM key for an existing domain: a new key comes only with a new domain entry. The steps:

1. **Set the new secret** and recreate the backend:

    ```bash
    sed -i "s|^BACKEND_ENCRYPTION_SECRET=.*|BACKEND_ENCRYPTION_SECRET=$(openssl rand -base64 48)|" .env
    docker compose up -d backend
    ```

    Copy the new `.env` to your safe place right away.

2. **Re-enter every reCAPTCHA secret.** On each form with a Google reCAPTCHA check, edit the check (the pencil, **Edit _type_**) and enter the **Secret key** from Google again ([Security checks](/admin-guide/inbound-forms/security#google-recaptcha)). If the old secret leaked, create a new key pair in Google's reCAPTCHA admin console first and put the new site key into the website.

3. **Give every sender domain a new DKIM key** by deleting it and adding it again under **Domains**. The backend refuses to delete a domain while it is in use, so for each domain, for example `mail.example.net`:
    - unassign it from every project that uses it (the domain's page names them);
    - it must not be the sender domain of any inbound form. A form's sender domain cannot be cleared while the form has receivers, so remove the form's receivers first, or delete the form. Removing a receiver deletes its template and all its versions: copy the template text out of the editor before you remove it ([Name and sender domain](/admin-guide/inbound-forms/create#name-and-sender-domain));
    - delete the domain ([Delete a domain](/admin-guide/domains#delete-a-domain)) and add it again ([Add the domain](/admin-guide/domains#add-the-domain));
    - replace the DKIM record `s1._domainkey.mail.example.net` in DNS with the new value from the domain's page; the SPF and DMARC records stay the same;
    - assign the domain to its projects again, set it on the forms again and add the receivers and templates back.

4. **The platform sending domain** `mx.example.com` keeps an undecryptable DKIM key. mailer creates a new one for it only when `MAIL_HOSTNAME` changes ([Change MAIL_HOSTNAME](/admin-guide/settings#change-mail-hostname)). The admin UI offers only sender domains to projects, and mailer signs each mail with the key of the domain in its `From` address, so mail sent through projects does not use this key.

## How you know it worked

- `docker compose ps` shows `backend` as `healthy`, and the readiness check passes; after a mail password change its `smtp` check is `up`:

    ```bash
    docker compose ps --format "table {{.Service}}\t{{.Status}}"
    curl -s https://app.example.com/api/health/ready
    ```

    ```text
    {"status":"ok","info":{"database":{"status":"up"},"redis":{"status":"up"},"smtp":{"status":"up"}},"error":{},"details":{"database":{"status":"up"},"redis":{"status":"up"},"smtp":{"status":"up"}}}
    ```

- After a database password change, Postgres logs no failed logins since the change:

    ```bash
    docker compose logs --since 5m postgres | grep 'password authentication failed'
    ```

    This prints nothing.

- After a `BACKEND_JWT_SECRET` change, the admin UI asks you to log in again, and logging in works.
- A test mail through the send API arrives and passes DKIM, as on [Verify the installation](/installation/verify#send-a-test-mail). After a new `BACKEND_ENCRYPTION_SECRET`, test one mail per sender domain and one submission per form with reCAPTCHA.
