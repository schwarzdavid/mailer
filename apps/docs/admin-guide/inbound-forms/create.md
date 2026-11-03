# Create a form

This page walks you through creating an inbound form: its name, its slug, the sender domain its mail comes from, whether it accepts submissions, and which websites may post to it. At the end the form has a public endpoint such as `https://app.example.com/api/public/form/contact` that your website's contact form can post to.

An **inbound form** is mailer's side of a contact form on a website. The website keeps its own HTML form; when a visitor submits it, the browser sends the values to the form's public endpoint, mailer checks them and e-mails them to the addresses you configure. The website needs no backend of its own.

Setting up a form takes five steps, each on its own page of this guide:

1. Create the form (this page).
2. Define its [fields](/admin-guide/inbound-forms/fields), the values the website sends.
3. Add [security checks](/admin-guide/inbound-forms/security) that keep bots out.
4. Add [receivers and their templates](/admin-guide/inbound-forms/receivers-and-templates): who gets an e-mail per submission and what it looks like.
5. [Embed the form](/admin-guide/inbound-forms/embed) in the website.

## Before you start

- The form belongs to a project. Create the project first, see [Projects](/admin-guide/projects#create-a-project).
- You need the project permission **Manage forms** on that project. Users with only **View** can open the form's page, but every card is read-only.
- The form sends its mail from a **sender domain** that is assigned to the project. Add the domain on [Domains](/admin-guide/domains), wait until it shows **Valid**, and assign it to the project as described in [Assign sender domains](/admin-guide/projects#assign-sender-domains). You can create the form without a domain, but you cannot add receivers until it has one.

## Create the form

1. Open **Projects** and click the project, for example **Acme Website**.
2. In the card **Inbound forms**, click **New form**.
3. In the dialog **New inbound form**, fill in:

    | Field             | Required | What to enter                                                                                                                                                                              |
    | ----------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
    | **Name**          | Required | A name for people, for example `Contact form`. At most 255 characters.                                                                                                                     |
    | **Slug**          | Required | The last part of the endpoint URL, for example `contact`. mailer fills it in from the name until you edit it.                                                                              |
    | **Sender domain** | Optional | The domain the form's mail comes from, for example `mail.example.net`. The list offers only the domains assigned to the project; when the project has exactly one, it is already selected. |

4. Click **Create form**.

mailer opens the form's page and shows **Form created**.

The **slug** may contain lowercase letters, digits and single hyphens between them, like `contact` or `contact-request`; it cannot start or end with a hyphen and is at most 255 characters long. It must be unique across the whole installation, not only within the project: if another form anywhere already uses it, the dialog shows `Slug is already in use`.

![The page of the form Contact form: the Endpoint card with the URL https://app.example.com/api/public/form/contact and the Accept submissions switch, and below it the General card with name, slug and sender domain](/screenshots/admin-guide/form-detail.png)

_The form's page. The **Endpoint** card shows the public URL; **General** holds name, slug and sender domain._

## The form's page

The page shows, from top to bottom, the cards **Endpoint**, **General**, **Fields**, **Security**, **Receivers** and **Delete form**. Next to the form's name, a badge shows **Active** or **Inactive** and, while no allowed domains are set, a second one shows **Any website**. Below the name you see the sender domain and the number of receivers.

### The endpoint

The **Endpoint** card shows the URL your website posts to, with a copy button:

```text
https://app.example.com/api/public/form/<slug>
```

With the slug `contact` that is `https://app.example.com/api/public/form/contact`. The admin UI builds the URL from the address you opened it under, so it shows your own `SITE_ADDRESS`.

**Example request** opens a ready-made JavaScript `fetch` call with sample values for the form's fields. [Embed the form](/admin-guide/inbound-forms/embed) has complete examples.

### Accept submissions

The switch **Accept submissions** turns the endpoint on and off. A new form is on right away. As long as it has no receivers, it accepts submissions but e-mails nobody.

While the switch is off, the endpoint answers `404` with the message `Unknown form`, exactly as if the form did not exist, and so does the token endpoint of the timed token. Submissions that were already accepted are still delivered. Switch it off while you build a form you do not want reachable yet, or to stop a flood of spam at once.

### Name, slug and sender domain

Change them in the card **General** and click **Save**.

- Changing the **Slug** changes the endpoint URL at once. The website must post to the new URL; the old one answers `404`.
- The **Sender domain** decides which sender addresses the receivers may use. While the form has receivers, mailer refuses to clear it (`The domain cannot be removed while receivers exist`), and it refuses a different domain unless every receiver's sender address already ends in that domain, which in practice means it refuses it.

::: warning Changing the sender domain of a form with receivers
There is no way to move receivers to another domain. To switch domains, remove the receivers, change the domain, and add them again. Removing a receiver deletes its template and all its versions, so copy the template text out of the editor first.
:::

## Allowed domains

**Allowed domains** lists the websites that may post to the form. It sits at the top of the card **Security**.

While the list is empty, the form accepts submissions from any website: the page shows **Any website** next to the form's name and the warning **No allowed domains: any website can embed and submit this form. Add your website's domains to restrict it.** Anybody who knows the URL can then put the form on their own site.

To restrict it:

1. In the card **Security**, click the pencil next to **Allowed domains** (**Edit allowed domains**).
2. In **Allowed domains**, type the host name of each website and press Enter or comma after each one, for example `www.example.org`.
3. Click **Save**.

The rules:

- mailer compares the host name the browser reports in the request's `Origin` header (or, without one, in its `Referer` header) with the list. Requests whose host name is not on the list, and requests that carry neither header, get `403` with the message `Origin not allowed`.
- Matching is exact: `example.org` does not include `www.example.org`. List both if the site answers under both.
- Enter only the host name, without `https://`, path or port. mailer stores it in lower case. Enter international domain names in punycode (`xn--…`).
- Up to 50 entries.
- The **timed token** security check needs at least one allowed domain: it cannot be added to a form without one, and while it is enabled the list cannot be emptied (`Allowed domains cannot be cleared while the timed token is enabled`). With **Google reCAPTCHA**, mailer also checks the host name Google reports against the list.

::: tip What the list protects against
The check stops other websites from using your form in a visitor's browser, because browsers set `Origin` themselves. It does not stop a script that runs outside a browser: such a script can send any `Origin` header it likes. The [security checks](/admin-guide/inbound-forms/security) handle that case.
:::

## Delete a form

1. At the bottom of the form's page, in **Delete form**, click **Delete form…**.
2. Confirm with **Delete form**.

mailer deletes the form with its fields, checks, receivers, templates, stored submissions and the deliveries that are still waiting to be sent. The endpoint answers `404` from then on. The entries the form already left on the project's **Sent mail** page stay. A deleted form cannot be restored; to pause a form instead, switch off **Accept submissions**.

Deleting a project moves its forms to **Recently deleted** together with the project; see [Delete and restore a project](/admin-guide/projects#delete-and-restore-a-project).
