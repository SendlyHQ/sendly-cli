<p align="center">
  <img src="https://raw.githubusercontent.com/SendlyHQ/sendly-cli/main/.github/header.svg" alt="Sendly CLI" />
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@sendly/cli"><img src="https://img.shields.io/npm/v/@sendly/cli.svg?style=flat-square" alt="npm version" /></a>
  <a href="https://github.com/SendlyHQ/sendly-cli/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/@sendly/cli.svg?style=flat-square" alt="license" /></a>
</p>

# @sendly/cli

Official command-line interface for the [Sendly](https://sendly.live) SMS API.

## Installation

```bash
# npm
npm install -g @sendly/cli

# or Homebrew (macOS / Linux)
brew install SendlyHQ/tap/sendly
```

## Staying up to date

The CLI checks npm once a day and prints a one-line banner after your command if a newer version is out. Run `sendly upgrade` to update — it auto-detects your install path (Homebrew vs npm) and runs the right command. Use `sendly upgrade --check` to see what it would do without executing.

Banner is silent in CI (`CI=true`) and offline-safe.

## Quick Start

```bash
# Login to your Sendly account
sendly login

# Send an SMS
sendly sms send --to "+15551234567" --text "Hello from Sendly CLI!"

# Check your credit balance
sendly credits balance
```

## Authentication

The CLI supports two authentication methods:

### Browser Login (Recommended)

```bash
sendly login
```

This opens your browser to authenticate via Sendly's secure login flow. After authorization, your credentials are stored locally.

### API Key Login

```bash
sendly login --api-key sk_test_v1_your_key
```

Or interactively:

```bash
sendly login -i
```

### Check Authentication Status

```bash
sendly whoami
```

### Logout

```bash
sendly logout
```

## Commands

### SMS Commands

#### Send a Message

```bash
sendly sms send --to "+15551234567" --text "Hello!"

# Send from a number you own (E.164) — see Numbers Commands below
sendly sms send --to "+15551234567" --text "Hello!" --from "+447111111111"

# Or an alphanumeric sender ID (international)
sendly sms send --to "+447700900000" --text "Hello!" --from "MyBrand"
```

#### List Messages

```bash
sendly sms list

# Filter by status
sendly sms list --status delivered

# Limit results
sendly sms list --limit 10
```

#### Get Message Details

```bash
sendly sms get msg_abc123
```

#### Send Batch Messages

```bash
# From a JSON file
sendly sms batch --file messages.json

# From a CSV file (phone-only with shared text)
sendly sms batch --file phones.csv --text "Your order is ready!"

# Multiple recipients inline
sendly sms batch --to "+15551234567,+15559876543" --text "Hello everyone!"

# Preview before sending (dry run) - validates without sending
sendly sms batch --file messages.json --dry-run

# Dry run output includes:
# - Per-country breakdown with credit costs
# - Blocked messages and reasons
# - Your messaging access (domestic/international)
# - Credit balance check
```

#### Send a Group MMS

Send to 2-8 recipients (US & Canada only) in a single group thread — everyone
sees the group and replies fan out to all participants. Group messaging is an
A2P 10DLC capability, so the sending number must be an MMS-enabled,
10DLC-registered number you own (omit `--from` to use your default sender).

```bash
sendly sms group --to "+14155551234,+14155555678" --text "Team sync at noon?"

# Attach media
sendly sms group --to "+14155551234,+14155555678" --media-url https://example.com/flyer.jpg

# Marketing (applies quiet-hours rules; group MMS defaults to transactional)
sendly sms group --to "+14155551234,+14155555678" --text "Sale!" --type marketing
```

#### Schedule a Message

```bash
sendly sms schedule --to "+15551234567" --text "Reminder!" --at "2025-12-25T10:00:00Z"
```

#### List Scheduled Messages

```bash
sendly sms scheduled
```

#### Cancel a Scheduled Message

```bash
sendly sms cancel sched_abc123
```

#### Idempotent Sends

Every send command (`sms send`, `sms group`, `sms schedule`, `sms batch`, `rcs send`, `whatsapp send`) accepts `--idempotency-key` (1-255 printable ASCII characters). Re-running with the same key within 24 hours returns the original result instead of sending again, so a crashed script or CI job is safe to re-run. Without the flag, non-batch sends carry an auto-generated `Idempotency-Key` that is reused across the CLI's own network-error retries, so a retry of a request that already reached the API does not send twice.

```bash
sendly sms send --to "+15551234567" --text "Your order has shipped!" --idempotency-key "order-4821-shipped"
```

### Numbers Commands

Buy international phone numbers and send from them. (US & Canada use toll-free
verification instead — they can't be bought.)

#### Search Available Numbers

```bash
sendly numbers search --country GB --type mobile
```

#### Buy a Number

```bash
sendly numbers buy --country GB --type mobile
```

The buy is asynchronous: the number starts as `provisioning` and becomes
`active` once the carrier confirms it. Some countries need documents or
business details first — you'll get a hosted link to complete them. See
[How to buy a number](https://sendly.live/docs/how-to/buy-a-number).

#### List Your Numbers

```bash
sendly numbers list
```

Pass the `phoneNumber` of any `active` number as `--from` on a send to send
from it (see [Send from a number you own](https://sendly.live/docs/how-to/send-from-owned-number)):

```bash
sendly sms send --to "+15551234567" --text "Hi!" --from "+447111111111"
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
Add `--yes` to skip the confirmation prompt.

### 10DLC Commands

Register your brand and messaging campaigns for carrier review so you can
send from US local (10-digit) numbers. The flow is brand → qualify →
campaign → assign number. Requires a live API key.

#### Register a Brand

```bash
sendly 10dlc brands create --legal-name "Acme Inc" --ein "12-3456789" --website https://acme.com
```

#### Check Brand Status

Carrier review starts as `pending` and becomes `verified` (or `failed`).
Running `get` refreshes the status:

```bash
sendly 10dlc brands list
sendly 10dlc brands get <brandId>
```

#### Qualify a Use Case

Pre-check that a use case is accepted for your brand before creating a
campaign:

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

Poll until the campaign is `active`:

```bash
sendly 10dlc campaigns get <campaignId>
```

#### Assign a Number

Attach a US local number you own to the active campaign to make it sendable:

```bash
sendly 10dlc campaigns assign <campaignId> --number "+15551234567"
sendly 10dlc assignments list
```

Then send from it:

```bash
sendly sms send --to "+15559876543" --text "Hi!" --from "+15551234567"
```

### WhatsApp Commands

Connect a number you own to WhatsApp and message customers over it —
free-form text inside the 24-hour reply window, approved templates any time.
One-time $19 connection fee, no monthly fee. Connecting, managing templates,
and editing profiles require a live API key. WhatsApp is rolling out
gradually; if these commands report it isn't available yet, contact
support@sendly.live for early access.

#### Connect a Number

```bash
sendly whatsapp connect --number "+15559876543"
```

Prints a secure link a person must open and sign in with Facebook to finish
connecting; the command waits until the sender is active.

#### Check Connection Status

Defaults to your most recent connection attempt:

```bash
sendly whatsapp status

# Or a specific signup
sendly whatsapp status 3f6a1c9e-0000-0000-0000-000000000000
```

#### List WhatsApp Senders

```bash
sendly whatsapp senders
```

#### Send a Message

```bash
# Free-form text (only inside the 24-hour reply window)
sendly whatsapp send --to "+15551234567" --from "+15559876543" --text "Your table is ready!"

# Approved template (reaches contacts any time)
sendly whatsapp send --to "+447700900123" --from "+15559876543" \
  --template order_shipped --language en_US --var 1=TinyFat --var 2=4821
```

#### Manage Templates

Templates are reviewed by Meta (typically 24-48h) and are the only way to
message outside the 24-hour window. Every `{{n}}` body variable needs an
`--example n=value`:

```bash
sendly whatsapp templates list

sendly whatsapp templates create --sender "+15559876543" --name order_shipped \
  --language en_US --category utility \
  --body "Hi {{1}}, order {{2}} shipped!" --example 1=TinyFat --example 2=4821

# Edit an approved or rejected template and resubmit it for review
sendly whatsapp templates update 3f6a1c9e-0000-0000-0000-000000000000 \
  --body "Hi {{1}}, your order shipped!" --example 1=TinyFat

# Delete (Meta reserves the name for up to 30 days)
sendly whatsapp templates delete 3f6a1c9e-0000-0000-0000-000000000000
```

#### Business Profile

The profile customers see when they tap your business name in WhatsApp:

```bash
sendly whatsapp profile get "+15559876543"

sendly whatsapp profile update "+15559876543" \
  --about "Family-run bakery in Austin" --website https://example.com
```

### RCS Commands

Send RCS messages from your brand's verified RCS agent — rich text with
tappable suggestion chips, or rich cards with images. Recipients whose device
doesn't support RCS automatically get the text delivered as plain SMS (rich
cards have no SMS form). Requires a live API key — RCS delivery is never
simulated on a test key. RCS is rolling out gradually; once it is enabled for
your account you register your brand and agent from the CLI (below) — contact
support@sendly.live for early access.

#### Register Your Brand and Agent

The flow is brand → agent → submit → testing → request launch. Drafts are
saved as you go; required fields are only checked when you submit. Every
step is also available in the dashboard, and both see the same registration.
Registration commands need an API key with the `rcs:read` / `rcs:write`
scopes (or a `sendly login` session).

Start from what Sendly already knows about your business (your 10DLC brand
or toll-free verification), then draft the brand:

```bash
sendly rcs dossier --json > brand.json     # prefilled details; edit as needed
sendly rcs brands create --from-json brand.json --ein 12-3456789 \
  --legal-entity-type CORPORATION --organization-type PRIVATE_PROFIT
# or one field per flag:
sendly rcs brands create --display-name "Acme" --legal-name "Acme Inc" \
  --website https://acme.com --address-line1 "1 Main St" --city Austin \
  --state TX --postal-code 78701 --contact-first-name Jane \
  --contact-last-name Doe --contact-email jane@acme.com \
  --contact-phone +15125550100
sendly rcs brands update <brandId> --stock-symbol NASDAQ:ACME
```

Draft the agent under the brand. Logo, hero image and any opt-in screenshot
must already be public `https://` URLs — assets can't be uploaded from the
CLI (use the dashboard for that):

```bash
sendly rcs agents create --brand <brandId> --display-name "Acme" \
  --use-case TRANSACTIONAL --description "Order updates from Acme" \
  --logo-url https://acme.com/logo.png --hero-url https://acme.com/hero.png \
  --brand-color "#1E90FF" --privacy-policy-url https://acme.com/privacy \
  --terms-url https://acme.com/terms --website https://acme.com --website-label Acme
sendly rcs agents get <agentId>
```

Submit for review. Sendly checks the brand and agent, then sends them to the
carrier network; you're emailed when anything changes or needs attention:

```bash
sendly rcs agents submit <agentId>
sendly rcs registration        # where things stand, and what to do next
```

Once the agent is in testing, invite test devices (the list you pass replaces
the current one), send them a message, and add the campaign details the
launch review needs:

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
  --call-to-action-url https://acme.com/checkout \
  --call-to-action-media-url https://acme.com/optin.png \
  --no-double-opt-in \
  --opt-in-message "Welcome to Acme updates. Reply STOP to opt out." \
  --help-response "Acme support: help@acme.com" \
  --opt-out-response "You are unsubscribed from Acme updates."
```

Then request launch with a recording or screenshots of the agent on a test
device:

```bash
sendly rcs agents request-launch <agentId> --test-url https://acme.com/rcs-test.mp4
```

`brands create`, `brands update`, `agents create` and `agents update` accept
`--from-json <file>` for the full nested body (flags override fields in the
file); every write accepts `--idempotency-key`. Field errors come back as
`path: message` pairs (and as an `errors` array with `--json`).

#### Send a Message

```bash
sendly rcs send --to "+15125550190" --text "Your order shipped!"

# With suggestion chips
sendly rcs send --to "+15125550190" --text "Need anything else?" \
  --suggest-reply "Track order=TRACK" \
  --suggest-url "View receipt=RECEIPT=https://example.com/r/4821"

# Rich card (RCS-capable recipients only)
sendly rcs send --to "+15125550190" \
  --card-title "Spring sale" \
  --card-description "20% off everything this weekend" \
  --card-media https://example.com/sale.jpg

# Fail instead of falling back to SMS
sendly rcs send --to "+15125550190" --text "RCS only please" --no-fallback
```

The output shows what actually happened: native RCS delivery, or the SMS
fallback (suggestion chips have no SMS form and are dropped).

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

### API Key Commands

#### List API Keys

```bash
sendly keys list
```

#### Create a New Key

```bash
sendly keys create --name "Production Key" --type live
```

#### Revoke a Key

```bash
sendly keys revoke key_abc123
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

### Credit Commands

#### Check Balance

```bash
sendly credits balance
```

Output includes:
- Current balance
- Reserved credits
- Estimated messages remaining

#### View Transaction History

```bash
sendly credits history

# Limit results
sendly credits history --limit 20
```

### Webhook Commands

#### List Webhooks

```bash
sendly webhooks list
```

#### Listen for Webhooks Locally

Start a local tunnel to receive webhook events during development (similar to Stripe CLI):

```bash
sendly webhooks listen

# Forward to a specific URL
sendly webhooks listen --forward http://localhost:3000/webhook

# Listen for specific events
sendly webhooks listen --events message.delivered,message.failed
```

This creates a secure tunnel and displays:
- Tunnel URL
- Webhook secret for signature verification
- Real-time event stream

#### Create Webhook

```bash
sendly webhooks create --url https://myapp.com/webhook --events message.delivered,message.failed

# With description and mode
sendly webhooks create \
  --url https://myapp.com/webhook \
  --events message.delivered,message.failed,message.bounced \
  --description "Production webhook" \
  --mode live
```

#### Get Webhook Details

```bash
sendly webhooks get whk_abc123
```

#### Update Webhook

```bash
sendly webhooks update whk_abc123 --url https://newdomain.com/webhook

# Update events
sendly webhooks update whk_abc123 --events message.delivered,message.bounced

# Disable webhook
sendly webhooks update whk_abc123 --active false
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

#### Rotate Webhook Secret

```bash
sendly webhooks rotate-secret whk_abc123
```

Note: Old secret remains valid for 24 hours during migration.

### Verification (OTP) Commands

#### Send OTP

```bash
sendly verify send --to "+15551234567"

# With custom app name
sendly verify send --to "+15551234567" --app-name "MyApp"

# With template
sendly verify send --to "+15551234567" --template tpl_preset_2fa

# Custom code length and timeout
sendly verify send --to "+15551234567" --code-length 6 --timeout 300
```

#### Check OTP Code

```bash
sendly verify check ver_abc123 --code 123456
```

#### Get Verification Status

```bash
sendly verify status ver_abc123
```

#### List Recent Verifications

```bash
sendly verify list

# Limit results
sendly verify list --limit 10
```

#### Resend OTP

```bash
sendly verify resend ver_abc123
```

### Template Commands

#### List Templates

```bash
sendly templates list
```

#### Get Template Details

```bash
sendly templates get tpl_abc123

# Get a preset template
sendly templates get tpl_preset_2fa
```

#### Create Template

```bash
sendly templates create --name "My OTP" --text "Your code is {{code}}"
```

Supported variables: `{{code}}`, `{{app_name}}`

#### Publish Template

```bash
sendly templates publish tpl_abc123
```

#### Delete Template

```bash
sendly templates delete tpl_abc123

# Skip confirmation
sendly templates delete tpl_abc123 --force
```

#### List Preset Templates

```bash
sendly templates presets
```

### Link Commands (URL Shortening)

Mint branded, owned-domain short links for your destination URLs. Branded short
links improve deliverability (carriers filter public shorteners) and give you
per-link click analytics. URL shortening is gated behind the `url_shortener`
rollout flag — until it's enabled for your account these commands return
`not_enabled`.

#### Create a Short Link

```bash
sendly links create https://example.com/spring-sale
```

#### List Your Short Links

Newest first, with click counts:

```bash
sendly links list

# Paginate
sendly links list --limit 20 --offset 20
```

#### Disable / Re-enable a Short Link

The per-link kill switch — a disabled link's redirect returns 404:

```bash
sendly links disable Ab3xY7

# Re-enable
sendly links disable Ab3xY7 --enable
```

### Logs Commands

#### Tail Logs

Stream real-time API activity:

```bash
sendly logs tail

# Filter by status
sendly logs tail --status error
```

### Configuration Commands

#### Get Configuration Value

```bash
sendly config get baseUrl
```

#### Set Configuration Value

```bash
sendly config set baseUrl https://sendly.live
```

#### List All Configuration

```bash
sendly config list
```

### Diagnostics

Run diagnostics to check your setup:

```bash
sendly doctor
```

This checks:
- Authentication status
- API connectivity
- Configuration validity
- Network issues

### Utility Commands

#### Account Status Dashboard

```bash
sendly status
```

Shows account overview including:
- Verification status and tier
- Credit balance
- Active API keys and webhooks
- Recent messages

#### Trigger Test Event

For testing with `webhooks listen`:

```bash
sendly trigger message.delivered
sendly trigger message.bounced
```

## Environment Variables

Override CLI configuration with environment variables:

| Variable | Description |
|----------|-------------|
| `SENDLY_API_KEY` | API key for authentication |
| `SENDLY_BASE_URL` | API base URL (default: `https://sendly.live`) |
| `SENDLY_API_URL` | Older spelling of `SENDLY_BASE_URL`; used only when `SENDLY_BASE_URL` is unset |
| `SENDLY_OUTPUT_FORMAT` | Output format: `text` or `json` |
| `SENDLY_NO_COLOR` | Disable colored output |
| `SENDLY_TIMEOUT` | Request timeout in milliseconds |
| `SENDLY_MAX_RETRIES` | Maximum retry attempts |

### Which API host a command talks to

The base URL is resolved once per command, highest priority first:

1. An explicit per-command flag, where a command offers one (none do today).
2. `SENDLY_BASE_URL`
3. `SENDLY_API_URL`
4. `baseUrl` in the config file (`sendly config set baseUrl https://...`)
5. `https://sendly.live`

An empty or whitespace-only variable counts as unset. A value from the
environment must be a scheme and host with no path, query or fragment — the CLI
appends the API path itself, so `https://example.com/api/v1` is rejected rather
than turned into `https://example.com/api/v1/api/v1/messages`.

#### Hosts the CLI will send credentials to

`SENDLY_BASE_URL` and `SENDLY_API_URL` come from the ambient environment, so the
CLI will not hand your API key to just any host they name:

| Host | Allowed |
|------|---------|
| `https://sendly.live` and its subdomains | Always |
| Loopback (`localhost`, `*.localhost`, `127.0.0.0/8`, `::1`), http or https | Always |
| Any other host, over `https://`, with a test key (`sk_test_…`) | Allowed |
| Any other host, over plain `http://` | Refused — cleartext |
| Any other host, with a live key (`sk_live_…`) or a `sendly login` session | Refused |

A refusal names the host and what to do instead, and no request is made. If you
genuinely need a live key pointed at another host, store it deliberately with
`sendly config set baseUrl https://...`; the stored value is your own explicit
local setting and is used as written.

Only commands that actually open a connection fail on a bad value. Read-only
commands (`sendly config list`, `sendly whoami`, `sendly doctor`) keep working
and report the problem: `effectiveBaseUrl` is `null` and `baseUrlError` carries
the reason.

`sendly config get baseUrl` and the `baseUrl` field of `sendly config list`
report what is stored in the config file. To see the host actually in use, run
`sendly whoami` (or read `effectiveBaseUrl` from `sendly config list --json`).

```bash
# Point every command at a local server for one shell session
export SENDLY_BASE_URL=http://localhost:5001
sendly whoami
```

## Output Formats

### Text (Default)

Human-readable formatted output with colors.

### JSON

Machine-readable JSON output for scripting:

```bash
sendly sms list --json
sendly credits balance --json
```

## CI/CD Usage

For non-interactive environments:

```bash
# Set API key via environment variable
export SENDLY_API_KEY=sk_live_v1_your_key

# Or pass directly
sendly sms send --api-key sk_live_v1_your_key --to "+15551234567" --text "Hello!"

# Use JSON output for parsing
sendly credits balance --json | jq '.balance'
```

## Configuration Storage

Configuration is stored in:
- **macOS/Linux**: `~/.sendly/config.json`
- **Windows**: `%USERPROFILE%\.sendly\config.json`

## Webhook Signature Verification

When using `sendly webhooks listen`, verify signatures in your app:

```javascript
import crypto from 'crypto';

function verifyWebhook(payload, signature, secret) {
  const expectedSig = 'v1=' + crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSig)
  );
}
```

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
