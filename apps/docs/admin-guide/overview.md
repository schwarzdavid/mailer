# Admin guide overview

This page is a tour of the admin UI: how you log in, what each entry in the navigation is for, what the dashboard tells you and where the account menu is. After reading it you know where every task of the Admin guide starts.

The admin UI runs at the address of your installation, for example `https://app.example.com`. Its header and browser tab call it **Mail Admin**; that is the name of mailer's admin UI, not a separate product.

## Log in

![The login page with the fields Email address and Password and the Log in button](/screenshots/admin-guide/login.png)

_The login page. Every user logs in with the email address and password an administrator created for them._

Enter your **Email address** and **Password** and click **Log in**.

- If the email address or password is wrong, the page shows **Email or password is wrong. Check both and try again.** and selects the password field.
- A login is valid for 31 days. After that, or after the session ends for another reason, the next page you open leads back to the login page with **Your session expired. Log in again to continue where you left off.** After logging in you land on the page you wanted to open.
- The login allows 10 attempts per minute for one IP address and email address, successful ones included. After that, further attempts are blocked for 5 minutes. If Redis is down, the login refuses every attempt with an error instead of letting them through. [Rate limits](/configuration/rate-limits) has the details.

There is no "forgot password" link, and mailer sends no mail to its own users. A user who forgot the password asks an administrator with the **Update users** permission to set a new one, as described on [Users and roles](/admin-guide/users-and-roles#the-user-page).

## The navigation

The navigation runs down the left side of every page. On a narrow window it shrinks to a column of icons (hover an icon to see its name); on a phone it is hidden behind the menu button in the top left corner.

![The dashboard of a new installation with the navigation on the left: Dashboard, Projects, Domains, Bounces, and under Administration Users, Roles and Settings](/screenshots/admin-guide/dashboard.png)

_The dashboard right after the first-run setup. The dot next to **Settings** is the DNS health alert._

| Entry         | What you do there                                                                                                               | Shown to users with                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| **Dashboard** | See what needs attention and how your installation is doing. Described below.                                                   | Everybody                                                 |
| **Projects**  | Create projects, assign sender domains, manage members and API keys, read the sent mail. See [Projects](/admin-guide/projects). | Everybody; each user sees only the projects they may open |
| **Domains**   | Add the domains your websites send from and publish their DNS records. See [Domains](/admin-guide/domains).                     | **View domains**                                          |
| **Bounces**   | Review addresses that bounced and lift blocks. The [Bounces](/admin-guide/bounces) page of this guide describes it.             | **View bounces**                                          |
| **Users**     | Create user accounts, set their global role and extra permissions. See [Users and roles](/admin-guide/users-and-roles).         | **View users**                                            |
| **Roles**     | Manage the global and project roles. See [Users and roles](/admin-guide/users-and-roles#custom-roles).                          | **View roles**                                            |
| **Settings**  | The server's own mail identity: the sending domain, its IP addresses and DNS records. See [Settings](/admin-guide/settings).    | **View settings**                                         |

**Users**, **Roles** and **Settings** sit under the heading **Administration**. The heading is hidden when you may open none of them.

Entries you have no permission for are hidden. If you open such a page by its address anyway, it shows **You don't have access to this page** with the name of the missing permission, for example **You need the “View settings” permission. Ask a Super admin to grant it.** [Users and roles](/admin-guide/users-and-roles) explains every permission.

### The DNS health alert

A dot next to **Settings** means at least one DNS record of the platform sending domain is not valid. Hover the entry to read how many, for example **Settings · 2 sending-domain records need attention**. On a phone the dot sits on the menu button.

- Only users with **View settings** see the dot.
- The admin UI asks the backend for the record status once a minute. The backend itself looks the records up in DNS every 15 minutes, or immediately when someone clicks **Check again** in **Settings**. A record you just fixed therefore clears the dot within about 15 minutes, or right away after **Check again**.
- Problems with your customers' sender domains do not light the dot; they show on the dashboard and on the **Domains** page.

## The dashboard

The dashboard is the first page after logging in. What it shows depends on your permissions and on how far your installation is.

**Needs attention**, explained below, is always there.

**While your first website is not set up yet** (the screenshot above), users with **Create projects** also see:

- **Get started**, a checklist of four steps: **Add and verify a sender domain**, **Create a project**, **Create a form and add a receiver** and **Publish a template and connect your website**. The current step has a button that takes you there, for example **New domain** or **New project**. A step is ticked off as soon as mailer sees it done, and the card disappears once all four are done.
- **How it fits together**, four sentences on how the sending domain, sender domains, projects and forms relate.

While **Get started** is shown and no project exists yet, the subtitle reads **Setup is done. Four steps to your first delivered submission.**; otherwise it greets you by name.

**A row of figures** appears once a project exists, and also before that whenever **Get started** is not shown, for example for users without **Create projects**. Each figure links to its page: **Projects** (with the number in **Recently deleted**), **Active forms** of all forms, **Sender domains** that are valid of all sender domains, and **Bounces · 7 days** split into permanent and transient. The domain and bounce figures need **View domains** and **View bounces**.

**Once projects exist**, the page also shows:

- **Forms**, every form you can open, grouped by project.
- **Delivery health**: the platform sending domain with how many of its records are valid and when they were last checked, and every sender domain with its status. Users with **Update settings** get a **Check now** button that looks the sending domain's records up right away.
- **Recent bounces**, the latest four bounces, with **View all** to open **Bounces**.

**Needs attention** lists everything that keeps mail from reaching an inbox, each entry linking to the page where you fix it:

| Entry                                      | Meaning                                                                           |
| ------------------------------------------ | --------------------------------------------------------------------------------- |
| **_n_ sending-domain records are invalid** | Records of the platform sending domain are missing or wrong. Opens **Settings**.  |
| **_domain_ can't send yet**                | A sender domain has records that are not valid. Opens the domain's page.          |
| **A receiver has no template**             | An active form receiver has no published template yet. Opens its template editor. |
| **_n_ permanent bounces this week**        | Recipients rejected mail permanently in the last 7 days. Opens **Bounces**.       |

When nothing is wrong it shows **Nothing needs you**.

## The account menu

Your name and global role sit at the bottom of the navigation. Click them to open the account menu. It shows your name and email address, and offers:

- **Theme**: **System** follows your operating system's light or dark setting, **Light** and **Dark** fix it. The choice is stored in this browser only; another browser or device starts with **System**.
- **Log out** ends the session in this browser.

The account menu has no page to change your own name, email address or password. Users with **Update users** change their own profile, except their role, on their page under **Users**; everybody else asks such a user.
