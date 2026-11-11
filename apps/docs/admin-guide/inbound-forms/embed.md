# Embed the form

This page shows three ways to connect a website's contact form to mailer, each as a complete example you can paste: a plain HTML form, a form sent with JavaScript `fetch` and the timed token, and a complete static page. At the end your website submits to `https://app.example.com/api/v1/forms/3f9a0c1e7b2d4a6f8e5c9b0d1a2f4e6c` and you have seen an e-mail arrive.

The examples use the form from the other pages of this guide: form key `3f9a0c1e7b2d4a6f8e5c9b0d1a2f4e6c` (yours is on the form's **Endpoint** card), the fields `name`, `email` and `message`, a honeypot with the key `website` and a timed token with the key `formToken`, both with the location **Body**, and the allowed domain `www.example.org`. Replace these with your form's values; the info button of each check on the form's page (**How to integrate _type_**) shows the exact keys.

## Before you start

- The form exists and **Accept submissions** is on, see [Create a form](/admin-guide/inbound-forms/create).
- Its [fields](/admin-guide/inbound-forms/fields) match the inputs of the website's form.
- It has at least one active receiver with a published template, see [Receivers and templates](/admin-guide/inbound-forms/receivers-and-templates). Without one, submissions are accepted but nobody gets an e-mail.
- The website's host name is in the form's **Allowed domains**, here `www.example.org`.

## What the endpoint accepts

The website sends a `POST` to `https://app.example.com/api/v1/forms/<form-key>` with a body that has up to two parts:

```json
{
    "data": { "name": "Ada", "email": "reader@example.org", "message": "Hello" },
    "security": { "website": "", "formToken": "eyJmIjoxLCJuIjoi…" }
}
```

- `data` (required) holds the field values, under the field keys.
- `security` (optional) holds the values of the security checks with the location **Body**, under their keys.

No other top-level keys are allowed. The body can be JSON (`Content-Type: application/json`) or a URL-encoded HTML form (`application/x-www-form-urlencoded`, the default of `<form method="post">`), in which the two parts are written as `data[name]` and `security[website]`. `multipart/form-data` is not understood, and neither are file uploads. Bodies are limited to 100 kB.

## Example 1: a plain HTML form

A plain HTML form needs no JavaScript at all. It works only for forms whose fields are all **Text** or **Email** and whose only security check is the honeypot: the timed token and reCAPTCHA need JavaScript, and a browser sends every value as a string, which **Number** and **Boolean** fields reject.

```html
<form method="post" action="https://app.example.com/api/v1/forms/3f9a0c1e7b2d4a6f8e5c9b0d1a2f4e6c">
    <label>
        Name
        <input name="data[name]" required minlength="1" />
    </label>
    <label>
        Email
        <input name="data[email]" type="email" required />
    </label>
    <label>
        Message
        <textarea name="data[message]" required maxlength="2000"></textarea>
    </label>
    <input name="security[website]" tabindex="-1" autocomplete="off" style="position: absolute; left: -9999px" />
    <button type="submit">Send</button>
</form>
```

- Name the inputs `data[<field key>]` and the honeypot `security[<key>]`.
- Do not give the button, or any other element, a `name` outside `data[…]` and `security[…]`: mailer rejects unknown keys with `400` (`property submit should not exist`).
- An HTML form sends empty inputs as empty strings. Mark email inputs `required`, because mailer rejects an empty optional email field; see [Fields](/admin-guide/inbound-forms/fields#validation-rules).
- If the website sends the header `Referrer-Policy: no-referrer`, browsers send `Origin: null` with the cross-origin post, and a form with allowed domains answers `403` `Origin not allowed`. Use a policy such as `strict-origin-when-cross-origin`, the browsers' default, on the page with the form.

::: warning The visitor ends up on a JSON page
After sending, the browser shows mailer's raw answer, `{"status":"accepted"}` or an error, on `app.example.com`. mailer cannot redirect back to a thank-you page. Use the plain form only where that is acceptable, for example on an internal site; for a public website, use one of the JavaScript examples below.
:::

## Example 2: fetch with client.js and the timed token

This is a form block for an existing page. It loads mailer's `client.js`, which provides `InboundForm.getToken('<form-key>')`: the function requests a timed token and resolves only once the token's minimum delay has passed. The script asks for the token as soon as the visitor starts filling in the form, so the delay has passed by the time they click send, and sends it in the `security` object together with the empty honeypot.

```html
<form id="contact-form">
    <label>
        Name
        <input name="name" required />
    </label>
    <label>
        Email
        <input name="email" type="email" required />
    </label>
    <label>
        Message
        <textarea name="message" required maxlength="2000"></textarea>
    </label>
    <input name="website" tabindex="-1" autocomplete="off" style="position: absolute; left: -9999px" />
    <button type="submit">Send</button>
    <p id="contact-status" role="status"></p>
</form>

<script src="https://app.example.com/api/v1/forms/client.js"></script>
<script>
    const endpoint = 'https://app.example.com/api/v1/forms/3f9a0c1e7b2d4a6f8e5c9b0d1a2f4e6c'
    const form = document.getElementById('contact-form')
    const status = document.getElementById('contact-status')
    let tokenRequest = null

    function requestToken() {
        if (!tokenRequest) {
            tokenRequest = InboundForm.getToken('3f9a0c1e7b2d4a6f8e5c9b0d1a2f4e6c')
            tokenRequest.catch(() => {
                tokenRequest = null
            })
        }
        return tokenRequest
    }

    form.addEventListener('focusin', requestToken)

    form.addEventListener('submit', async (event) => {
        event.preventDefault()
        status.textContent = 'Sending…'
        try {
            const token = await requestToken()
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    data: {
                        name: form.elements.name.value,
                        email: form.elements.email.value,
                        message: form.elements.message.value,
                    },
                    security: {
                        website: form.elements.website.value,
                        formToken: token,
                    },
                }),
            })
            if (response.status !== 400) {
                tokenRequest = null
            }
            if (!response.ok) {
                throw new Error(`Submit failed with status ${response.status}`)
            }
            status.textContent = 'Thank you, your message was sent.'
            form.reset()
        } catch (error) {
            status.textContent = 'Sending failed. Please try again in a few minutes.'
        }
    })
</script>
```

- Load `client.js` with a normal `<script src="…">` tag, not `type="module"`: it finds the token endpoint through its own URL. The browser may cache it for a day.
- A token works once. The script drops it after every answer except `400`, which leaves the token unused, so the visitor can correct a field and send again without a new one.
- With reCAPTCHA instead of, or in addition to, the timed token, request Google's token in the submit handler with `await grecaptcha.execute('SITE_KEY', { action: 'submit' })` after loading `https://www.google.com/recaptcha/api.js?render=SITE_KEY`, and add it to `security` under the check's key. The info dialog of the reCAPTCHA check shows the exact lines.

## Example 3: a complete static page

A whole page, for example `contact.html` on a static site. It adds to example 2 a status line in colour, a disabled button while sending, and messages for each kind of error. Save it, replace the URLs and keys if yours differ, and open it from `https://www.example.org/contact.html`; opened from disk or from another host it gets `403` because of the allowed domains.

```html
<!doctype html>
<html lang="en">
    <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Contact</title>
        <style>
            body {
                font-family: system-ui, sans-serif;
                max-width: 36rem;
                margin: 2rem auto;
                padding: 0 1rem;
            }
            label {
                display: block;
                margin-bottom: 1rem;
            }
            input,
            textarea {
                display: block;
                width: 100%;
                box-sizing: border-box;
                padding: 0.5rem;
                font: inherit;
            }
            textarea {
                min-height: 8rem;
            }
            .trap {
                position: absolute;
                left: -9999px;
            }
            .ok {
                color: #1b6e2a;
            }
            .error {
                color: #b3261e;
            }
        </style>
    </head>
    <body>
        <h1>Contact us</h1>
        <form id="contact-form" novalidate>
            <label>
                Name
                <input name="name" autocomplete="name" required />
            </label>
            <label>
                Email
                <input name="email" type="email" autocomplete="email" required />
            </label>
            <label>
                Message
                <textarea name="message" required maxlength="2000"></textarea>
            </label>
            <input class="trap" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" />
            <button type="submit">Send</button>
            <p id="contact-status" role="status"></p>
        </form>

        <script src="https://app.example.com/api/v1/forms/client.js"></script>
        <script>
            const formKey = '3f9a0c1e7b2d4a6f8e5c9b0d1a2f4e6c'
            const endpoint = `https://app.example.com/api/v1/forms/${formKey}`
            const form = document.getElementById('contact-form')
            const button = form.querySelector('button')
            const status = document.getElementById('contact-status')
            let tokenRequest = null

            function requestToken() {
                if (!tokenRequest) {
                    tokenRequest = InboundForm.getToken(formKey)
                    tokenRequest.catch(() => {
                        tokenRequest = null
                    })
                }
                return tokenRequest
            }

            function show(text, tone) {
                status.textContent = text
                status.className = tone
            }

            function describeFailure(statusCode, body) {
                if (statusCode === 400 && Array.isArray(body.message)) {
                    const fields = body.message.map((line) => line.split(':')[0])
                    return `Please check these fields: ${[...new Set(fields)].join(', ')}.`
                }
                if (statusCode === 429) {
                    return 'Too many messages from your network. Please try again in ten minutes.'
                }
                if (statusCode === 403) {
                    return 'Your message could not be verified. Please send it again.'
                }
                return 'Sending failed. Please try again later.'
            }

            form.addEventListener('focusin', requestToken)

            form.addEventListener('submit', async (event) => {
                event.preventDefault()
                if (!form.reportValidity()) {
                    return
                }
                button.disabled = true
                show('Sending…', '')
                try {
                    const token = await requestToken()
                    const response = await fetch(endpoint, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            data: {
                                name: form.elements.name.value.trim(),
                                email: form.elements.email.value.trim(),
                                message: form.elements.message.value.trim(),
                            },
                            security: {
                                website: form.elements.website.value,
                                formToken: token,
                            },
                        }),
                    })
                    if (response.status !== 400) {
                        tokenRequest = null
                    }
                    if (response.ok) {
                        show('Thank you, your message was sent.', 'ok')
                        form.reset()
                        return
                    }
                    const body = await response.json().catch(() => ({}))
                    show(describeFailure(response.status, body), 'error')
                } catch (error) {
                    show(describeFailure(error.status ?? 0, {}), 'error')
                } finally {
                    button.disabled = false
                }
            })
        </script>
    </body>
