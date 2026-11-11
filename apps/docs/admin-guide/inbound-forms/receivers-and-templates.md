# Receivers and templates

This page explains receivers, who gets an e-mail for each submission, and the template editor, where you write what that e-mail says. At the end a form has a receiver with a published template and sends one e-mail per submission.

A **receiver** is one e-mail that goes out for every accepted submission: from a sender address on the form's domain to a recipient. A form can have several receivers, for example one that notifies the office and one that confirms receipt to the visitor. Each receiver has its own **template**, the subject and HTML body of its e-mail, written in Handlebars, a template language in which <code v-pre>{{name}}</code> stands for the submitted value of the field `name`.

![The Receivers card of the form Contact form with one receiver from contact@mail.example.net to inbox@example.org, Reply-To set to the email field, and the badges Published v1 and Active](/screenshots/admin-guide/form-receivers.png)

_The card **Receivers**: one receiver with a published template._

## Add a receiver

You need **Manage forms** on the form's project, and the form needs a **Sender domain** (see [Create a form](/admin-guide/inbound-forms/create#name-and-sender-domain)). Without one, the dialog says **Choose a sender domain on the form first.** and mailer refuses the receiver with `The form needs a domain before receivers can be configured`.

1. On the form's page, in the card **Receivers**, click **Add receiver**.
2. Fill in the dialog:

    | Field         | Required | What to enter                                                                                                                                                                                       |
    | ------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
    | **Sender**    | Required | `emailFrom`, the `From` address, for example `contact@mail.example.net`. It must end in `@` plus the form's sender domain, exactly: `contact@news.mail.example.net` is refused.                     |
    | **Recipient** | Required | `emailReceiver`, where the e-mail goes: a fixed address such as `inbox@example.org`, or a placeholder of an **Email** field such as <code v-pre>{{email}}</code>. The list offers the placeholders. |
    | **Reply-To**  | Optional | `emailReplyTo`, where answers go: a fixed address or a placeholder. Empty (**None**) means answers go to the sender.                                                                                |
    | **Active**    | Optional | On by default. **Inactive receivers are skipped.**                                                                                                                                                  |

3. Click **Add receiver**.

Typical receivers:

- **Notify the office:** **Sender** `contact@mail.example.net`, **Recipient** `inbox@example.org`, **Reply-To** <code v-pre>{{email}}</code>. Clicking reply in the office's mail program answers the visitor directly.
- **Confirm to the visitor:** **Sender** `contact@mail.example.net`, **Recipient** <code v-pre>{{email}}</code>, **Reply-To** `inbox@example.org`.

The errors mailer can answer with:

| Message                                                                              | Cause                                                                              |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `Sender address must use the form domain mail.example.net`                           | **Sender** is on another domain.                                                   |
| `"inbox" is neither an email address nor a field placeholder`                        | **Recipient** or **Reply-To** is neither an address nor a placeholder.             |
| <code v-pre>Placeholder "{{name}}" must reference an email field of this form</code> | The placeholder names a field that does not exist or is not of the type **Email**. |

