# @sendly/cli

## 3.38.0

### Minor Changes

- **`SENDLY_BASE_URL` is finally honoured by every command.** It has been in the README's environment-variable table for a long time, but only `sendly doctor` and `sendly events listen` ever read it. Every other command, every send, every `numbers` call, `sendly login` itself, used the `baseUrl` stored in `~/.sendly/config.json` and otherwise `https://sendly.live`. So if you exported `SENDLY_BASE_URL=http://localhost:5001` to point the CLI at a local server, `sendly doctor` reported a healthy connection to localhost while `sendly sms send` quietly sent a real message through production, against your real account. Every command now resolves the host the same way. If you had worked around this by keeping the variable set and never trusting it, you can stop.
- The base URL is resolved once per command, highest priority first: an explicit per-command value (no command exposes a flag for this yet, the hook exists for when one does), `SENDLY_BASE_URL`, `SENDLY_API_URL`, `baseUrl` from the config file, then `https://sendly.live`. `SENDLY_API_URL` is newly accepted as a lower-priority alias, so a shell that already exports that spelling for other Sendly tooling now works with the CLI too. An empty or whitespace-only variable counts as unset rather than blanking the host, and surrounding whitespace and trailing slashes are trimmed. `SENDLY_API_BASE` is deliberately not consulted: elsewhere in our tooling that name carries a version-suffixed base (`.../api/v1`) and the CLI appends the version itself.
- A base URL supplied through the environment must be a bare origin. `SENDLY_BASE_URL=https://staging.example.com/api/v1` is now refused with a message naming the origin to use instead, rather than producing requests to `https://staging.example.com/api/v1/api/v1/messages`. A query string or fragment is refused for the same reason. A value stored with `sendly config set baseUrl` is still used exactly as written.
- **The CLI will no longer hand a live credential to an arbitrary host named by the environment.** `SENDLY_BASE_URL` and `SENDLY_API_URL` come from the ambient shell, so they are now checked before anything is sent: `https://sendly.live` and its subdomains are always allowed, loopback (`localhost`, `*.localhost`, `127.0.0.0/8`, `::1`) is always allowed over http or https, any other host is allowed over `https://` with a test key (`sk_test_…`), and refused over plain `http://` or when the request would carry a live key or a `sendly login` session. A refusal names the host and what to do instead, and no request leaves the machine. This can break an existing setup: if you deliberately run a live key against a private host, store it with `sendly config set baseUrl https://…` instead, because the stored value is your own explicit local setting and is exempt from the check.
- **Automatic idempotency keys on POST.** Every POST the CLI makes now carries a generated `Idempotency-Key`, and the same key is reused across the CLI's built-in retries (it retries a dropped connection or a 5xx, up to `maxRetries`). On endpoints that support idempotency the server recognises the retry of a request that already reached it and replays the original response instead of executing it again, so a connection that dies after your send was accepted no longer bills you for a second message. Endpoints that act on the key today: `sendly send`, `sendly sms send`, `sendly rcs send`, `sendly whatsapp send`, `sendly sms group`, `sendly sms schedule`, `sendly sms batch`, `sendly verify send`, `sendly enterprise provision`, `sendly whatsapp connect`, and `sendly whatsapp templates create`. On every other POST the header is simply ignored, including the file uploads behind `sendly sms upload-media` and `sendly sms batch --file`, which carry a key that nothing deduplicates yet.
- Be clear about what the automatic key does not buy you. It is generated per invocation, so running the same command twice still sends twice: it protects the CLI's own retry, not your shell history. And it narrows the duplicate window rather than closing it, because the server records a key only once the original request has finished, so a retry that fires while the first request is still executing is not recognised as a repeat. After a 5xx the automatic key is rotated before the retry, since the server responded and may have cached that response under the key and you want the retry to really run. After a network error it is kept, since the outcome is unknown and the server should be the one to decide it is a repeat.
- `sendly sms batch` deliberately sends no automatic key. The batch endpoint already deduplicates header-less retries server-side by hashing the content of the request, and a fresh key on every run would bypass that net.
- New `--idempotency-key <key>` flag on `sendly send`, `sendly sms send`, `sendly sms group`, `sendly sms schedule`, `sendly sms batch`, `sendly rcs send`, and `sendly whatsapp send`. Repeating a send with the same key within 24 hours returns the original result instead of sending again, which is what you want for a script that retries across process restarts or a job that may be re-run by a scheduler. Keys must be 1 to 255 printable ASCII characters and are validated before any network call, so a bad key fails instantly instead of after a send. Empty and whitespace-only values are treated as absent, and the automatic key applies instead. A key you supply is never rotated on retry. Reusing one key for a genuinely different message is rejected by the server with `idempotency_key_mismatch` (HTTP 422), so mint one key per logical send. On `sendly sms batch` the flag cannot be combined with `--history`, and passing it there replaces the content-hash protection above with your key.
- `sendly whoami` now reports the server actually in use, not the value sitting in the config file, and says so in red when that value is one the CLI refuses to use. `--json` gains `baseUrl` (null when unusable) and `baseUrlError`.
- `sendly config list` gains an "in effect" line whenever the resolved host differs from the stored one, and `effectiveBaseUrl` plus an optional `baseUrlError` in `--json`. The plain `baseUrl` field still reports what is stored in the config file, so scripts that read it are unchanged; read `effectiveBaseUrl` if you want the host requests will go to.
- `sendly config set baseUrl …` now warns when `SENDLY_BASE_URL` or `SENDLY_API_URL` is set, because the environment outranks the config file and the value you just stored will not be the one in use until you unset the variable.
- `sendly doctor` gains a Base URL check that prints the host and where it came from (`SENDLY_BASE_URL`, the config file, the built-in default). When the value is unusable it is reported once as a single failure with the reason, and the network, clock, and credits checks record themselves as skipped rather than each firing at a bad host and reporting a confusing connection error.

