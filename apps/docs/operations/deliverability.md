# Deliverability

Valid DNS records get your mail accepted; whether it lands in the inbox depends on your sender reputation. This page covers the three things that build it: warming up a new IP address, tightening DMARC, and what to check when mail lands in spam.

## Warm up the IP address

Large mail providers judge a sender by its history. A new IP address has none, and one that suddenly sends hundreds of mails a day looks like a spammer. Raise your daily volume slowly over the first weeks, counting every mail the server sends, form deliveries and API sends together:

| Days    | Mails per day, at most |
| ------- | ---------------------- |
| 1 – 2   | 20                     |
| 3 – 4   | 40                     |
| 5 – 7   | 75                     |
| 8 – 10  | 150                    |
| 11 – 14 | 300                    |
| 15 – 17 | 600                    |
| 18 – 21 | 1,000                  |
| 22 – 24 | 2,000                  |
| 25 – 28 | 4,000                  |

After four weeks, at most double the volume from one week to the next. Most contact forms never get near these numbers, so a small installation warms up on its own.

- **Start with mail people expect:** contact-form mail to your own inboxes and transactional mail users asked for.
- **Watch the bounces.** If **Bounces** in the admin UI shows growing permanent bounces or rejections that mention spam or reputation, hold the volume until they stop.
- **Move websites over one at a time.** mailer has no daily sending cap; for API keys, a lower `PUBLIC_API_RATE_LIMIT` ([Advanced configuration](/installation/advanced-configuration#rate-limits)) slows a single sender down.

Gmail's [Postmaster Tools](https://postmaster.google.com/) and Microsoft's [SNDS](https://sendersupport.olc.protection.outlook.com/snds/) show how those providers rate your domain and IP.

## Tighten DMARC step by step

mailer generates every domain's DMARC record with `p=none`, which only observes. Once all legitimate mail passes, tighten it, so nobody can send mail in your domain's name. Do this for every sender domain and for `MAIL_HOSTNAME` itself:

1. **From the start, observe:** `v=DMARC1; p=none;`. Optionally add `rua=mailto:dmarc-reports@example.com` to receive daily reports from large providers. If the report mailbox is on another domain than the one the record is for, that domain must allow it with a TXT record at `<your domain>._report._dmarc.<mailbox domain>` with the value `v=DMARC1;`.
2. **After about four weeks, quarantine:** `v=DMARC1; p=quarantine;` asks receivers to put failing mail into spam.
3. **After another two to four weeks without problems, reject:** `v=DMARC1; p=reject;` refuses failing mail outright.

If the domain also sends mail from elsewhere (an office mailbox, a newsletter service), that service must sign with DKIM for the domain before you go past `p=none`. A subdomain used only for mailer, such as `mail.example.net`, avoids the question. The DNS check stays **Valid** for any policy, as long as the record starts with `v=DMARC1` and has a `p=` tag.

## When mail lands in spam

Work through these in order:

1. **Authentication.** Open the mail's original source (in Gmail: **Show original**). `spf=pass`, `dkim=pass` and `dmarc=pass` are what you want; a failure points to a DNS record that is not **Valid** in the admin UI.
2. **Reverse DNS.** The PTR record of the server's IP address must point to `MAIL_HOSTNAME`.
3. **Blocklists.** A freshly rented IP can be listed because of its previous owner. Check it with Spamhaus's [reputation checker](https://check.spamhaus.org/) or MxToolbox's [blacklist check](https://mxtoolbox.com/blacklists.aspx); the list's website explains how to request removal.
4. **Volume.** If the daily volume rose faster than the warm-up schedule, go back a step.
5. **Content.** Capitalised subjects, many links, link shorteners or a mail that is one big image look like spam. Send short HTML with a text part.
