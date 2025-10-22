# AI Middleware & Analysis Tool

## Overview

This is an open-source AI middleware platform that provides real-time analysis and intelligent prompt optimization for AI interactions. The system analyzes user prompts across multiple dimensions (intent, sentiment, style, security), selects optimal AI models, and optimizes prompts before sending them to AI providers. It features a split-screen interface with a chat panel and a live analysis dashboard that displays real-time processing insights.

**Open-Source Distribution Model**: Users provide their own API keys for AI providers (Gemini, OpenAI, Anthropic). Keys are stored locally in the browser and never transmitted to or stored on our servers. This ensures privacy and allows anyone to run the application with their own credentials.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework & Build System**
- React 18 with TypeScript for type-safe component development
- Vite as the build tool and development server for fast HMR and optimized production builds
- Wouter for lightweight client-side routing (single home page with analysis interface)

**UI Component System**
- shadcn/ui component library built on Radix UI primitives for accessible, customizable components
- Tailwind CSS for utility-first styling with custom design tokens
- Design follows Material Design + Linear aesthetics with dark mode as primary theme
- Custom CSS variables for theming (defined in `index.css`) supporting both light and dark modes

**State Management & Data Flow**
- TanStack Query (React Query) for server state management and caching
- WebSocket-based real-time communication for streaming analysis updates from server
- Custom `useWebSocket` hook manages connection lifecycle and message handling
- Component-local state (useState) for UI-specific state like modals and form inputs

**Key UI Patterns**
- Split-screen layout: Chat interface (left) + Analysis Dashboard (right)
- Real-time log stream displays step-by-step middleware processing
- Analysis dashboard shows structured data fields (intent, sentiment, security score, etc.)
- Modal confirmation for deep research mode with estimated time warnings
- Settings page (`/settings`) for API key configuration
- Alert system when API keys are missing or invalid

**Routing**
- `/` - Home page with chat interface and analysis dashboard
- `/settings` - API key management and configuration

### Backend Architecture

**Server Framework**
- Express.js with TypeScript for HTTP routing and middleware
- WebSocket Server (ws library) for real-time bidirectional communication
- Hybrid approach: REST endpoints for compatibility + WebSocket for real-time analysis

**Analysis Pipeline (Orchestrator Pattern)**
- `analysis-orchestrator.ts` coordinates the multi-phase analysis workflow
- Phase 1: Six parallel analyses (intent, sentiment, style, security, model selection, prompt optimization)
- Phase 2: Sequential parameter tuning (depends on model selection)
- WebSocket sends incremental updates for each phase (processing/completed/error states)

**AI Integration Layer**
- **Gemini AI Required**: All analysis phases (intent, sentiment, style, security, prompt optimization) use Gemini as the primary analysis provider
- **Per-Request API Client Creation**: No singleton AI client - each request creates a new GoogleGenAI instance with user-provided API key
- User-provided API keys passed through WebSocket payloads to backend
- Server validates Gemini key presence before processing (required)
- Modular analysis functions in `gemini-analysis.ts`:
  - Intent detection (categorizes user goal)
  - Sentiment analysis (positive/neutral/negative)
  - Style inference (formal, casual, technical, etc.)
  - Security risk scoring (0-10 scale with explanation)
  - Prompt optimization (rewrites for better results)
  - Parameter tuning (temperature, top_p, max_tokens)
- All analysis functions accept `apiKey` parameter for dynamic client creation

**Intelligent Model Selection (`shared/model-selection.ts`)**
- Automated decision tree selects optimal AI model for final response generation
- **Latest Models Only**: GPT-5/Mini/Nano, Claude Sonnet 4.5/Haiku 4.5/Opus 4.1, Gemini 2.5 Pro/Flash/Flash-Lite
- **Lightweight Priority**: Defaults to ultra-cheap models ($0.10-$0.50 per 1M tokens) unless premium indicators detected:
  - Escalates for: complex coding keywords (refactor, architect), deep math proofs, long prompts (>2000 chars), explicit "complex/difficult"
