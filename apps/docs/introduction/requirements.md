# Requirements

This page lists what you need before you install mailer: the server, the network access, the DNS names and the tools. It ends with a checklist; once every box is ticked you can start the installation without stopping halfway.

## Server

| Requirement      | Details                                                                                                                                                                                                                                                                                                                       |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture     | **x86-64 (`amd64`) only.** The mailer image is built for `linux/amd64`. ARM servers (Ampere, Graviton, Raspberry Pi) cannot run it as published.                                                                                                                                                                              |
| Operating system | Any current Linux distribution that Docker supports. The commands in these docs are written for Debian and Ubuntu.                                                                                                                                                                                                            |
| Docker           | Docker Engine with the Compose plugin, **Compose 2.23.1 or newer**. The compose file embeds its configuration files with `configs.content`, which older versions do not understand. [Prepare the server](/installation/prepare-server) installs both.                                                                         |
| Memory           | 2 GB RAM is a sensible minimum for the five containers (backend, Postgres, Redis, Caddy, mail server). This is guidance, not a measured limit; more helps if the server runs other things too.                                                                                                                                |
| Disk             | 20 GB is a comfortable start. The database grows with stored submissions, sent mail and bounces; container logs are capped at 50 MB per container.                                                                                                                                                                            |
| Public IP        | A fixed public IPv4 address. A fixed IPv6 address is optional. If you have one, it serves the admin UI and API over IPv6, can receive bounces on port 25, and goes into the AAAA, SPF and PTR records of `MAIL_HOSTNAME`. Outgoing mail always leaves over IPv4, because the containers run on Docker's default IPv4 network. |
| Exclusive ports  | Ports 25, 80 and 443 on the server must be free for mailer. Do not run another web server or mail server on the same machine.                                                                                                                                                                                                 |

A small VPS from any hosting provider is enough. These docs use Hetzner Cloud as the example where a provider-specific step is needed, because it shows both of the typical hurdles (blocked port 25 and reverse DNS in the console).

## Network

| Direction | Port    | Why                                                                                                                                                                                                                    |
| --------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inbound   | 80/tcp  | Caddy answers Let's Encrypt's certificate checks and redirects plain HTTP to HTTPS.                                                                                                                                    |
| Inbound   | 443/tcp | The admin UI and the API over HTTPS.                                                                                                                                                                                   |
| Inbound   | 443/udp | HTTP/3. Optional; browsers fall back to TCP when it is closed.                                                                                                                                                         |
| Inbound   | 25/tcp  | Other mail servers deliver bounce reports to your mail server.                                                                                                                                                         |
| Outbound  | 25/tcp  | Your mail server delivers mail to recipients' mail servers. **Many providers block this by default**, Hetzner Cloud among them. Until your provider unblocks it, nothing is delivered, although everything else works. |

Port 25 is the port mail servers use to talk to each other. Providers block it on new accounts to stop spammers; most unblock it when you ask. [Prepare the server](/installation/prepare-server) shows how to test it and how to ask.

## DNS

You need control over the DNS zone of a domain you own, for example `example.com`, and two names in it:

| Name            | Example           | Used for                                                                                              |
| --------------- | ----------------- | ----------------------------------------------------------------------------------------------------- |
| `SITE_ADDRESS`  | `app.example.com` | The admin UI and the API. Your websites post forms here.                                              |
| `MAIL_HOSTNAME` | `mx.example.com`  | The mail server's name and mailer's own sending domain. Bounces come back to `bounce@mx.example.com`. |

The two names must be different: Caddy refuses to start when both are the same. [DNS records](/installation/dns) creates them.

You also need to set the **PTR record** (reverse DNS) of your server's IP address to `mx.example.com`. A PTR record maps an IP address back to a name; receiving mail servers compare it with the name your mail server introduces itself with and distrust mail when they do not match. The PTR record lives at the owner of the IP address, your hosting provider, so you set it in the provider's console, not in your DNS zone. Check now that your provider lets you set it; almost all VPS providers do.

The domains your websites send from (for example `mail.example.net`) are added later in the admin UI, and each needs three DNS records there. You do not need them for the installation.

Choose the domain of `MAIL_HOSTNAME` with them in mind: mailer keeps one domain per registrable domain (the part you buy at a registrar, here `example.com`), and its own sending domain already occupies the one of `MAIL_HOSTNAME`. No sender domain can ever be added under it afterwards, so put `MAIL_HOSTNAME` under a registrable domain your websites will not send from, and use another one for sender domains, for example `mail.example.net`. [Domains](/admin-guide/domains#choose-the-domain-name) explains the rule.

## On your own computer

- **An SSH client** to log in to the server. Every command in these docs runs on the server.
- **A web browser** for the first-run setup wizard.
- **A mailbox you can read** at another provider, to receive the test mail at the end.

## Checklist

Tick every line before you continue with [Prepare the server](/installation/prepare-server).

- [ ] I have an `amd64` VPS with a fixed public IPv4 address, at least 2 GB RAM and 20 GB disk.
- [ ] I can log in to it over SSH as `root` or as a user with `sudo`.
- [ ] Nothing else on the server uses ports 25, 80 or 443.
- [ ] My provider allows outbound connections to port 25, or I know how to request that it is unblocked.
- [ ] My provider lets me set the PTR (reverse DNS) record of the server's IP address.
- [ ] I can create records in the DNS zone of my domain.
- [ ] I have picked two different names: `SITE_ADDRESS` (for example `app.example.com`) and `MAIL_HOSTNAME` (for example `mx.example.com`).
- [ ] The registrable domain of `MAIL_HOSTNAME` (for example `example.com`) is not one my websites will send from; their sender domains use another one (for example `mail.example.net`).
- [ ] I have a mailbox elsewhere to receive a test mail.
