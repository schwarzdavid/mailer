# Users and roles

This page explains who can do what in the admin UI: user accounts, global roles and project roles, every permission and its effect, and the rules for handing out access. After reading it you can create accounts for your team and give each person exactly the access they need.

## How access works

Access is granted in two places, and the two add up:

1. **On the user, under Users.** Every user has exactly one **global role**, plus optional **extra permissions**. Both apply everywhere: to the Domains, Bounces, Users, Roles and Settings pages, and, through **Access all projects**, to every project.
2. **On a project, under Projects.** A user who is a **member** of a project has exactly one **project role** there, plus optional extra permissions for that project only. They apply to that one project.

A user's access is the sum of everything granted to them in both places; nothing granted anywhere takes access away. A user can open a project when they are a Super Admin, hold **Access all projects**, or are a member of it.

The user's page says the same in its box **How access works**: _Permissions add up: the role and these permissions apply everywhere; a project membership adds a project role and extras for that one project. Super admins and users with “Access all projects” reach every project without membership._

Changes to roles, permissions and memberships apply to the next request the user makes; nobody has to log in again.

## Global roles

![The Roles page with the sections Global roles and Project roles, listing Super Admin, Admin, User, Support and the four project roles](/screenshots/admin-guide/roles-list.png)

_**Roles** under **Administration** lists the global roles and the project roles, with how many permissions each has and how many users or members hold it._