### Patch Changes

- `sendly config list`, `sendly whoami`, and `sendly doctor` keep working when the base URL is unusable. They report the problem instead of throwing, so you can still read your configuration and diagnose the variable that broke everything else.
- The `--use-case` flag on `sendly enterprise verification submit` and `sendly enterprise verification resubmit` describes itself as a carrier use-case value instead of naming a vendor enum. Accepted values are unchanged.
- `sendly doctor`'s Environment check no longer repeats the custom base URL, which the new Base URL check now reports properly.

## 3.36.0

### Minor Changes

- New command `sendly enterprise verification submit <workspaceId>` — submit (or resubmit) a verification for an enterprise workspace. Matches the actual API shape: camelCase top-level fields, nested `address`/`contact` objects, `--entity-type` + `--brn`/`--brn-type`/`--brn-country` instead of the old `businessType`/`ein`. Pass `--data <file.json>` for the full payload, or use individual `--business-name`, `--website`, `--contact-email`, etc. flags. Field flags are merged on top of the JSON file when both are passed.
- **Partial-update friendly:** for resubmits on existing workspaces, send only the fields you want to change — everything else is filled in from the existing record. Hosted page URLs (`/biz/`, `/opt-in/`, `/legal/`) generated during provision are auto-preserved.
- New command `sendly enterprise verification resubmit <workspaceId>` — convenience alias for resubmits. Same endpoint as `submit`, just reads more naturally for one-field-change retries after a rejection.
- New command `sendly enterprise verification get <workspaceId>` — fetch and pretty-print the current verification record (status, business info, address, contact, rejection reason). Useful before a resubmit so you know what's already on file. `--json` for raw output.
- For sole proprietors, leave `--brn`/`--brn-type`/`--brn-country` unset — the server strips them before forwarding to the carrier.

### Server-side fixes paired with this release

- `/api/v1/enterprise/workspaces/:id/verification/submit` now returns specific missing-field errors (e.g. `"Missing required fields: website"`) instead of listing every required field whether present or not.
- Endpoint accepts both flat and `{ verification: {...} }` wrapped shapes (matches `/enterprise/provision`).
- `useCase` validation expanded from 23 entries to the full 43-value carrier use-case enum.

## 3.35.0

### Patch Changes

- `sendly webhooks redeliver` and `sendly webhooks backfill` now print the **Run ID** (e.g. `recover_…`) returned by the server so you can quote it in a support ticket or correlate with dashboard live progress. The dashboard's recovery dialog uses the same Run ID to subscribe to realtime progress events while the run is in flight.

## 3.34.0

### Patch Changes

- `sendly upgrade` now correctly detects how the CLI was installed when both Homebrew and an npm-global install coexist on the same machine. Previously the detection trusted the `HOMEBREW_CELLAR` env var, which is set in every shell where Homebrew is on PATH — even when the CLI itself was installed via `npm install -g @sendly/cli`. The result: an npm-installed CLI on a Mac with brew available would shell out to `brew upgrade sendly` and either error or upgrade the wrong copy. Detection now resolves `process.argv[1]` through `fs.realpathSync` and inspects the actual install path (`node_modules/` for npm, `Cellar/` or `/opt/homebrew/` for Homebrew). Returns `unknown` when the path is inconclusive instead of guessing — `sendly upgrade` then prints both options.
- Recover gracefully from an un-decryptable `~/.sendly/config.json`. When both the active and legacy encryption keys fail to decrypt the config (cross-machine sync, key rotation, file corruption), the CLI used to crash every command with `SyntaxError: Unexpected token '�'…` because the "fresh install" fallback re-instantiated `Conf{}` against the same broken file. The CLI now moves the un-decryptable file aside to `config.json.corrupt.<timestamp>` (so the user keeps a copy in case they recover the key) and starts clean. Run `sendly login` afterwards to re-authenticate.
- 12 new unit tests covering the detection logic across nvm, Homebrew (Apple Silicon + Intel + linuxbrew), npm-global, source checkouts, and `realpath` failures.

## 3.33.0

### Minor Changes

- New `sendly webhooks redeliver <id>` — re-queue failed or cancelled webhook deliveries from a time window. Idempotent — already-delivered events are skipped, not double-sent. Use after fixing your endpoint.
- New `sendly webhooks backfill <id>` — synthesize webhook deliveries for messages whose events never created a delivery row in the first place (the silent-drop case our circuit-breaker was leaving behind). Run after `redeliver` to recover events from a window when the circuit was open.
- New `sendly webhooks reset-circuit <id>` — force-close an open or half-open circuit breaker. Recovery commands reject with HTTP 409 while the circuit is open, so call this first if your circuit is stuck open after fixing your endpoint.

## 3.32.0

### Minor Changes

- `sendly login` gains a press-to-copy UX during the device-code flow. While waiting for authorization, press `[c]` to copy the verification URL to the clipboard or `[q]` / Ctrl-C to cancel cleanly. Cross-platform (pbcopy / clip / wl-copy / xclip / xsel). No-ops silently in CI / non-TTY environments.
- `sendly --help` now shows real topic descriptions for `contacts`, `conversations`, `campaigns`, `templates`, `labels`, `drafts`, and `verify` instead of falling back to the first alphabetical subcommand's description.

## 3.31.0

### Minor Changes

- New command `sendly countries` — list supported countries with pricing, tier, and whether registration is required. Public endpoint (no auth). Filter by `--search` or `--tier`.
- New command `sendly templates enhance` — AI-rewrite a message for clarity and compliance. Accepts text via `--text`, `--file`, a positional arg, or stdin. Requires the `ai_classification` flag on your account.
- New command `sendly sms upload-media <file>` — upload a JPEG / PNG / GIF for MMS and get back a public URL to pass to `sms send --media`. Requires MMS to be enabled for your account.