</html>
```

If the form has no timed token, remove the `client.js` tag, `requestToken`, the `focusin` listener and `formToken` from the example.

## Responses

A successful submission answers `202 Accepted` with exactly this body:

```json
{ "status": "accepted" }
```

`accepted` means mailer stored the submission and queued one e-mail per receiver; the e-mails go out a moment later, see [Deliveries](/admin-guide/inbound-forms/deliveries). A submission caught by the honeypot gets the same answer on purpose.

Errors other than `413` are JSON with `statusCode` and `message`; all of them except `429` also carry `error`. The exact schemas are on [Public form endpoints](/api/reference/public-form).

| Status | When                                                                                     | Example body                                                                                 | What the website should do                                       |
| ------ | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `400`  | A field breaks its rules, `data` is missing, or the body has unknown top-level keys      | `{ "message": ["email: Invalid email address"], "error": "Bad Request", "statusCode": 400 }` | Show the visitor which fields to correct. `message` is a list.   |
| `403`  | A security check failed or the website is not in the allowed domains                     | `{ "message": "Form token expired", "error": "Forbidden", "statusCode": 403 }`               | Fetch a new token and let the visitor send again.                |
| `404`  | The form key is unknown, the form does not accept submissions, or its project is deleted | `{ "message": "Unknown form", "error": "Not Found", "statusCode": 404 }`                     | Check the URL and **Accept submissions**.                        |
| `413`  | The body is larger than 100 kB                                                           | no fixed body; check the status only                                                         | Shorten the input; set `maxlength` on text areas.                |
| `429`  | A rate limit was hit                                                                     | `{ "statusCode": 429, "message": "ThrottlerException: Too Many Requests" }`                  | Ask the visitor to try again later; by default after 10 minutes. |

Every `403` message is listed on [Security checks](/admin-guide/inbound-forms/security): `Origin not allowed`, the `Form token …` messages and the `Captcha …` messages. Write the website's code against the status, not against the message text.

The token endpoint `https://app.example.com/api/v1/forms/<form-key>/token` answers `403` `Origin not allowed`, `404` `Unknown form` or `429` in the same shapes. `InboundForm.getToken` then rejects with an error whose `status` property holds the status code, which example 3 uses.

