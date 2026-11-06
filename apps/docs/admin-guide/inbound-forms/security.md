# Security checks

This page explains the checks that keep bots and abuse away from a public form: the honeypot, Google reCAPTCHA, the timed token, allowed domains and the rate limits, what each one stops and what it does not. After reading it you can pick the right combination for a website and configure it.

A public form endpoint needs no login, so anybody can post to it, including bots that fill in every form they find. mailer offers three **security checks** you can add to a form, at most one of each type, plus two protections every form has: the list of allowed domains and the rate limits.

![The Security card of the form Contact form: the allowed domain www.example.org, a Honeypot check in the body with the key website, and a Timed token check in the body with the key formToken, a minimum delay of 3 s and a lifetime of 3,600 s](/screenshots/admin-guide/form-security.png)

_The card **Security** with one allowed domain, a honeypot and a timed token._

## Choose the checks

| Protection                            | Stops                                                                                             | Does not stop                                                                          | Needs on the website                      |
| ------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------- |
| [Allowed domains](#allowed-domains)   | Other websites embedding your form in their visitors' browsers                                    | Scripts outside a browser, which can send any `Origin` header                          | Nothing                                   |
| [Honeypot](#honeypot)                 | Simple bots that fill in every input of a page                                                    | Bots written for your form, and people                                                 | One hidden input                          |
| [Timed token](#timed-token)           | Bots that post without loading the page, posting faster than a person, replaying the same request | Bots that run a real browser and wait; a single visitor sending a few messages by hand | `client.js` and a few lines of JavaScript |
| [Google reCAPTCHA](#google-recaptcha) | Most automated traffic, scored by Google                                                          | Determined attackers using solving services; it also sends visitor data to Google      | Google's script and a Google account      |
| [Rate limits](#rate-limits)           | One address sending many submissions                                                              | Many addresses sending a few each                                                      | Nothing                                   |

A good default for a contact form is **allowed domains, a honeypot and the timed token**: together they stop most bot traffic without anything the visitor notices and without a third party. Add reCAPTCHA if spam still gets through.

## Add, change or remove a check

You need **Manage forms** on the form's project.

1. On the form's page, in the card **Security**, click **Add check**.
2. Choose the **Type** and fill in its settings, described in the sections below.
3. Click **Add check**.

Each check in the list has three buttons:

- the info button (**How to integrate _type_**) opens a dialog with the code the website needs for this check, filled in with the form's URL and key;
- the pencil (**Edit _type_**) changes the settings; the type itself is fixed (**The type can't change. Remove the check and add a new one instead.**);
- the bin (**Remove _type_**) removes the check.

Every check has a **Key**: the name under which the website sends the check's value. With the **Location** you choose where in the request mailer looks for it:

| Location            | Where the website puts the value                           | Example with the key `formToken`                                          |
| ------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------- |
| **Body**            | In the `security` object of the submission, next to `data` | `{ "data": { … }, "security": { "formToken": "…" } }`                     |
| **Header**          | In an HTTP header with that name (case does not matter)    | `formToken: …`                                                            |
| **Query parameter** | In the query string of the endpoint URL                    | `https://app.example.com/api/v1/forms/Xk3_a-9QpLm2Zr7Tb1Wv0c?formToken=…` |

Security values never go into `data`: mailer looks for them only in the place you chose. **Body** is the simplest choice and the only one a plain HTML form can use.

mailer runs the checks in a fixed order: allowed domains, honeypot, timed token, reCAPTCHA, then the field rules. The first one that fails decides the answer.

## Allowed domains

The list at the top of the card **Security** restricts which websites may post to the form. [Create a form](/admin-guide/inbound-forms/create#allowed-domains) explains how to edit it and how the matching works. A request from a website that is not on the list gets:

```json
{ "message": "Origin not allowed", "error": "Forbidden", "statusCode": 403 }
```

The list is a requirement for the timed token and is used by reCAPTCHA as well.

## Honeypot

A **honeypot** is an input that people never see and therefore leave empty, while bots that fill in every input of a page put something in it. A submission with a value in the honeypot is treated as spam.

Settings:

| Setting  | Required | What to enter                                                                                                                            |
| -------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Type** | Required | **Honeypot**                                                                                                                             |
| **Key**  | Required | The input's name, for example `website`. Pick a name that sounds like a real field, so bots fill it in, but do not define it as a field. |

A honeypot always uses the location **Body**; the dialog does not offer a choice.

On the website, add the input and hide it with CSS, not with `type="hidden"`, which bots skip:

```html
<input name="website" tabindex="-1" autocomplete="off" style="position: absolute; left: -9999px" />
```

and send its value in the `security` object (`security: { website: "" }`), as the examples on [Embed the form](/admin-guide/inbound-forms/embed) do.

What happens when it is filled in: mailer answers `200` with `{ "status": "accepted" }` like for a real submission, so the bot learns nothing, stores the submission marked as spam, sends no e-mail and logs the warning `Honeypot "website" triggered for form <id>`. An empty value or a missing key passes.

## Timed token

The **timed token** makes the website ask mailer for a token before it submits. The token:

- becomes valid only after a minimum delay, so a bot that posts the moment the page loads is rejected;
- expires after its lifetime;
- works only once, so a recorded request cannot be replayed;
- is bound to the form and to the visitor's IP address, so a token fetched elsewhere is useless.

It needs at least one [allowed domain](#allowed-domains): until the form has one, the type is greyed out with **Add allowed domains first to use the timed token.**

Settings:

| Setting                      | Required                 | What to enter                                                                                                     |
| ---------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| **Type**                     | Required                 | **Timed token**                                                                                                   |
| **Location**                 | Required                 | Where the website sends the token. Preset to **Body**.                                                            |
| **Key**                      | Required                 | The name the token is sent under. Preset to `formToken`.                                                          |
| **Minimum delay (seconds)**  | Optional (preset `3`)    | `minDelaySeconds`: how long after it was issued the token becomes valid. 1 to 60, default `3`.                    |
| **Token lifetime (seconds)** | Optional (preset `3600`) | `maxAgeSeconds`: how long after it was issued the token stops being valid. 60 to 86400 (one day), default `3600`. |

### How the website gets a token

The website requests a token from the token endpoint, a `POST` without a body:

```text
https://app.example.com/api/v1/forms/<form-key>/token
```

It answers:

```json
{
    "token": "eyJmIjoxLCJuIjoi…",
    "notBefore": "2026-10-23T10:00:03.000Z",
    "expiresAt": "2026-10-23T11:00:00.000Z",
    "waitMs": 3000
}
```

- `token` is the value to send with the submission under the check's key.
- `notBefore` and `expiresAt` are the times from which and until which it is accepted.
- `waitMs` is how many milliseconds the website still has to wait until `notBefore`.

You do not have to handle this yourself. mailer serves a small script, `https://app.example.com/api/v1/forms/client.js`, that provides `InboundForm.getToken('<form-key>')`: it requests the token, waits `waitMs`, and then returns the token. Load the script with a normal `<script src="…">` tag (not `type="module"`), because it finds the endpoint through its own URL. [Embed the form](/admin-guide/inbound-forms/embed) shows the complete code.

The token endpoint also checks the allowed domains. It answers `403` `Origin not allowed` when the request comes from another website, and `404` `Unknown form` when the form does not exist, does not accept submissions or has no timed token.

### What the visitor notices

Nothing, as long as the website asks for the token while the visitor fills in the form, as the examples on [Embed the form](/admin-guide/inbound-forms/embed) do: the minimum delay has passed long before they click send. If the website asks only when the visitor clicks send, sending takes about as long as the minimum delay, 3 seconds by default.

Fetch a fresh token for every submission. A token that was used, expired, or fetched from a different IP address is rejected.

### Errors

All of them answer `403`:

| `message`                          | Cause                                                                                                                            |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `Missing form token`               | The submission carries no token under the key and location.                                                                      |
| `Invalid form token`               | The token is damaged, belongs to another form, or was issued to another IP address, for example after a phone switched networks. |
| `Form token not yet valid`         | Sent before the minimum delay was over.                                                                                          |
| `Form token expired`               | Sent after the lifetime was over, for example from a page that stayed open for hours.                                            |
| `Form token already used`          | The token was used for an earlier submission.                                                                                    |
| `Form token could not be verified` | Redis is unreachable. mailer stores used tokens in Redis and refuses the submission while it cannot check them.                  |

A submission that fails the field rules with `400` does not use up its token; the visitor can correct the input and send again with the same token.

::: warning The token depends on BACKEND_ENCRYPTION_SECRET
Tokens are signed with a key derived from `BACKEND_ENCRYPTION_SECRET`. After that secret changes, tokens issued before are rejected as `Invalid form token`; visitors only need to reload the page.
:::

## Google reCAPTCHA

With **Google reCAPTCHA**, the website asks Google for a token that rates the visitor, and mailer has Google verify the token before it accepts the submission. mailer supports reCAPTCHA v3, which scores every visitor between 0.0 (likely a bot) and 1.0 (likely a person) without a puzzle, and v2, the checkbox.

### Register the website with Google

1. Open the reCAPTCHA admin console at `https://www.google.com/recaptcha/admin` and sign in with a Google account.
2. Create a new site: enter a label, choose the type, score-based v3 or the v2 checkbox, and add the website's domain, for example `www.example.org`. It should match the form's allowed domains.
3. Google shows two keys. The **site key** is public and goes into the website's HTML. The **secret key** goes into mailer and nowhere else.

For additional reading, see [Google's reCAPTCHA documentation](https://developers.google.com/recaptcha).

### Settings

| Setting                | Required | What to enter                                                                                                                                                                            |
| ---------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Type**               | Required | **Google reCAPTCHA**                                                                                                                                                                     |
| **Location**           | Required | Where the website sends Google's token. **Body** is preset.                                                                                                                              |
| **Key**                | Required | The name the token is sent under, for example `recaptchaToken`.                                                                                                                          |
| **Secret key**         | Required | The secret key from Google. When you edit an existing check, leave it empty to keep the stored one (**Leave empty to keep the current secret.**).                                        |
| **Minimum score (v3)** | Optional | `minScore`, 0.0 to 1.0. Submissions with a lower score are rejected. Leave it empty for v2, which has no score; with a minimum set, a missing score counts as 0.                         |
| **Expected action**    | Optional | `expectedAction`, at most 100 characters. With v3, the website names an action when it requests the token, for example `submit`; mailer then rejects tokens issued for any other action. |

The site key is not entered in mailer: it only appears in the website's code.

**Where the secret is stored:** mailer encrypts the secret key with `BACKEND_ENCRYPTION_SECRET` before it writes it to the database, and never sends it back to the admin UI, which only learns that a secret exists. If `BACKEND_ENCRYPTION_SECRET` changes, the stored secret can no longer be decrypted: submissions fail with `Captcha is not configured` and the backend logs `Stored reCAPTCHA secret of form <id> could not be decrypted; check BACKEND_ENCRYPTION_SECRET`. Enter the secret key again in the check to fix it.

### What mailer checks

For each submission, mailer sends the token and the secret key to Google and waits up to 5 seconds for the answer. Then it requires, in this order:

1. that Google confirms the token;
2. when the form has allowed domains, that the host name Google reports for the token is one of them;
3. when **Expected action** is set, that the token was issued for that action;
4. when **Minimum score (v3)** is set, that the score is at least that.

Every failure answers `403`:

| `message`                          | Cause                                                                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `Missing captcha token`            | The submission carries no token under the key and location.                                                                     |
| `Captcha is not configured`        | No secret is stored, or it cannot be decrypted (see above).                                                                     |
| `Captcha verification unavailable` | Google did not answer within 5 seconds or answered with an error. mailer rejects the submission rather than letting it through. |
| `Captcha verification failed`      | Google rejected the token: wrong secret key, expired or reused token, or a token for another site.                              |
| `Captcha hostname mismatch`        | The token was issued on a website that is not in the allowed domains.                                                           |
| `Captcha action mismatch`          | The token was issued for another action than **Expected action**.                                                               |
| `Captcha score too low`            | The score is below **Minimum score (v3)**.                                                                                      |

Google says a reCAPTCHA token expires after two minutes, so request it when the visitor clicks send, not when the page loads. The info dialog of the check shows the code; [Embed the form](/admin-guide/inbound-forms/embed) has a complete example with the timed token, which follows the same pattern.

## Rate limits

Every form endpoint is rate limited, whatever checks the form has: by default 5 submissions per 10 minutes per form and visitor IP address, a separate 5 token requests per 10 minutes, and a general limit of 10 requests per minute per IP address. Requests over the limit get `429`. The numbers, how to change them with `FORM_SUBMIT_RATE_LIMIT`, `FORM_SUBMIT_RATE_TTL`, `FORM_TOKEN_RATE_LIMIT` and `FORM_TOKEN_RATE_TTL`, and what happens while Redis is down are on [Rate limits](/configuration/rate-limits).

The limits apply to all forms of the installation alike; a single form cannot have its own limit yet. If one website needs more, for example because its visitors share an office network, raise the values for the whole installation.

Rate limits are not counted correctly when the backend sees the proxy's address instead of the visitor's. Check `TRUST_PROXY` as described on [Reverse proxy](/configuration/reverse-proxy) when many visitors get `429` at once.
