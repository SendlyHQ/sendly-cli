# @sendly/cli

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
  - **sms schedule**: Fixed time validation to enforce Telnyx's actual limits:
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

- [`2082b3a`](https://github.com/sendly-live/sendly/commit/2082b3a30c605529aa8f891c0d13c5169ce4db00) Thanks [@sendly-live](https://github.com/sendly-live)! - ## Bug Fixes
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

- [`49ae989`](https://github.com/sendly-live/sendly/commit/49ae9892f7a4bc192ecb0d665f1f450f5d9208be) Thanks [@sendly-live](https://github.com/sendly-live)! - - Add retry logic with exponential backoff for 5xx server errors
  - Fix User-Agent header to use dynamic version from package.json
  - Remove dead EventSource code from webhook listener
  - Fix README config path documentation

## 3.0.1

### Patch Changes

- Added missing `onboarding` command that was referenced in codebase but not included in 3.0.0 build

## 3.0.0

### Major Changes

- [`c5a261b`](https://github.com/sendly-live/sendly/commit/c5a261b8306e53be9d0cf37cd35827f1ec709817) Thanks [@sendly-live](https://github.com/sendly-live)! - feat: complete CLI authentication system with OAuth device flow and secure onboarding

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
  - Test SMS sandbox (`+15550001234`, etc.) for development
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

- [`ed8ebb5`](https://github.com/sendly-live/sendly/commit/ed8ebb5ede1ba9ba624906e8ce348711a2b513ea) Thanks [@sendly-live](https://github.com/sendly-live)! - Complete webhook system implementation with full SDK and CLI support.

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

- [`56fa46e`](https://github.com/sendly-live/sendly/commit/56fa46e95e0c3cded81e3c45a7f25e6bb8088e8c) Thanks [@sendly-live](https://github.com/sendly-live)! - Enhanced CLI with batch messaging, scheduled SMS, and improved developer experience.

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
