# DNS records

This page creates the DNS records mailer needs before its first start: an address record for each of its two host names and the reverse DNS of your server. At the end both names resolve to your server, so Caddy can obtain certificates on the first start.

The mail authentication records (MX, SPF, DKIM, DMARC) come later, in the [first-run setup](/installation/first-run-setup): the DKIM key does not exist until mailer generates it there.

## Why two names

mailer answers under two host names, both on the same server:

- **`SITE_ADDRESS`**, for example `app.example.com`, serves the admin UI and the API.
- **`MAIL_HOSTNAME`**, for example `mx.example.com`, is the name of the mail server. Other mail servers connect to it on port 25, it is the name in the mail server's TLS certificate, and it is mailer's own sending domain: every mail leaves with the envelope sender `bounce@mx.example.com`.

The names must differ. Caddy obtains a certificate for each one and refuses to start when the same name appears twice in its configuration. Pick names that are not used for anything else yet, typically two subdomains of a domain you own.

The registrable domain of `MAIL_HOSTNAME` (here `example.com`) can never hold a sender domain afterwards: mailer keeps one domain per registrable domain, and its own sending domain occupies this one. Put `MAIL_HOSTNAME` under a registrable domain your websites will not send from, and use another one for their sender domains, for example `mail.example.net`. [Domains](/admin-guide/domains#choose-the-domain-name) explains the rule.

## Create the address records

In your DNS provider's zone for `example.com`, create these records. Use your server's addresses instead of the examples. A short TTL (the time other servers cache a record) such as 300 seconds lets you correct a mistake quickly during the installation.

| Host              | Type   | Value          | Required                              |
| ----------------- | ------ | -------------- | ------------------------------------- |
| `app.example.com` | `A`    | `203.0.113.10` | Required                              |
| `mx.example.com`  | `A`    | `203.0.113.10` | Required                              |
| `app.example.com` | `AAAA` | `2001:db8::10` | Optional, only if the server has IPv6 |
| `mx.example.com`  | `AAAA` | `2001:db8::10` | Optional, only if the server has IPv6 |

In zone-file notation, the format some DNS providers accept for import:

```dns
app.example.com.  300  IN  A     203.0.113.10
mx.example.com.   300  IN  A     203.0.113.10
app.example.com.  300  IN  AAAA  2001:db8::10
mx.example.com.   300  IN  AAAA  2001:db8::10
```

Most DNS providers ask only for the part before your domain in the host field: `app` and `mx`.

::: warning Cloudflare and other proxying DNS providers
Set both records to **DNS only** (the grey cloud in Cloudflare), not proxied. Mail on port 25 cannot pass through an HTTP proxy, and Caddy must be reachable directly to obtain its certificates. This applies to the installation; [Reverse proxy](/configuration/reverse-proxy#put-a-cdn-or-another-proxy-in-front-of-caddy) shows how to put a CDN in front of `SITE_ADDRESS` later.
:::

Note the addresses you used here: they go into `.env` as `MAIL_SERVER_IPV4` and, if you use IPv6, `MAIL_SERVER_IPV6` on [Docker Compose](/installation/docker-compose), and mailer builds the records of the sending domain from them.

The IPv6 records are optional. If you create the AAAA record for `mx.example.com` and set `MAIL_SERVER_IPV6`, mailer adds the address to the SPF record of `mx.example.com` and lists an AAAA and an IPv6 PTR record among the records it checks. Leave all IPv6 records and `MAIL_SERVER_IPV6` out if your server has no IPv6 address or you are unsure.

## Set the reverse DNS

The PTR record (reverse DNS) of your server's IP address must point to `MAIL_HOSTNAME`:

| IP address     | Type  | Value            | Required                                   |
| -------------- | ----- | ---------------- | ------------------------------------------ |
| `203.0.113.10` | `PTR` | `mx.example.com` | Required                                   |
| `2001:db8::10` | `PTR` | `mx.example.com` | Optional, only if you use the IPv6 address |

You set it in your hosting provider's console, not in your DNS zone. [Prepare the server](/installation/prepare-server#set-the-reverse-dns-ptr-record) shows how on Hetzner Cloud.

## Check that the records resolve

DNS changes take from a few seconds to a few hours to reach everyone, depending on your provider and on the TTL of any older record with the same name. Check with `dig`, asking a public resolver so you do not see a stale cached answer. On the server, install `dig` first if it is missing:

```bash
apt-get install -y dnsutils
```

Then check each record:

```bash
dig +short A app.example.com @1.1.1.1
dig +short A mx.example.com @1.1.1.1
```

Each command prints your server's IPv4 address:

```text
203.0.113.10
```

If you created AAAA records:

```bash
dig +short AAAA app.example.com @1.1.1.1
dig +short AAAA mx.example.com @1.1.1.1
```

```text
2001:db8::10
```

The reverse DNS:

```bash
dig +short -x 203.0.113.10 @1.1.1.1
dig +short -x 2001:db8::10 @1.1.1.1
```

```text
mx.example.com.
```

An empty answer means the record does not exist yet or has not reached the resolver. Wait a few minutes and run the command again. A different address than yours means a typo in the record or an old record that still needs to be removed.

## How you know it worked

All of these commands, run on the server, print the value shown in the tables above:

```bash
dig +short A app.example.com @1.1.1.1
dig +short A mx.example.com @1.1.1.1
dig +short -x 203.0.113.10 @1.1.1.1
```

```text
203.0.113.10
203.0.113.10
mx.example.com.
```

Both A records must resolve before you start the stack on the next page, because Caddy requests the certificates right at the first start. The PTR record can still be pending; mailer works without it, but large mail providers will reject or junk your mail until it is set.

Continue with [Docker Compose](/installation/docker-compose).
