# AI Helm

An open-source universal AI interface with intelligent middleware that optimizes prompts, selects the best AI model for each task, and provides a full-featured admin and learning platform.

## Features

**Intelligent Model Selection** - Automatically selects the optimal AI model (GPT, Claude, Gemini) based on task type, complexity, and cost via a configurable dynamic router. Model versions auto-update via provider API discovery.

**Consolidated Analysis Pipeline** - Single-call analysis extracts intent, sentiment, style, security risk, task type, complexity, and prompt quality in one LLM request (~75% cost reduction vs. individual calls).

**Real-Time Streaming** - WebSocket-based response streaming with live analysis dashboard showing processing phases, stop button for cancellation, and automatic retry with model upgrade when validation detects a poor response.

**Authentication & Multi-User** - OAuth login via Google and GitHub, session management, role-based access (user/admin), organization support.

**Dynamic Model Router** - Configurable rule-based routing with version history, natural language editing ("make coding tasks use Claude"), side-by-side version comparison, and extensible task types. Beyond the 6 built-in types (coding, math, creative, conversation, analysis, general), users can define custom task types (e.g., "customer-support", "legal-research") that are automatically injected into the LLM analysis prompt for classification. New rules can be created via "Describe with AI" — describe what you want in plain English and the LLM generates a complete rule, including novel task types when needed.

**Learning Center** - Built-in curriculum with 11 lessons across 5 categories, prerequisite gating, and progress tracking.

**Admin Console** - Organization analytics, cost analysis, model performance metrics, user management, API key approval workflows, demo API key management with encrypted persistence, and users-needing-attention alerts. Accessible via ADMIN_SECRET in no-auth/demo mode.

**Data Loss Prevention (DLP)** - Automatic detection and redaction of sensitive data (credit cards, SSNs, API keys, emails, phone numbers, IBANs, IPs) before any message reaches an AI provider. Validated with Luhn checks and pattern-specific rules to minimize false positives. Users see a warning; sensitive data never leaves the server.

**Privacy-First Architecture** - User-provided API keys stored locally in browser, never on servers. Optional server-side AES-256-GCM encryption for org-managed keys. API keys validated before saving with per-key inline validation, and Show Key button secured to only reveal freshly-entered keys.

**Provider Health Monitoring** - Real-time operational status of OpenAI, Anthropic, and Google Gemini fetched from their public status APIs. Displayed in the admin Health tab and as inline status indicators on the Settings page. Cached for 5 minutes with auto-refresh.

**Conversation Persistence** - Full conversation history with search, sidebar navigation, and WebSocket message saving.

**Progress Tracking** - Per-user prompt quality sparkline, trend indicators, lesson completion, and model usage stats visible in header and settings.

**Deep Research Detection** - LLM-based classifier determines whether a prompt warrants extended multi-source research (with heuristic fallback), replacing keyword-only detection.

**Demo Mode** - Public-facing demo with server-provided API keys, three-tier abuse protection (per-session, per-IP, and daily budget rate limiting), and automatic key injection. Demo keys manageable via admin console with encrypted file persistence. Users with their own keys bypass all demo limits.

**Beginner-Friendly Home Page** - Chat-dominant layout (70/30 split) with personalized welcome screen showing suggested prompts for new and returning users. Collapsible process log footer that shows real-time pipeline activity without overwhelming the interface. Analysis dashboard reordered by relevance: model+cost reasoning, prompt quality (always visible), optimized prompt, then collapsible details.

**Prompt Library & AI Assistants** - Database-backed catalog of 10 prompt templates and 5 AI assistant presets (Code Tutor, Writing Coach, Research Assistant, Creative Brainstormer, Data Analyst). Browseable via a slide-out sheet with search, category filtering, and usage tracking. Templates fill the chat input; presets activate a custom system prompt for the conversation.

**System Context Injection** - Three-layer system prompt construction: base context (what AI Helm is), user context (experience level and prompt quality trends), and preset context (active AI assistant persona). Injected per-provider: OpenAI system message, Anthropic system parameter, Gemini systemInstruction.

## Quick Start

### Prerequisites