## 3.30.0

### Minor Changes

- New command `sendly upgrade` — bumps the CLI to the latest version. Auto-detects whether you installed via Homebrew or npm and runs the matching command (`brew upgrade sendly` or `npm install -g @sendly/cli@latest`). Use `--check` to dry-run.
- Out-of-date banner — the CLI now checks npm for a newer version once every 24h (cached) and prints a one-line banner after command output when you're behind. Quiet in CI (`CI=true`), offline-safe, non-blocking.

## 3.29.0

### Minor Changes

- New command `sendly contacts bulk-mark-valid --ids <csv> | --list <id>`: clear the invalid flag on many contacts at once (up to 10,000 per call).
- `sendly webhooks listen` default event set now includes the full `message.*` + `contact.*` + `contacts.*` families so local debugging doesn't silently drop list-health events. Override with `--events` as before.

## 3.28.0

### Minor Changes

- New command `sendly contacts mark-valid <id>`: clear the auto-exclusion flag on a contact.
- New command `sendly contacts check-numbers [--list <id>] [--force]`: trigger a background carrier lookup across your contacts.

## 3.25.0

### Minor Changes

- [`80ca04c`](https://github.com/SendlyHQ/sendly/commit/80ca04c91ba51f4c292c6373cd0325e890525a67) Thanks [@sendly-live](https://github.com/sendly-live)! - EIN/BRN document upload for verification, business page generation on provisioning, AI integration (badges, template generation, conversation summaries), verification document upload across all SDKs + CLI.

## 3.24.0

### Minor Changes

- [`6f2406e`](https://github.com/SendlyHQ/sendly/commit/6f2406e6da409798cef11ef18ccfc50302ab443d) Thanks [@sendly-live](https://github.com/sendly-live)! - Conversations API, AI intelligence, Labels, and Drafts across all SDKs.
  - Conversations: list, get, reply, update, close, reopen, markRead, suggestReplies, addLabels, removeLabel
  - AI classification (aiMetadata) on Message type — intent + sentiment on inbound messages
  - AI suggested replies — 2-3 tone-varied suggestions per conversation
  - Labels: create, list, delete — categorize conversations and messages
  - Drafts: create, list, get, update, approve, reject — human-in-the-loop message approval
  - CLI: `sendly conversations`, `sendly labels`, `sendly drafts` command groups
  - MCP Server: 25 tools (messaging, conversations, labels, drafts, OTP, account)

## 3.20.0

### Minor Changes

- [`bec79af`](https://github.com/SendlyHQ/sendly/commit/bec79af3df211f3dce5e5e43b8dabad6138b1c3d) Thanks [@sendly-live](https://github.com/sendly-live)! - Enterprise credits pool, SDK endpoint fixes, and security hardening
  - Added `enterprise.credits.get()` to retrieve pool balance
  - Added `enterprise.credits.deposit(amount, description)` to deposit credits into enterprise pool
  - Fixed credits endpoint paths across all 8 SDKs (`/credits/pool` → `/credits`)
  - Fixed CLI quota commands to use `monthlyMessageQuota` field (was incorrectly sending `monthlyLimit`)
  - Stripped webhook signing secret and invitation tokens from API responses

## 3.19.1

### Patch Changes

- [`c3c412c`](https://github.com/SendlyHQ/sendly/commit/c3c412c02c4f0d8b6ccee21d70add9c3a83c3220) Thanks [@sendly-live](https://github.com/sendly-live)! - Fix enterprise provision response types to match actual API response shape (workspace/key fields)

## 3.18.2

### Patch Changes

- [`d14f11b`](https://github.com/SendlyHQ/sendly/commit/d14f11b67e076a050fc5c1d1f95c00b7078243b1) Thanks [@sendly-live](https://github.com/sendly-live)! - fix: webhook signature verification and payload parsing across all SDKs
  - All 7 non-Node SDKs now correctly verify webhook signatures using `timestamp.payload` HMAC format
  - Webhook payload parsing handles `data.object` nesting (with flat `data` fallback)
  - Added `livemode` field to WebhookEvent across all SDKs
  - Added `direction`, `organizationId`, `text`, `messageFormat` fields to WebhookMessageData
  - Backwards compatible: old 3-arg verify_signature() still works, message_id aliased to id
  - Documentation fixes: webhook payloads, signature verification, opt-out events, PHP imports, Java namespaces
  - Added 8 missing pages to docs search, updated llms.txt

## 3.18.1

### Patch Changes

- fix: version bump for SDK webhook fixes (no CLI code changes)

## 3.18.0

### Minor Changes

- Add MMS support for US/CA domestic messaging
  - New `media` resource for uploading images (JPEG, PNG, GIF up to 600KB)
  - `mediaUrls` parameter on `messages.send()` for sending MMS
  - New `--media-url` flag on `sendly sms send` CLI command
  - Supports up to 10 media attachments per message at 4 credits per MMS

## 3.17.0

### Minor Changes

- [`ecbc76c`](https://github.com/SendlyHQ/sendly/commit/ecbc76ccf9d86faf02df0d5a78787bf063e49cc8) Thanks [@sendly-live](https://github.com/sendly-live)! - Add structured error classification and automatic message retry
  - Messages that fail with transient errors (sending_failed, timeout, rate limit) now auto-retry up to 3 times with exponential backoff (30s, 2min, 8min)
  - New `errorCode` field classifies errors into 13 structured codes (E001-E013, E099)
  - New `retryCount` field tracks retry attempts
  - New "bounced" and "retrying" message statuses with badges across all UIs
  - All 8 SDKs updated with `retrying` status, `errorCode`, `retryCount` fields, and `message.retrying` webhook event
  - CLI: `webhooks listen` defaults now include `message.retrying`, trigger command supports it
  - v1 API responses include `error`, `errorCode`, `retryCount` for both list and single-message endpoints
  - No credit re-charge on retries — original deduction covers all attempts

## 3.16.0

### Minor Changes

- [`53f3a3c`](https://github.com/SendlyHQ/sendly/commit/53f3a3c1e291cb35ff235291a2e4942dfef40ded) Thanks [@sendly-live](https://github.com/sendly-live)! - Add credit transfer support to all SDKs and circuit breaker half-open recovery
  - All 8 SDKs now support `transferCredits()` / `transfer_credits()` for moving credits between workspaces
  - Circuit breaker auto-recovers after 5 minutes via half-open state
  - Manual circuit reset via API and dashboard UI
  - CLI version bump with credits transfer command

## 3.13.1

### Patch Changes

- [`130551c`](https://github.com/SendlyHQ/sendly/commit/130551c66748e019970a352f2f09986f1d5253e3) Thanks [@sendly-live](https://github.com/sendly-live)! - CLI: Add contacts import, campaigns update/clone, contacts update, contacts lists get/update commands. Fix campaign preview and send display output to match API response fields. Fix contact list field mapping for snake_case API responses.

  Server: Add POST /api/v1/contacts/import endpoint for bulk CSV import with dedup. Fix campaign send route to pass isTestKey for sandbox mode. Fix campaign preview to return hasEnoughCredits: true for test keys.

## 3.13.0

### Minor Changes

- [`c2181c8`](https://github.com/SendlyHQ/sendly/commit/c2181c8f2a07e7d8b17e7262fcbc423c52f4b46c) Thanks [@sendly-live](https://github.com/sendly-live)! - SDK Feature Parity Update - Campaigns, Contacts & Template Clone

  ### Added

  **Server:**
  - Campaigns API v1: 10 endpoints with API key auth at `/api/v1/campaigns/*`
  - Contacts API v1: 13 endpoints at `/api/v1/contacts/*` and `/api/v1/contact-lists/*`
  - New scopes: `contacts:read`, `contacts:write`

  **Node.js SDK:**
  - Campaigns resource with full CRUD + send/schedule/cancel/clone
  - Contacts resource with full CRUD
  - Contact Lists sub-resource for list management
  - Template clone method (`templates.clone()`)
  - API key rotate and rename methods

  **CLI:**
  - 8 campaign commands: list, get, create, preview, send, schedule, cancel, delete
  - 9 contacts commands: list, get, create, delete + lists subcommands
  - Template clone command (`sendly templates clone <id>`)
  - Key rotate/rename commands

  ### All Other SDKs (Python, Ruby, Java, PHP, Go, Rust, .NET)
  - Campaigns resource with full CRUD + send/schedule/cancel/clone
  - Contacts resource with full CRUD
  - Contact Lists sub-resource for list management
  - Template clone method

  ### Fixed
  - **Campaign Builder Compliance**: Opted-out contacts are now ALWAYS excluded from campaigns (TCPA compliance)
  - **Draft State Restoration**: Campaign timezone is now properly restored when reopening drafts
  - DELETE endpoints now return 204 (no content) consistently across all SDKs

## 3.12.3

### Patch Changes

- [`d5e9722`](https://github.com/SendlyHQ/sendly/commit/d5e972221bb63febc6fb48978e15a5c0afd97f2b) Thanks [@sendly-live](https://github.com/sendly-live)! - ### Documentation & SDK Improvements

  **SDK Code Examples**
  - Added all 9 SDK variants (Node.js, Python, cURL, Go, PHP, Ruby, Java, C#, Rust) to API Reference Overview section
  - Fixed PHP SDK naming consistency: `Sendly\SendlyClient` → `Sendly\Sendly` across 25 code examples
  - Fixed Java SDK naming: `com.sendly.SendlyClient` → `com.sendly.Sendly` in 3 API key examples
  - Fixed Rust SDK naming: `sendly::SendlyClient` → `sendly::Sendly` in 1 example

  **CLI Updates**
  - Updated CLI version references from v3.6.0 to v3.12.2 in documentation
  - Fixed example output showing correct version number

  **Templates**
  - Fixed templates page category filtering (OTP, 2FA, Signup, Transaction, General filters now work correctly)
  - Server endpoints now properly return `category` field for preset templates

## 3.12.2

### Patch Changes

- [`3da909d`](https://github.com/SendlyHQ/sendly/commit/3da909d05c0d9b57cf9f31849f050f2f9f44ea44) Thanks [@sendly-live](https://github.com/sendly-live)! - Add Credits and API Key resources to SDKs
  - PHP SDK: Add Credits resource with balance, history, purchase methods
  - PHP SDK: Add ApiKey and CreditTransaction models
  - Python SDK: Improve type hints across types module
  - Minor fixes and improvements across Go, Rust, .NET SDKs

## 3.12.0

### Minor Changes

- feat: add `message.bounced` event support

  **New Trigger Event:**

  Test bounced message handling with the trigger command:

  ```bash
  sendly trigger message.bounced
  ```

  **Webhook Events:**

  Subscribe to bounce events when creating webhooks:

  ```bash
  sendly webhooks create \
    --url https://yourapp.com/webhook \
    --events message.delivered,message.failed,message.bounced
  ```

### Patch Changes

- fix: webhook details now correctly displays secret version

## 3.11.0

### Minor Changes

- [`687e717`](https://github.com/SendlyHQ/sendly/commit/687e717fa507dbfc45cf724241d443a1c55e5566) Thanks [@sendly-live](https://github.com/sendly-live)! - feat: add Hosted Verification Flow for simplified phone verification

  **New Feature: Hosted Verification Flow**

  Reduce phone verification integration from ~300 lines to ~20 lines with Sendly's hosted UI.

  **Node.js SDK:**

  ```javascript
  // Create session, redirect user to session.url
  const session = await sendly.verify.sessions.create({
    successUrl: "https://yourapp.com/verified",
    cancelUrl: "https://yourapp.com/signup",
    brandName: "YourApp",
    brandColor: "#f59e0b",
    metadata: { userId: "123" },
  });

  // After redirect, validate the token
  const result = await sendly.verify.sessions.validate({ token });
  if (result.valid) {
    console.log("Verified phone:", result.phone);
  }
  ```

  **CLI:**
  - No CLI changes in this release (hosted flow is web-based)

  **Also Updated (separate packages):**
  - Python SDK: `sendly.verify.sessions.create()` / `.validate()`
  - Go SDK: `client.Verify.Sessions.Create()` / `.Validate()`
  - Ruby SDK: `sendly.verify.sessions.create()` / `.validate()`
  - PHP SDK: `$sendly->verify->sessions->create()` / `->validate()`
  - Java SDK: `sendly.verify().sessions().create()` / `.validate()`
  - .NET SDK: `sendly.Verify.Sessions.CreateAsync()` / `.ValidateAsync()`
  - Rust SDK: `client.verify().sessions().create()` / `.validate()`

  **Security:**
  - Sessions expire in 30 minutes
  - Tokens are one-time use (48 hex chars, 192 bits entropy)
  - Tokens scoped to originating API key
  - HTTPS required for success_url (localhost allowed for dev)

## 3.8.2

### Patch Changes

- [`3384e3d`](https://github.com/SendlyHQ/sendly/commit/3384e3d2fd34bc38708408eed6e9eeddbcad4cc8) Thanks [@sendly-live](https://github.com/sendly-live)! - chore: migrate repository URLs to SendlyHQ organization

## 3.8.1

### Patch Changes

- fix: update marketing copy and documentation
  - Fix docs logo to use hexagon instead of lightning bolt
  - Fix docs right panel spacing
  - Remove misleading claims from landing page (fake metrics, inflated numbers)
  - Remove fake download/star counts from SDKs page
  - Fix about page - remove infrastructure provider mention
  - Consistent country count (40+) across all pages
  - Clarify API response time vs SMS delivery time

## 3.8.0

### Minor Changes

- [`a3cd711`](https://github.com/SendlyHQ/sendly/commit/a3cd711454b002d78c924e81421c9b129dbbb546) Thanks [@SendlyHQ](https://github.com/SendlyHQ)! - ## New Features
  - **Batch Preview (Dry Run)**: New `previewBatch()` method across all 8 SDKs to validate batch messages before sending - returns per-country credit breakdown, blocked messages, and validation errors without consuming credits
  - **Programmatic API Key Management**: New `createApiKey()` and `revokeApiKey()` methods across all 8 SDKs for full API key lifecycle management
  - **Webhook Event Discovery**: New `listEventTypes()` method (Java, PHP, Rust, .NET) to enumerate available webhook event types

  ## Bug Fixes
  - **Endpoint Path Corrections**: Fixed incorrect API paths in PHP, Rust, and .NET SDKs (`/account/api-keys` → `/account/keys`)
  - **Java SDK Completeness**: Added 4 missing methods to Java `AccountResource` (`getApiKey`, `getApiKeyUsage`, `createApiKey`, `revokeApiKey`)
  - **API Key Retrieval**: Added `getApiKey()` and `getApiKeyUsage()` to PHP, Rust, and .NET SDKs for parity with Node/Python/Ruby/Go

  ## Documentation
  - Updated all 8 SDK READMEs with comprehensive examples for new methods
  - Fixed outdated version numbers in installation examples (Java: 3.0.1→3.7.0, Rust: 0.9.5→3.7.0, .NET: 1.0.5→3.7.0)
  - Security audit passed: all code examples use placeholder API keys (`sk_live_v1_xxx`)

## 3.6.1

### Patch Changes

- [`5a6d786`](https://github.com/SendlyHQ/sendly/commit/5a6d786cf125633ae53037ce7bdfec7e4e702a39) Thanks [@SendlyHQ](https://github.com/SendlyHQ)! - ## CLI Webhook Listener Fix

  ### What's Fixed

  Fixed a critical bug where `sendly webhooks listen` would immediately disconnect with "Invalid or expired CLI token" error.

  **Root Causes:**
  1. **Upstash Redis Auto-Deserialization**: Redis was returning parsed JSON objects, but code was calling `JSON.parse()` again, causing "[object Object] is not valid JSON" errors
  2. **Multi-Instance Token Signing**: In multi-instance Fly.io deployments, each server instance was generating its own random signing secret, causing tokens created on one instance to fail validation on another

  **Technical Changes:**
  - Fixed Redis data handling in `websocket.ts` to handle both string and object responses from Upstash
  - Fixed `cli-tokens.ts` to properly handle Upstash auto-deserialization
  - Server now uses consistent `CLI_TOKEN_SECRET` environment variable across all instances

  **Affected Commands:**
  - `sendly webhooks listen` - Now stays connected properly
  - `sendly login` - Token validation now works across server instances
  - `sendly logout` - Server-side token revocation now works correctly

## 3.6.0

### Minor Changes

- feat: WebSocket-based CLI webhook listener

  **CLI Changes:**
  - `sendly webhooks listen` now uses WebSocket instead of localtunnel
  - Real-time event delivery (no more 2-second polling delay)
  - No third-party tunnel dependencies
  - Events are HMAC-SHA256 signed

  **New Command:**
  - `sendly trigger <event>` - Send test webhook events to your listener
  - Supported events: message.sent, message.delivered, message.failed, message.bounced, message.received

  **Example:**

  ```bash
  # Terminal 1
  sendly webhooks listen --forward http://localhost:3000/webhook

  # Terminal 2
  sendly trigger message.delivered
  ```

## 3.5.4

### Patch Changes

- [`17e3435`](https://github.com/SendlyHQ/sendly/commit/17e343517764981741cfbae521cf5a5251895d36) Thanks [@SendlyHQ](https://github.com/SendlyHQ)! - ## Critical Bug Fixes

  ### Toll-Free Verification Status
  - Fixed: Carrier returns `"Verified"` status but code only checked for `"approved"`
  - Impact: Toll-free verified users can now send SMS correctly

  ### SDK Fixes
  - Node SDK: Fixed `messageType` parameter not being sent in API requests
  - Python SDK: Added missing `message_type` parameter

  ### API & Dashboard
  - Added `GET /api/v1/credits` endpoint for SDK compatibility
  - Dashboard live mode now properly rejects sandbox test numbers

  ### Documentation
  - All 8 SDK READMEs updated with schedule, batch, webhooks, account docs
  - Fixed URL inconsistencies in API documentation

## 3.5.3

### Patch Changes

- [`19bad0a`](https://github.com/SendlyHQ/sendly/commit/19bad0a44fef3ebbffe1478cd3c736d5e845cd1d) - ## Documentation Improvements

  ### New: Going Live Guide
  - Added `/docs/going-live` page with step-by-step verification flow
  - Explains International (instant) vs US/Canada (toll-free) vs Global options
  - Documents why live keys require credits

  ### CLI Environment Switching
  - Added `sendly config set environment live/test` documentation
  - Replaces confusing `testMode true/false` with clearer environment switching

  ### Sandbox Testing
  - Unified all sandbox test numbers to `+1500555xxxx` pattern
  - Added missing `+15005550006` (carrier violation) to docs
  - Fixed descriptions: "Queue full error" for `+15005550003`

  ### API Reference
  - Fixed endpoint paths: `/api/messages` → `/api/v1/messages`
  - Added Sender ID logic explanation (international vs US/CA behavior)
  - Added CSV format documentation for batch messages

  ### SDK READMEs
  - All 8 SDKs updated with consistent sandbox numbers
  - Fixed Go SDK path: `github.com/SendlyHQ/sendly-go`
  - Fixed domain references: `sendly.dev` → `sendly.live`

## 3.5.2

### Patch Changes

- [`b503f48`](https://github.com/SendlyHQ/sendly/commit/b503f48140b00a4d4bc3cf5227a7c96baa1b36b1) Thanks [@SendlyHQ](https://github.com/SendlyHQ)! - Improved error handling and authentication fixes

  ### CLI Improvements
  - **API Key Required Errors**: When using CLI session tokens for operations that require an API key (like sending messages), the CLI now displays a clear error with instructions on how to set up an API key
  - **Login Code Paste Fix**: Fixed an issue where pasting login codes with hyphens (e.g., `8FV3-PAT2`) would fail validation. Codes can now be pasted directly from the terminal

  ### SDK Updates
  - **Node.js**: Added `api_key_required` to recognized authentication error codes
  - **Python**: Added `api_key_required` to recognized authentication error codes

  ### Security
  - CLI session tokens are now explicitly rejected for message sending operations, enforcing the use of proper API keys with audit trails

## 3.4.0

### Minor Changes

- feat: Add messageType parameter for SMS compliance

  All SDKs now support `messageType` parameter for SMS compliance handling:
  - **Marketing** (default): Subject to quiet hours restrictions (8am-9pm recipient local time)
  - **Transactional**: 24/7 delivery for OTPs, order confirmations, appointment reminders

  ### API Changes

  **Send Message:**

  ```javascript
  // Node.js
  await sendly.messages.send('+1234567890', 'Your code is 123456', { messageType: 'transactional' });

  // CLI
  sendly sms send --to +1234567890 --text "Your code is 123456" --type transactional
  ```

  **Batch Send:**

  ```javascript
  await sendly.messages.sendBatch(["+1...", "+2..."], "Sale!", {
    messageType: "marketing",
  });
  ```

  **Schedule:**

  ```javascript
  await sendly.messages.schedule("+1234567890", "Reminder", new Date(), {
    messageType: "transactional",
  });
  ```

  ### SDK Updates

  All 8 SDKs updated with `messageType` support:
  - Node.js: `messageType` option in send/batch/schedule
  - Python: `message_type` parameter
  - Ruby: `message_type:` keyword argument
  - Go: `MessageType` field in request structs
  - PHP: `$messageType` parameter
  - Java: `messageType()` builder method
  - .NET: `MessageType` property
  - Rust: `message_type` field with `MessageType` enum

  ### Compliance Features
  - SHAFT content filtering (Sex, Hate, Alcohol, Firearms, Tobacco/Cannabis)
  - Quiet hours enforcement for 48 countries with timezone detection
  - US state-specific rules (FL, OK, WA, CT have stricter hours)
  - Automatic rescheduling option for quiet hours violations

## 3.3.0

### Minor Changes

- ## Batch SMS Improvements
  - **`--dry-run` flag**: Preview batch before sending with comprehensive validation
    - Per-country breakdown with credit costs and pricing tiers
    - Blocked messages with specific reasons (access denied, unsupported country)
    - Messaging profile access check (domestic/international permissions)
    - Credit balance validation
    - API key type indicator (test/live)
    - Duplicate detection warnings
  - **Phone-only CSV support**: Use `--file phones.csv --text "message"` for CSVs with just phone numbers
  - **Improved header detection**: Now recognizes "to", "phone", "number", "recipient", "mobile", "cell"
  - **Real-time progress**: Server broadcasts batch progress via WebSocket/SSE

- ## UI Batch Improvements
  - **Preview button**: Click "Preview" to see batch analysis before sending
  - **Country breakdown panel**: Shows per-country message counts and credit costs
  - **Messaging profile status**: Displays your domestic/international sending permissions
  - **Accurate credit calculation**: Uses actual international pricing tiers

- ## API Changes
  - **New endpoint**: `POST /api/v1/messages/batch/preview` - Validate batch without sending
    - Scope required: `sms:read` (read-only, no send permission needed)
    - Returns sendable/blocked counts, per-country breakdown, credit costs, access validation

## 3.2.0

### Minor Changes

- ## Security Improvements
  - **CLI Authentication**: Implemented two-code device flow for secure browser-based login
    - `deviceCode`: 32-character hex code used in URL to identify the session
    - `userCode`: 8-character human-readable code displayed only in terminal
    - This prevents verification code exposure through URL sharing/screenshots
  - **CLI Session Scopes**: Added full SMS permissions to CLI session tokens (`sms:send`, `sms:read`, `sms:schedule`)

- ## Bug Fixes
  - **sms batch**: Fixed "Queued: undefined" display when API doesn't return queued count
  - **sms schedule**: Fixed time validation to enforce carrier's actual limits:
    - Minimum: 5 minutes in the future (was incorrectly 1 minute)
    - Maximum: 5 days in the future (was incorrectly 7 days)
  - **login**: Fixed duplicate error messages appearing on failed login attempts

- ## Backend Improvements
  - **Scheduled Message Sync**: Added Supabase cron job to automatically update stale scheduled messages
    - Runs every 5 minutes to catch messages that missed webhook status updates
    - Prevents scheduled messages from being stuck in "scheduled" status indefinitely

## 3.1.1

### Patch Changes

- ## Bug Fixes
  - **webhooks test**: Fixed API response structure - now correctly reads delivery details from nested `delivery` object
  - **webhooks deliveries**: Fixed API response structure - now correctly extracts deliveries array from paginated response
  - **webhooks rotate-secret**: Fixed API response to include all expected fields (id, new_secret_version, grace_period_hours, rotated_at)
  - **webhooks list**: Added Success Rate and Last Delivery columns to match dashboard UI

  ## New Features
  - **sms list --page**: Added pagination support with `--page` flag for navigating through message history
  - **sms list --offset**: Added `--offset` flag as alternative pagination method
  - **sms list --sandbox**: Added `--sandbox` flag to view test/sandbox messages (live keys only)
  - **sms list Mode column**: Now shows "test" or "live" indicator for each message

  ## Security Improvements
  - **API v1 messages endpoint**: Test API keys now only see sandbox messages (security enforced)
  - **API v1 messages endpoint**: Live API keys see production messages by default, can request sandbox with `?sandbox=true`

## 3.1.0

### Minor Changes

- Add webhook mode filtering support

  **Node SDK:**
  - Added `WebhookMode` type (`'all' | 'test' | 'live'`)
  - Added `mode` parameter to `CreateWebhookOptions` and `UpdateWebhookOptions`
  - Added `mode` property to `Webhook` type
  - Webhooks can now filter events by mode:
    - `all`: Receive all events (default)
    - `test`: Receive only sandbox/test events
    - `live`: Receive only production events (requires business verification)

  **CLI:**
  - Added `--mode` flag to `sendly webhooks create` command
  - Added `--mode` flag to `sendly webhooks update` command
  - Mode is now displayed in `sendly webhooks list` and `sendly webhooks get` output

## 3.0.3

### Patch Changes

- [`2082b3a`](https://github.com/SendlyHQ/sendly/commit/2082b3a30c605529aa8f891c0d13c5169ce4db00) Thanks [@SendlyHQ](https://github.com/SendlyHQ)! - ## Bug Fixes
  - **Webhook commands**: Fixed snake_case field name handling to match API responses (`is_active`, `circuit_state`, `failure_count`, `created_at`)
  - **Keys commands**: Fixed `keys create` and `keys revoke` to use correct CLI API endpoints (`/api/v1/account/keys`)
  - **Credits history**: Fixed authentication by using CLI API endpoint (`/api/v1/credits/transactions`)
  - **Whoami**: Changed confusing "Environment test" to clearer "API Mode: test (sandbox)" display

  ## New Features
  - **`sendly status`**: Dashboard command showing account info, credits, resources, and recent messages at a glance
  - **`sendly send`**: Shortcut for `sendly sms send` - quickly send SMS without typing the full command
  - **Command suggestions**: Typo detection with "Did you mean?" suggestions (e.g., `sendly statsu` → `sendly status`)

  ## Developer Experience
  - Better error messages with actionable suggestions
  - Consistent field naming across all commands
  - Improved command discovery with shortcuts

## 3.0.2

### Patch Changes

- [`49ae989`](https://github.com/SendlyHQ/sendly/commit/49ae9892f7a4bc192ecb0d665f1f450f5d9208be) Thanks [@SendlyHQ](https://github.com/SendlyHQ)! - - Add retry logic with exponential backoff for 5xx server errors
  - Fix User-Agent header to use dynamic version from package.json
  - Remove dead EventSource code from webhook listener
  - Fix README config path documentation

## 3.0.1

### Patch Changes

- Added missing `onboarding` command that was referenced in codebase but not included in 3.0.0 build

## 3.0.0

### Major Changes

- [`c5a261b`](https://github.com/SendlyHQ/sendly/commit/c5a261b8306e53be9d0cf37cd35827f1ec709817) Thanks [@SendlyHQ](https://github.com/SendlyHQ)! - feat: complete CLI authentication system with OAuth device flow and secure onboarding

  ## 🔐 Major CLI Authentication Overhaul

  This release introduces a **complete CLI authentication system** with enterprise-grade security and user experience.

  ### ✨ New Features

  **CLI Authentication System:**
  - OAuth device flow for secure browser-based authentication
  - CLI session tokens with 7-day expiration
  - Progressive permission system (CLI sessions → API keys)
  - CLI-first onboarding with strict collision detection

  **Developer Experience:**
  - `sendly login` - Secure browser-based authentication
  - `sendly onboarding --dev-mode` - Quick development setup
  - Automatic API key creation for immediate productivity
  - Clear error messages and upgrade paths

  **Security & Protection:**
  - CLI sessions limited to test SMS numbers only
  - Strict blocking prevents duplicate onboarding attempts
  - Test SMS sandbox (`+15005550000`, etc.) for development
  - Real SMS requires business verification and live API keys

  ### 🛠 Technical Implementation

  **Authentication Architecture:**
  - Dual authentication: Clerk sessions (UI) + CLI tokens (CLI)
  - CLI tokens: `cli_` prefix with base64-encoded JWT payload
  - API key compatibility maintained (`sk_test_` / `sk_live_`)
  - Enhanced middleware supporting both authentication methods

  **API Endpoints:**
  - `POST /api/cli/auth/device` - Initiate device authorization
  - `GET /api/cli/auth/validate-code` - Validate device codes
  - `POST /api/cli/auth/verify` - User authorization
  - `POST /api/cli/auth/token` - Token exchange
  - `POST /api/cli/quick-start` - Development environment setup

  ### 🧪 Comprehensive Testing

  **Test Suite (431+ test cases):**
  - Unit tests for CLI token validation
  - Integration tests for OAuth device flow
  - Edge case testing (race conditions, malicious inputs)
  - SMS protection verification
  - Manual testing scripts for end-to-end flows

  ### 🔧 Database Changes

  **Schema additions:**

  ```typescript
  cliOnboardingCompleted: boolean("cli_onboarding_completed").default(false);
  source: text("source").default("manual"); // "cli_quickstart", "manual", "onboarding"
  ```

  ### ⚡ Migration Guide

  **For existing users:**
  - No breaking changes to existing API keys or authentication
  - CLI authentication is additive - existing flows preserved
  - Users can choose between web onboarding or CLI quick-start

  **For new users:**
  - `sendly login` for authentication
  - `sendly onboarding --dev-mode` for instant development setup
  - Automatic guidance to production verification when needed

  ### 🚨 Breaking Changes
  - CLI now requires authentication before use
  - Previous unauthenticated CLI usage no longer supported
  - `sendly login` must be run before other commands

  ### 📈 Benefits
  - **Faster developer onboarding** - 2 minutes to production-ready development
  - **Enhanced security** - No more API key copy-paste from browser
  - **Better UX** - Progressive permissions with clear upgrade paths
  - **Safer testing** - Automatic test SMS protection
  - **Production ready** - Enterprise-grade authentication flow

  This release establishes Sendly CLI as a **world-class developer tool** with security, usability, and scalability at its core.

## 2.3.0

### Minor Changes

- [`ed8ebb5`](https://github.com/SendlyHQ/sendly/commit/ed8ebb5ede1ba9ba624906e8ce348711a2b513ea) Thanks [@SendlyHQ](https://github.com/SendlyHQ)! - Complete webhook system implementation with full SDK and CLI support.

  **🚀 New Features:**

  **Node.js SDK:**
  - WebhooksResource with full CRUD operations
  - Webhook signature verification utilities
  - Complete TypeScript definitions

  **CLI Commands:**
  - `sendly webhooks create` - Create new webhooks
  - `sendly webhooks list` - List all webhooks
  - `sendly webhooks get <id>` - Get webhook details
  - `sendly webhooks update <id>` - Update webhook configuration
  - `sendly webhooks delete <id>` - Remove webhooks
  - `sendly webhooks test <id>` - Test webhook endpoints
  - `sendly webhooks rotate-secret <id>` - Rotate webhook secrets
  - `sendly webhooks deliveries <id>` - View delivery history
  - `sendly webhooks listen` - Local webhook development tunnel

  **API Endpoints:**
  - Complete webhook CRUD operations
  - Webhook delivery tracking and retry logic
  - Secret rotation with zero-downtime

  **Developer Experience:**
  - Local tunnel for webhook development
  - Comprehensive delivery tracking
  - Automatic retry logic for failed deliveries
  - Rich CLI output with status indicators

## 2.2.0

### Minor Changes

- [`56fa46e`](https://github.com/SendlyHQ/sendly/commit/56fa46e95e0c3cded81e3c45a7f25e6bb8088e8c) Thanks [@SendlyHQ](https://github.com/SendlyHQ)! - Enhanced CLI with batch messaging, scheduled SMS, and improved developer experience.

  **✨ New Features:**

  **Batch Messaging:**
  - `sendly sms batch --file messages.csv` - Send bulk SMS from CSV
  - `sendly sms batch --json messages.json` - Send from JSON file
  - Progress tracking and delivery status updates
  - Support for up to 1,000 messages per batch

  **Scheduled Messages:**
  - `sendly sms schedule` - Schedule messages for future delivery
  - `sendly sms scheduled` - List all scheduled messages
  - `sendly sms cancel <id>` - Cancel scheduled messages
  - Timezone support for accurate delivery timing

  **Enhanced Developer Experience:**
  - `sendly doctor` - Comprehensive system diagnostics
  - `sendly logs tail` - Real-time log streaming
  - Improved error messages with actionable guidance
  - Color-coded output for better readability
  - Interactive prompts for complex operations
