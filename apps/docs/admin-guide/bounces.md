# Bounces

This page explains how mailer learns that a mail was not delivered, when it blocks a recipient address because of that, and how you review and lift blocks. After reading it you can tell why a mail to an address was not sent and decide whether to unblock it.

A **bounce** is the report that a mail could not be delivered to a recipient. It is **permanent** when the address will not work on a retry either, for example because the mailbox does not exist, and **transient** (temporary) when the problem may go away, for example a full mailbox or a receiving server that is down. mailer collects every bounce on one page and blocks addresses that keep bouncing, because mail to dead addresses harms the reputation of your server with the large mail providers.

You need the global permission **View bounces** to open **Bounces**, and **Unblock addresses** to lift a block (see [Users and roles](/admin-guide/users-and-roles)).

## How bounces reach mailer

Bounces arrive in two ways.

**At send time.** While the backend hands a mail to mailer's mail server, that server may refuse the recipient right away. mailer records a permanent bounce only for a `5xx` reply to `RCPT TO`, the step that names the recipient, with one of the enhanced status codes `5.1.1`, `5.1.2`, `5.1.3`, `5.1.6` or `5.1.10`: the address or its domain does not exist, is malformed, has moved, or accepts no mail. [Recipient rejections at send time](/admin-guide/domains#recipient-rejections-at-send-time) explains the codes. Every other refusal only marks the mail **Failed** on the project's **Sent mail** page.

**Later, by mail.** Most rejections happen after mailer's mail server has accepted the mail and passed it on: the recipient's server accepts or refuses it on its own schedule. When it cannot deliver, it sends a bounce report to the mail's **return path**, the envelope sender address, which is `bounce@mx.example.com` for every mail mailer sends. Such a report is a **DSN** (delivery status notification), a mail with a machine-readable part that names each failed recipient, the action (`failed` or `delayed`) and a status code such as `5.1.1`.

The mail server stores these reports in the **bounce mailbox**, the account `bounce@mx.example.com`. Every 60 seconds, the backend logs in to it over IMAP, reads every mail it has not read yet and records one bounce per recipient in the report:

| In the report                                                    | Recorded as   |
| ---------------------------------------------------------------- | ------------- |
| Action `failed` with any status code other than `4.x.x`, or none | **Permanent** |
| Action `failed` with a status code `4.x.x`                       | **Transient** |
| Action `delayed`                                                 | **Transient** |
| Any other action, for example `delivered`                        | not recorded  |

A mail in the bounce mailbox that is not a DSN, for example an out-of-office reply, is skipped. The backend marks every mail it has processed as read, so it never processes the same mail twice, and a report that arrives twice with the same `Message-ID` records its bounces only once. A new bounce therefore appears on **Bounces** about a minute after the report reached the mailbox.

## The Bounces list

Open **Bounces** in the navigation. The tab **Bounces** lists every recorded bounce, newest first.

![The Bounces tab listing one permanent bounce for blocked@example.org with status 5.1.1 and the reason 550 5.1.1 User unknown](/screenshots/admin-guide/bounces.png)

_The **Bounces** tab. The chips filter by type; the count next to each tab shows how many entries it holds._

| Column        | Content                                                                                                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Recipient** | The address that bounced, in lower case.                                                                                                                                 |
| **Type**      | **Permanent** or **Transient**.                                                                                                                                          |
| **Status**    | For a bounce report, the status code from the report, for example `5.1.1`. For a rejection at send time, the mail server's reply code, for example `550`. **—** if none. |
| **Reason**    | The receiving server's explanation, for example `550 5.1.1 User unknown`.                                                                                                |
| **Received**  | When the bounce happened: the date of the report, or the moment of the rejection at send time.                                                                           |

Type in **Search recipient or reason** to search both columns, and use the chips **All**, **Permanent** and **Transient** to show one type only. Click **Type** or **Received** in the table header to sort by that column.

The dashboard shows the same data in short: **Recent bounces**, the figure **Bounces · 7 days**, and under **Needs attention** the number of permanent bounces of the last seven days.

## When an address is blocked

A **block** stops mailer from sending to an address for a while. mailer blocks an address automatically, and nobody can block one by hand. The rules are:

- **A permanent bounce** blocks the address at once.
- **Transient bounces** block the address when it has 3 or more of them within the last 7 days, counted by their **Received** time and including the new one.

The length of a block depends on how often the address has been blocked before:

| Block for this address | Lasts    |
| ---------------------- | -------- |
| First                  | 7 days   |
| Second                 | 30 days  |
| Third                  | 90 days  |
| Fourth and every later | 365 days |

A bounce for an address that is blocked right now changes nothing: the block is neither extended nor counted again. A block ends on its own at its **Blocked until** date; mail to the address is sent again from then on. The count of earlier blocks stays, so the next block of the same address takes the next step of the ladder, even after the block has run out or was lifted by hand.