- Node.js 18+
- npm
- PostgreSQL database (required for auth and persistence)
- API keys from at least one provider:
  - [Google AI Studio](https://aistudio.google.com/apikey) (Gemini)
  - [OpenAI Platform](https://platform.openai.com/api-keys) (GPT)
  - [Anthropic Console](https://console.anthropic.com/) (Claude)

### Installation

```bash
# Clone the repository
git clone https://github.com/mishanovini/ai-helm.git
cd ai-helm

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your configuration (see Environment Variables below)

# Push database schema
npm run db:push

# Start development server
npm run dev
```

The application will be available at `http://localhost:3000`.

### First-Time Setup

1. Navigate to **Settings** (gear icon)
2. Enter your API key(s) - at least one provider required
3. Click **Save API Keys**
4. Return to home and start chatting

If authentication is enabled (`REQUIRE_AUTH=true`), you'll be prompted to sign in via Google or GitHub first.

## Architecture

```
User Prompt
    |
DLP Scan (detect & redact sensitive data)
    |-- Credit cards, SSNs, API keys, emails, phones, IBANs, IPs
    |-- Warn user if PII detected; redact for all downstream calls
    |
Consolidated Analysis (single LLM call, using redacted message)
    |-- Intent Detection
    |-- Sentiment Analysis
    |-- Style Inference
    |-- Security Risk Scoring (regex pre-check + AI)
    |-- Task Type & Complexity Classification (core + custom types from router rules)
    |-- Prompt Quality Scoring
    |
Dynamic Router (rule evaluation)
    |-- Match against configured rules (first-match-wins)
    |-- Fall back to catch-all model priority
    |
Parameter Tuning (temperature, top_p, max_tokens)
    |
AI Response Generation (selected model, streamed)
    |
Response Validation (pass/fail quality check)
    |-- If failed: retry with upgraded model + adjusted parameters
    |
User Progress Update
    |
Display to User
```

### Model Selection Logic

The dynamic router evaluates rules in order. Default rules include:

- **Simple tasks** - Ultra-cheap models (Gemini Flash-Lite, GPT Nano)
- **Complex coding** - Claude Sonnet or Gemini Pro
- **Advanced math** - Gemini Pro
- **Creative writing** - Claude Opus or Claude Sonnet
- **Conversation** - GPT
- **Large context (>200K tokens)** - Gemini Pro (1M token window)

Model versions are automatically discovered from provider APIs (checked daily at noon PST). The codebase uses version-free aliases (e.g., "gemini-pro" instead of "gemini-2.5-pro") that resolve to the latest available version at runtime. Admins can trigger manual model checks from the Admin Console > Models tab.

Rules are fully customizable via the Router page, including natural language editing.

## Project Structure

```
ai-helm/
|-- client/                    # React + TypeScript frontend
|   |-- src/
|       |-- pages/             # Home, Settings, Router, Admin, Learn, Login
|       |-- components/        # UI components, ErrorBoundary, ProgressWidget
|       |-- hooks/             # use-auth, use-websocket, use-toast
|       |-- lib/               # api-keys, utils
|-- server/                    # Express.js backend
|   |-- routes.ts              # REST API + WebSocket server
|   |-- auth.ts                # OAuth strategies (Google, GitHub)
|   |-- storage.ts             # DatabaseStorage (Drizzle ORM)
|   |-- analysis-orchestrator.ts  # Pipeline coordinator
|   |-- consolidated-analysis.ts  # Single-call analysis
|   |-- dynamic-router.ts      # Rule engine + NL editing
|   |-- response-generator.ts  # Multi-provider streaming
|   |-- encryption.ts          # AES-256-GCM for API keys
|   |-- dlp-scanner.ts         # Data Loss Prevention (PII detection & redaction)
|   |-- provider-status.ts     # Real-time provider health monitoring
|   |-- demo-budget.ts         # Demo mode rate limiter + budget tracker
|   |-- model-discovery.ts     # Auto-discovery of latest model versions
|   |-- db.ts                  # Database connection (lazy init)
|-- shared/                    # Shared between client and server
|   |-- schema.ts              # 11-table Drizzle schema + Zod validation
|   |-- types.ts               # Shared TypeScript interfaces
|   |-- model-aliases.ts       # Version-free alias registry + resolution
|   |-- model-selection.ts     # Model catalog + decision tree
|   |-- curriculum.ts          # Learning system lessons
|-- tests/                     # Vitest test suite
|   |-- shared/                # Model selection tests
|   |-- server/                # Router, encryption, analysis tests
|-- vitest.config.ts           # Test configuration
```

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, wouter, React Query
- **Backend**: Express.js, WebSocket (ws), TypeScript
- **Database**: PostgreSQL + Drizzle ORM + Zod validation
- **Auth**: Passport.js (Google OAuth, GitHub OAuth), connect-pg-simple sessions
- **AI Providers**: Google GenAI, OpenAI, Anthropic SDKs
- **Testing**: Vitest

## Available Scripts

```bash
npm run dev          # Start development server with HMR
npm run build        # Build for production (Vite + esbuild)
npm start            # Run production build
npm run check        # TypeScript type checking
npm test             # Run test suite (vitest)
npm run test:watch   # Run tests in watch mode
npm run db:push      # Sync database schema to PostgreSQL
```

## Environment Variables

Create a `.env` file from `.env.example`:

```bash
# Required
DATABASE_URL=postgresql://user:password@localhost:5432/aihelm

# Authentication (set REQUIRE_AUTH=true to enable)
REQUIRE_AUTH=false
SESSION_SECRET=your-secure-random-string
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret

# Server-side API key encryption (optional, for org-managed keys)
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_KEY=64-char-hex-string

# Admin console access for no-auth/demo mode
# When REQUIRE_AUTH=false, the admin console requires this secret.
# Generate with: openssl rand -base64 32
ADMIN_SECRET=your-admin-secret

# Server
PORT=3000
NODE_ENV=development
```

User-provided API keys are stored in browser `localStorage` and are never sent to the AI Helm server.

### Demo Mode Variables

```bash
# Enable demo mode for public access with server-provided keys
DEMO_MODE=false
DEMO_GEMINI_KEY=your-demo-gemini-key
DEMO_OPENAI_KEY=your-demo-openai-key
DEMO_ANTHROPIC_KEY=your-demo-anthropic-key

# Rate limits
DEMO_SESSION_LIMIT=10      # Messages per session per hour
DEMO_IP_LIMIT=30           # Messages per IP per hour (prevents bot flooding)
DEMO_DAILY_BUDGET=2.00     # Max USD spend per day across all demo users
```

See the [Demo Mode](#demo-mode) section below for details.

## API Endpoints

### Authentication
- `GET /auth/google` - Google OAuth login
- `GET /auth/github` - GitHub OAuth login
- `GET /auth/me` - Current user info
- `POST /auth/logout` - Sign out

### Conversations
- `POST /api/conversations` - Create conversation
- `GET /api/conversations` - List conversations
- `GET /api/conversations/search?q=` - Search conversations
- `GET /api/conversations/:id/messages` - Get messages
- `DELETE /api/conversations/:id` - Delete conversation

### Router Configuration
- `GET /api/router/config` - Get active config
- `PUT /api/router/config` - Update config (creates version)
- `GET /api/router/config/history` - Version history
- `POST /api/router/config/revert/:version` - Revert to version
- `POST /api/router/config/edit-natural-language` - AI-powered batch config editing
- `POST /api/router/config/generate-rule` - Generate a single rule from natural language description

### User Progress
- `GET /api/progress` - Current user's progress

### Provider Status
- `GET /api/providers/status` - Real-time operational status of all AI providers (no auth required)

### Demo
- `GET /api/demo-status` - Demo mode status (no auth required)

### API Key Validation
- `POST /api/validate-keys` - Bulk validate API keys (all provided must pass)
- `POST /api/validate-key` - Single key inline validation
- `POST /api/classify-research` - LLM-based deep research classification

### Admin (requires admin role or ADMIN_SECRET header)
- `POST /api/admin/verify-secret` - Verify admin secret for no-auth mode access
- `GET /api/admin/demo-keys` - Get demo key status (masked previews)
- `PUT /api/admin/demo-keys` - Update demo API keys (validates before saving)
- `GET /api/admin/analytics/overview` - Org analytics
- `GET /api/admin/analytics/model-usage` - Model usage stats
- `GET /api/admin/users` - User list with progress
- `GET /api/admin/api-keys` - API key management
- `PATCH /api/admin/api-keys/:id` - Approve/reject keys
- `PATCH /api/admin/settings` - Update org settings
- `GET /api/admin/models/status` - Current model alias mappings + last discovery report
- `POST /api/admin/models/check-updates` - Trigger manual model discovery

### WebSocket
- `ws://localhost:3000/ws` - Analysis pipeline streaming + chat

## Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch
```

Test coverage includes:
- **Model selection** (42 tests) - catalog integrity, prompt analysis, optimal model selection, creative routing, cost estimation, custom task type handling
- **Dynamic router** (32 tests) - default rules, condition matching, first-match-wins evaluation, custom task type extraction, mixed core+custom matching
- **Encryption** (9 tests) - round-trip, random IV, unicode, tampering detection
- **Consolidated analysis** (33 tests) - schema validation, security regex patterns, JSON parsing
- **Demo budget** (23 tests) - per-session and per-IP rate limiting, daily budget cap, midnight reset, status reporting
- **Model aliases & discovery** (35 tests) - alias registry, pattern matching, resolution, reverse lookup, update/reset
- **DLP scanner** (26 tests) - credit card (Luhn), SSN, API key, email, phone, IP detection, false-positive filtering, redaction
- **Provider status** (19 tests) - Atlassian/Google API parsing, degraded/outage detection, caching, error handling

## Demo Mode

Demo mode allows you to host a public-facing instance where visitors can experience AI Helm's intelligent routing without providing their own API keys. You provide demo API keys via environment variables, and the server injects them for unauthenticated users.

### How It Works

1. Set `DEMO_MODE=true` and provide at least one `DEMO_*_KEY` in your `.env`
2. Visitors without their own API keys see a demo banner with remaining message count
3. The full intelligent routing pipeline runs (no forced cheap model) so visitors experience the real product
4. Three layers of abuse protection prevent API key exhaustion:
   - **Per-session limit** (default: 10 messages/hour per WebSocket connection)
   - **Per-IP limit** (default: 30 messages/hour, prevents bot session flooding)
   - **Daily budget cap** (default: $2.00/day across all demo users, resets at midnight UTC)
5. When visitors add their own keys in Settings, they bypass all demo limits and get unlimited access

### Setup

```bash
# .env
DEMO_MODE=true
DEMO_GEMINI_KEY=your-gemini-key
DEMO_OPENAI_KEY=your-openai-key
DEMO_ANTHROPIC_KEY=your-anthropic-key
DEMO_DAILY_BUDGET=2.00
DEMO_SESSION_LIMIT=10
DEMO_IP_LIMIT=30
```

Rate limiting state is in-memory (resets on server restart), which is acceptable for a demo. Rate windows are rolling (1-hour window), and the daily budget resets at midnight UTC.

### Admin-Managed Demo Keys

Demo API keys can also be managed via the Admin Console (Demo Keys tab) instead of environment variables. Keys set via the admin UI are:
- Encrypted at rest using AES-256-GCM (requires `ENCRYPTION_KEY`)
- Persisted to `.demo-keys.json` (in `.gitignore`)
- Validated with each provider before saving
- Merged with existing keys (update individual providers without affecting others)

Admin UI keys take priority over environment variables.

## Production Deployment

### Security Checklist

- [ ] HTTPS/TLS enabled
- [ ] `SESSION_SECRET` set to a strong random value
- [ ] `ENCRYPTION_KEY` set for server-side key storage
- [ ] Database secured with strong password
- [ ] Rate limiting at reverse proxy level
- [ ] CORS configured for allowed origins
- [ ] `.env` file secured (never committed)
- [ ] Content Security Policy headers configured
- [ ] Regular `npm audit` runs

### Example Deployment (nginx + PM2)

```bash
npm run build
pm2 start npm --name "ai-helm" -- start
# Configure nginx reverse proxy with SSL, CSP headers, rate limiting
```

## Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes
4. Push and open a Pull Request

## License

Apache License 2.0 - see [LICENSE](LICENSE) for details.

## Acknowledgments

- Built with [shadcn/ui](https://ui.shadcn.com/) components
- Powered by [Gemini](https://ai.google.dev/), [OpenAI](https://openai.com/), and [Anthropic](https://anthropic.com/) AI models
