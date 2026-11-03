# Security

This page describes what mailer does to protect the installation and its users, and what stays your job: the HTTP security headers, which browsers may call which endpoints, what never reaches the logs, how API keys are handled, why the mail server is no open relay, how to verify the image you run, and what the licence asks of modified versions. At the end you know the defaults and how to check each of them.

## Security headers

The backend sets these headers on every response, through the library [helmet](https://helmetjs.github.io/) (additional reading):

| Header                              | Value              | Effect                                                                                     |
| ----------------------------------- | ------------------ | ------------------------------------------------------------------------------------------ |
| `Content-Security-Policy`           | See below          | Limits where the admin UI may load scripts, styles, images and fonts from.                 |
| `Strict-Transport-Security`         | `max-age=31536000` | Browsers use only HTTPS for `app.example.com` for one year. Subdomains are not included.   |
| `Cross-Origin-Opener-Policy`        | `same-origin`      | Other sites' windows cannot keep a handle on the admin UI's window.                        |
| `Cross-Origin-Resource-Policy`      | `same-origin`      | Other sites cannot embed the backend's responses; `client.js` is the exception (see CORS). |
| `Origin-Agent-Cluster`              | `?1`               | The browser isolates the admin UI from other pages of the same site.                       |
| `Referrer-Policy`                   | `no-referrer`      | Links from the admin UI send no `Referer` header.                                          |
| `X-Content-Type-Options`            | `nosniff`          | Browsers do not guess content types.                                                       |
| `X-Frame-Options`                   | `SAMEORIGIN`       | Other sites cannot show the admin UI in a frame.                                           |
| `X-DNS-Prefetch-Control`            | `off`              | No DNS prefetching of links.                                                               |
| `X-Download-Options`                | `noopen`           | Old Internet Explorer versions do not open downloads in the site's context.                |
| `X-Permitted-Cross-Domain-Policies` | `none`             | Old plug-ins get no cross-domain access.                                                   |
| `X-XSS-Protection`                  | `0`                | Turns off a broken filter of old browsers.                                                 |

The backend also leaves out the `X-Powered-By` header. Caddy adds `X-Robots-Tag: noindex, nofollow` to every response, so search engines do not index the admin UI ([Reverse proxy](/configuration/reverse-proxy#what-caddy-does)).

`Strict-Transport-Security` leaves out `includeSubDomains` on purpose: if `SITE_ADDRESS` is an apex domain such as `example.com`, the header does not force HTTPS on every other name under it.

### The Content Security Policy

The policy is helmet's default with three changes for the admin UI:

| Directive                       | Value                           |
| ------------------------------- | ------------------------------- |
| `default-src`                   | `'self'`                        |
| `base-uri`, `form-action`       | `'self'`                        |
| `frame-ancestors`               | `'self'`                        |
| `font-src`                      | `'self' https: data:`           |
| `style-src`                     | `'self' https: 'unsafe-inline'` |
| `object-src`, `script-src-attr` | `'none'`                        |
| `script-src`                    | `'self' 'unsafe-eval'`          |
| `img-src`                       | `'self' data: https:`           |

The three exceptions and why they are there:

- **`'unsafe-eval'` in `script-src`.** The template editor compiles Handlebars templates in the browser for its live preview, which needs it. Scripts still load only from the site itself.
- **`https:` in `img-src`.** The template preview shows images that templates link from other HTTPS servers.
- **No `upgrade-insecure-requests`.** helmet's default would make the browser rewrite every `http:` request to `https:`, which would keep the admin UI from loading when the site is served to browsers over plain HTTP. The Docker Compose stack serves HTTPS, so there it makes no difference.

Check the headers of your installation:

```bash
curl -sI https://app.example.com/ | grep -iE '^(content-security-policy|strict-transport-security|cross-origin|origin-agent|referrer-policy|x-)'
```

## CORS: which sites may call which endpoints

CORS (Cross-Origin Resource Sharing) decides whether JavaScript on another website may read the answers of an endpoint. mailer answers differently per surface:

| Surface                                     | CORS                                                               | Why                                                                                                                        |
| ------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Public form endpoints, `/api/public/form/…` | `Access-Control-Allow-Origin: *`, without credentials (no cookies) | Forms are embedded on any website. Each form can restrict itself to **Allowed domains**.                                   |
| `client.js` of a form                       | As above, plus `Cross-Origin-Resource-Policy: cross-origin`        | Websites load the script from mailer.                                                                                      |
| Send API, `/api/v1/send`                    | No CORS headers                                                    | Browsers on other sites cannot read its answers. Call it from a server, never from a browser, so the API key stays secret. |
| Admin API and admin UI, everything else     | No CORS headers                                                    | The admin UI is served from the same origin and needs none.                                                                |

Restricting a form to its websites is the form's job, not CORS's: see [Allowed domains](/admin-guide/inbound-forms/create#allowed-domains) and [CORS and browser security](/admin-guide/inbound-forms/embed#cors-and-browser-security).

## What the logs never contain

The backend's request log keeps the method, the path without the query string, the client address and the status code. It never contains:

- query strings, so an API key sent as `?key=…` does not reach it;
- request or response headers, so no `Authorization` header and no cookies;
- request or response bodies: no passwords, form data or mail content;
- e-mail addresses in log messages: records are named by their id, and errors that can carry an address are logged with their type and code only;
- the health checks, which are not logged at all.

[What is never logged](/configuration/logging#what-is-never-logged) has the details. The exceptions you should know: the setup token is logged on purpose while no user exists, and the mail server's own log names the sender and recipient of every delivery, as every mail server does. Treat `docker compose logs mail` and the `mail-logs` volume as personal data.

## API keys

- **Shown once.** The admin UI shows a new key once, under **Copy your API key**. mailer stores only a SHA-256 hash of it, so nobody can read a key back later, not even from the database. A lost key is replaced by creating a new one.
- **Recognisable.** Every key starts with `sdm_`, followed by 8 characters, an underscore and 43 more characters. Secret scanners and your own searches can find leaked keys by that prefix.
- **Scoped to a project.** A key sends only from the sender domains assigned to its project.
- **Revocable.** Revoke a key on the project page as soon as it may have leaked ([Revoke an API key](/admin-guide/projects#revoke-an-api-key)); the next request with it answers `401`.
- **Header, not query string.** Send the key as `Authorization: Bearer sdm_…`. The query parameter `?key=sdm_…` works too, for clients that cannot set headers, but URLs end up in logs of proxies and tools between the client and mailer.

mailer itself keeps the query string out of every log: the backend logs paths only, and the Caddyfile in `compose.yml` replaces the `key` parameter with `REDACTED` in every entry Caddy writes, including the error entries for requests it could not forward. If you turn on Caddy access logs, add the same filter to them ([Turn on Caddy access logs](/configuration/reverse-proxy#turn-on-caddy-access-logs)). If you put your own proxy or a CDN in front, make sure it does not log the `key` parameter either.

## No open relay on port 25

The mail server publishes only port 25, and only to receive mail for its own addresses: bounce reports for `bounce@mx.example.com` and `postmaster@mx.example.com`. It refuses to pass mail on to any other domain, from the internet and from inside the Docker network alike, so it cannot be abused as an open relay. The ports the backend uses to send (587) and to read the bounce mailbox (143) are reachable only on the internal Docker network `mail`, require STARTTLS (the command that switches the connection to TLS) and a login as `bounce@mx.example.com`. With spoof protection turned on, the mail server accepts mail from that login only with its own address as the envelope sender, the return path that mailer puts on every mail.

To see the refusal, run this from a machine other than the server. Many home and office networks block outgoing connections to port 25; if the command prints nothing and times out, try it from another server. It connects to port 25 like another mail server and asks to deliver to an outside address:

```bash
{ sleep 2; printf 'EHLO test.example.org\r\n'; sleep 1; printf 'MAIL FROM:<test@example.org>\r\n'; sleep 1; printf 'RCPT TO:<reader@example.org>\r\n'; sleep 1; printf 'QUIT\r\n'; } | openssl s_client -starttls smtp -connect mx.example.com:25 -servername mx.example.com -quiet 2>/dev/null
```

The answer to `RCPT TO` is a line with `Relay access denied`.

## Container hardening

The backend image runs as the unprivileged user `node` (set in the image itself). `compose.yml` adds a read-only file system (only `/tmp` is writable, in memory) and a minimal init process that forwards signals and reaps child processes. The backend, Postgres and Redis publish no ports; only Caddy (80 and 443) and the mail server (25) are reachable from outside. Keep `.env` readable only by `root` (`chmod 600 /opt/mailer/.env`), because it holds every secret ([Rotating secrets](/operations/rotating-secrets)).

## Verify the image you run

Run a pinned version, never `latest`: with `IMAGE_TAG=1.0.0` in `.env`, every `docker compose pull` gets the same image, and it always matches the `compose.yml` of that release. Every release image carries the commit it was built from as the label `org.opencontainers.image.revision`:

```bash
cd /opt/mailer
docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$(docker compose images -q backend | head -n 1)"
```

Compare the commit with the release on the repository's releases page, which names the commit of each tag, or ask GitHub directly (needs `git` on the machine):

```bash
git ls-remote https://github.com/schwarzdavid/mailer 'refs/tags/v1.0.0*'
```

For an annotated tag, the line ending in `^{}` carries the commit; otherwise the only line does. Both must match the label. The image is also published as `sha-<first 7 characters of the commit>`, so `IMAGE_TAG=sha-3f9a2c1` pins the same image by its commit.

## Modified versions and the AGPL

mailer is licensed under the GNU Affero General Public License, version 3 only. Running it unmodified for your own websites asks nothing further of you. If you modify mailer and let other people use your modified version over a network, for example customers who log in to your admin UI or send through your API, section 13 of the licence requires you to offer those users the complete source code of your modified version, under the same licence. The full text is in the [`LICENSE`](https://github.com/schwarzdavid/mailer/blob/main/LICENSE) file of the repository. This is a summary, not legal advice.
