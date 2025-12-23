# @sendly/cli

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