- **Selection Criteria**:
  1. Large context (>200K tokens) → Gemini 2.5 Pro (only 1M token window)
  2. Standard tasks → Gemini Flash-Lite ($0.10) or GPT-5 Nano ($0.15)
  3. Complex coding → Claude Sonnet 4.5 (77.2% SWE-bench)
  4. Advanced math → Gemini 2.5 Pro (86.7% AIME)
  5. Creative writing → Claude Opus 4.1
  6. Conversation → GPT-5
  7. Deep reasoning → Claude Opus/Sonnet 4.5
  8. Multimodal (image/video) → Gemini 2.5 Pro/Flash
- **Partial Provider Support**: Works with 1-3 API providers (Gemini/OpenAI/Anthropic)
- **Cost Transparency**: Displays estimated cost before generation (no confirmation needed)
- **Selection Reasoning**: Explains why specific model was chosen ("Standard task. Using cost-efficient Gemini 2.5 Flash-Lite (0.1¢ per 1K input tokens)")
- Returns primary + fallback model (future retry logic placeholder)

**Development & Production Modes**
- Vite middleware integration in development for HMR and SSR
- Production build serves static files from dist/public
- Environment-aware configuration (NODE_ENV detection)

### Data Storage Solutions

**Database Technology**
- PostgreSQL via Neon serverless database (@neondatabase/serverless)
- Drizzle ORM for type-safe database operations and migrations
- WebSocket constructor override (using ws library) for Neon compatibility

**Schema Design**
- User authentication schema defined in `shared/schema.ts`
- Users table: id (UUID), username (unique), password (hashed)
- Zod validation schemas for type-safe inserts
- Currently uses in-memory storage implementation (`MemStorage` in `storage.ts`) - database schema prepared for future migration

**Migration Strategy**
- Drizzle Kit for schema migrations (config in `drizzle.config.ts`)
- Migrations output to `./migrations` directory
- `db:push` script for schema synchronization

### API Key Management (Open-Source Model)

**Client-Side Storage**
- API keys stored in browser localStorage under key: `"ai_api_keys"`
- Utility module: `client/src/lib/api-keys.ts` provides:
  - `getStoredAPIKeys()`: Retrieve keys from localStorage
  - `saveAPIKeys(keys)`: Save keys to localStorage
  - `clearAPIKeys()`: Remove all keys
  - `hasAnyAPIKey(keys)`: Check if any key exists
  - `hasGeminiKey(keys)`: Check if required Gemini key exists
- Keys interface: `{ gemini: string, openai: string, anthropic: string }`

**Security & Privacy**
- Keys NEVER sent to or stored on application servers
- Keys transmitted only directly to respective AI providers (Gemini, OpenAI, Anthropic)
- localStorage is browser-specific and domain-scoped
- Users can clear keys at any time
- Privacy notice displayed on Settings page

**Backend Flow**
1. Client includes `apiKeys` in WebSocket message payload
2. Server validates Gemini key present (required for analysis)
3. API key passed to analysis orchestrator and all analysis functions
4. Each analysis creates temporary AI client instance with user's key
5. Key discarded after request completes

### External Dependencies

**AI Provider Services**
- Google Gemini AI (primary): Multi-model support, analysis capabilities
  - API Keys: User-provided via Settings page (stored in browser localStorage)
  - Models: Gemini 2.5 Flash-Lite (fast), Gemini 2.5 Pro (deep research)
- OpenAI SDK: Integrated for future multi-provider support (optional)
- Anthropic SDK: Integrated for future multi-provider support (optional)

**Database & Hosting**
- Neon PostgreSQL: Serverless database with WebSocket support
  - Connection: `DATABASE_URL` environment variable
  - Pool-based connection management

**Development Tools**
- Replit-specific plugins for development environment:
  - Runtime error modal overlay
  - Cartographer (code navigation)
  - Dev banner
- TypeScript for static type checking across full stack

**UI Dependencies**
- Radix UI primitives: 20+ component primitives for accessibility
- Tailwind CSS + autoprefixer for styling
- Lucide React for consistent iconography
- React Hook Form + Zod for form validation (hookform/resolvers)

**Real-time Communication**
- ws (WebSocket library) for server-side WebSocket handling
- Native browser WebSocket API for client-side connections
- JSON message protocol for structured data exchange