## What a block does to mail

Before every mail, mailer checks the recipient against the active blocks, regardless of upper and lower case. For a blocked recipient it does not contact the mail server:

- **Send API:** the request is answered with `422` and the code `RECIPIENT_BLOCKED` (see [Send API](/admin-guide/send-api#responses-and-errors)).
- **Inbound forms:** the delivery to that receiver is marked `failed` at once and not retried (see [Deliveries](/admin-guide/inbound-forms/deliveries#what-fails-immediately)).

Both appear on the project's **Sent mail** page with the status **Blocked**.

## Review and lift a block

Open **Bounces** and click the tab **Blocked addresses**. It lists every address that is blocked right now; blocks that have run out or were lifted are not shown.

![The Blocked addresses tab listing blocked@example.org, blocked until 30 Oct 2026, blocked once, with an Unblock button](/screenshots/admin-guide/blocked-addresses.png)

_The **Blocked addresses** tab. **Times blocked** decides how long the next block lasts._

| Column            | Content                                                             |
| ----------------- | ------------------------------------------------------------------- |
| **Recipient**     | The blocked address.                                                |
| **Blocked until** | The day the block runs out on its own.                              |
| **Times blocked** | How often the address has been blocked so far, this block included. |
| **Actions**       | **Unblock**, shown only to users with **Unblock addresses**.        |

Before you lift a block, look up the address on **Bounces** and check the reason. Unblock when the cause is gone, for example when the recipient tells you their mailbox works again or a typo in a form receiver was fixed. If the address still does not exist, the next mail bounces again and blocks it for longer.

To lift a block:

1. In the address's row, click **Unblock**. There is no confirmation dialog.
2. The row disappears and the notification **Unblocked** _address_ appears with an **Undo** button. Click **Undo** within 8 seconds to keep the block.
3. When the notification closes, or when you open another page, the block is lifted. If that fails, the row comes back with the message **Couldn't unblock** _address_. If you close the browser tab while the notification is still showing, the block stays.

Mail to the address is sent again from then on. Mail that was not sent during the block stays unsent: an API client sends it again itself, and a `failed` form delivery is resent by hand as described in [Resend a failed delivery](/admin-guide/inbound-forms/deliveries#resend-a-failed-delivery). The bounces of the address stay in the list.

## Known gaps

### The bounce mailbox only grows

The backend marks the reports it has processed as read and never deletes them, and mailer has no cleanup job for the mailbox. Every bounce report therefore stays on disk for good.

The mailbox lives in the Docker volume `mail-data`, which `deploy/compose.yml` mounts at `/var/mail` in the `mail` container. To see how much space it takes:

```bash
cd /opt/mailer
docker compose exec mail du -sh /var/mail
```

The workaround is to purge the mailbox by hand from time to time. mailer itself provides no command for it, but the mail server is docker-mailserver, which ships Dovecot and its admin tool `doveadm`. Delete only mails that are marked as read (the IMAP flag `SEEN`): the backend has processed them and no longer needs them, while unread mails are still waiting for the next poll. Back up the volume first (see the [Backup and restore](/operations/backup-restore) page in the Operations section).

1. List the read mails older than 30 days that the purge would remove:

    ```bash
    cd /opt/mailer
    (set -a; . ./.env; docker compose exec mail doveadm search -u "bounce@$MAIL_HOSTNAME" mailbox INBOX SEEN savedbefore 30d)
    ```

    Each line of the output is one mail. No output means there is nothing to remove.

2. Delete exactly these mails:

    ```bash
    cd /opt/mailer
    (set -a; . ./.env; docker compose exec mail doveadm expunge -u "bounce@$MAIL_HOSTNAME" mailbox INBOX SEEN savedbefore 30d)
    ```

3. Run the `doveadm search` command from step 1 again: it prints nothing. The `du` command above reports less space.

Change `30d` to keep a longer or shorter history in the mailbox. Unread mails are never touched by these commands, so the backend still processes every report that has not been read yet.

### Bounces are not linked to the mail that caused them

A bounce report names the recipient, but mailer does not record which project, form delivery or API request the bounced mail came from: every mail uses the same return path, `bounce@mx.example.com`. **Bounces** is therefore one list for the whole installation, and a bounce does not change the status of the original entry on **Sent mail**, which stays **Sent**. Linking them would need a separate return path per mail (VERP), which is [planned](/reference/roadmap#link-bounces-to-the-mail-that-caused-them).

To find the mail behind a bounce, search the recipient on the **Sent mail** page of the projects that may have sent to it, and compare the times.

### Old bounces are never removed

Recorded bounces stay in the database for good; there is no automatic purge yet. The list is paginated and searchable, so this only matters for the size of the database.
