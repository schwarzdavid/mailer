# Reverse proxy

This page explains the reverse proxy that ships with mailer: what it does, which host ports it uses, how the backend learns the real visitor address, and how to put a CDN in front of it, turn on access logs or replace it with your own proxy. After reading it you can change the proxy setup without breaking certificates, rate limits or the mail server.

A reverse proxy is a web server that accepts the visitors' connections and passes each request on to an application behind it. In mailer's Docker Compose stack, that is the `proxy` service, a stock [Caddy](https://caddyserver.com/docs/) image (`caddy:2.11.7-alpine`). Its configuration file, the Caddyfile, is not a separate file: it sits inline in `compose.yml`, in the block `x-proxy-caddyfile`.

## What Caddy does

The Caddyfile in `compose.yml` does exactly this:

- **TLS certificates.** Caddy obtains and renews Let's Encrypt certificates for two names: `SITE_ADDRESS` (for example `app.example.com`) and `MAIL_HOSTNAME` (for example `mx.example.com`). It registers without a contact address, so Let's Encrypt sends no expiry e-mails; Caddy renews on its own.
- **`SITE_ADDRESS`** gets HTTPS, compressed responses (`zstd` or `gzip`), the header `X-Robots-Tag: noindex, nofollow` so search engines leave the admin UI alone, and every request forwarded to the backend at `backend:8000`. The backend serves both the admin UI and the API under `/api`.
- **`MAIL_HOSTNAME`** answers every web request with `404`. The site exists only so that Caddy obtains a certificate for that name; the `mail` service reads it from Caddy's data volume `caddy-data` and uses it for encrypted SMTP.
- **Logs.** Caddy writes no access log (one line per request) by default. It does log errors, for example a failed request to the backend while it restarts, and its global log filter replaces the `key` query parameter in every logged URL with `REDACTED`, so an API key passed as `?key=…` never reaches the log.

The backend publishes no port of its own. Everything from outside reaches it through Caddy.

## Host ports

Three [compose variables](/configuration/environment#compose-variables) in `.env` choose the host ports. All three are optional.

| Variable           | Default | Forwards to                          | Change it when                                                                                                                                    |
| ------------------ | ------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HTTP_PORT`        | `80`    | `proxy`, port 80                     | Port 80 is taken on the host by something that forwards the public port 80 to this one.                                                           |
| `HTTPS_PORT`       | `443`   | `proxy`, port 443 (TCP and UDP)      | Port 443 is taken on the host by something that forwards the public port 443 to this one. UDP carries HTTP/3.                                     |
| `SMTP_PUBLIC_PORT` | `25`    | `mail`, port 25 (incoming mail only) | Only for tests. Other mail servers always deliver to port 25, so bounces stop arriving when the public port 25 does not reach the `mail` service. |

Let's Encrypt checks domain ownership by connecting to ports 80 and 443 of `SITE_ADDRESS` and `MAIL_HOSTNAME`. If you change `HTTP_PORT` or `HTTPS_PORT`, those public ports must still reach Caddy, or it cannot obtain or renew the certificates, and the mail server loses its certificate as well.

To change a port, set it in `/opt/mailer/.env`, for example `HTTPS_PORT=8443`, and recreate the proxy:

```bash
cd /opt/mailer
docker compose up -d proxy
```

## TRUST_PROXY

Rate limits (login, public form submissions, setup, and the send API's per-IP limit) are counted per client IP address. Behind a reverse proxy, every request arrives from the proxy's address, so all visitors would share one limit. `TRUST_PROXY` tells the backend which proxies it may trust to report the real client address in `X-Forwarded-For`, the header in which each proxy appends the address it received the request from. The value is passed to Express's [`trust proxy`](https://expressjs.com/en/guide/behind-proxies.html) setting:

| Setup                                                      | `TRUST_PROXY`                             |
| ---------------------------------------------------------- | ----------------------------------------- |
| No proxy, the backend is reached directly                  | leave unset                               |
| One reverse proxy (nginx, Traefik, Caddy, a load balancer) | `1`                                       |
| A chain of N proxies                                       | `N`                                       |
| Trust proxies by address instead of by position            | `loopback` or a subnet, e.g. `10.0.0.0/8` |

When `TRUST_PROXY` is unset, empty or `false`, the backend ignores `X-Forwarded-For`.

::: danger
Do not set `TRUST_PROXY=true` unless the backend can only be reached through the proxy. It then trusts the left-most address in `X-Forwarded-For`, which any visitor can forge to get around the rate limits.
:::

In the Docker Compose stack, `TRUST_PROXY` is fixed to `1` in `compose.yml`, because Caddy is the single proxy hop. A value in `.env` has no effect, because the value under `backend.environment` in `compose.yml` wins.

The same address appears in the backend's request log as `remoteAddress` (see [Logging](/configuration/logging)), which is the quickest way to check the setting: it must show your visitors' addresses, not the proxy's.

## Put a CDN or another proxy in front of Caddy

A CDN or a load balancer in front of Caddy adds a second hop. Two edits in `/opt/mailer/compose.yml` make the backend see the visitor again.

1. **Let Caddy pass the CDN's header on.** By default Caddy ignores an incoming `X-Forwarded-For` and replaces it with the address of whoever connected to it, which would be the CDN. Add a `servers` block with the CDN's address ranges to the global options at the top of the `x-proxy-caddyfile` block. The ranges below are an example; use the list your CDN publishes:

    ```yaml
    x-proxy-caddyfile: &proxy-caddyfile |
        {
            acme_ca https://acme-v02.api.letsencrypt.org/directory
            servers {
                trusted_proxies static 192.0.2.0/24 198.51.100.0/24
            }
            log default {
    ```

    Leave the rest of the block as it is.

2. **Count two hops.** Under `backend.environment`, change

    ```yaml
    TRUST_PROXY: '1'
    ```

    to

    ```yaml
    TRUST_PROXY: '2'
    ```

3. Apply both changes. Compose recreates the services whose configuration changed:

    ```bash
    cd /opt/mailer
    docker compose up -d
    ```

Keep `MAIL_HOSTNAME` out of the CDN: its DNS record must point straight at the server, because other mail servers connect to it on port 25 and Caddy must obtain its certificate directly. `SITE_ADDRESS` may go through the CDN as long as the CDN forwards ports 80 and 443 to Caddy, so certificate renewal keeps working.

The edited `compose.yml` is yours now: when you update mailer, take the new release's `compose.yml` and apply the same two edits again.

To check the result, open the admin UI from your own computer, then look up your request in the backend log; `remoteAddress` must be your own public address:

```bash
docker compose logs --since 5m backend | grep '"request completed"' | tail -n 5
```

## Turn on Caddy access logs

Caddy's access log writes one line per request into the `proxy` log. If you turn it on, add the same `key` filter as the global log, because the access log records the full URL, including an API key passed as `?key=…`. Caddy itself replaces the values of the `Authorization` and `Cookie` headers with `REDACTED` in its access log.

Add a `log` block to the `SITE_ADDRESS` site in the `x-proxy-caddyfile` block of `/opt/mailer/compose.yml`, so that the site reads as follows (the lines keep the indentation they have inside the YAML block):

```text
    ${SITE_ADDRESS:?SITE_ADDRESS is required} {
        encode zstd gzip
        header X-Robots-Tag "noindex, nofollow"
        reverse_proxy backend:8000
        log {
            format filter {
                request>uri query {
                    replace key REDACTED
                }
            }
        }
    }
```

Then recreate the proxy and read the log:

```bash
cd /opt/mailer
docker compose up -d proxy
docker compose logs -f proxy
```

A request with `?key=sdm_…` shows up with `"uri":"/api/v1/send?key=REDACTED"`. The log files are rotated like every other service's, see [Logging](/configuration/logging#log-rotation).

## Use your own proxy instead of Caddy

The simplest way to use an existing proxy (nginx, Traefik, a cloud load balancer) is to keep Caddy and put your proxy in front of it, as described [above](#put-a-cdn-or-another-proxy-in-front-of-caddy). Replacing Caddy completely is possible, but it takes over three jobs, and you edit `compose.yml` for each.

**1. Terminate TLS for `SITE_ADDRESS` and forward to the backend.** Remove the `proxy` service from `compose.yml` and add a `ports` entry to the `backend` service instead, for example only on the host's loopback interface for a proxy on the same host:

```yaml
backend:
    ports:
        - '127.0.0.1:8000:8000'
```

Your proxy then forwards every path of `https://app.example.com` to `http://127.0.0.1:8000`, keeping the `Host` header and adding the client address to `X-Forwarded-For`. Set `TRUST_PROXY` in `compose.yml` to the number of proxies in front of the backend (`1` for a single proxy), and keep [the danger note](#trust-proxy) in mind.

Your proxy must accept request bodies of at least 8 MB on `/api/v1/send`, because the send API accepts up to 1,000,000 characters each in `html` and `text`. nginx, for example, refuses bodies over 1 MB unless you raise `client_max_body_size`.

Make your proxy drop or redact the `key` query parameter in its access and error logs. nginx, for example, records the request line with the query string in both, and Caddy's error entries contain the URL too, which is why the Caddyfile in `compose.yml` filters it globally.

**2. Provide the mail server's certificate.** The `mail` service does not get its certificate on its own. `compose.yml` mounts Caddy's data volume into it read-only and points it at the files Caddy keeps for `MAIL_HOSTNAME`:

```yaml
environment:
    SSL_TYPE: manual
    SSL_CERT_PATH: /caddy/caddy/certificates/acme-v02.api.letsencrypt.org-directory/${MAIL_HOSTNAME:?MAIL_HOSTNAME is required}/${MAIL_HOSTNAME:?MAIL_HOSTNAME is required}.crt
    SSL_KEY_PATH: /caddy/caddy/certificates/acme-v02.api.letsencrypt.org-directory/${MAIL_HOSTNAME:?MAIL_HOSTNAME is required}/${MAIL_HOSTNAME:?MAIL_HOSTNAME is required}.key
volumes:
    - caddy-data:/caddy:ro
```

Without Caddy, you must obtain a certificate for `MAIL_HOSTNAME` some other way, keep it renewed, replace the `caddy-data:/caddy:ro` line with a mount of the directory that holds your certificate and key, and point `SSL_CERT_PATH` and `SSL_KEY_PATH` at those files. The backend checks the mail server's certificate against `MAIL_HOSTNAME` when it sends, so a missing or wrong certificate stops all outgoing mail.

**3. Remove what is left of Caddy.** Delete the `proxy-caddyfile` entry under the top-level `configs`, the `x-proxy-caddyfile` block and, once nothing mounts them any more, the `caddy-data` and `caddy-config` volumes. Then apply the changes:

```bash
cd /opt/mailer
docker compose up -d --remove-orphans
```

As with a CDN, the edited `compose.yml` is yours to maintain: re-apply your changes to each new release's `compose.yml`.
