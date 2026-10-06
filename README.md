<p align="center">
  <img src="https://raw.githubusercontent.com/SendlyHQ/sendly-cli/main/.github/header.svg" alt="Sendly CLI" />
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@sendly/cli"><img src="https://img.shields.io/npm/v/@sendly/cli.svg?style=flat-square" alt="npm version" /></a>
  <a href="https://github.com/SendlyHQ/sendly-cli/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/@sendly/cli.svg?style=flat-square" alt="license" /></a>
</p>

# @sendly/cli

Official command-line interface for the [Sendly](https://sendly.live) messaging API.

## Installation

```bash
# npm
npm install -g @sendly/cli

# or Homebrew (macOS / Linux)
brew install SendlyHQ/tap/sendly
```

Requires Node.js 18 or newer. The current release is `4.2.0`.

## Staying up to date

The CLI checks npm once a day and prints a one-line banner (on stderr, before the command's own output) if a newer version is out. Run `sendly upgrade` to update — it auto-detects your install path (Homebrew vs npm) and runs the right command. Use `sendly upgrade --check` to see what it would do without executing.

The version check runs in a background process, so it is offline-safe. `CI` does not silence the banner; set `SENDLY_SKIP_NEW_VERSION_CHECK=true` to turn it off.

## Quick Start

```bash
# Login to your Sendly account
sendly login

# Send an SMS
sendly sms send --to "+15125550123" --text "Hello from Sendly CLI!"

# Check your credit balance
sendly credits balance
```

## Authentication

The CLI supports two authentication methods.

### Browser Login (Recommended)

```bash
sendly login
```

This opens your browser to authenticate via Sendly's secure login flow. The terminal shows a short code you type on the page to prove you have terminal access; that code is never put in the URL. After authorization, your credentials are stored locally. Session tokens are refreshed automatically when they expire.

### API Key Login

```bash
sendly login --api-key sk_test_v1_your_key
```

Or interactively:

```bash
sendly login -i
```

Keys must look like `sk_test_v1_…` or `sk_live_v1_…`. The interactive prompt rejects any other shape before a request is made; `--api-key` checks the key with the server first and then refuses to store one in any other shape. A `sk_test_` key puts the CLI in test mode, anything else in live mode.

### Check Authentication Status

```bash
sendly whoami
```

Shows the API mode (test/live), email, user ID, the workspace the credential is bound to, the server in use, and your config file path.

### Logout

```bash
sendly logout
```

When a browser-login session (`cli_…`) is stored, logout signs it out on the server first, whether or not it has expired and whatever API key is also set, then clears your local credentials. If the server cannot be reached, does not answer in time or cannot record the sign-out, local credentials are still cleared and the command exits 0, but prints `Logged out locally` and a warning that the session may stay valid on the server until it expires. The exception is when `SENDLY_BASE_URL` (or `SENDLY_API_URL`) points at a host the CLI will not send a session to: logout then sends nothing, keeps your credentials and exits 1, so you can unset the variable and retry.

With `--json` the output includes `serverSignOut`: `confirmed`, `unconfirmed`, `none` (no session was stored) or `refused`, plus a `reason` when it is not `confirmed`.

### When Authentication Is Rejected

A 401 from the API is reported with **the server's own message**, plus the machine-readable `code` and a `hint`:

```
✗ Invalid or expired API key
  code: api_key_required
  hint: Set SENDLY_API_KEY environment variable or create a key with:
  sendly keys create --name "Test key" --type test
```

The `code` is stable, so `--json` consumers should branch on it rather than on the message text. A 403 is not treated as a sign-in problem: it keeps the server's own code and message (and the server's hint when it sends one), so a refusal such as `verification_required` or a missing scope says what is actually wrong.

## Output and Scripting

Every command except `upgrade` and `onboarding` accepts two base flags:

| Flag | Effect |
|------|--------|
| `--json` | Machine-readable JSON output |
| `--quiet`, `-q` | Minimal output |

JSON mode also turns on **automatically when stdout is not a TTY**, so piping or redirecting a command gives you JSON without passing `--json`:

```bash
sendly sms list --json
sendly credits balance --json | jq '.availableBalance'
sendly rcs dossier --json > brand.json
```

Errors are reported on stderr with a `code` you can branch on:

| `code` | HTTP | Meaning |
|--------|------|---------|
| `authentication_error` | 401 | Not signed in, or the `sendly login` session was rejected; run `sendly login` |
| `api_key_required` | 401/403 | The API key is missing or was rejected, or the operation needs an API key |
| `live_key_required` | 403 | The operation needs a live key; RCS and WhatsApp report it as `rcs_requires_live_key` and `whatsapp_requires_live_key` |
| `insufficient_permissions` | 403 | The API key lacks a scope the endpoint needs, or your workspace role cannot make the change; the message says which |
| `verification_required` | 403 | Verify your business at https://sendly.live/verify first |
| `insufficient_credits` | 402 | Balance does not cover the request |
| `payment_method_required` | 402 | No card on file |
| `not_found` | 404 | No such resource, or the feature is not enabled for you |
| `validation_error` | 400 | Bad input; the message says what is wrong |
| `rate_limit_exceeded` | 429 | Too many requests; the output carries a `Retry after` |
| `too_many_failed_key_attempts` | 429 | API keys from your address were refused too many times and are blocked for the time shown; fix the key before you try again |

The server's message is always shown. A refusal whose status is not in the table above (such as `409`, `410`, `422` or a `5xx`), and a `403` other than the API-key ones, also keeps the server's own error code. The statuses in the table report the codes shown there instead: every `400` is `validation_error`, every `404` is `not_found`, a `402` is `insufficient_credits` unless it is `payment_method_required`, and a `429` is `rate_limit_exceeded` unless it is one of the two key-check codes (`too_many_failed_key_attempts`, `too_many_concurrent_verifications`). The exceptions: `whatsapp templates create` and `update` keep the API's own code for a `400`, and the WhatsApp commands that add a number by code (`connect --business-account`, `verify`, `resend-code`) or change a sender (`profile upload-photo`, `profile remove-photo`, `components`, `calling`) keep it for a `400` or `404` and for the WhatsApp-specific `402` and `429` codes. Commands exit non-zero on failure.

An ID of `.`, `..` or an empty string is refused with `validation_error` before any request is made, because it would send the request to a different endpoint. IDs that merely contain dots, such as `msg.1`, are sent as written.

## Commands

### SMS Commands

#### Send a Message

```bash
sendly sms send --to "+15125550123" --text "Hello!"

# Send from a number you own (E.164) — see Numbers Commands below
sendly sms send --to "+15125550123" --text "Hello!" --from "+447700900456"

# Or an alphanumeric sender ID (international)
sendly sms send --to "+447700900123" --text "Hello!" --from "MyBrand"

# Transactional instead of the default marketing classification
sendly sms send --to "+15125550123" --text "Your code is 123456" --type transactional

# MMS — repeat --media-url for more than one attachment
sendly sms send --to "+15125550123" --text "Check this out" --media-url https://cdn.example/promo.jpg
```

`--text` is optional when at least one `--media-url` is given. `sendly send` is a shortcut for the common case (`--to`, `--text`, `--from`, `--idempotency-key`).

#### List Messages

```bash
sendly sms list

# Filter by status: queued, sent, delivered, failed, bounced, retrying
sendly sms list --status delivered

# Paginate
sendly sms list --limit 10 --page 2
sendly sms list --limit 10 --offset 20

# Show sandbox/test messages (live keys only)
sendly sms list --sandbox
```

#### Search Messages

Full-text search over message bodies:

```bash
sendly sms search "verification code"
sendly sms search "order" --limit 10 --page 2
```

#### Get Message Details

```bash
sendly sms get 4a7c1e2f-9b3d-4c8a-91f2-7d5e6a0b3c19
```

#### Send Batch Messages

```bash
# From a CSV file (columns: phone, message)
sendly sms batch --file recipients.csv

# CSV of phone numbers only, with one shared message
sendly sms batch --file phones.csv --text "Your order is ready!"

# Multiple recipients inline
sendly sms batch --to "+15125550123,+15125550142" --text "Hello everyone!"

# Preview before sending (dry run) — validates without sending
sendly sms batch --file recipients.csv --dry-run

# Re-use a previous upload, or list past uploads
sendly sms batch --history
sendly sms batch --reuse <uploadId>
```

Only `.csv` files are accepted, up to 5 MB, and a batch is capped at 10,000 messages, the API's limit. The dry run reports how many messages are sendable, blocked and removed as duplicates, the per-country breakdown with credit costs, blocked messages and why, your messaging access (domestic/international), the SHAFT and quiet-hours compliance check, and whether your balance covers the send.

#### Send a Group MMS

Send to 2-8 recipients (US & Canada only) in a single group thread — everyone
sees the group and replies fan out to all participants. Group messaging is an
A2P 10DLC capability, so the sending number must be an MMS-enabled,
10DLC-registered number you own (omit `--from` to use your default sender).

```bash
sendly sms group --to "+14155550101,+14155550102" --text "Team sync at noon?"

# Attach media
sendly sms group --to "+14155550101,+14155550102" --media-url https://cdn.example/flyer.jpg

# Marketing (applies quiet-hours rules; group MMS defaults to transactional)
sendly sms group --to "+14155550101,+14155550102" --text "Sale!" --type marketing
```

The output lists each recipient. A live send shows each number with its own status; a simulated send on a test key lists the numbers only.

#### Upload Media for MMS

Upload a JPEG, PNG or GIF and get back a public URL to pass to `--media-url`. Needs MMS enabled on your account.

```bash
sendly sms upload-media ./promo.jpg
sendly sms upload-media ./animated.gif --json
```

#### Schedule a Message

`--at` takes ISO 8601 or natural language. The send must be at least 5 minutes and at most 5 days out.

```bash
sendly sms schedule --to "+15125550123" --text "Reminder!" --at "tomorrow at 9am"
sendly sms schedule --to "+15125550123" --text "Sale!" --at "$(node -p 'new Date(Date.now() + 86400000).toISOString()')"
```

#### List Scheduled Messages

```bash
sendly sms scheduled
sendly sms scheduled --limit 10 --status scheduled
```

#### Cancel a Scheduled Message

```bash
sendly sms cancel schd_abc123
```

#### Idempotent Sends

Every send command (`send`, `sms send`, `sms group`, `sms schedule`, `sms batch`, `rcs send`, `whatsapp send`) accepts `--idempotency-key` (1-255 printable ASCII characters). Re-running with the same key within 24 hours returns the original result instead of sending again, so a crashed script or CI job is safe to re-run. An invalid key fails before any request is made.

Without the flag, POSTs other than `sms batch` carry an auto-generated `Idempotency-Key`. The CLI keeps the same key, yours or the generated one, on every retry it makes (after a network error, a `5xx` or a busy key-check `429`; see [Retries](#retries-timeouts-and-rate-limits)), so a retry of a request that already reached the API does not send twice. (`sms batch` is excluded because the batch endpoint dedupes header-less retries itself.) Reusing a key with a different request fails with `422 idempotency_key_mismatch`. The RCS registration writes accept `--idempotency-key` too.

```bash
sendly sms send --to "+15125550123" --text "Your order has shipped!" --idempotency-key "order-4821-shipped"
```

### Contacts Commands

```bash
sendly contacts list
sendly contacts list --search john --limit 50
sendly contacts list --list lst_xxx

sendly contacts create --phone +15125550123 --name "John Doe" --email john@acme.example
sendly contacts get cnt_xxx
sendly contacts update cnt_xxx --name "Jane Doe"
sendly contacts delete cnt_xxx --yes

# Import from CSV (columns: phone, name, email)
sendly contacts import ./contacts.csv --list lst_xxx
```

#### Carrier Lookups and Invalid Contacts

```bash
# Run a carrier lookup over your contacts
sendly contacts check-numbers
sendly contacts check-numbers --list lst_xxx
sendly contacts check-numbers --force

# Clear the invalid flag when auto-marking got it wrong
sendly contacts mark-valid cnt_xxx
sendly contacts bulk-mark-valid --ids cnt_abc,cnt_def
sendly contacts bulk-mark-valid --list lst_xxx
```

`bulk-mark-valid` takes `--ids` (up to 10,000) **or** `--list`, never both.

#### Contact Lists

```bash
sendly contacts lists
sendly contacts lists create --name "VIP Customers" --description "Top accounts"
sendly contacts lists get lst_xxx
sendly contacts lists update lst_xxx --name "VIPs"
sendly contacts lists add lst_xxx --contacts cnt_abc,cnt_def
sendly contacts lists remove lst_xxx cnt_abc
sendly contacts lists delete lst_xxx --yes
```

Deleting a list does not delete the contacts in it.

### Campaign Commands

Bulk sends to a contact list. A campaign targets one list: if you pass `--list` more than once, only the first is used and the command warns that the others were not, so run `campaigns create` once per list. `--text` (and a `--template`) can use `{{name}}` and `{{brand_name}}`, which are filled in for each contact.

```bash
sendly campaigns create --name "Welcome" --text "Hello {{name}}!" --list lst_xxx

sendly campaigns list
sendly campaigns list --status draft --limit 10
sendly campaigns get cmp_xxx
sendly campaigns update cmp_xxx --name "Sale" --text "50% off!"
sendly campaigns clone cmp_xxx --name "Copy of Sale"
sendly campaigns delete cmp_xxx --yes

# Cost and recipient preview before you commit
sendly campaigns preview cmp_xxx

# Send now, or schedule (ISO 8601 or natural language)
sendly campaigns send cmp_xxx --yes
sendly campaigns schedule cmp_xxx --at "tomorrow at 9am" --timezone "America/New_York"
sendly campaigns cancel cmp_xxx
```

### Conversation Commands

```bash
sendly conversations                       # same as `conversations list`
sendly conversations list --status active --limit 20 --offset 20
sendly conversations get conv_abc123 --messages --limit 50
sendly conversations reply conv_abc123 "On my way"
sendly conversations mark-read conv_abc123
sendly conversations close conv_abc123
sendly conversations reopen conv_abc123
sendly conversations update conv_abc123 --tags vip,renewal --metadata '{"crmId":"lead_8812"}'
```

#### Context and Suggested Replies

```bash
# Conversation history rendered for an LLM prompt
sendly conversations context conv_abc123 --max-messages 40
sendly conversations context conv_abc123 --raw      # text only, for piping

# AI-suggested replies
sendly conversations suggest-replies conv_abc123
```

### Label Commands

```bash
sendly labels                              # same as `labels list`
sendly labels create "Needs follow-up" --color "#FF0000" --description "Chase tomorrow"
sendly labels add conv_abc123 lbl_xxx
sendly labels remove conv_abc123 lbl_xxx
sendly labels delete lbl_xxx
```

### Draft Commands

Human-in-the-loop sends: a draft is written, reviewed, then approved or rejected.

```bash
sendly drafts                              # pending drafts
sendly drafts list --conversation-id conv_abc123 --status pending
sendly drafts create conv_abc123 "Thanks — we'll have that out today."
sendly drafts approve drf_xxx              # approving sends it
sendly drafts reject drf_xxx --reason "Wrong tone"
```

### Rule Commands

Auto-labeling rules for AI classification results.

```bash
sendly rules                               # list rules
sendly rules create --name "Complaints" --intent complaint --label lbl_xxx --priority 10
sendly rules create --name "Opt-outs" --intent opt_out --close
sendly rules delete rul_xxx
```

`--intent` accepts `question`, `appointment`, `complaint`, `order_status`, `feedback`, `opt_out`, `greeting`, `confirmation`, `other`; `--sentiment` accepts `positive`, `neutral`, `negative`. Lower `--priority` runs first.

### Template Commands

```bash
sendly templates list
sendly templates get tpl_abc123
sendly templates get tpl_preset_2fa
sendly templates create --name "My OTP" --text "Your code is {{code}}"
sendly templates update tpl_abc123 --text "Your new code is {{code}}"
sendly templates clone tpl_preset_otp --name "My Custom OTP"
sendly templates publish tpl_abc123
sendly templates delete tpl_abc123 --force
sendly templates presets
```

Supported variables: `{{code}}`, `{{app_name}}`. Template text is capped at 1600 characters (10 SMS segments). Publishing locks a draft for use; preset templates can be cloned but not edited, published or deleted.

#### AI Enhancement

Rewrites a draft for clarity and compliance and explains what changed. Needs AI classification enabled for your account.

```bash
sendly templates enhance --text "hey come check out our sale"
sendly templates enhance --file ./draft.txt --message-type marketing
echo "your sale msg" | sendly templates enhance --message-type marketing
```

### Verification (OTP) Commands

#### Send OTP

```bash
sendly verify send --to "+15125550123"

# With custom app name
sendly verify send --to "+15125550123" --app-name "MyApp"

# With a template or a saved verify profile
sendly verify send --to "+15125550123" --template tpl_preset_2fa
sendly verify send --to "+15125550123" --profile vp_xxx

# Custom code length (4-10, default 6) and validity in seconds (60-3600, default 300)
sendly verify send --to "+15125550123" --code-length 8 --timeout 120
```

On a test key the SMS is not sent and the response carries the sandbox code, which the command prints. A refusal is explained from its error code, which `--json` carries: `insufficient_credits`, `verification_required` (verify your business at https://sendly.live/verify) or `invalid_phone_format` (use E.164).

#### Check OTP Code

```bash
sendly verify check ver_abc123 --code 123456
```

A wrong code exits 1 with `invalid_code` and the attempts left (`remaining_attempts` in `--json`). An expired code reports `expired`, and running out of attempts `max_attempts_exceeded`, both with a hint to request a new code. A credential the API refuses is reported with its own code and message.

#### Get Verification Status

```bash
sendly verify status ver_abc123
```

#### List Recent Verifications

```bash
sendly verify list
sendly verify list --limit 50 --status verified
```

#### Resend OTP

```bash
sendly verify resend ver_abc123
```

### Numbers Commands

Search, buy, inspect and release phone numbers.

#### Search Available Numbers

```bash
sendly numbers search --country GB --type mobile
sendly numbers search --country US --type local --contains 555
```

#### Buy a Number

```bash
sendly numbers buy --country GB --type mobile

# Pick an exact number
sendly numbers buy --country US --type local --number +15125550188
```

The buy is asynchronous: the number starts as `provisioning` and becomes
`active` once the carrier confirms it. Some countries need documents or a
payment first — the command prints a secure link (and opens it), waits while
you complete it, then finishes the order. Those countries can also land in
`under_review`, where the number is reserved until the details are checked.

A US local number reaches `active` but still cannot send until it is assigned
to a registered 10DLC campaign; the command says so when that applies. See
[How to buy a number](https://sendly.live/docs/how-to/buy-a-number).

#### List Your Numbers

```bash
sendly numbers list
```

Pass the `phoneNumber` of any `active` number as `--from` on a send to send
from it (see [Send from a number you own](https://sendly.live/docs/how-to/send-from-owned-number)):

```bash
sendly sms send --to "+15125550123" --text "Hi!" --from "+447700900456"
```

#### Show a Number

```bash
sendly numbers get num_abc123
```

Includes whether it's your workspace default sender and any scheduled release.

#### Update a Number

Make a number your default sender, or cancel a scheduled release. At least one
of `--default` / `--keep` is required:

```bash
# Make this number the workspace default sender (must be active)
sendly numbers update num_abc123 --default

# Cancel a scheduled release and keep the number
sendly numbers update num_abc123 --keep
```

#### Release a Number

```bash
sendly numbers release num_abc123
```

Paid purchases are scheduled to release at the end of the billing period (undo
with `sendly numbers update <id> --keep`); everything else releases immediately.
Add `--yes` to skip the confirmation prompt. Releasing needs a live API key or a
`sendly login` session (a test key gets `403 live_key_required`), and in a team
workspace the owner or admin role (otherwise `403 insufficient_permission`).

### 10DLC Commands

Register your brand and messaging campaigns for carrier review so you can
send from US local (10-digit) numbers. The flow is brand → qualify →
campaign → assign number. Registering a brand, creating a campaign and
assigning a number need a live API key.

#### Register a Brand

```bash
sendly 10dlc brands create --legal-name "Acme Inc" --ein "12-3456789" --website https://acme.example
sendly 10dlc brands create --legal-name "Jane Doe" --entity-type SOLE_PROPRIETOR --email jane@acme.example
```

`--entity-type` defaults to `PRIVATE_PROFIT` and `--country` to `US`. Address, vertical, phone and `--verification-id` (to prefill from an existing verification) are all optional.

#### Check Brand Status

Carrier review starts as `pending` and becomes `verified` (or `failed`, with
`failureReasons`). Running `get` refreshes the status:

```bash
sendly 10dlc brands list
sendly 10dlc brands get <brandId>
```

#### Qualify a Use Case

Pre-check that a use case is accepted for your brand before creating a
campaign. It reports the throughput tier and how many carriers are ready:

```bash
sendly 10dlc qualify <brandId> MIXED
```

#### Create a Campaign

Once the brand is `verified`:

```bash
sendly 10dlc campaigns create \
  --brand <brandId> \
  --use-case MIXED \
  --description "Order updates and promotions" \
  --message-flow "Customers opt in at checkout" \
  --sample "Your order has shipped!" \
  --sample "20% off this weekend"
```

Optional flags cover sub use cases, opt-in/opt-out/help keywords and replies, and whether messages carry links (`--no-embedded-link`) or phone numbers (`--embedded-phone`).

Poll until the campaign is `active`:

```bash
sendly 10dlc campaigns list
sendly 10dlc campaigns get <campaignId>
```

#### Assign a Number

Attach a US local number you own to the active campaign to make it sendable.
Assignments report as `Under review`, `Active` or `Action needed`:

```bash
sendly 10dlc campaigns assign <campaignId> --number "+15125550188"
sendly 10dlc assignments list
```

Then send from it:

```bash
sendly sms send --to "+15125550123" --text "Hi!" --from "+15125550188"
```

### Short Code Commands

Apply for a US short code, a 5 or 6 digit sender, from the terminal. A short code is granted rather than bought: you fill in the application, Sendly reviews it, the carrier forms are signed, and each carrier certifies the code. Short codes must be enabled for your account — until then these commands fail with "Short codes aren't enabled for this account yet." (code `not_found`; `short-codes list` shows it as a warning, with no code, and exits 1).

```bash
# Where the application stands, what is missing, and where the setup fee and lease stand
sendly short-codes application

# Save answers (the first run creates the application)
sendly short-codes update \
  --use-case "Delivery alerts for Acme orders" \
  --message-frequency "4 messages per month" \
  --brand-contact-name "Ada Lovelace" --brand-contact-email ada@acme.example

# A different company sends the messages
sendly short-codes update --no-content-provider-same-as-brand \
  --content-provider-legal-name "Relay Messaging LLC" --content-provider-ein 12-3456789 \
  --content-provider-contact-name "Grace Hopper" --content-provider-contact-email grace@relay.example

# Example messages (repeat the flag)
sendly short-codes update --sample-message "Acme: your order shipped." --sample-message "Acme: your order arrived."

# Check against the carrier rules, then submit for review (charges the $999 setup fee)
sendly short-codes check
sendly short-codes submit --accept-terms

# Codes leased to the workspace
sendly short-codes list
```

`--order-type` is `new` or `migration`, and `--code-type` is `random` or `vanity`. A vanity request takes the digits you want in `--requested-digits`; a migration takes the code being moved plus `--losing-provider`. Other answers the carriers require: `--opt-in-flow`, `--opt-in-confirmation`, `--help-response`, `--stop-confirmation`, `--campaign-keyword`, `--expected-monthly-volume`, `--expected-daily-volume`, `--privacy-policy-url`, `--terms-url`.

`sendly short-codes application` shows the review state, the setup fee and whether it is paid, the monthly lease (once the code is live: paid through, next charge, minimum term end, and any unpaid month with the date sending pauses), how many carriers have approved, and each carrier form — the Short Code Order Brief, Brand Registration Form, Content Provider Registration Form, Migration Letter and Letter of Authorization — as *not ready yet*, *signing link sent* or *signed*. Fields Sendly or the carriers own are ignored on save and listed back to you.

`sendly short-codes check` runs the carrier rules without changing anything and lists what is left as `path: message` pairs. `submit` refuses until it passes.

`submit` charges the one-time $999 setup fee to the workspace's card on file, so it needs `--accept-terms`: the fee now, the monthly lease ($1,150 random, $2,150 vanity) from the day the code goes live, and a 3-month minimum. The fee is refunded in full if Sendly rejects the application before filing it. Without a card it fails with `payment_method_required`; a declined card fails with `payment_failed`; and when your bank wants to confirm the payment it fails with `payment_requires_authentication` and prints `checkoutUrl`, a secure payment page to finish it on. In every case the application stays a draft and nothing is charged.

### RCS Commands

Send RCS messages from your brand's verified RCS agent — rich text with
tappable suggestion chips, or rich cards with images. Recipients whose device
doesn't support RCS automatically get the text delivered as plain SMS (rich
cards have no SMS form). Requires a live API key — RCS delivery is never
simulated on a test key. RCS is rolling out gradually; until it is enabled for
your workspace these commands report that and point at support@sendly.live.

#### Register Your Brand and Agent

The flow is brand → agent → submit → testing → request launch. Drafts are
saved as you go; required fields are only checked when you submit. Every
step is also available in the dashboard, and both see the same registration.
Registration commands need an API key with the `rcs:read` / `rcs:write`
scopes (or a `sendly login` session). RCS registration is open to US
businesses for now.

Start from what Sendly already knows about your business (your 10DLC brand
or toll-free verification), then draft the brand:

```bash
sendly rcs dossier --json > brand.json     # prefilled details; edit as needed
sendly rcs brands create --from-json brand.json --ein 12-3456789 \
  --legal-entity-type CORPORATION --organization-type PRIVATE_PROFIT
# or one field per flag:
sendly rcs brands create --display-name "Acme" --legal-name "Acme Inc" \
  --website https://acme.example --address-line1 "1 Main St" --city Austin \
  --state TX --postal-code 78701 --contact-first-name Jane \
  --contact-last-name Doe --contact-email jane@acme.example \
  --contact-phone +15125550100
sendly rcs brands update <brandId> --stock-symbol NASDAQ:ACME
```

`--legal-entity-type` is one of `LIMITED_LIABILITY_COMPANY`, `CORPORATION`, `S_CORPORATION`, `PARTNERSHIP`, `SOLE_PROPRIETORSHIP`. `--organization-type` is one of `PRIVATE_PROFIT`, `PUBLIC_PROFIT`, `NON_PROFIT`, `GOVERNMENT`, `UNKNOWN`.

Draft the agent under the brand. Logo, hero image and any opt-in screenshot
must already be public `https://` URLs — assets can't be uploaded from the
CLI (use the dashboard for that). `--use-case` is one of `MULTI_USE`,
`TRANSACTIONAL`, `PROMOTIONAL`, `OTP`:

```bash
sendly rcs agents create --brand <brandId> --display-name "Acme" \
  --use-case TRANSACTIONAL --description "Order updates from Acme" \
  --logo-url https://acme.example/logo.png --hero-url https://acme.example/hero.png \
  --brand-color "#1E90FF" --privacy-policy-url https://acme.example/privacy \
  --terms-url https://acme.example/terms --website https://acme.example --website-label Acme
sendly rcs agents get <agentId>
```

Submit for review. Sendly checks the brand and agent, then sends them to the
carrier network; you're emailed when anything changes or needs attention:

```bash
sendly rcs agents submit <agentId>
sendly rcs registration        # where things stand, and what to do next
```

Once the agent is in testing, invite test devices (the list you pass replaces
the current one, up to 20), send them a message, and add the campaign details
the launch review needs:

```bash
sendly rcs agents devices set <agentId> --phone +13125550100 --phone "+13125550101=Jane's Pixel"
sendly rcs send --to +13125550100 --text "Hello from testing" --agent <agentId>
sendly rcs agents update <agentId> \
  --company-overview "Acme sells widgets online" \
  --agent-overview "Order and delivery updates" \
  --interaction TRANSACTIONAL_UPDATES \
  --message-example "Your Acme order #4821 has shipped. Reply STOP to opt out." \
  --message-example "Your order is out for delivery today." \
  --message-example "Delivered! Reply HELP for help." \
  --opt-in-method "WEBSITE=Checkbox at checkout" \
  --call-to-action "Get order updates by text" \
  --call-to-action-url https://acme.example/checkout \
  --call-to-action-media-url https://acme.example/optin.png \
  --no-double-opt-in \
  --opt-in-message "Welcome to Acme updates. Reply STOP to opt out." \
  --help-response "Acme support: help@acme.example" \
  --opt-out-response "You are unsubscribed from Acme updates."
```

`--interaction` values: `TRANSACTIONAL_UPDATES`, `CUSTOMER_SUPPORT`, `ACCOUNT_ALERTS`, `LOYALTY_OR_REWARD`, `MARKETING_OR_PROMOTIONAL`, `TWO_WAY_CONVERSATION`, `OTHER`. `--opt-in-method` values: `WEBSITE`, `SMS`, `MOBILE_APP`, `QR_CODE`, `SALE_POINT`, `OTHER`. Both take an optional description as `TYPE=description` and both replace the whole list.

Then request launch with a recording or screenshots of the agent on a test
device:

```bash
sendly rcs agents request-launch <agentId> --test-url https://acme.example/rcs-test.mp4
```

`brands create`, `brands update`, `agents create` and `agents update` accept
`--from-json <file>` for the full nested body (flags override fields in the
file); every write accepts `--idempotency-key`. On `update`, passing an empty
value clears an optional field, and `--clear-campaign` / `--clear-testing`
drop a whole section. Field errors come back as `path: message` pairs (and as
an `errors` array with `--json`).

#### Registration Stages

`sendly rcs registration` and `rcs agents get` report one stage:

| Stage | Meaning |
|-------|---------|
| `draft` | Being filled in; nothing submitted |
| `in_review` | Sendly is reviewing the brand and agent |
| `changes_requested` | Action needed — see the review note, then resubmit |
| `rejected` | Not approved |
| `brand_verification` | The carrier network is verifying the brand |
| `agent_review` | The carrier network is reviewing the agent |
| `testing` | Reaches invited test devices only |
| `launch_review` | Sendly is reviewing the launch request |
| `launching` | The carrier network is reviewing the launch |
| `launch_rejected` | Launch not approved |
| `live` | Reaches everyone |
| `suspended` / `failed` | Contact support@sendly.live |

#### Send a Message

```bash
sendly rcs send --to "+15125550190" --text "Your order shipped!"

# With suggestion chips
sendly rcs send --to "+15125550190" --text "Need anything else?" \
  --suggest-reply "Track order=TRACK" \
  --suggest-url "View receipt=RECEIPT=https://acme.example/r/4821"

# Rich card (RCS-capable recipients only)
sendly rcs send --to "+15125550190" \
  --card-title "Spring sale" \
  --card-description "20% off everything this weekend" \
  --card-media https://cdn.example/sale.jpg

# Fail instead of falling back to SMS
sendly rcs send --to "+15125550190" --text "RCS only please" --no-fallback
```

`--card-description` is required with `--card-title`, and `--text` cannot be combined with the card flags. `--card-orientation` is `vertical` or `horizontal`. The output shows what actually happened: native RCS delivery, or the SMS fallback (suggestion chips have no SMS form and are dropped).

#### List Your Agents

```bash
sendly rcs agents
```

Pass an agent's id as `--agent` on sends and capability checks when your
workspace has more than one. Agents in `testing` reach invited test devices
only; `approved` agents reach everyone.

#### Check Recipient Capability

Know before sending whether a recipient gets native RCS or the SMS fallback.
Capability checks reach the carrier network, so they require a live API key:

```bash
sendly rcs capability --to "+15125550190"
```

### WhatsApp Commands

Connect a number you own to WhatsApp and message customers over it —
free-form text inside the 24-hour reply window, approved templates any time.
One-time $19 connection fee, no monthly fee. If the connection fails, the
$19 fee is refunded automatically; once a number has connected, a later
disconnect gets nothing back.

`whatsapp send` goes through `POST /v1/messages` with channel `whatsapp` and
needs `sms:send`, not `whatsapp:write`, and a live key. Reads (`whatsapp
status`, `whatsapp senders`, `whatsapp templates list`, `whatsapp profile
get`, `whatsapp components get`) need `whatsapp:read` and accept test keys.
Connecting (including `whatsapp verify` and `whatsapp resend-code`), template
create/edit/delete, profile edits and photos, ice breakers and commands, and
the calling switch need `whatsapp:write` and a live key or a `sendly login`
session (a test key gets 403 `whatsapp_requires_live_key`). In a team
workspace, connecting, profile edits, ice breakers and commands, and the
calling switch need an owner or admin (`settings:write`), and template writes
need an owner, admin or member (`templates:write`). A missing role returns 403
`insufficient_permissions`.

WhatsApp is rolling out gradually, and it is enabled per person: the user who
owns the API key, not the workspace. While it is off, sends return 403
`whatsapp_not_enabled` and the `/api/v1/whatsapp/*` management routes return
404 `not_found`; `whatsapp connect` and `whatsapp profile` say so and point at
support@sendly.live. Contact support@sendly.live for early access.

#### Connect a Number

```bash
sendly whatsapp connect --number "+15125550188"
```

Prints a secure link a person must open and sign in with Facebook to finish
connecting. WhatsApp then activates the number. Activation usually takes a
few minutes but can take hours. If it hasn't finished about 6 hours after the
session began, the session fails with `registration_timeout` and the fee is
refunded. The command waits up to 20 minutes; if the
number is still activating when it stops, it says the sign-in is done and to
check with `sendly whatsapp status <id>`. With `--json` it prints the link and
the signup id instead of waiting, so you can poll with `whatsapp status`.

When connections are unavailable the API answers `503 whatsapp_unavailable`
before charging anything, with `retryAfter: 3600` in the body and a
`Retry-After: 3600` header. Only signup returns it; no send does. The command says nothing was charged and when to try
again (`code` and `retryAfter` in `--json`). After too many failed attempts in
24 hours it answers `429 whatsapp_signup_limit_reached`, which is not worth
retrying that day: check why the last attempt failed with
`sendly whatsapp status`, then try again tomorrow or contact
support@sendly.live. Each failed attempt's fee is refunded.

#### Add a Number to a Connected Business Account

Once one number is connected, you can add more numbers to the same WhatsApp
Business account without the Facebook step. WhatsApp sends a 6-digit code to
the new number, by text (the default) or voice call. `sendly whatsapp senders`
shows each connected number's business account id. The same one-time $19 fee
applies, and it is refunded automatically if the attempt fails.

```bash
sendly whatsapp connect --number "+15125550142" --business-account 104996582519384

# Code by voice call, with the name WhatsApp shows for this number
# (it defaults to the account's existing display name)
sendly whatsapp connect --number "+15125550142" --business-account 104996582519384 \
  --verification-method voice --display-name "Acme Plumbing"

# A text to a number on your workspace arrives in your Sendly inbox, and
# `whatsapp status` shows the code once it has
sendly whatsapp status

# Enter the code (without --code it submits the code that arrived)
sendly whatsapp verify --code 482913

# Ask for another code (30 seconds after the last request or submission)
sendly whatsapp resend-code --verification-method voice
```

`verify` and `resend-code` default to your most recent connection attempt on
this machine; pass the signup id to choose another. Running
`connect --business-account` again for a number that is already being added
returns that attempt with no new charge and no new code; `resend-code` asks for
another code. Until a code has been entered, `whatsapp status` (and `verify`
without `--code`) keeps showing the earlier code after `resend-code` until the
new one arrives, so wait until the code shown changes, or pass it with `--code`. Five wrong codes end the
attempt (`409 whatsapp_verification_failed`); before that, a wrong code is
`422 whatsapp_verification_code_invalid` with `attemptsRemaining`. An attempt
left untouched for about an hour expires. Each refusal keeps the API's code,
for example `whatsapp_business_account_not_found` (no connected account with
that id in this workspace), `display_name_required` (pass `--display-name`),
`whatsapp_signup_in_progress` (a Facebook connection for the number is in
flight), `whatsapp_verification_start_failed` (`422` when WhatsApp refused the
number, `502` when it couldn't be reached; the fee is refunded either way),
`whatsapp_verification_resend_too_soon` (with `retryAfter` in seconds) and
`whatsapp_activation_pending` (WhatsApp accepted the code but the connection
didn't finish; don't start again, check `whatsapp status` shortly).

`connect --business-account`, `verify` and `profile upload-photo` never retry
a request on their own, not even after a server error or a dropped connection:
a second start could charge the fee again, and every code submission uses one
of the five attempts. Run the command again yourself once you know what
happened. While a number is being added by code, `whatsapp connect` without
`--business-account` answers `409 whatsapp_verification_in_progress` with the
signup id to enter the code for.

#### Check Connection Status

Defaults to your most recent connection attempt on this machine:

```bash
sendly whatsapp status

# Or a specific signup
sendly whatsapp status 3f6a1c9e-0000-0000-0000-000000000000
```

Statuses run `initiated` → `registering` → `active`, or end as `failed` / `expired`. `registering` means the Facebook sign-in is done and WhatsApp is activating the number. A number added with `--business-account` is `verifying` until its code is accepted; while it is, `status` shows how the code was sent, the attempts left and the code itself once the text has arrived on the number.

#### List WhatsApp Senders

```bash
sendly whatsapp senders
```

Each sender shows its business name and business account id (both empty while
it is pending) and whether WhatsApp calling is on. `on (inbound only)` means
Meta doesn't allow business-initiated calls from that number's country code
(+1, +20, +84 and +234). `--json` includes `businessAccountId`, `businessName`,
`callingEnabled` and `outboundCallingAllowed`.

#### Send a Message

```bash
# Free-form text (only inside the 24-hour reply window)
sendly whatsapp send --to "+15125550123" --from "+15125550188" --text "Your table is ready!"

# Approved template (reaches contacts any time)
sendly whatsapp send --to "+447700900123" --from "+15125550188" \
  --template order_shipped --language en_US --var 1=Acme --var 2=4821
```

`--language` is required with `--template`, and `--text` cannot be combined with the template flags.

Pricing: free-form text or media inside the 24-hour window costs 1 credit each for the first 1,000 per sending number per calendar month (UTC), then the destination's utility template price; countries without a listed price use the default utility price of 12 credits. Templates are priced by category and destination country; countries without a listed price use 33 (marketing), 12 (utility) and 12 (authentication) credits. A failed send gives its slot back.

Refusals keep the API's code:

- `422 whatsapp_window_closed`: the 24-hour reply window is closed; send an approved template instead.
- `422 whatsapp_template_not_approved`: the template is not approved (check with `sendly whatsapp templates list`).
- `whatsapp_send_failed`: `422` when the carrier refused the message, which is final (cached under the idempotency key and replayed for 24 hours), or `502` when it could not be reached: not sent, safe to send again. A `502` is never cached, and the CLI retries it under the same idempotency key. The credits for a failed send are refunded.
- `409 whatsapp_send_unconfirmed`: the outcome is unknown. The message was marked failed and refunded, but it may still be delivered, so check before sending it again, or it could arrive twice. It is cached under the idempotency key, and the CLI does not retry it.
- `403 whatsapp_not_enabled`: WhatsApp is not enabled for the key's owner.

#### Manage Templates

Templates are reviewed by Meta, usually within a day, and are the only way to
message outside the 24-hour window. Names are lowercase letters, numbers and
underscores. Every `{{n}}` body variable needs an `--example n=value`:

```bash
sendly whatsapp templates list

sendly whatsapp templates create --sender "+15125550188" --name order_shipped \
  --language en_US --category utility \
  --body "Hi {{1}}, order {{2}} shipped!" --example 1=Acme --example 2=4821

# Header, footer and buttons are optional
sendly whatsapp templates create --sender "+15125550188" --name summer_sale \
  --language en_US --category marketing --body "Our sale is on!" \
  --footer "Reply STOP to opt out" --button "quick_reply:Stop promotions"

# Edit an approved or rejected template and resubmit it for review
sendly whatsapp templates update 3f6a1c9e-0000-0000-0000-000000000000 \
  --body "Hi {{1}}, your order shipped!" --example 1=Acme

# Delete (the name stays reserved for up to 30 days)
sendly whatsapp templates delete 3f6a1c9e-0000-0000-0000-000000000000
```

`--category` is `authentication`, `utility` or `marketing`. It is required, with no default (the API refuses a missing one with `template_category_invalid`), and `update` can't change it. `--button` takes `quick_reply:Text`, `otp:Text`, or `url:Text:https://acme.example/{{1}}`; repeating it on `update` replaces the whole button set. Only approved or rejected templates can be edited — a pending one is already in review.

`--header` must be fixed text. Sends fill only body and button variables, so a header containing `{{n}}` is refused with `template_header_variable_unsupported`: put the variable in `--body`. A validation refusal (400) keeps the API's own code in `--json`, for example `template_name_reserved_prefix` for a name starting with `test`, `sample` or `demo`, `template_category_invalid`, `template_authentication_otp_button_required`, or `template_authentication_no_links` (a link in the body or a URL button on an authentication template). On create, `404 whatsapp_sender_not_connected` is checked first. A marketing template without an opt-out button only gets a warning.

#### Business Profile

The profile customers see when they tap your business name in WhatsApp:

```bash
sendly whatsapp profile get "+15125550188"

sendly whatsapp profile update "+15125550188" \
  --about "Family-run bakery in Austin" --website https://acme.example
```

Also settable: `--display-name`, `--description`, `--category`, `--email`, `--address`.

Set or remove the profile photo. It must be a JPEG or PNG of 5 MB or less;
WhatsApp wants it square and at least 192 pixels wide (640 recommended):

```bash
sendly whatsapp profile upload-photo "+15125550188" ./logo.png
sendly whatsapp profile remove-photo "+15125550188"
```

A file that isn't a JPEG or PNG, or is over 5 MB, is refused before it is
uploaded. When WhatsApp refuses the image the API answers
`502 whatsapp_profile_update_failed`; fix the image and try again.

#### Ice Breakers and Commands

Ice breakers are tappable suggestions shown when someone opens a chat with
the business for the first time; commands are shown when the customer types
`/`. Each list you pass replaces the stored one, and a list you leave out stays
as it is:

```bash
sendly whatsapp components get "+15125550188"

sendly whatsapp components update "+15125550188" \
  --ice-breaker "Book a repair" --ice-breaker "Get a quote" \
  --command "quote=Get a price for a job" --command "status=Check your booking"

# Remove every ice breaker or command
sendly whatsapp components update "+15125550188" --clear-ice-breakers
sendly whatsapp components update "+15125550188" --clear-commands
```

Up to 4 ice breakers of at most 80 characters each, all different. Up to 30
commands: the name is letters, digits or underscores, at most 32 characters (a
leading `/` is dropped), and the description is at most 256 characters. A list
that breaks a rule is refused with `400 invalid_request` and a message saying
which rule.

#### WhatsApp Calling

Once calling is on, a WhatsApp user calling the number rings like a phone
call, your team in the dashboard or an AI agent according to the number's voice
settings, billed at the normal inbound rate:

```bash
sendly whatsapp calling "+15125550188" --enable
sendly whatsapp calling "+15125550188" --disable
```

Turning it on needs voice on for the number first (`409 voice_not_enabled`;
`sendly voice numbers update <number> --enable`). Meta only allows calling once
the account may message at least 2,000 people a day and the number's display
name is approved; otherwise the API answers `422 whatsapp_calling_unavailable`.
Calls placed to WhatsApp users from your numbers are dashboard only for now.

### Calls Commands

Place and manage phone calls handled by your AI agents. `calls list`,
`calls get` and `calls recording` work with any API key that has the
`calls:read` scope or a `sendly login` session. Calls are live data, so a test
key lists none and gets `call_not_found` for a call or its recording. Placing
and ending calls (`calls create`, `calls hangup`) needs a live API key with
`calls:write`, a US or Canadian number that has voice switched on and a
registered emergency address for that number. Voice is being enabled
workspace by workspace; until it is on for yours these commands return
`voice_not_enabled`.

#### Place a Call

The agent talks on the call; you pass its id (`sendly voice agents list`).
`--context` gives the agent extra instructions for this call only (up to 2000
characters), and `--metadata` attaches key=value pairs (up to 20) that come
back on every read and in every `call.*` webhook:

```bash
sendly calls create --to +15125550123 --agent <agentId>

# Choose the number to call from when you have more than one
sendly calls create --to +15125550123 --agent <agentId> --from +15125550188 \
  --context "Confirm the 3pm appointment on Tuesday" \
  --metadata crmId=lead_8812 --metadata source=cli
```

A `402 insufficient_credits` answer means the balance does not cover the call
(check it with `sendly credits`); `428 e911_required` means the `--from` number
has no emergency address yet; `409 lines_busy` means every line in the
workspace is in use, so retry in a moment. `409 agent_disabled` means the agent
is switched off. `429 daily_call_limit` means the workspace has reached today's
calling limit, so try again tomorrow. `400 from_number_not_supported` means the
`--from` number is not a US or Canadian number; pass one that is.

#### List Calls

Newest first, with direction, status, numbers, duration and credits:

```bash
sendly calls list

# Filter and paginate (--limit 1-100)
sendly calls list --status active
sendly calls list --direction outbound --agent <agentId> --limit 20 --offset 20
```

Statuses: `ringing`, `active`, `suspended`, `completed`, `no_answer`, `busy`, `cancelled`, `declined`, `failed`.

#### Inspect a Call

Shows the channel (`phone`, `whatsapp` or `browser`), hangup reason, recording
status and metadata. Agent-handled calls print the transcript below the
details:

```bash
sendly calls get <callId>
```

#### End a Call

A ringing call is cancelled, an active call is completed, and a call that has
already ended is returned unchanged:

```bash
sendly calls hangup <callId>
```

#### Download a Recording

Prints the recording status and, once it is `ready`, a signed download URL that
is valid for 5 minutes. Run it again for a fresh URL:

```bash
sendly calls recording <callId>
```

### Voice Commands

Configure what phone calls depend on: which of your numbers answer calls and
how, each number's emergency address, and the AI agents that talk on calls.
The read commands (`voice numbers list`, `voice numbers get`,
`voice agents list`, `voice agents get` and `voice voices`) work with any API
key that has the `calls:read` scope (test keys included) or a `sendly login`
session. Changing anything needs a live API key with `calls:write`; in a team
workspace, changing a number or managing agents also needs the owner or admin
role. Voice is being enabled workspace by workspace; until it is on for yours
these commands return `voice_not_enabled`.

#### Numbers and Their Voice Settings

Every active number in the workspace, the default first, with whether voice is
on, who answers, the emergency address status and the per-minute rates in
credits. Name a number by its id or by the phone number in E.164:

```bash
sendly voice numbers list
sendly voice numbers get +15125550188
```

#### Choose How a Number Answers

Real callers get the new behaviour as soon as it saves. `ring_dashboard` rings
your team in the dashboard; `agent` hands the call to an AI agent:

```bash
# Ring the team in the dashboard
sendly voice numbers update +15125550188 --enable

# Have an AI agent answer (this switches voice on too)
sendly voice numbers update +15125550188 --mode agent --agent <agentId>

# Switch voice off
sendly voice numbers update +15125550188 --disable
```

`--mode` is `none`, `ring_dashboard` or `agent`. `ring_dashboard` and `agent`
switch voice on by themselves, so `--enable` is optional with them, and
`--mode none` on its own switches voice off. `--enable` without a mode, or with
`--mode none`, rings the team, and `--disable` switches voice off whatever
`--mode` says. `--mode agent` needs an agent that is switched on
(`409 agent_disabled` otherwise).

#### Register an Emergency Address

A US or Canadian number needs an emergency address before it can place calls.
It is where emergency services are sent when someone dials 911 from the
number, so use the address where the number is actually used. It adds $1.50 a
month to the number the first time; registering again replaces the address at
no extra cost.

```bash
sendly voice numbers emergency-address +15125550188 \
  --street "500 Example Ave" --unit "Suite 2" --city Austin --state TX --zip 78701

# A Canadian address
sendly voice numbers emergency-address +15125550199 \
  --street "100 Sample St" --city Toronto --state ON --zip "M5V 2T6" --country CA
```

`--street`, `--city`, `--state` and `--zip` are required; `--unit` and
`--country` (US or CA, default US) are optional. When the address cannot be
verified you get `422 invalid_address` with the suggested address and the exact
command that registers it, so you can check the suggestion before running it.

#### Create and Manage Agents

An agent answers real callers on the numbers pointed at it and talks on the
calls you place with `sendly calls create`. A workspace can have up to 20.

```bash
# Voices to choose from
sendly voice voices

sendly voice agents create --name "Front desk" --voice olivia \
  --greeting "Thanks for calling Acme, how can I help?" \
  --instructions "Answer questions about opening hours and take messages."

sendly voice agents list
sendly voice agents get <agentId>

# Only the flags you pass change
sendly voice agents update <agentId> --no-sms
sendly voice agents update <agentId> --disable

# Asks before deleting; --yes skips the prompt
sendly voice agents delete <agentId>
```

`--name` is capped at 80 characters, `--greeting` at 500 and `--instructions`
at 4000; on `update`, `""` clears the greeting or instructions. An unknown
`--voice` id falls back to the default voice and the command warns you.

`--sms` (on unless you pass `--no-sms`) lets the agent text the person on the
call. Each agent holds its own sending key, limited to sending texts, which is
revoked when the agent is deleted; `sendly voice agents update <agentId>` with
no flags issues a new one if it was revoked. An agent that still answers a
number cannot be deleted (`409 agent_in_use`, which lists the numbers): point
those numbers at another agent or back to the team first with
`sendly voice numbers update <number> --mode ring_dashboard`.

### Link Commands (URL Shortening)

Mint branded, owned-domain short links for your destination URLs. Branded short
links improve deliverability (carriers filter public shorteners) and give you
per-link click analytics. URL shortening is gated behind the `url_shortener`
rollout flag — until it's enabled for your account these commands report the
feature as not found.

#### Create a Short Link

```bash
sendly links create https://shop.example/spring-sale
sendly links create --url "https://shop.example/welcome?utm_source=sms"
```

#### List Your Short Links

Newest first, with click counts:

```bash
sendly links list

# Paginate (--limit 1-200)
sendly links list --limit 20 --offset 20
```

#### Disable / Re-enable a Short Link

The per-link kill switch — a disabled link's redirect returns 404:

```bash
sendly links disable Ab3xY7

# Re-enable
sendly links disable Ab3xY7 --enable
```

### Credit Commands

#### Check Balance

```bash
sendly credits            # same as `credits balance`
sendly credits balance
```

Output includes:
- Available credits
- Reserved credits
- Total balance
- Estimated message capacity

#### View Transaction History

```bash
sendly credits history

# Limit results
sendly credits history --limit 20
```

Transaction types include `purchase`, `usage`, `bonus`, `refund` and `transfer` (credits moved between workspaces).

#### Transfer Credits Between Workspaces

You must own both workspaces, and the CLI must have one selected
(`sendly teams switch`). The credits come out of the workspace your credential
acts for: the selected workspace with a `sendly login` session, or the API
key's own workspace. When the API key in use belongs to a different workspace
than the selected one, or to none, the command stops before anything is
transferred and says why. Without `--to` or `--amount` it prompts:

```bash
sendly credits transfer --to org_abc123 --amount 500
sendly credits transfer --to org_abc123 --amount 500 --yes
```

### API Key Commands

#### List API Keys

```bash
sendly keys list
```

#### Create a New Key

```bash
sendly keys create --name "Production Key" --type live
```

`--type` is `test` (default) or `live`. The `sk_…` secret is shown once.

#### Inspect a Key

```bash
sendly keys get <keyId>
sendly keys usage <keyId>
```

`get` shows the prefix, type, scopes, status and last use; `usage` shows the
request and credit totals, a per-endpoint breakdown and recent requests.

#### Rename a Key

```bash
sendly keys rename key_abc123 --name "Staging"
```

#### Revoke a Key

```bash
sendly keys revoke key_abc123
sendly keys revoke key_abc123 --reason "Compromised" --yes
```

#### Rotate a Key

Generate a replacement key while keeping the old one valid for a grace period
(24-168 hours, default 24), so you can roll deployments over before the old key
expires:

```bash
sendly keys rotate key_abc123

# Keep the old key alive for 48 hours
sendly keys rotate key_abc123 --grace-period 48 --yes
```

The new `sk_…` secret is shown once — store it immediately.

### Webhook Commands

#### List Webhooks

```bash
sendly webhooks list
```

#### Listen for Webhooks Locally

Start a local tunnel to receive webhook events during development (similar to Stripe CLI):

```bash
sendly webhooks listen

# Forward to a specific URL (default: http://localhost:3000/webhook)
sendly webhooks listen --forward http://localhost:3000/webhook

# Listen for specific events
sendly webhooks listen --events message.delivered,message.failed

# Lifecycle events only
sendly webhooks listen --events rcs_agent.live,rcs_agent.rejected,number.activated
```

This opens a WebSocket session and displays:
- The webhook secret for signature verification
- A real-time event stream, each event verified locally before it is forwarded

`--events` defaults to **every event type the API emits**, so nothing is missed during local development. Pass `--events` yourself to narrow the stream. The full set is:

`message.sent`, `message.delivered`, `message.read`, `message.failed`, `message.bounced`, `message.retrying`, `message.received`, `message.opt_out`, `message.opt_in`, `verification.created`, `verification.delivered`, `verification.verified`, `verification.expired`, `verification.failed`, `verification.resent`, `verification.delivery_failed`, `conversation.created`, `conversation.updated`, `draft.created`, `draft.approved`, `draft.rejected`, `contact.auto_flagged`, `contact.marked_valid`, `contacts.lookup_completed`, `contacts.bulk_marked_valid`, `brand.verified`, `brand.failed`, `campaign.approved`, `campaign.rejected`, `campaign.suspended`, `assignment.confirmed`, `assignment.failed`, `rcs_brand.verified`, `rcs_brand.failed`, `rcs_agent.testing`, `rcs_agent.live`, `rcs_agent.rejected`, `rcs_agent.action_required`, `port.completed`, `port_out.requested`, `port_out.completed`, `port_out.rejected`, `port_out.cancelled`, `number.activated`, `number.failed`, `number.requirements_required`, `number.released`, `whatsapp_account.connected`, `whatsapp_account.failed`, `whatsapp_template.approved`, `whatsapp_template.rejected`, `whatsapp_template.paused`, `call.started`, `call.completed`, `call.recording.ready`, `short_code.action_required`, `short_code.rejected`, `short_code.filed`, `short_code.live`, `short_code.suspended`, `short_code.reactivated`, `short_code.payment_succeeded`, `short_code.payment_failed`.

#### Handling Lifecycle Events

`sendly webhooks listen` forwards each event to your local URL **verbatim**: the same JSON body Sendly POSTs to a registered webhook. It never reshapes the payload, so the object you want is always `data.object` in the forwarded request body — never `data` itself, and never a top-level field.

`data.object` is a message only on `message.*` events. Every lifecycle event — `rcs_*`, `whatsapp_*`, `call.*`, `brand.*`, `campaign.*`, `assignment.*`, `number.*`, `port*`, `short_code.*` — carries a different object, so branch on `type` before you read a field:

```json
{
  "id": "5c9f4b2e-1d7a-4a1b-9f3c-8e6d2a0b1c34",
  "type": "rcs_agent.live",
  "api_version": "2024-01",
  "created": 1757246400,
  "livemode": true,
  "data": {
    "object": {
      "agent_id": "agt_7f2a91c4",
      "name": "Acme Support",
      "stage": "live",
      "organization_id": "org_3b8d15ea"
    }
  }
}
```

A handler that covers both kinds:

```javascript
import express from 'express';

const app = express();
// Keep the raw body — you need the exact bytes to verify the signature.
app.use('/webhook', express.raw({ type: 'application/json' }));

app.post('/webhook', (req, res) => {
  const event = JSON.parse(req.body.toString('utf8'));
  const object = event.data.object; // raw payload, never reshaped

  switch (event.type) {
    case 'message.delivered':
      console.log(`message ${object.id} delivered to ${object.to}`);
      break;

    case 'rcs_agent.live':
      console.log(`RCS agent ${object.agent_id} (${object.name}) is ${object.stage}`);
      break;

    case 'contact.auto_flagged':
      // object.id is the CONTACT id on this event. The message that
      // triggered the flag is object.message_id.
      console.log(`contact ${object.id} flagged: ${object.invalid_reason}`);
      break;

    default:
      console.log(event.type, object);
  }

  res.sendStatus(200);
});

app.listen(3000);
```

Then point the listener at it:

```bash
sendly webhooks listen --forward http://localhost:3000/webhook
```

#### Create Webhook

```bash
sendly webhooks create --url https://myapp.example/webhook --events message.delivered,message.failed

# With description and mode
sendly webhooks create \
  --url https://myapp.example/webhook \
  --events message.delivered,message.failed,message.bounced \
  --description "Production webhook" \
  --mode live
```

`--mode` is `all` (default), `test` (sandbox events only) or `live` (production only). The URL must be `https://`: the API refuses `http://` whatever the host, `localhost` included, so the command refuses it before sending. To receive events on your machine, use `sendly webhooks listen`. The signing secret is printed once on creation.

#### Get Webhook Details

```bash
sendly webhooks get whk_abc123
```

Shows the events, mode, active flag, recent failure count and the circuit-breaker state (`closed`, `open` or `half_open`).

#### Update Webhook

```bash
sendly webhooks update whk_abc123 --url https://myapp.example/webhook

# Update events
sendly webhooks update whk_abc123 --events message.delivered,message.bounced

# Disable / re-enable
sendly webhooks update whk_abc123 --no-active
sendly webhooks update whk_abc123 --active
```

#### Delete Webhook

```bash
sendly webhooks delete whk_abc123

# Skip confirmation
sendly webhooks delete whk_abc123 --yes
```

#### Test Webhook

```bash
sendly webhooks test whk_abc123
```

#### View Delivery History

```bash
sendly webhooks deliveries whk_abc123

# Show only failed deliveries
sendly webhooks deliveries whk_abc123 --failed-only --limit 20
```

#### Replay and Repair Deliveries

```bash
# Requeue failed/cancelled deliveries from the audit log
sendly webhooks redeliver whk_abc123
sendly webhooks redeliver whk_abc123 --since "$(node -p 'new Date(Date.now() - 3 * 86400000).toISOString()')" --limit 5000
sendly webhooks redeliver whk_abc123 --event-types message.delivered,message.failed --statuses failed

# Synthesize events that an outage left with no audit row
sendly webhooks backfill whk_abc123
sendly webhooks backfill whk_abc123 --since "$(node -p 'new Date(Date.now() - 3 * 86400000).toISOString()')" --limit 5000

# Clear an open circuit breaker so deliveries resume
sendly webhooks reset-circuit whk_abc123
```

`redeliver` and `backfill` default to the last 24 hours and a limit of 1000 (max 10000), and the window from `--since` to `--until` can be at most 7 days; `redeliver` defaults to the `failed,cancelled` statuses. Reset the circuit first if it is open.

#### Rotate Webhook Secret

```bash
sendly webhooks rotate-secret whk_abc123
sendly webhooks rotate-secret whk_abc123 --yes
```

Deliveries are signed with the new secret as soon as the rotation returns, and the old secret stops verifying straight away (the `grace_period_hours` field in the `--json` output is not applied). Let your endpoint accept both secrets while you deploy the new one, and requeue any deliveries that failed in between with `sendly webhooks redeliver`. The new secret is shown once.

### Events Commands

Stream real-time account events over Server-Sent Events — message deliveries, conversation updates and more. This is the account event stream, not the webhook tunnel:

```bash
sendly events listen
sendly events listen --types new_message,conversation_update
sendly events listen --json
```

### Team Commands

```bash
sendly teams list
sendly teams current
sendly teams create --name "Acme Corp" --description "Our main team"
sendly teams switch                        # pick interactively
sendly teams switch <org-id-or-slug>
sendly teams switch clear                  # back to your personal workspace
sendly teams members
sendly teams invite user@acme.example --role admin
```

`--role` is `admin`, `member` or `viewer`. The selected team is sent on every request, and `SENDLY_ORG_ID` overrides it for one shell.

### Enterprise Commands

For enterprise accounts that manage customer workspaces.

```bash
sendly enterprise status
sendly enterprise billing --period 7d
sendly enterprise billing --page 2

# Workspaces
sendly enterprise workspaces list
sendly enterprise workspaces create --name "Acme Corp"
sendly enterprise workspaces get 3d1f8a2b-6c4e-4f7a-9b0d-2e5c7a9f1b3d
sendly enterprise workspaces suspend 3d1f8a2b-6c4e-4f7a-9b0d-2e5c7a9f1b3d --reason "Policy violation"
sendly enterprise workspaces resume 3d1f8a2b-6c4e-4f7a-9b0d-2e5c7a9f1b3d
sendly enterprise workspaces delete 3d1f8a2b-6c4e-4f7a-9b0d-2e5c7a9f1b3d --yes
sendly enterprise workspaces delete 3d1f8a2b-6c4e-4f7a-9b0d-2e5c7a9f1b3d --yes --release-numbers

# Provision a workspace that inherits a verified workspace's verification
sendly enterprise provision --name "Acme Corp" --inherit-from 3d1f8a2b-6c4e-4f7a-9b0d-2e5c7a9f1b3d
sendly enterprise provision --name "Acme Corp" --inherit-from 3d1f8a2b-6c4e-4f7a-9b0d-2e5c7a9f1b3d \
  --credits 1000 --credits-from 7a9c2e4f-1b3d-4c5e-8f0a-6b8d0f2a4c6e --create-key

# Or up to 100 from a JSON file
sendly enterprise provision --bulk workspaces.json --credits-from 7a9c2e4f-1b3d-4c5e-8f0a-6b8d0f2a4c6e

# Credits and quotas
sendly enterprise credits 3d1f8a2b-6c4e-4f7a-9b0d-2e5c7a9f1b3d
sendly enterprise transfer-credits --from 7a9c2e4f-1b3d-4c5e-8f0a-6b8d0f2a4c6e --to 9e2b4d6f-8a0c-4e1f-a3b5-c7d9e1f3a5b7 --amount 500
sendly enterprise quota get 3d1f8a2b-6c4e-4f7a-9b0d-2e5c7a9f1b3d
sendly enterprise quota set 3d1f8a2b-6c4e-4f7a-9b0d-2e5c7a9f1b3d --monthly 25000
sendly enterprise quota set 3d1f8a2b-6c4e-4f7a-9b0d-2e5c7a9f1b3d --monthly unlimited

# Keys
sendly enterprise keys list 3d1f8a2b-6c4e-4f7a-9b0d-2e5c7a9f1b3d
sendly enterprise keys create 3d1f8a2b-6c4e-4f7a-9b0d-2e5c7a9f1b3d --name "Production" --type live
sendly enterprise keys revoke 3d1f8a2b-6c4e-4f7a-9b0d-2e5c7a9f1b3d key_xyz --yes

# Enterprise-level webhook (one per account)
sendly enterprise webhooks get
sendly enterprise webhooks set --url https://myapp.example/webhook --events "message.sent,message.delivered"
sendly enterprise webhooks rotate-secret
sendly enterprise webhooks test
sendly enterprise webhooks delete --yes

# Verification
sendly enterprise verification get 3d1f8a2b-6c4e-4f7a-9b0d-2e5c7a9f1b3d
sendly enterprise verification submit 3d1f8a2b-6c4e-4f7a-9b0d-2e5c7a9f1b3d --data ./verification.json
sendly enterprise verification resubmit 3d1f8a2b-6c4e-4f7a-9b0d-2e5c7a9f1b3d --contact-email new@acme.example
sendly enterprise upload-verification-document --file ./ein-letter.pdf
sendly enterprise generate-business-page --name "Acme Services" --use-case "Appointment Reminders"

# Analytics
sendly enterprise analytics overview
sendly enterprise analytics messages --period 30d
sendly enterprise analytics credits
sendly enterprise analytics delivery
```

`provision` needs `--inherit-from`: a workspace you own that has a verification, or your personal workspace when your account has one. The CLI checks it before anything is created. `--credits` moves credits out of the `--credits-from` workspace, and `--create-key` creates a test key named `<name> key`, printed once. `--webhook-url` (https only) sets your enterprise-wide webhook, not one for this workspace. The API creates the workspace before it checks that the source's verification is active, so when it refuses with `Source workspace has no active verification`, find the new workspace with `sendly enterprise workspaces list` and delete it. Workspace IDs are UUIDs, as in the examples above; `sendly enterprise workspaces list` shows them.

The `--bulk` file is a JSON array of workspaces:

```json
[
  { "name": "Acme East", "sourceWorkspaceId": "3d1f8a2b-6c4e-4f7a-9b0d-2e5c7a9f1b3d", "credits": 500 },
  { "name": "Acme West", "sourceWorkspaceId": "3d1f8a2b-6c4e-4f7a-9b0d-2e5c7a9f1b3d" }
]
```

An item's `credits` come from its own `creditSourceWorkspaceId`, or from `--credits-from`; `credits` with no source, or that is not a positive whole number, is dropped and a warning names the item. `creditAmount` is sent as written: without a source it is silently ignored, and a value that is not a positive whole number makes the API refuse the whole file, as does a credit source that is not a UUID (the item's `creditSourceWorkspaceId`, or `--credits-from` for an item that moves credits). Bulk provisioning cannot create keys (`createApiKey` is dropped with a warning) or set a webhook (an item with `webhookUrl` is refused before anything is sent).

`billing --period` is `7d`, `30d` (the default) or `90d`. `analytics credits` reports all-time totals, because the API ignores `--period` for it. A workspace quota is monthly only: `quota set --daily` on its own is refused, and with `--monthly` the `--daily` value is ignored with a warning. `webhooks set` prints the signing secret only when it first creates the webhook; `webhooks rotate-secret` issues a new one, printed once, and deliveries are signed with it straight away.

`verification submit` and `resubmit` are partial updates against the same endpoint: only the fields you pass change.

### Business Upgrade Commands

Move a workspace onto a new business entity (sole proprietor → LLC, say). It
reserves a new toll-free number under the new entity and submits it for
carrier review.

```bash
# Dry-run the candidate details against the carrier rules
sendly business-upgrade preflight --business-name "Acme LLC" --brn "12-3456789" \
  --brn-type EIN --entity-type PRIVATE_PROFIT
sendly business-upgrade preflight --candidate ./candidate.json --json

# Start the upgrade
sendly business-upgrade start --workspace ws_abc --business-name "Acme Holdings LLC" \
  --brn "12-3456789" --brn-type EIN --entity-type PRIVATE_PROFIT --ein-doc ./CP-575.pdf

sendly business-upgrade status --workspace ws_abc
sendly business-upgrade resubmit --workspace ws_abc --use-case-summary "Updated summary"
sendly business-upgrade cancel --workspace ws_abc --yes

# After approval, say what happens to the old toll-free number
sendly business-upgrade disposition --workspace ws_abc --disposition released
```

`--brn-type` is one of `EIN`, `SSN`, `DUNS`, `CRA`, `VAT`, `LEI`, `OTHER`. `--disposition moved` also needs `--target-workspace`.

You must own the workspace. With a `sendly login` session that is all. An API key also has to belong to that workspace (a key created without one counts as your personal workspace's); otherwise every command returns `403 forbidden`. `start`, `resubmit`, `cancel` and `disposition` change your carrier setup, so they also need a live key (`403 live_key_required`) with the `numbers:write` scope (`403 insufficient_permissions`). An enterprise master key can act on any workspace you own.

A `released` disposition is refused with `409 number_in_use` while another workspace still uses the old number; choose `moved` instead. Once a choice is recorded, another one gets `409 already_disposed`.

### Countries

Supported countries with pricing. No authentication required, so you can browse before signing up:

```bash
sendly countries
sendly countries --search GB
sendly countries --tier domestic
sendly countries --json
```

Each row shows the country and dial code, the pricing tier, credits per SMS, the USD price, and whether the destination requires sender registration (Australia, Singapore and India, for instance; the US and Canada show as not required).

### Logs Commands

#### Tail Logs

Stream your message log. The command reads your 50 newest messages every 2 seconds and prints each one once, oldest first:

```bash
sendly logs tail

# Only messages with this status (queued, sent, delivered, failed, ...)
sendly logs tail --status failed

# Start further back (e.g. 30m, 1h, 1d; default 1h)
sendly logs tail --since 1d
```

It keeps the messages created inside the `--since` window that have the `--status` you asked for; a message that reaches that status later is printed when it does. `--type` accepts only `message`, the one kind of log there is, and exits with an error for anything else.

A server error, a timeout or dropped connection, or a rate limit prints one warning and polling continues; after a rate limit the next poll waits the `retryAfter` the API sends, up to a minute. Any other refusal stops the command with the server's message and exit code 1, and so does a block on API keys from your address (`429 too_many_failed_key_attempts`). A `sendly login` session is a test credential, so it tails sandbox messages only: set `SENDLY_API_KEY` to a live key to tail live traffic.

### Configuration Commands

The config file holds four editable keys: `environment`, `baseUrl`, `defaultFormat` and `colorEnabled`. `defaultFormat` and `colorEnabled` are stored but not applied: output is JSON with `--json` or when stdout is not a TTY, and color follows `FORCE_COLOR`. `environment` is set for you from the key you log in with.

```bash
sendly config list
sendly config get baseUrl
sendly config set baseUrl https://sendly.live
```

### Diagnostics

```bash
sendly doctor
```

This checks:
- The credential in use: an API key's presence and format, or a `sendly login` session (accepted, in test mode)
- The API host in effect, and where it came from
- Network reachability
- Clock drift against the server (drift breaks webhook signature verification)
- Credit balance
- Environment (CI mode, color, `SENDLY_API_KEY`)
- Config file location and permissions
- Locally installed AI agent tooling

`sendly doctor --json` prints only the JSON report and always exits 0, so check `summary.errors` in scripts; without `--json`, `sendly doctor` exits non-zero when a check fails. A passing session check does not mean every command will run with it: sending messages, the enterprise commands, and the verification code, template, contact and campaign commands need an API key.

### Utility Commands

#### Account Status Dashboard

```bash
sendly status
```

Shows account overview including:
- Email and account tier
- Verification status, sender ID or toll-free number
- Send capabilities (sandbox, international, US & Canada)
- Credit balance and reserved credits
- Active API keys and webhooks
- Recent messages (sandbox messages only with a `sendly login` session) and any next steps

#### Onboarding

```bash
sendly onboarding
```

Runs the interactive quick-start for a new account. New browser logins are offered it automatically. Choosing the development setup creates a test key named `CLI Development Key` with your `sendly login` session and saves it for the CLI to use; from then on the stored key, not the session, is the credential commands use. Try it with `sendly sms send --to +15005550000 --text "Hello from CLI!"`.

#### Trigger Test Event

For testing with `webhooks listen`, which must already be running in another terminal:

```bash
sendly trigger message.delivered
sendly trigger message.bounced
```

Valid types: `message.sent`, `message.delivered`, `message.failed`, `message.bounced`, `message.retrying`, `message.received`.

## Sandbox Testing

A test key (`sk_test_v1_…`) puts the CLI in test mode: sends are simulated, cost
no credits and need no verification. These numbers drive the outcome:

| Number | Behavior |
|--------|----------|
| +15005550000 | Success (instant) |
| +15005550001 | Fails: `Invalid phone number` |
| +15005550002 | Fails: `Cannot route to destination` |
| +15005550003 | Fails: `Queue full, try again later` |
| +15005550004 | Fails: `Rate limit exceeded` |
| +15005550006 | Fails: `Carrier violation` |

Any other number succeeds.

```bash
sendly login --api-key sk_test_v1_your_key
sendly sms send --to "+15005550000" --text "Sandbox check"
sendly sms list --sandbox
```

## Environment Variables

Override CLI configuration with environment variables:

| Variable | Description |
|----------|-------------|
| `SENDLY_API_KEY` | API key for authentication (outranks the stored key) |
| `SENDLY_BASE_URL` | API base URL (default: `https://sendly.live`) |
| `SENDLY_API_URL` | Older spelling of `SENDLY_BASE_URL`; used only when `SENDLY_BASE_URL` is unset |
| `FORCE_COLOR` | Set to `0` to disable colored output (`TERM=dumb` also works) |
| `SENDLY_TIMEOUT` | Request timeout in milliseconds (default: `30000`) |
| `SENDLY_MAX_RETRIES` | Maximum retry attempts (default: `3`) |
| `SENDLY_ORG_ID` | Override the active workspace for one shell |
| `SENDLY_CONFIG_KEY` | Encryption key for the config file (for CI/CD) |
| `CI` | Treated as CI mode: `teams create` skips its "Switch to this team now?" prompt, `teams switch` with no argument fails instead of prompting, and `sendly doctor` reports it. It does not turn off other prompts or the update banner; set `SENDLY_SKIP_NEW_VERSION_CHECK=true` to silence the banner |

### Which API host a command talks to

The base URL is resolved once per command, highest priority first:

1. An explicit per-command flag, where a command offers one (none do today).
2. `SENDLY_BASE_URL`
3. `SENDLY_API_URL`
4. `baseUrl` in the config file (`sendly config set baseUrl https://...`)
5. `https://sendly.live`

An empty or whitespace-only variable counts as unset. A value from the
environment must be a scheme and host with no path, query or fragment — the CLI
appends the API path itself, so `https://acme.example/api/v1` is rejected rather
than turned into `https://acme.example/api/v1/api/v1/messages`.

#### Hosts the CLI will send credentials to

`SENDLY_BASE_URL` and `SENDLY_API_URL` come from the ambient environment, so the
CLI will not hand your API key to just any host they name:

| Host | Allowed |
|------|---------|
| `https://sendly.live` and its subdomains | Always |
| Loopback (`localhost`, `*.localhost`, `127.0.0.0/8`, `::1`), http or https | Always |
| Any other host, over `https://`, with a test key (`sk_test_…`) or no stored credential | Allowed |
| Any other host, over plain `http://` | Refused — cleartext |
| Any other host, with a live key (`sk_live_…`) or a `sendly login` session | Refused |

A stored `sendly login` session is never sent to any other host, to refresh it or to sign it out, even after it has expired and even while a test key is the credential in use.

A refusal names the host and what to do instead, and no request is made. If you
genuinely need a live key pointed at another host, store it deliberately with
`sendly config set baseUrl https://...`; the stored value is your own explicit
local setting and is used as written.

Only commands that actually open a connection fail on a bad value. Read-only
commands (`sendly config list`, `sendly whoami`, `sendly doctor`) keep working
and report the problem: in `--json` output, `effectiveBaseUrl` (`config list`) or
`baseUrl` (`whoami`) is `null` and `baseUrlError` carries the reason; `doctor`
fails its Base URL check.

`sendly config get baseUrl` and the `baseUrl` field of `sendly config list`
report what is stored in the config file. To see the host actually in use, run
`sendly whoami` (or read `effectiveBaseUrl` from `sendly config list --json`).

```bash
# Point every command at a local server for one shell session
export SENDLY_BASE_URL=http://localhost:5001
sendly whoami
```

## Retries, Timeouts and Rate Limits

Each request is given `SENDLY_TIMEOUT` milliseconds (30 seconds by default) before it is aborted. A request that times out is reported (`This operation was aborted`) and not retried.

The CLI retries network failures and `5xx` responses, up to
`SENDLY_MAX_RETRIES` times (3 by default), backing off 1s, 2s, 4s, 8s and
capping at 10s. It also retries one `429`: `too_many_concurrent_verifications`
means too many checks of your API key were running at once, so the request
never ran. The CLI waits the second the API asks for (never more than a minute)
and sends it again, within the same retry budget. Apart from the session
refresh after a `401` described below, every other `4xx` is final:

- `429 rate_limit_exceeded` reports how long to wait (`Retry after`) and leaves the decision to you.
- `429 too_many_failed_key_attempts` means API keys from your address were refused too many times and are blocked for the time shown. It is never retried: check the key in `SENDLY_API_KEY` or your CLI config before you try again.

Requests are counted per API key in a fixed 60-second window that opens with the first request in it:

| Key | Requests per minute |
|-----|---------------------|
| Test (`sk_test_v1_*`) | 60 |
| Live (`sk_live_v1_*`) | 600 |
| Enterprise master key | 3000 |

Every retry carries the same `Idempotency-Key` as the first attempt, the
auto-generated one or yours (`sms batch` sends one only when you pass it), and
so do retried uploads. The API records its
answer under a key for a `2xx` or a `4xx` other than `429`, and replays it for
24 hours. It never records a `5xx` or a `429`, so a retry after one of those
runs the request again. If the API finished a send but a gateway returned the
`5xx`, the retry gets the recorded answer and nothing is sent twice. Because a
timed-out request is not retried, pass `--idempotency-key` on sends you may need
to re-run, and re-run them with the same key.

A 401 on a browser-login session triggers one token refresh and one replay
before the command gives up.

## Webhook Signature Verification

`sendly webhooks listen` signs every forwarded request the same way Sendly signs a production delivery, so one handler covers both. On each forwarded request it sets:

| Header | Value |
| --- | --- |
| `X-Sendly-Signature` | `sha256=<hex digest>` |
| `X-Sendly-Timestamp` | Unix seconds |
| `X-Sendly-Event` | The event type (a production delivery sends this as `X-Sendly-Event-Type` — read `type` from the body to cover both) |
| `X-Sendly-Event-Id` | The event id |

The signed string is `<timestamp>.<raw request body>`, so verify against the raw bytes before parsing. This continues the Express handler shown above, which keeps the raw body:

```javascript
import crypto from 'crypto';

function verifyWebhook(rawBody, signature, timestamp, secret) {
  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`, 'utf8')
    .digest('hex');

  const a = Buffer.from(signature ?? '');
  const b = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch — check first.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

app.post('/webhook', (req, res) => {
  const rawBody = req.body.toString('utf8');

  const ok = verifyWebhook(
    rawBody,
    req.get('X-Sendly-Signature'),
    req.get('X-Sendly-Timestamp'),
    process.env.SENDLY_WEBHOOK_SECRET,
  );
  if (!ok) return res.sendStatus(400);

  const event = JSON.parse(rawBody);
  console.log(event.type, event.data.object);
  res.sendStatus(200);
});
```

`sendly webhooks listen` prints the secret to use when it starts, and verifies each event with it before forwarding — a tampered event is reported and dropped. For a registered webhook, the secret is shown once when you run `sendly webhooks create`, and you can mint a new one with `sendly webhooks rotate-secret <id>`.

## CI/CD Usage

For non-interactive environments:

```bash
# Authenticate with an environment variable
export SENDLY_API_KEY=sk_live_v1_your_key

sendly sms send --to "+15125550123" --text "Hello!"

# Or store a key on the machine once
sendly login --api-key sk_live_v1_your_key

# Output is JSON automatically when stdout is not a TTY
sendly credits balance | jq '.availableBalance'
```

There is no per-command `--api-key` flag: `SENDLY_API_KEY` or `sendly login --api-key` is how a key gets in. Set `SENDLY_CONFIG_KEY` if several CI jobs share a home directory, and `SENDLY_ORG_ID` to pin the workspace.

## Configuration Storage

Configuration is stored, encrypted, in:
- **macOS/Linux**: `~/.sendly/config.json`
- **Windows**: `%USERPROFILE%\.sendly\config.json`

The encryption key is derived from the machine unless `SENDLY_CONFIG_KEY` is set. A config file that cannot be decrypted (copied from another machine, or a changed `SENDLY_CONFIG_KEY`) is moved aside and a fresh one is started, so run `sendly login` again if that happens.

## Requirements

- Node.js 18.0.0 or higher
- A Sendly account ([sign up free](https://sendly.live))

## Documentation

- [CLI Documentation](https://sendly.live/docs/cli)
- [API Reference](https://sendly.live/docs/api)
- [Sendly Dashboard](https://sendly.live/dashboard)

## Support

- [GitHub Issues](https://github.com/SendlyHQ/sendly-cli/issues)
- Email: support@sendly.live

## License

MIT
