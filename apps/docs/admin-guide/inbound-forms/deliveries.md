# Deliveries

This page explains what happens after a form answers `{ "status": "accepted" }`: how a submission becomes e-mails, how mailer retries, what fails for good, where you see the result, and how you resend a failed e-mail. After reading it you can tell why an e-mail did or did not arrive.

A **delivery** is one e-mail for one receiver of one submission. A form with two active receivers creates two deliveries per submission, each sent and retried on its own.

## From submission to e-mail

1. **The submission is checked.** mailer runs the [security checks](/admin-guide/inbound-forms/security) and the [field rules](/admin-guide/inbound-forms/fields). A submission caught by the honeypot is stored marked as spam and gets no deliveries.
2. **Submission and deliveries are stored together.** In one database transaction, mailer stores the submission and one delivery with the status `pending` for every receiver that is **Active** and has a published template. Receivers without a published template are skipped. Each delivery remembers the template version that was live at this moment.
3. **The form answers.** The website gets `202` `{ "status": "accepted" }`. mailer does not wait for the mail server.
4. **Each delivery is queued.** mailer puts a job for each delivery into a queue in Redis. If Redis does not answer within 2 seconds, mailer logs it and leaves the delivery to the recovery sweep (see [The recovery sweep](#the-recovery-sweep)); the website still gets `accepted`.
5. **The backend sends it.** A worker inside the backend takes the job, up to five at a time, renders the template with the submitted values, resolves placeholder recipients such as <code v-pre>{{email}}</code>, signs the e-mail with the sender domain's DKIM key and hands it to mailer's mail server, which delivers it to the recipient's server.
6. **The delivery is marked `sent`**, or retried, or marked `failed`, as described below.

Redis is therefore required for form deliveries, but a Redis outage only delays them: the deliveries wait in the database and are sent once Redis is back. The exception is forms with the timed token, which refuse submissions with `403 Form token could not be verified` until Redis is back, so no delivery is created for them meanwhile. The production compose file runs Redis so that it never drops queued jobs.

## Statuses

Each delivery has one of three statuses. The admin UI does not show deliveries themselves; you see their e-mails on **Sent mail** (see [Where deliveries show up](#where-deliveries-show-up)) and the statuses in the database.

| Status    | Meaning                                                                                                         |
| --------- | --------------------------------------------------------------------------------------------------------------- |
| `pending` | Waiting to be sent, being sent, or waiting for its next attempt after a temporary error.                        |
| `sent`    | mailer's mail server accepted the e-mail.                                                                       |
| `failed`  | mailer gave up: the error was permanent, or all 8 attempts failed. Nothing sends it again unless you resend it. |

`sent` means the same as **Sent** on the **Sent mail** page: accepted by your own mail server, not yet in the recipient's inbox. If the recipient's server rejects the e-mail later, the rejection arrives as a bounce and shows on **Bounces**. The [Bounces](/admin-guide/bounces) page of this guide explains them.

## Retries after temporary errors

A **temporary error** is one that may go away by itself:

- the mail server answered with a `4xx` reply, for example because it is busy or greylists the sender;
- the connection to the mail server failed, timed out, was reset or refused, or TLS failed;
- something went wrong inside mailer before the e-mail was handed over, for example the database was briefly unreachable.

After a temporary error the delivery stays `pending` and is tried again, up to **8 attempts in all**. The pause before the next attempt doubles each time: `60 s · 2^(attempts-1)`, where `attempts` is the number of attempts made so far.

| Attempt | Pause before it | Time since the first attempt |
| ------- | --------------- | ---------------------------- |
| 1       | none            | 0                            |
| 2       | 1 minute        | 1 minute                     |
| 3       | 2 minutes       | 3 minutes                    |
| 4       | 4 minutes       | 7 minutes                    |
| 5       | 8 minutes       | 15 minutes                   |
| 6       | 16 minutes      | 31 minutes                   |
| 7       | 32 minutes      | 63 minutes                   |
| 8       | 64 minutes      | 127 minutes                  |

So a delivery is retried for about two hours. If the 8th attempt fails as well, the delivery becomes `failed`. An outage of the mail server longer than that needs a resend by hand, see [Resend a failed delivery](#resend-a-failed-delivery).

## A domain that is not ready to send

While the sender domain of the form is not ready to send (a DNS record of the domain is not **Valid**, see [Sending needs valid records](/admin-guide/domains#sending-needs-valid-records)), mailer does not hand the e-mail to the mail server. This counts as a temporary error: the delivery stays `pending` and is tried again with the pauses above, so it goes out as soon as a check has found every record **Valid**. If the domain is still not ready at the 8th attempt, about two hours after the first, the delivery becomes `failed` with the error

```text
Domain 3 (mail.example.net) has DNS records that are not valid yet
```

where `3` is the id of the domain. The attempts leave no entry on **Sent mail**, because no mail was recorded. To avoid the wait, fix the records and click **Check again** on the domain's page; to send a delivery that already failed, see [Resend a failed delivery](#resend-a-failed-delivery).

## What fails immediately

These errors do not go away by retrying, so the delivery becomes `failed` at the first attempt:

| Cause                                                                                   | Error stored with the delivery                                   |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| The receiver was removed after the submission arrived                                   | `Receiver was deleted`                                           |
| The template was deleted (it is deleted with its receiver)                              | `Template was deleted`                                           |
| A **Recipient** or **Reply-To** placeholder points to a field the submission left empty | `Recipient field "email" is empty`                               |
| The template cannot be rendered with the submitted values                               | the Handlebars error                                             |
| The recipient's address is blocked after earlier bounces                                | the block message; the e-mail shows **Blocked** on **Sent mail** |
| The mail server rejected the e-mail permanently, with a `5xx` reply                     | the mail server's reply                                          |
| The sender domain no longer exists in mailer                                            | `No sending domain configured for mail.example.net`              |

A permanent rejection of a recipient also counts toward blocking that address, as the [Bounces](/admin-guide/bounces#when-an-address-is-blocked) page of this guide describes.

## The recovery sweep

The queue in Redis is fast, but the database decides. Every minute, one backend instance looks for deliveries that are still `pending` although nothing should be holding them up, and queues them again. A delivery counts as stuck when its last change is older than **2 minutes plus the pause of its next retry**: 2 minutes for a delivery that was never tried, 3 minutes after one attempt, 4 after two, and so on up to 66 minutes after seven. A delivery that is merely waiting for its next retry is left alone.

That catches deliveries that never reached the queue because Redis was down, and jobs lost when the backend or Redis restarted. They are sent about two to three minutes after the problem is over, possibly long after the submission.

## Duplicates after a crash

If the backend stops after the mail server accepted an e-mail but before the delivery was marked `sent`, for example in a power cut, the delivery is still `pending`, and the recovery sweep sends it a second time. The recipient then gets the e-mail twice. This is rare and deliberate: marking a delivery `sent` before handing it over would instead lose e-mails in the same situation.

## Where deliveries show up

Every attempt that reaches the point of sending creates an entry on the project's **Sent mail** page, with the **Source** **Form**: see [Sent mail](/admin-guide/projects#sent-mail).

![The Sent mail page of Acme Website with one sent message](/screenshots/admin-guide/project-messages.png)

_A form's e-mails appear on the project's **Sent mail** page with the source **Form**._

- A delivery that was sent shows as **Sent**.
- A failed attempt shows as **Failed**, with the error below the subject. A delivery that was retried shows one entry per attempt, for example several **Failed** entries followed by one **Sent**.
- A blocked recipient shows as **Blocked**.

Deliveries that fail before they reach the mail server, such as a deleted receiver, an empty recipient field or a template error, leave no entry on **Sent mail**. You find them in the backend log and in the database.

The backend logs every failed attempt by delivery id, with the error's name and code but never the addresses, for example:

```text
Delivery 12 attempt 1 failed, retrying: MailSendError caused by Error (code ECONNECTION)
Delivery 12 attempt 2 failed: MailSendError caused by Error (code EENVELOPE, responseCode 550)
```

To find them, run in the install directory:

```bash
cd /opt/mailer
docker compose logs backend | grep 'Delivery '
```

[Logging](/configuration/logging) explains the log format.

## List failed deliveries

The admin UI has no list of deliveries. To see the failed ones, newest first, query the database in the install directory:

```bash
cd /opt/mailer
(set -a; . ./.env; docker compose exec postgres psql -U "$DB_USERNAME" -d "$DB_DATABASE" -c "SELECT \"inboundFormDeliveryId\", \"emailTo\", attempts, error, \"updatedAt\" FROM inbound_form_delivery WHERE status = 'failed' ORDER BY \"updatedAt\" DESC LIMIT 20")
```

`emailTo` is the recipient as configured on the receiver, for example <code v-pre>{{email}}</code> for a placeholder that could not be resolved, or the resolved address once a delivery was sent. Replace `'failed'` with `'pending'` to see deliveries that are still waiting.

## Resend a failed delivery

The admin UI has no button to resend a `failed` delivery. To resend one, set its status back to `pending` and its attempts to `0` in the database. Take the id from the list above and run, in the install directory:

```bash
cd /opt/mailer
(set -a; . ./.env; docker compose exec postgres psql -U "$DB_USERNAME" -d "$DB_DATABASE" -c "UPDATE inbound_form_delivery SET status = 'pending', attempts = 0 WHERE \"inboundFormDeliveryId\" = <id> AND status = 'failed'")
```

`psql` answers `UPDATE 1`. The recovery sweep queues the delivery within about two minutes, and it gets a fresh set of 8 attempts. Reset `attempts` as well: the sweep waits for the retry pause that belongs to the attempts count, so a delivery that keeps 8 attempts would wait more than two hours.

Resending only helps when the cause is gone: fix the mail server, lift the block or correct the address first. A delivery whose receiver or template was deleted fails again at once.

## When no e-mail arrives

Work through these in order:

1. **Did the form answer `accepted`?** If not, the answer names the cause; see [Embed the form](/admin-guide/inbound-forms/embed#responses).
2. **Does the form have a receiver that is Active and has a published template?** Without one, `accepted` is answered but no delivery is created, and publishing later does not catch up. See [Receivers and templates](/admin-guide/inbound-forms/receivers-and-templates#while-no-template-is-published).
3. **Did the honeypot catch it?** A filled-in honeypot also answers `accepted`. The backend log shows `Honeypot "website" triggered for form <id>`.
4. **What does Sent mail say?** **Failed** shows the error, **Blocked** a blocked recipient, **Sent** that your mail server accepted it: then look in the recipient's spam folder and on **Bounces**.
5. **Nothing on Sent mail?** Check the backend log for `Delivery` lines and the database for `pending` or `failed` deliveries, as shown above. Many `pending` deliveries that do not move point to Redis or the mail server: `docker compose ps` in `/opt/mailer` shows whether `redis` and `mail` are running. Or the sender domain is not ready to send: the delivery's error then reads `… has DNS records that are not valid yet`; see [Sending needs valid records](/admin-guide/domains#sending-needs-valid-records).

The [operations](/operations/monitoring) and [troubleshooting](/operations/troubleshooting) pages of this documentation cover the mail server and Redis in more depth.
