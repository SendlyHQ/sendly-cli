# @sendly/cli

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
  - Fixed PHP SDK naming consistency: `Sendly\\SendlyClient` → `Sendly\\Sendly` across 25 code examples
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