A standard installation has three global roles; you can add your own (see [Custom roles](#custom-roles)).

| Role            | Permissions                         | Notes                                                                                                                                                                                                  |
| --------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Super Admin** | Every permission, without exception | The role of the account created in the first-run setup. It cannot be changed or deleted and carries the tag **System**. Only Super Admins can give it to someone, change or delete a Super Admin user. |
| **Admin**       | All 19 global permissions           | Can do everything except change or delete Super Admin users and hand out the Super Admin role. Its permissions can be changed like those of any other role.                                            |
| **User**        | None                                | For people who work only in the projects they are members of. Add global permissions per user or through project memberships.                                                                          |

### Global permissions

The permission grid on a user's or role's page groups the global permissions as follows.

| Group        | Permission in the UI    | Key               | What it allows                                                                                                                                                                                                                           |
| ------------ | ----------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Domains**  | **View domains**        | `domains.read`    | Open **Domains** and each domain's page. Also needed to see a project's **Sender domains** card and to assign domains to a project.                                                                                                      |
|              | **Create domains**      | `domains.create`  | Add sender domains with **New domain**.                                                                                                                                                                                                  |
|              | **Update domains**      | `domains.update`  | Look a domain's DNS records up right away with **Check again**.                                                                                                                                                                          |
|              | **Delete domains**      | `domains.delete`  | Delete sender domains that no project uses.                                                                                                                                                                                              |
| **Projects** | **Create projects**     | `projects.create` | Create projects with **New project**. The creator becomes the project's Owner unless they can open every project anyway. Also shows the **Get started** card on the dashboard.                                                           |
|              | **Access all projects** | `projects.all`    | All six project permissions in every project, without being a member.                                                                                                                                                                    |
| **Bounces**  | **View bounces**        | `bounces.read`    | Open **Bounces** and the list of blocked addresses; see the bounce figures on the dashboard.                                                                                                                                             |
|              | **Unblock addresses**   | `bounces.unblock` | Lift a block so mail to the address is sent again.                                                                                                                                                                                       |
| **Settings** | **View settings**       | `settings.read`   | Open **Settings**; see the DNS health alert in the navigation and the sending domain on the dashboard.                                                                                                                                   |
|              | **Update settings**     | `settings.update` | Change the server's IP addresses, run **Check again** on the sending domain's records (**Check now** on the dashboard) and finish the first-run setup.                                                                                   |
| **Users**    | **View users**          | `users.read`      | Open **Users** and each user's page. Also needed to pick a user when adding a project member.                                                                                                                                            |
|              | **Create users**        | `users.create`    | Create user accounts with **New user**.                                                                                                                                                                                                  |
|              | **Update users**        | `users.update`    | Change users' name, email address, password, global role and extra permissions, including their own profile except their role. Also lets the holder manage the members of every project they can open, without **Manage members** there. |
|              | **Delete users**        | `users.delete`    | Delete user accounts.                                                                                                                                                                                                                    |
| **Roles**    | **View roles**          | `roles.read`      | Open **Roles** and each role's page.                                                                                                                                                                                                     |
|              | **Create roles**        | `roles.create`    | Create global and project roles with **New role**.                                                                                                                                                                                       |
|              | **Update roles**        | `roles.update`    | Rename roles and change their description and permissions.                                                                                                                                                                               |
|              | **Delete roles**        | `roles.delete`    | Delete roles nobody holds.                                                                                                                                                                                                               |

## Project roles

A member's project role decides what they may do in that one project. A standard installation has four project roles; you can change them and add your own (see [Custom roles](#custom-roles)).

| Role           | Permissions                                                                             | Description in the UI                                              |
| -------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **Viewer**     | **View**                                                                                | Sees the project, its forms and sent mail.                         |
| **Editor**     | **View**, **Manage forms**                                                              | Builds forms and templates.                                        |
| **Maintainer** | **View**, **Update project**, **Manage forms**, **Manage API keys**, **Manage members** | Runs the project day to day: forms, API keys, members and domains. |
| **Owner**      | All six                                                                                 | Everything, including deleting the project.                        |

### Project permissions

| Group                | Permission in the UI | Key               | What it allows in the project                                                                                                                    |
| -------------------- | -------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Project**          | **View**             | `read`            | Open the project, see its forms, sender domains and API keys (never the key itself), read its **Sent mail**. Every project role must include it. |
|                      | **Update project**   | `update`          | Rename the project; assign and unassign sender domains (together with the global **View domains**).                                              |
|                      | **Delete project**   | `delete`          | Delete the project and restore it from **Recently deleted**.                                                                                     |
| **Forms & API keys** | **Manage forms**     | `forms.manage`    | Create, change and delete forms, their fields, security checks, receivers and templates.                                                         |
|                      | **Manage API keys**  | `api_keys.manage` | Create and revoke API keys.                                                                                                                      |
| **Members**          | **Manage members**   | `members.manage`  | Add, change and remove members of the project.                                                                                                   |

Members are managed on the project's page; [Projects](/admin-guide/projects#members-and-project-roles) walks through it.

## The users list

![The Users page listing Ada Admin with the role Super Admin and Max Member with the role User](/screenshots/admin-guide/users-list.png)

_**Users** lists every account with its global role and the number of projects it is a member of._

Open **Users** under **Administration**. The columns are **Name** (with the email address, and the tag **You** on your own row), **Role**, **Projects** (the number of memberships; **All** for Super Admins) and **Actions**, whose menu offers **Edit user** and, with **Delete users**, **Delete user…** for the users you may change; your own row has no menu.

### Create a user

You need **Create users**.

1. Click **New user**.
2. Fill in **First name**, **Last name**, **Email address** and **Password**. The password needs at least 8 characters. The email address must not belong to another user (`Email is already in use`).
3. Choose the global **Role**. The role's description appears below the field.
4. Optional: open **Advanced: additional permissions** and tick global permissions the user gets on top of the role.
5. Click **Create user**.

mailer sends the new user no mail. Give them the address of the admin UI, their email address and the password through a secure channel. There is no way for users to reset a forgotten password themselves; a user with **Update users** sets a new one on their page.

## The user page

![The page of the user Max Member with the cards Profile and Permissions, showing the role User and the permission grid with nothing ticked](/screenshots/admin-guide/user-detail.png)

_A user's page: the profile with the global role, then the extra permissions and the project memberships._

Click a user's name to open their page:

- **Profile**: **First name**, **Last name**, **Email address**, **New password (optional)** (leave it empty to keep the current password) and **Role**. Click **Save**. You cannot change your own role (**You can't change your own role.**).
- **Permissions**: the extra global permissions, granted in addition to the role, in every project. Permissions that come with the role are ticked and marked **From role: _role_**. Tick or untick the others and click **Save**.
- **Project memberships**: every project the user is a member of, with the project role and extra permissions. Change them on the project's **Members** card.
- **Delete user**: click **Delete user…** and confirm with **Delete user**. The user loses access immediately and is removed from all projects. This cannot be undone.

For a Super Admin the page shows **Super admins have every permission** instead of the permissions and memberships, because they do not apply.

Rules the backend enforces:

- Only a Super Admin can give someone the Super Admin role, or change or delete a Super Admin user.
- The last Super Admin can neither be deleted nor moved to another role: `The last super admin cannot be removed`.
- You cannot delete your own account.

## Direct extra permissions

Extra permissions let you give one person a little more than their role without creating a new role for them:

- **On the user** (**Permissions** card or **Advanced: additional permissions** in **New user**): global permissions that apply everywhere. Example: a **User** who should also see bounces gets **View bounces**.
- **On a membership** (**Advanced: additional permissions** in the project's member dialog): project permissions for that one project. Example: an **Editor** who may also create API keys in one project gets **Manage API keys** there.

When several people need the same set, create a role instead; a role is easier to review and to change for everyone at once.

## Custom roles

Roles are managed under **Administration** → **Roles**. The page has two sections: **Global roles** (_Apply everywhere. Every user has exactly one._) and **Project roles** (_Apply inside one project. Every member has exactly one per project._).

### Create a role

You need **Create roles**.

1. On **Roles**, click **New role**.
2. Enter a **Name**. It must be unique among the roles of its scope.
3. Choose the **Scope**: **Global** roles are assigned to users, **Project** roles to project members.
4. Optional: enter a **Description (optional)**; it appears wherever the role is chosen.
5. Optional: under **Start from (optional)**, choose an existing role of the same scope to copy its permissions. The list offers only roles whose permissions you all hold, and never Super Admin.
6. Click **Create role**.

mailer opens the role's page. Under **Permissions**, tick what everyone holding the role gets and click **Save**. A project role always includes **View**: **Every project role includes viewing.**

![The page of the custom global role Support with its description and the permission View bounces ticked](/screenshots/admin-guide/role-detail.png)

_The custom global role **Support**: it lets its holders read bounces to answer delivery questions, and nothing else._

### Change or delete a role

On a role's page, **Profile** holds the **Name** and **Description**, **Permissions** the permission grid; each card has its own **Save**. The header shows how many users or members hold the role, with **Manage in Users** for global roles.

To delete a role, click **Delete role…** in **Delete role** and confirm with **Delete role**. A role that is still assigned cannot be deleted (**Support is still assigned. Move everyone to another role first.**). The **Super Admin** role can be neither changed nor deleted (**System role with every permission**). The built-in **Admin**, **User**, **Viewer**, **Editor**, **Maintainer** and **Owner** roles can be changed and, once nobody holds them, deleted like custom roles.

## Nobody grants more than they hold

Whoever hands out access can only hand out what they hold themselves. The backend checks this on every change, and the admin UI greys out what you cannot grant (**You don't hold this permission**):

| Where                                | Rule                                                                                                                 | Error when broken                                                                                                                            |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| A user's global role                 | You can assign a role only if you hold all of its global permissions. Only Super Admins assign the Super Admin role. | `You cannot assign a role with permissions you do not hold: …`; for the Super Admin role `Only super admins can assign the super admin role` |
| A user's extra permissions           | You can add or remove only permissions you hold yourself. Permissions you do not hold stay as they are.              | `You cannot grant or revoke permissions you do not hold: …`                                                                                  |
| A role's permissions                 | You can add or remove only permissions you hold yourself; for a project role, ones you hold in every project.        | `You cannot grant or revoke permissions you do not hold: …`                                                                                  |
| A member's project role              | You can assign a project role only if you hold all of its permissions in that project.                               | `You cannot assign a role with permissions you do not hold: …`                                                                               |
| A member's extra project permissions | You can add or remove only permissions you hold in that project.                                                     | `You cannot grant or revoke permissions you do not hold: …`                                                                                  |

The `…` lists the permission keys concerned, for example `roles.delete`. A Super Admin holds everything and is never stopped by these rules.