## CORS and browser security

- The form endpoints are open to every origin: mailer answers the browser's CORS preflight and sends `Access-Control-Allow-Origin: *`, so `fetch` from any website works. Which websites mailer actually accepts is decided by the allowed domains, not by CORS. Requests carry no cookies.
- `client.js` is served with `Cross-Origin-Resource-Policy: cross-origin`, so other websites may load it.
- The browser does not let the website's script read mailer's rate-limit headers (`Retry-After-formSubmit` and the `X-RateLimit-…` headers); only the status `429` is visible. Tell the visitor to try again later.
- If the website sends a Content Security Policy, allow mailer in it: `script-src https://app.example.com` for `client.js` and `connect-src https://app.example.com` for the requests, plus `form-action https://app.example.com` for the plain HTML form.

## How you know it worked

1. From any computer, request a token and submit a test message as the website would. The `Origin` header stands in for the browser, the `sleep` for the minimum delay of 3 seconds plus a margin. Run the commands one after another; the token is bound to your IP address:

    ```bash
    TOKEN=$(curl -s -X POST https://app.example.com/api/v1/forms/3f9a0c1e7b2d4a6f8e5c9b0d1a2f4e6c/token \
      -H "Origin: https://www.example.org" | sed -E 's/.*"token":"([^"]+)".*/\1/')
    sleep 5
    curl -s -X POST https://app.example.com/api/v1/forms/3f9a0c1e7b2d4a6f8e5c9b0d1a2f4e6c \
      -H "Origin: https://www.example.org" \
      -H "Content-Type: application/json" \
      -d "{\"data\":{\"name\":\"Ada\",\"email\":\"reader@example.org\",\"message\":\"Test from curl\"},\"security\":{\"website\":\"\",\"formToken\":\"$TOKEN\"}}"
    ```

    The second command prints:

    ```json
    { "status": "accepted" }
    ```

    For a form without the timed token, leave out the first two commands and `formToken`.

2. Within a few seconds the receiver's e-mail arrives, in the example at `inbox@example.org`, with the subject of its template.
3. In the admin UI, open the project's **Sent mail** page (see [Projects](/admin-guide/projects#sent-mail)). The newest row has the **Source** **Form** and the **Status** **Sent**.
4. Open the page on the website, fill in the form and send it. In the browser's developer tools, the **Network** tab shows the `POST` to `/api/v1/forms/3f9a0c1e7b2d4a6f8e5c9b0d1a2f4e6c` with status `202` and the answer `{"status":"accepted"}`, and a second row appears on **Sent mail**.

If step 1 prints an error instead, the table under [Responses](#responses) names the cause. If it prints `accepted` but no e-mail arrives, see [Deliveries](/admin-guide/inbound-forms/deliveries#when-no-e-mail-arrives).
