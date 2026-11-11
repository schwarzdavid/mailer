# Projects

This page explains projects: how you create one, give it sender domains, members and API keys, read the mail it sent, and delete or restore it. After reading it you can set up a project for a website and decide who may work on it.

A **project** groups everything that belongs to one website: its inbound forms (the public endpoints a website's contact form posts to), the sender domains its mail may come from, the people who work on it, its API keys and the list of mail it sent. Every form and every API key belongs to exactly one project.

## The projects list

Open **Projects** in the navigation.

![The Projects page listing the project Acme Website with its counts of forms, sender domains and members](/screenshots/admin-guide/projects-list.png)

_The projects list. Each row shows how many forms, sender domains and members the project has._

The list shows the projects you may open (see [Who can open a project](#who-can-open-a-project)). A project with at least one sender domain whose DNS records are not all valid carries the badge **Domain invalid**. Below the list, **Recently deleted** shows deleted projects you may restore (see [Delete and restore a project](#delete-and-restore-a-project)).

A user who may open no project sees **You're not in any project yet** and asks an administrator to add them as a member.

## Create a project

You need the global permission **Create projects**.

1. On **Projects**, click **New project**.
2. In the dialog **New project**, enter a **Name**, for example `Acme Website`. It must be unique and at most 255 characters long.
3. Click **Create project**.

mailer opens the new project's page. If the name is already taken, the dialog shows `Name is already in use`; a project in **Recently deleted** still holds its name until it is purged.

If you cannot already open every project (you are neither a Super Admin nor hold **Access all projects**), mailer makes you a member of the new project with the project role that holds all six project permissions, **Owner** on a standard installation. That way the person who creates a project can always manage it.

## The project page

![The project page of Acme Website with the cards Inbound forms, Sender domains, Members and API keys and the Sent mail button](/screenshots/admin-guide/project-detail.png)

_The page of the project Acme Website. The button **Sent mail** in the top right opens the list of mail it sent._

The page shows, from top to bottom:

| Card               | What it holds                                                                                                                                                                   | Needed to change it                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| **Inbound forms**  | The project's forms, with their receiver count and status. **New form** creates one; the [Inbound forms](/admin-guide/inbound-forms/create) pages of this guide describe forms. | **Manage forms**                        |
| **Sender domains** | The domains the project's forms and API keys may send from. Hidden from users without **View domains**.                                                                         | **Update project** and **View domains** |
| **Members**        | Who works on the project and with which project role.                                                                                                                           | **Manage members** or **Update users**  |
| **API keys**       | Keys that let your own applications send mail through the project.                                                                                                              | **Manage API keys**                     |
| **General**        | The **Project name**. Change it and click **Save**.                                                                                                                             | **Update project**                      |
| **Delete project** | Moves the project to **Recently deleted**.                                                                                                                                      | **Delete project**                      |

The **Members** card is hidden entirely unless you hold **Manage members** on the project or the global **Update users**; **Sender domains** is hidden without **View domains**, and **Delete project** without **Delete project**. The other cards are shown without their buttons, and **General** read-only, when you may not change them. If you may only view the project, its name carries the tag **Read only** and the page explains **You can view this project**.

## Assign sender domains

A form or API key may only send from a domain assigned to its project, and only with a `From` address whose domain is exactly that domain name. Add the domain first on [Domains](/admin-guide/domains).

1. On the project's page, in **Sender domains**, click **Assign domain**.
2. In the dialog **Assign sender domain**, choose the **Sender domain**. Domains whose DNS records are not all valid are marked **Invalid**.
3. Click **Assign domain**.

You need **Update project** on this project and the global **View domains**. One domain can be assigned to several projects.

The dialog warns that **Unverified domains can be assigned, but forms can't send from them until their DNS records are valid.** The backend enforces this: the send API refuses such a domain and form deliveries wait until its records are valid. Wait until the domain shows **Valid** before you point a website at it. [Domains](/admin-guide/domains#sending-needs-valid-records) explains this.

To remove a domain from the project, click the unlink icon (**Unassign mail.example.net**) in its row. The row disappears at once and a message offers **Undo** for 8 seconds; only after that is the change saved. While a form of this project still sends from the domain, the backend refuses with `The domain is used by 1 forms in this project`, the row comes back and the admin UI shows **Couldn't unassign mail.example.net**; move those forms to another domain first.

## Members and project roles

A **member** is a user who was given access to one project. Each member has exactly one **project role** in that project, plus optional extra permissions for that project only.

### Who can open a project

A user can open a project in one of three ways:

- They are a **Super Admin**.
- They hold the global permission **Access all projects**, through their global role or as an extra permission. It grants all six project permissions in every project.
- They are a **member** of the project.

The **Members** card lists only the members. A note below it names the others, for example **Also open to 1 Super admin, without membership.** [Users and roles](/admin-guide/users-and-roles) explains global and project access in full.

### The six project permissions

| Permission in the UI | Key               | What it allows in this project                                                                                                           |
| -------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **View**             | `read`            | Open the project, see its forms, sender domains and API keys (never the key itself), read its sent mail. Every project role includes it. |
| **Update project**   | `update`          | Rename the project, assign and unassign sender domains.                                                                                  |
| **Delete project**   | `delete`          | Delete the project and restore it from **Recently deleted**.                                                                             |
| **Manage forms**     | `forms.manage`    | Create, change and delete forms, their fields, security checks, receivers and templates.                                                 |
| **Manage API keys**  | `api_keys.manage` | Create and revoke API keys.                                                                                                              |
| **Manage members**   | `members.manage`  | Add, change and remove members of this project.                                                                                          |

### The project roles

A standard installation has four project roles. They are ordinary roles: users with the role permissions can change them or add their own under **Roles** (see [Users and roles](/admin-guide/users-and-roles#custom-roles)).

| Role           | Permissions                                                                             | Meant for                                                          |
| -------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **Viewer**     | **View**                                                                                | Sees the project, its forms and sent mail.                         |
| **Editor**     | **View**, **Manage forms**                                                              | Builds forms and templates.                                        |
| **Maintainer** | **View**, **Update project**, **Manage forms**, **Manage API keys**, **Manage members** | Runs the project day to day: forms, API keys, members and domains. |
| **Owner**      | All six                                                                                 | Everything, including deleting the project.                        |

### Add a member

You need **Manage members** on this project or the global **Update users**, and **View users** to pick a user.

1. On the project's page, in **Members**, click **Add member**.
2. Choose the **User**. The list leaves out you, Super Admins and users with **Access all projects**, because they can open the project anyway.
3. Choose the **Project role**. The description of the selected role appears below the field.
4. Optional: open **Advanced: additional permissions** and tick permissions the member gets on top of the role, in this project only. Permissions that come with the role are already ticked and marked **From role: _role_**.
5. Click **Add member**.

You can only hand out what you hold yourself in this project: the role list offers only roles whose permissions you all hold, and extra permissions you do not hold cannot be ticked. If you hold no role in full, the dialog says **You can't assign a role here**.

To change a member's access, click the pencil icon (**Edit access of _name_**), change role or extra permissions and click **Save**. To remove a member, click the delete icon (**Remove _name_**); as with domains, **Undo** is offered for 8 seconds. A removed member loses access to the project immediately.

## API keys

API keys let your own applications send mail through mailer's send API, from the project's sender domains. The [send API](/admin-guide/send-api) page of this guide covers the request itself.

### Create an API key

You need **Manage API keys** on this project.

1. On the project's page, in **API keys**, click **New API key**.
2. Enter a **Name** for the key, at most 100 characters. Name it after the application that will use it, for example `Website`.
3. Click **Create key**.

The dialog **Copy your API key** shows the key, which starts with `sdm_`, for example `sdm_xxxxxxxx_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`. Copy it with the copy button and store it where your application reads its secrets, then click **Done**.

::: warning The key is shown only once
mailer stores only a hash of the key, so neither the admin UI nor the database can show it again. If you lose it, create a new key and revoke the old one.
:::

Each key in the list shows its name, its first characters (**Key sdm_xxxxxxxx…**), and when it was last used (**Last used** …, updated at most once a minute) or **Never used**.

### Revoke an API key

Click the revoke icon (**Revoke _name_**) in the key's row and confirm with **Revoke key**. Applications using the key stop sending immediately; a revoked key cannot be reactivated. It stays in the list marked **Revoked**.

## Sent mail

Click **Sent mail** in the top right of the project's page. Everybody who can open the project can read it.

![The Sent mail page of Acme Website with a search field, filters for source and status, and one sent message](/screenshots/admin-guide/project-messages.png)

_The **Sent mail** page lists every mail the project sent, from forms and from API keys._

The page lists the newest mail first, with the columns **Recipient**, **Subject**, **Source** (**Form** or **API**), **Status** and **Sent**. Narrow it down with **Search recipient or subject** and the filters **All sources**, **API**, **Forms** and **All statuses**, **Sent**, **Failed**, **Blocked**.

| Status      | Meaning                                                                                                                                                |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Sent**    | mailer's mail server accepted the mail for delivery.                                                                                                   |
| **Failed**  | The mail could not be handed over, for example because the mail server rejected it. The error is shown below the subject.                              |
| **Blocked** | mailer did not send it because the recipient is blocked after earlier bounces. The [Bounces](/admin-guide/bounces) page of this guide explains blocks. |
| **Sending** | The mail is being handed over right now.                                                                                                               |

**Sent** means accepted by your own mail server, not delivered to the inbox. If the recipient's server rejects the mail later, the rejection arrives as a bounce report and shows on **Bounces**, not here.

## Delete and restore a project

You need **Delete project** on the project.

1. On the project's page, in **Delete project**, click **Delete project…**.
2. Confirm with **Delete project**.

The project and its forms move to **Recently deleted** at the bottom of the projects list. While a project is there, its forms no longer accept submissions and its API keys are rejected, exactly as if they did not exist. Its sender domains are not affected.

To undo the deletion, click **Restore** next to the project in **Recently deleted**. Forms and API keys work again immediately.

Each entry shows when it will be purged (**Purged on** _date_), 30 days after it was deleted. A background job runs every hour and permanently deletes every project deleted 30 or more days ago, together with its forms (fields, security checks, receivers, templates and submissions), its API keys, its members and its domain assignments. The domains themselves are kept, and so are the records of the mail the project sent, but they no longer belong to a project and the admin UI does not show them any more. A purged project cannot be restored.

::: tip Restore needs Delete project
**Recently deleted** lists only projects on which you hold **Delete project**, and restoring needs the same permission. Viewers and editors of a deleted project do not see it there.
:::
