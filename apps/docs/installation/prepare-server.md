# Prepare the server

This page gets a fresh VPS ready for mailer: Docker and Compose installed, the firewall open on the right ports, outbound port 25 unblocked, the reverse DNS set and the install directory `/opt/mailer` created. It assumes you ticked the checklist on [Requirements](/introduction/requirements).

Log in to the server over SSH. The commands on this and the following pages assume you are `root`; as another user, run them with `sudo` or open a root shell with `sudo -i` first.

## Install Docker and Compose

Docker's convenience script installs Docker Engine and the Compose plugin from Docker's own package repository on Debian, Ubuntu and the other common distributions:

```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
```

Check the Compose version. It must be **2.23.1 or newer**:

```bash
docker compose version
```

```text
Docker Compose version v2.40.3
```

Any version from `v2.23.1` up works. If the command prints `docker: 'compose' is not a docker command`, the Compose plugin is missing; run the convenience script again.

::: tip
The convenience script is the quickest way onto a fresh server. If you manage servers with a configuration tool, install the packages `docker-ce` and `docker-compose-plugin` from Docker's repository instead. Docker's [installation guide](https://docs.docker.com/engine/install/) has the details as additional reading.
:::

## Open the firewall

mailer needs these ports open inbound: **25/tcp** (bounce reports from other mail servers), **80/tcp** (certificate checks, redirect to HTTPS), **443/tcp** and **443/udp** (the admin UI and API), plus **22/tcp** for your SSH session.

**Your provider's firewall.** Many providers put a firewall in front of the server, configured in their web console. On Hetzner Cloud: open **Firewalls**, create a firewall with inbound rules for TCP 22, 25, 80, 443 and UDP 443 from any IPv4 and IPv6 address, and apply it to the server. If your server has no provider firewall attached, there is nothing to do here.

**A firewall on the server.** If you use `ufw` on the server, allow the same ports:

```bash
ufw allow 22/tcp
ufw allow 25/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable
```

::: warning
Docker writes its own firewall rules for published container ports, and those rules take effect before `ufw` sees the traffic. Ports 25, 80 and 443 are therefore reachable once the stack runs, even if `ufw` does not allow them. Do not rely on `ufw` to close a port that a container publishes; the provider's firewall is the reliable place to restrict traffic.
:::

## Make sure outbound port 25 is open

Your mail server delivers every mail by connecting to the recipient's mail server on port 25. Test whether your provider lets that connection through, using Gmail's mail server as the target:

```bash
timeout 10 bash -c 'echo > /dev/tcp/gmail-smtp-in.l.google.com/25' && echo "port 25 open" || echo "port 25 blocked"
```

If it prints `port 25 blocked`, your provider blocks outbound mail. Ask them to unblock it. On Hetzner Cloud, outbound ports 25 and 465 are blocked for new accounts; open a support request in the Hetzner Console asking to unblock outbound port 25 for your server, and name what you will send (transactional mail and contact-form mail for your own websites). Hetzner's [FAQ on blocked mail ports](https://docs.hetzner.com/cloud/servers/faq/) is additional reading. Other providers have a similar form or ticket.

You can continue with the installation while you wait. The site, the setup wizard and everything else work; only the delivery of mail to the outside waits until the block is lifted.

## Set the reverse DNS (PTR record)

A PTR record maps your server's IP address back to a name. Receiving mail servers look it up and distrust mail from an IP whose PTR record does not match the name the mail server introduces itself with. That name is your `MAIL_HOSTNAME`, for example `mx.example.com`.

Set the PTR record of your server's public IPv4 address to `mx.example.com` in your provider's console, and the same for the IPv6 address if the server has one. On Hetzner Cloud: open the server, go to the **Networking** tab, open the menu next to the primary IPv4 address, choose **Edit Reverse DNS** and enter `mx.example.com`; repeat for the IPv6 address (Hetzner shows the network, for example `2001:db8::/64`; enter the full address you use, for example `2001:db8::10`).

Some providers check that the name already resolves to the IP before they accept the PTR record. If yours refuses, create the A record for `mx.example.com` first ([DNS records](/installation/dns)) and come back.

## Create the install directory

Everything mailer needs on the server lives in one directory: the compose file and the `.env` file with your settings. The data itself lives in Docker volumes.

```bash
mkdir -p /opt/mailer
cd /opt/mailer
```

## How you know it worked

Run these four checks. Each one prints what is shown below it.

```bash
docker compose version
```

```text
Docker Compose version v2.40.3
```

The version is `v2.23.1` or newer.

```bash
timeout 10 bash -c 'echo > /dev/tcp/gmail-smtp-in.l.google.com/25' && echo "port 25 open" || echo "port 25 blocked"
```

```text
port 25 open
```

If it still says `port 25 blocked`, your unblock request is pending; you can continue, but no mail leaves the server until it is granted.

```bash
dig +short -x 203.0.113.10
```

```text
mx.example.com.
```

Use your own IP address instead of `203.0.113.10`. If `dig` is missing, install it with `apt-get install -y dnsutils`. An empty answer means the PTR record is not set yet or has not propagated; it can take up to a few hours at some providers.

```bash
ls -ld /opt/mailer
```

```text
drwxr-xr-x 2 root root 4096 Oct 23 10:00 /opt/mailer
```

Continue with [DNS records](/installation/dns).