::: warning A placeholder needs a filled-in field
When **Recipient** or **Reply-To** is a placeholder and the submission leaves that field empty, the e-mail cannot be addressed and the delivery fails with `Recipient field "email" is empty`. Make the field required, see [Fields](/admin-guide/inbound-forms/fields#validation-rules).
:::

::: warning A visitor-chosen recipient can be abused
A receiver with **Recipient** <code v-pre>{{email}}</code> sends mail to whatever address a visitor types in, with your text and from your domain. Keep such confirmation templates short and neutral, do not repeat the visitor's message in them, and protect the form with the [security checks](/admin-guide/inbound-forms/security), so that the form cannot be used to send mail to strangers.
:::

### Manage receivers

Each row shows **Sender → Recipient**, the **Reply-To** (or **No Reply-To**) and two badges: the template state (**Published v1**, **Draft v2** when an unpublished draft is newer, or **No template**) and **Active** or **Inactive**. The three-dot menu (**Actions for receiver _address_**) offers:

- **Edit receiver**: change the settings and click **Save**.
- **Deactivate** / **Activate**: switch the receiver off and on without losing it. Submissions accepted while it is off do not reach it later.
- **Remove receiver…**: confirm with **Remove receiver**. The receiver's template and all its versions are deleted with it. Deliveries for it that are still waiting fail with `Receiver was deleted`.

## Open the template editor

Click **Write template** in the receiver's row, or **Edit template** once it has one. Users with only **View** on the project see **View template** and get a read-only editor. On a phone, the same entry is in the three-dot menu.

![The template editor: the subject New message from and the name placeholder, the Insert field chips name, email and message, the HTML template on the left and the preview with sample data on the right, with the buttons Versions, Save draft and Publish at the top](/screenshots/admin-guide/template-editor.png)

_The page **Email template**: subject and code on the left, the preview with sample data on the right._

The header shows the receiver (`contact@mail.example.net → inbox@example.org`), the live version (**Live: v1 ·** and when it was published), and **Unsaved changes** while the editor holds edits that are not saved.

A receiver without a template shows **No template yet** with two buttons:

- **Use field layout** fills in a table with the label and value of every field, and the form's name as subject.
- **Start empty** opens an empty editor.

## Write the template

The template has two parts:

- **Subject**: one line. **Placeholders work here too.** Line breaks in submitted values are replaced by spaces.
- **Template**: the HTML body of the e-mail (**HTML + Handlebars**). mailer sends only this HTML part, no separate plain-text version.

Write placeholders as <code v-pre>{{key}}</code>, with the key of a field from [Fields](/admin-guide/inbound-forms/fields). In the body, submitted values are HTML-escaped, so `<b>` from a visitor shows up as text, not as bold type. A small example:

```handlebars
<h1>New message from {{name}}</h1>
<p>Email: {{email}}</p>
<p>{{message}}</p>
{{#if newsletter}}
    <p>Wants the newsletter.</p>
{{/if}}
```

Handlebars' built-in blocks work, such as <code v-pre>{{#if}}…{{else}}…{{/if}}</code>, <code v-pre>{{#unless}}</code> and <code v-pre>{{#each}}</code>; mailer adds no helpers of its own. A placeholder for a field the submission left out prints nothing.

Help while writing:

- **Insert field** shows one chip per field; clicking a chip inserts its placeholder at the cursor.
- Typing <code v-pre>{{</code> opens suggestions with the form's fields (the footer reads **Type <code v-pre>{{</code> for field suggestions · Ctrl+S saves a draft**).
- The editor closes HTML tags as you type them and expands short abbreviations such as `p` or `ul>li` when you press Tab.
- The buttons **Editor**, **Split** and **Preview** choose what the page shows; on a small screen **Split** is not offered.

### The preview

**Preview with sample data** renders the subject and body with invented values while you type, and shows the sender, recipient and Reply-To with the same values. **Desktop** and **Mobile** switch the preview width.

The sample values are each field's default value where it has one, otherwise:

| Field type  | Sample value                                      |
| ----------- | ------------------------------------------------- |
| **Text**    | `Sample` and the label, for example `Sample Name` |
| **Email**   | `jane.doe@example.com`                            |
| **Number**  | `42`                                              |
| **Boolean** | `true`                                            |

When the template has a syntax error, for example an unclosed <code v-pre>{{#if}}</code>, the preview shows **Template error on line _n_** and **Showing the last version that compiled.**, and the line is marked in the editor.

## Save draft and publish

Nothing you type reaches submissions until you publish it.

- **Save draft** (or Ctrl+S) stores the subject and template as a draft. A receiver has at most one draft; saving again overwrites it. The draft gets the next version number, for example `v2` while `v1` is live.
- **Publish** saves the draft and asks **Publish draft v2?**: **New submissions to inbox@example.org use this template right away. Earlier versions stay in the history.** Confirm with **Publish**; the page shows **Published as v2**.

mailer refuses to publish an empty subject or body (`Subject and template must not be empty`) and a template with a syntax error, naming the error.

A delivery uses the version that was live when the submission arrived. Publishing a new version does not change e-mails that are still waiting to be sent.

### Versions

**Versions** lists every version of the template (**Versions of this template**), newest first, with its badge (**Published v1**, **Draft v2**) and when it was saved; **Editing** marks the one in the editor and **Live** the one in use. **Opening a version loads it into the editor. Save a draft to keep it.**

To go back to an earlier version, open it from **Versions**, click **Save draft**, then **Publish**. It becomes a new version with the old content.

## While no template is published

A receiver without a published template is skipped. Submissions are still accepted and answered with `{ "status": "accepted" }`, but no e-mail is created for that receiver, and publishing a template later does not send e-mails for the submissions that arrived before. The dashboard warns **A receiver has no template** while an active receiver is in this state (see [Overview](/admin-guide/overview)).

The same holds for a form without any receivers: **Submissions are accepted but nobody is emailed.** Publish the template before you put the form on the website.

## How the e-mail goes out

Each published receiver turns every accepted submission into one delivery, which mailer sends in the background and retries after temporary errors. [Deliveries](/admin-guide/inbound-forms/deliveries) explains the process, what can fail and where you see the result.
