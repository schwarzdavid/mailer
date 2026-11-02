---
aside: false
outline: false
---

# Authentication

The admin UI calls these endpoints to log in and to read the current user. `POST /api/auth/login` takes e-mail and password and returns a JWT; `GET /api/auth/user` and the others need that JWT as `Authorization: Bearer <JWT>`.

<OASpec :tags="['auth']" hide-info hide-servers hide-paths-summary hide-branding />
