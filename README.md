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
npm install -g @sendly/cli
```

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

# With sender ID (international)
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
| `SENDLY_OUTPUT_FORMAT` | Output format: `text` or `json` |
| `SENDLY_NO_COLOR` | Disable colored output |
| `SENDLY_TIMEOUT` | Request timeout in milliseconds |
| `SENDLY_MAX_RETRIES` | Maximum retry attempts |

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
