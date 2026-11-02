# Errors

This page lists every error shape the API returns and what to do about each, so your code can tell a mistake it must fix from a failure it should retry.

## Two shapes

Every error response is JSON with `statusCode` and `message`. Most also carry `error`, the status text, but `413` and `429` responses have no `error` field.

Errors raised by the send endpoint's own checks carry one more field, `code`, which is stable and meant for programs to branch on:

```json
{
    "statusCode": 403,
    "error": "Forbidden",
    "message": "The from address must use a domain of this project",
    "code": "FROM_DOMAIN_NOT_ALLOWED"
}
```

All other errors (authentication, validation, rate limit, body size) use the standard shape without `code` (and, for `413` and `429`, without `error`):

```json
{ "statusCode": 401, "message": "Invalid API key", "error": "Unauthorized" }
```

A rate-limited request looks like this:

```json
{ "statusCode": 429, "message": "ThrottlerException: Too Many Requests" }
```

Validation errors (`400`) carry `message` as a list of strings, one per rejected field. Do not parse `message` text; branch on `statusCode` and, where present, `code`.

`RECIPIENT_BLOCKED` and `DELIVERY_FAILED` also include `mailMessageId`, the id of the entry on the project's **Sent mail** page that records the failed attempt.

## Send endpoint codes

These come from `POST /api/v1/send`.

| Status | `code`                    | Meaning                                                                                                                                                                              | What to do                                                                                                                                                                                                                                                                      |
| ------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 403    | `FROM_DOMAIN_NOT_ALLOWED` | The domain of `from` does not belong to the key's project                                                                                                                            | Assign the domain to the project or use another sender. Do not retry as is                                                                                                                                                                                                      |
| 422    | `FROM_DOMAIN_NOT_READY`   | The `from` domain has no active DKIM key (`The from domain has no active DKIM key`), or its DNS records are not all valid (`The from domain has DNS records that are not valid yet`) | The DKIM case does not occur in normal operation: delete the domain and add it again, which creates a new key. For the DNS case, fix the records on the domain's page, click **Check again** and retry; see [Send API](/admin-guide/send-api#what-from-domain-not-ready-checks) |
| 422    | `RECIPIENT_BLOCKED`       | The recipient is blocked after previous bounces                                                                                                                                      | Check the address. Do not retry as is                                                                                                                                                                                                                                           |
| 502    | `DELIVERY_FAILED`         | The mail relay did not accept the mail                                                                                                                                               | Retry later. mailer does not retry a synchronous send for you                                                                                                                                                                                                                   |

## Errors without a `code`

| Status | Meaning                               | Typical cause                                                                                      |
| ------ | ------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 400    | Validation failed                     | A field is missing, has the wrong type or length, or is not in the schema                          |
| 401    | Authentication failed                 | `Missing API key`, `Invalid API key`, `Invalid token` or, on login, `Invalid credentials.`         |
| 413    | Payload too large                     | A JSON body over the limit: about 8 MB on `/api/v1/send`, 100 kB elsewhere                         |
| 429    | Too many requests                     | A rate limit was hit, see [Limits](./overview#limits). Wait for the window to pass before retrying |
| 503    | Rate limiting temporarily unavailable | Only on login and first-user registration, when Redis is down. Retry later                         |

Admin endpoints also answer `403` when the user lacks a permission, `404` when a resource does not exist and `409` when it already exists. Each reference page shows the responses of its operations.

## Which errors to retry

- Retry after a pause: `502`, `503`, `429` and network failures. A `502` means the attempt was recorded but the relay did not accept the mail, so a retry creates another entry on the **Sent mail** page.
- Fix first, then retry: `400`, `401`, `403`, `413`, `422`.

## How you know it worked

Send a request with a wrong key:

```bash
curl -i -X POST https://app.example.com/api/v1/send \
  -H "Authorization: Bearer sdm_wrongkey" \
  -H "Content-Type: application/json" \
  -d '{}'
```

You get `401` with `"message": "Invalid API key"`. With a valid key and a `from` address on a domain that is not assigned to the key's project you get `403` with `"code": "FROM_DOMAIN_NOT_ALLOWED"`.
