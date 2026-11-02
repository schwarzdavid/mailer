# API reference

This reference lists every endpoint of the mailer API with its parameters, request bodies and responses. It is generated from the OpenAPI document that the backend builds from its own controllers, so it matches the release the docs are built from.

## How to read it

All paths are relative to the base URL `https://app.example.com/api`. A path shown as `/project/{projectId}` is `https://app.example.com/api/project/{projectId}` with the placeholder replaced by an id. Each operation shows its method, parameters, request body schema and response schemas, and is named after the controller method that handles it.

Endpoints are grouped by tag, one page per tag. Each page starts with who calls its endpoints and how they authenticate. There are three authentication modes:

- **No authentication.** The [public form endpoints](./public-form) and the first-run endpoints `GET /api/setup/status` and `POST /api/setup/user` (the latter needs the one-time setup token from the backend log).
- **API key.** The [public send API](./public-send): `Authorization: Bearer sdm_…`, or the `key` query parameter as a fallback.
- **JWT.** Everything else: log in with `POST /api/auth/login`, then send `Authorization: Bearer <JWT>`. This is what the admin UI does.

For limits, rate limiting and CORS read the [overview](../overview); for response codes read [Errors](../errors).

## Pages

| Page                                   | Authentication                     |
| -------------------------------------- | ---------------------------------- |
| [Setup](./setup)                       | None, except finishing setup (JWT) |
| [Authentication](./auth)               | None for login, JWT for the others |
| [Projects](./project)                  | JWT                                |
| [Domains](./domain)                    | JWT                                |
| [Inbound forms](./inbound-form)        | JWT                                |
| [Public form endpoints](./public-form) | None                               |
| [Public send API](./public-send)       | API key                            |
| [API keys](./api-key)                  | JWT                                |
| [Sent mail](./mail-message)            | JWT                                |
| [Bounces](./bounce)                    | JWT                                |
| [Users](./user)                        | JWT                                |
| [Roles](./role)                        | JWT                                |
| [Settings](./settings)                 | JWT                                |
