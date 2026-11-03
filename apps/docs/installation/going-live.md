# Going live

This page covers what to do between a working installation and real traffic: warming up the new IP address, tightening DMARC step by step, checking that your IP is on no blocklist, and taking backups from the first day. At the end you have a plan for the first weeks and know where to look when mail lands in spam.

::: warning Keep MAIL_HOSTNAME once customers send
Every customer's SPF record includes `MAIL_HOSTNAME`. With `SEND_REQUIRE_VALID_DNS=true`, the default, changing it later stops sending for every customer domain until each owner has published the new include and a check has run ([Change MAIL_HOSTNAME](/admin-guide/settings#change-mail-hostname)). Settle on the name before you go live.
:::

## Warm up the IP address

Large mail providers (Gmail, Microsoft, Yahoo and the rest) judge a sender by its history. A new IP address has none, and one that suddenly sends hundreds of mails a day looks like a spammer who just rented a server: its mail lands in spam folders or the IP lands on a blocklist. **IP warm-up** means raising your daily volume slowly over the first weeks, so the providers see a steady sender whose mail people want.

Count every mail the server sends in a day, form deliveries and API sends together, across all projects. Keep to this schedule:

| Week | Days    | Mails per day, at most |
| ---- | ------- | ---------------------- |
| 1    | 1 – 2   | 20                     |
| 1    | 3 – 4   | 40                     |
| 1    | 5 – 7   | 75                     |
| 2    | 8 – 10  | 150                    |
| 2    | 11 – 14 | 300                    |
| 3    | 15 – 17 | 600                    |
| 3    | 18 – 21 | 1,000                  |
| 4    | 22 – 24 | 2,000                  |
| 4    | 25 – 28 | 4,000                  |

After four weeks, raise the volume by at most double from one week to the next. If your sites send fewer mails than the schedule allows, you are warming up anyway; most contact forms never get near these numbers.

During the warm-up:

- **Send what people expect first.** Contact-form mail to your own inboxes and transactional mail that users asked for (password resets, confirmations) build a good reputation. Do not start with mail to addresses that have not heard from you in a long time.
- **Watch the bounces.** Open **Bounces** in the admin UI every few days. A growing number of permanent bounces, or rejections that mention spam or reputation, means: hold the volume where it is until they stop.
- **Do not jump back.** If the volume falls for a while and rises again, rise as slowly as the schedule.

