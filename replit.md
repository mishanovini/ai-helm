# AI Middleware & Analysis Tool

## Overview

This is an AI middleware platform that provides real-time analysis and intelligent prompt optimization for AI interactions. The system analyzes user prompts across multiple dimensions (intent, sentiment, style, security), selects optimal AI models, and optimizes prompts before sending them to AI providers. It features a split-screen interface with a chat panel and a live analysis dashboard that displays real-time processing insights.

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
- Google Gemini AI (via `@google/genai` SDK) as primary analysis provider
- Modular analysis functions in `gemini-analysis.ts`:
  - Intent detection (categorizes user goal)
  - Sentiment analysis (positive/neutral/negative)
  - Style inference (formal, casual, technical, etc.)
  - Security risk scoring (0-10 scale with explanation)
  - Model selection (chooses appropriate Gemini model)
  - Prompt optimization (rewrites for better results)
  - Parameter tuning (temperature, top_p, max_tokens)

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

### External Dependencies

**AI Provider Services**
- Google Gemini AI (primary): Multi-model support, analysis capabilities
  - API Key: `GEMINI_API_KEY` environment variable
  - Models: Gemini 2.5 Flash-Lite (fast), Gemini 2.5 Pro (deep research)
- Anthropic SDK included but not actively used in current implementation

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