# Fields

This page explains a form's fields: the four field types, every validation rule, default values, and how a field is used in templates and receivers. After reading it you can describe exactly what your website's form sends and what mailer accepts.

A **field** is one value the website submits, such as the visitor's name or message. mailer accepts only the fields you define here: it checks each submitted value against the field's type and rules, rejects the submission with `400` if one fails, and silently drops values whose key is not defined. Only defined fields can be used in templates and receivers.

![The Fields card of the form Contact form with the fields name, email and message, their types, the Required column and the rule Up to 2,000 characters on message](/screenshots/admin-guide/form-fields.png)

_The card **Fields** with the three fields of the example form._

## Add a field

You need **Manage forms** on the form's project.

1. On the form's page, in the card **Fields**, click **Add field**.
2. Fill in the dialog **Add field**:

    | Field             | Required | What it means                                                                                                                                 |
    | ----------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
    | **Key**           | Required | The name under which the website sends the value, the `name` attribute in an HTML form. Letters, digits, `_` and `-`, at most 255 characters. |
    | **Label**         | Required | A readable name, shown in the editor and in the field layout of a new template. At most 255 characters.                                       |
    | **Type**          | Required | **Text**, **Email**, **Number** or **Boolean**; see [Field types](#field-types). Preset to **Text**.                                          |
    | **Default value** | Optional | The value mailer uses when the submission leaves the field out; see [Default values](#default-values).                                        |
    | **Required**      | Optional | Submissions without this field are rejected.                                                                                                  |

    For **Text** fields the dialog also shows **Text rules** (**Min length**, **Max length**, **Pattern (regex)**), for **Number** fields **Number rules** (**Minimum**, **Maximum**). See [Validation rules](#validation-rules).

3. Click **Add field**.

The field is saved at once and the card shows **Field “name” added**. Each key may appear only once per form (**Another field already uses this key.**).

To change a field, click the pencil (**Edit field _key_**), change it and click **Save**. To delete it, click the bin (**Remove field _key_**). Changes apply to the next submission; submissions already stored keep their values.

The keys are case-sensitive: `Email` and `email` are different keys. Use the same spelling in the website's form, in templates and in receivers.

## Field types

| Type      | In the UI   | What mailer accepts                                                                | Example value                |
| --------- | ----------- | ---------------------------------------------------------------------------------- | ---------------------------- |
| `text`    | **Text**    | Any string, at most 5,000 characters (at most 1,000 when the field has a pattern). | `"Hello, I have a question"` |
| `email`   | **Email**   | A string that is a valid e-mail address, at most 254 characters.                   | `"reader@example.org"`       |
| `number`  | **Number**  | A JSON number. A number in quotes, such as `"42"`, is rejected.                    | `42`                         |
| `boolean` | **Boolean** | JSON `true` or `false`. Strings such as `"on"` or `"true"` are rejected.           | `true`                       |

**Number** and **Boolean** fields only work when the website sends JSON, which a plain HTML form cannot do: a browser sends every form value as a string. Use them with JavaScript, as in the `fetch` examples on [Embed the form](/admin-guide/inbound-forms/embed).

## Validation rules

Each rule is optional. The card's **Rules** column summarises the rules of each field, for example `Up to 2,000 characters`.

| Rule        | In the UI           | Applies to | What it checks                                              | Example setting | Rejects              | Accepts           |
| ----------- | ------------------- | ---------- | ----------------------------------------------------------- | --------------- | -------------------- | ----------------- |
| `required`  | **Required**        | every type | The key is present in the submission.                       | ticked          | key missing          | any present value |
| `minLength` | **Min length**      | **Text**   | At least this many characters.                              | `2`             | `"A"`                | `"Ada"`           |
| `maxLength` | **Max length**      | **Text**   | At most this many characters.                               | `2000`          | 2,001 characters     | 2,000 characters  |
| `pattern`   | **Pattern (regex)** | **Text**   | The whole value matches this JavaScript regular expression. | `[0-9]{5}`      | `"1234"`, `"A12345"` | `"12345"`         |
| `min`       | **Minimum**         | **Number** | The number is at least this.                                | `1`             | `0`                  | `1`               |
| `max`       | **Maximum**         | **Number** | The number is at most this.                                 | `10`            | `11`                 | `10`              |

Details that matter in practice:

- **Required means present, not filled in.** A plain HTML form always sends every input, an empty one as an empty string, and an empty string counts as present. To reject empty text, set **Min length** to `1` as well.
- **An empty optional email field is rejected.** An empty string is not a valid address. When the website sends JSON, leave empty optional values out of the submission instead of sending `""` or `null`; a plain HTML form cannot do that, so make email fields in such forms required.
- **Max length is capped.** A **Text** field never accepts more than 5,000 characters, or 1,000 when it has a pattern, whatever **Max length** says.
- **Patterns match the whole value.** mailer wraps your pattern so that it has to match from the first character to the last: `[0-9]{5}` accepts `"12345"` and rejects `"A12345"`. You do not need to add `^` and `$`; a pattern that already has them behaves the same.
- **Patterns are restricted** so that a crafted input cannot make the check run for minutes: at most 200 characters, no backreferences (`\1`, `\k<name>`), and no repetition of a group that itself repeats or alternates, such as `(a+)+` or `(a|b)*`. mailer refuses such a pattern with `Invalid pattern for field "…": the pattern must not …`.
- **Email** fields have no length or pattern rules; their own check is fixed.

When a submission breaks a rule, the endpoint answers `400` and names every failing field, for example:

```json
{
    "message": ["email: Invalid email address", "message: Too big: expected string to have <=2000 characters"],
    "error": "Bad Request",
    "statusCode": 400
}
```

## Default values

A **Default value** is used when the submission leaves the key out entirely. It is not used for a key that is sent empty.

- A field with a default never fails **Required**: a missing value becomes the default.
- The default is entered as text and converted for the field's type: for **Number** it is read as a number (`5`), for **Boolean** the text `true` gives `true` and anything else `false`.
- The live preview of the template editor uses the default as its sample value.

Use a default for values the website does not need to send, for example a field `source` with the default `website` that the template prints.

## Use a field in templates and receivers

A field's key is its placeholder. Write it in double curly braces:

- **In templates**, <code v-pre>{{message}}</code> prints the submitted message. In the subject, values are inserted as they are; in the body they are HTML-escaped, so a visitor cannot inject markup into the e-mail. **Boolean** fields work with Handlebars conditions, for example <code v-pre>{{#if newsletter}}Yes{{else}}No{{/if}}</code>. See [Receivers and templates](/admin-guide/inbound-forms/receivers-and-templates#write-the-template).
- **In receivers**, **Recipient** and **Reply-To** can be a placeholder such as <code v-pre>{{email}}</code> instead of a fixed address, so the e-mail goes to, or answers go to, the address the visitor entered. Only **Email** fields can be used there.

While a receiver refers to a field, that field must stay an **Email** field and cannot be removed: mailer refuses with `Field "email" is referenced by a receiver and must stay an email field`. Change or remove the receiver first.
