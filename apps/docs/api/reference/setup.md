---
aside: false
outline: false
---

# Setup

The first-run endpoints that register the first user and finish onboarding. `GET /api/setup/status` and `POST /api/setup/user` need no authentication (the user endpoint needs the one-time setup token from the backend log); `POST /api/setup/finish` needs a JWT from `POST /api/auth/login`.

<OASpec :tags="['setup']" hide-info hide-servers hide-paths-summary hide-branding />