::: warning No sending cap in mailer
mailer has no setting that limits the number of mails per day. Control the volume by moving websites onto mailer one at a time, starting with the ones that send least. For API keys you can lower `PUBLIC_API_RATE_LIMIT` in `.env` (requests per key per minute by default) and run `docker compose up -d` to apply it; see [Environment variables](/configuration/environment#rate-limits).
:::

Gmail's [Postmaster Tools](https://postmaster.google.com/) and Microsoft's [Smart Network Data Services](https://sendersupport.olc.protection.outlook.com/snds/) show how those providers rate your domain and IP; both are free and worth registering for as additional reading.

## Tighten DMARC step by step

DMARC tells receivers what to do with mail that claims to come from your domain but fails both SPF and DKIM: nothing, the spam folder or rejection. mailer generates every domain's DMARC record with `p=none`, which only observes. Once you are sure all legitimate mail passes, tighten it, so that nobody can send mail in your domain's name.

Do this for every domain you send from: the customer domains, for example `mail.example.net`, and `MAIL_HOSTNAME` itself.

**Stage 1, from the start: observe (`p=none`).** Keep the generated record. To see what receivers observe, you can add an `rua` address; large providers then send a daily report (an XML file) to it about every mail that claimed your domain:

```dns
_dmarc.mail.example.net.  300  IN  TXT  "v=DMARC1; p=none; rua=mailto:dmarc-reports@example.com"
```

The report address is optional and must be a real mailbox you read somewhere else; mailer does not host mailboxes. Because `example.com` is a different domain than `mail.example.net`, the domain of the mailbox must allow the reports with one more record:

```dns
mail.example.net._report._dmarc.example.com.  300  IN  TXT  "v=DMARC1;"
```

**Stage 2, after about four weeks: quarantine (`p=quarantine`).** When the reports, or your own test mails, show that all your mail passes DKIM, ask receivers to put failing mail into spam:

```dns
_dmarc.mail.example.net.  300  IN  TXT  "v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@example.com"
```

**Stage 3, after another two to four weeks without problems: reject (`p=reject`).** Failing mail is now refused outright:

```dns
_dmarc.mail.example.net.  300  IN  TXT  "v=DMARC1; p=reject; rua=mailto:dmarc-reports@example.com"
```

Without a report address, the records are `v=DMARC1; p=quarantine;` and `v=DMARC1; p=reject;`. For `MAIL_HOSTNAME`, the host is `_dmarc.mx.example.com`.

If the domain also sends mail from somewhere other than mailer (an office mailbox, a newsletter service), that service must sign with DKIM for the domain too before you go past `p=none`, or its mail will be junked or rejected. A subdomain used only for mailer, such as `mail.example.net`, avoids that question.

The DNS check accepts any policy: a DMARC record that starts with `v=DMARC1` and carries a `p=` tag stays **Valid** when you change it to `p=quarantine` or `p=reject` or add a report address.

## Check your IP address against blocklists

Blocklists (also called blacklists or DNSBLs) are lists of IP addresses that send spam. Many mail servers reject or junk mail from a listed IP. A freshly rented IP can already be on one because of its previous owner. mailer does not check blocklists for you: the check is manual. Do it before you go live, about once a month afterwards, and whenever mail suddenly lands in spam.

The lists most mail servers consult are:

- **Spamhaus ZEN** (`zen.spamhaus.org`), the most widely used, combining Spamhaus's SBL, XBL and PBL lists.
- **Barracuda** (`b.barracudacentral.org`).
- **SpamCop** (`bl.spamcop.net`).

Each list answers a DNS lookup of your IP address with its four parts reversed. This checks all three at once; set your own IP in the first line:

```bash
IP=203.0.113.10
REV=$(echo "$IP" | awk -F. '{print $4"."$3"."$2"."$1}')
for list in zen.spamhaus.org b.barracudacentral.org bl.spamcop.net; do
    echo "$list: $(dig +short "$REV.$list" | tr '\n' ' ')"
done
```

```text
zen.spamhaus.org:
b.barracudacentral.org:
bl.spamcop.net:
```

An empty answer means not listed. An answer in `127.0.0.2` to `127.0.0.11` means listed. Some lists refuse lookups through large public resolvers and answer with a code such as `127.255.255.254` instead; that means the lookup was refused, not that you are listed. In that case, and to see more lists at once, use the web checkers: Spamhaus's [IP and domain reputation checker](https://check.spamhaus.org/) and MxToolbox's [blacklist check](https://mxtoolbox.com/blacklists.aspx).

If your IP is listed, the list's website explains why and how to request removal. For a new server whose previous owner caused the listing, explain that the IP was recently assigned to you; most lists remove such entries quickly. Do not go live from a listed IP.

## Take backups from day one

Two things cannot be recreated if the server is lost: the database and the `.env` file with `BACKEND_ENCRYPTION_SECRET`. You saved `.env` on [Docker Compose](/installation/docker-compose#fill-in-env). Start dumping the database now, before real data arrives:

```bash
cd /opt/mailer
(set -a; . ./.env; docker compose exec -T postgres pg_dump -U "$DB_USERNAME" -d "$DB_DATABASE" -Fc) > "mailer-$(date +%F).dump"
```

This writes a compressed dump such as `mailer-2026-10-23.dump` into `/opt/mailer`. Copy it off the server, for example with `scp` to another machine or to your backup storage, and repeat it regularly, at least daily, for example from a cron job. A dump without the matching `BACKEND_ENCRYPTION_SECRET` cannot restore the DKIM keys, so keep both together.

The [Backup and restore](/operations/backup-restore) page under Operations explains what else to keep (the mail server's accounts in the `mail-config` volume), what you can skip, and how to restore on a new server.

## When mail lands in spam

Work through these in order; the first ones are the most common causes.

1. **Authentication.** Open the received mail's original source (in Gmail: **Show original**) and look at the `Authentication-Results` header. `spf=pass`, `dkim=pass` and `dmarc=pass` are what you want. A failure points to a DNS record: check that the domain shows every record as **Valid** in the admin UI.
2. **Reverse DNS.** `dig +short -x 203.0.113.10` must print `mx.example.com.` (see [DNS records](/installation/dns#set-the-reverse-dns)).
3. **Blocklists.** Run the blocklist check above.
4. **Volume.** Did the daily volume rise faster than the warm-up schedule? Go back a step and rise slowly.
5. **Content.** Subjects in capitals, many links, link shorteners or a mail that is one big image look like spam to filters. Send plain, short HTML with a text part.
6. **Reputation.** Gmail's Postmaster Tools show your domain's and IP's reputation once you send enough mail to Gmail users.

## How you know it worked

- The blocklist check prints an empty answer for every list, or the web checkers show your IP as not listed.
- A test mail to a Gmail or Outlook address lands in the inbox, and its `Authentication-Results` header shows `spf=pass`, `dkim=pass` and `dmarc=pass`.
- `dig +short TXT _dmarc.mail.example.net @1.1.1.1` prints the DMARC policy of the stage you are in, for example `"v=DMARC1; p=none; rua=mailto:dmarc-reports@example.com"`.
- A database dump exists off the server: `ls -lh /opt/mailer/*.dump` lists today's file, and you have copied it and `.env` to a second place.
- You have a calendar entry for the warm-up steps and for the next DMARC stage.
