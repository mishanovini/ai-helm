# AI Helm 🤖⚡

An open-source universal AI interface with intelligent middleware that optimizes prompts and selects the best AI model for each task.

## Features

✨ **Intelligent Model Selection** - Automatically selects the optimal AI model (GPT-5, Claude 4.5, Gemini 2.5) based on task type, complexity, and cost
📊 **Real-Time Analysis Dashboard** - Live processing insights showing intent, sentiment, style, security, and optimization phases
🔐 **Privacy-First Architecture** - User-provided API keys stored locally in browser, never on servers
💰 **Cost Transparency** - Displays estimated cost before generation with intelligent cost optimization
🎯 **Response Validation** - Analyzes AI responses to verify they address user intent
🔄 **Conversation Threading** - Full conversation history sent to AI models for contextual responses
⚡ **WebSocket Streaming** - Real-time log streaming of analysis pipeline

## Quick Start

### Prerequisites

- Node.js 18+ 
- npm or yarn
- PostgreSQL database (for production)
- API keys from at least one provider:
  - [Google AI Studio](https://makersuite.google.com/app/apikey) (Gemini)
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

# Edit .env and add your DATABASE_URL (required for production)
# Note: API keys are provided by users via web interface, not .env

# Run database setup (if using authentication)
npm run db:push

# Start development server
npm run dev
```

The application will be available at `http://localhost:5000`

### First-Time Setup

1. Navigate to **Settings** (gear icon in top-right)
2. Enter your API key(s) - you only need one provider minimum
3. Click **Save API Keys**
4. Return to home and start chatting!

## How It Works

### Architecture Overview

```
User Prompt
    ↓
Analysis Pipeline (Gemini 2.5 Flash-Lite)
    ├── Intent Detection
    ├── Sentiment Analysis
    ├── Style Inference
    ├── Security Risk Scoring
    ├── Prompt Optimization
    └── Model Selection
    ↓
Parameter Tuning (temperature, top_p, max_tokens)
    ↓
AI Response Generation (Selected Model)
    ↓
Response Validation
    ↓
Display to User
```

### Model Selection Logic

AI Helm uses a decision tree to select the optimal model:

- **Simple tasks** → Ultra-cheap models (Gemini Flash-Lite $0.10, GPT-5 Nano $0.15)
- **Creative writing** → Claude Opus/Sonnet for style preservation
- **Complex coding** → Claude Sonnet 4.5 (77.2% SWE-bench)
- **Advanced math** → Gemini 2.5 Pro (86.7% AIME)
- **Large context** → Gemini 2.5 Pro (1M token window)
- **Speed-critical** → Fastest available model

### Privacy & Security

🔒 **Your API Keys**:
- Stored in browser `localStorage` only
- Never transmitted to AI Helm servers
- Sent directly to AI providers (Gemini, OpenAI, Anthropic)
- You maintain full control and billing

⚠️ **Security Considerations**:
- localStorage is vulnerable to XSS attacks
- Always deploy with HTTPS in production
- Configure Content Security Policy headers
- See [SECURITY.md](SECURITY.md) for full details

## Development

### Project Structure

```
ai-helm/
├── client/           # React + TypeScript frontend
│   ├── src/
│   │   ├── pages/    # Home, Settings pages
│   │   ├── components/ # UI components
│   │   └── lib/      # Utilities (API keys, WebSocket)
├── server/           # Express.js backend
│   ├── routes.ts     # API routes + WebSocket
│   ├── analysis-orchestrator.ts  # Pipeline coordinator
│   ├── universal-analysis.ts     # Multi-provider analysis
│   └── response-generator.ts     # AI response generation
├── shared/           # Shared types and logic
│   ├── schema.ts     # Database schema (Drizzle ORM)
│   └── model-selection.ts  # Model decision tree
└── SECURITY.md       # Security documentation
```

### Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui
- **Backend**: Express.js, WebSocket (ws), TypeScript
- **Database**: PostgreSQL + Drizzle ORM (optional, for auth)
- **AI Providers**: Gemini, OpenAI, Anthropic SDKs

### Available Scripts

```bash
npm run dev          # Start development server with HMR
npm run build        # Build for production
npm run db:push      # Sync database schema
npm run db:generate  # Generate Drizzle migrations
```

### Environment Variables

Create a `.env` file (see `.env.example`):

```bash
DATABASE_URL=postgresql://user:password@localhost:5432/dbname
PORT=5000
NODE_ENV=development
SESSION_SECRET=your-secure-random-string
```

**Note**: API keys are NOT stored in `.env` - users provide them via the web interface.

## Production Deployment

### Security Checklist

- [ ] HTTPS/TLS enabled (required)
- [ ] Content Security Policy headers configured
- [ ] Database secured with strong password
- [ ] Rate limiting at reverse proxy level
- [ ] CORS configured for allowed origins
- [ ] `.env` file secured (never committed to git)
- [ ] Regular `npm audit` runs
- [ ] Monitoring and error logging enabled

### Example Deployment (nginx + PM2)

```bash
# Build production bundle
npm run build

# Start with PM2
pm2 start npm --name "ai-helm" -- start

# nginx reverse proxy (see SECURITY.md for full config)
# Configure SSL, CSP headers, rate limiting
```

### Replit Deployment

This project is Replit-ready:

1. Import repository to Replit
2. Set `DATABASE_URL` secret
3. Click **Run**
4. Share your Repl URL

## Configuration

### Model Pricing (Update as needed)

Edit `shared/model-selection.ts` to update pricing:

```typescript
export const MODEL_PRICING: Record<string, ModelPricing> = {
  'gemini-2.5-flash-lite': { input: 0.10, output: 0.40 },
  'gpt-5': { input: 2.00, output: 8.00 },
  // ...
};
```

### Analysis Model

The analysis pipeline uses the cheapest available model (default: Gemini 2.5 Flash-Lite).
Change in `server/analysis-orchestrator.ts`:

```typescript
const analysisModel = selectCheapestModel(availableProviders);
```

## Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Security Contributions

See [SECURITY.md](SECURITY.md) for vulnerability reporting and security checklist.

## Roadmap

- [ ] User authentication system
- [ ] Server-side key encryption
- [ ] Conversation history persistence
- [ ] Custom model configurations
- [ ] Customization of model decision tree
- [ ] Org-wide design allowing central management of multiple users
- [ ] Batch processing mode
- [ ] API endpoint for programmatic access
- [ ] Multi-language support
- [ ] Prompt templates library

## License

Apache License 2.0 - see [LICENSE](LICENSE) for details

## Acknowledgments

- Built with [shadcn/ui](https://ui.shadcn.com/) components
- Powered by [Gemini](https://ai.google.dev/), [OpenAI](https://openai.com/), and [Anthropic](https://anthropic.com/) AI models
- Inspired by the need for transparent AI middleware

## Support

- 📖 [Documentation](SECURITY.md)
- 🐛 [Issue Tracker](https://github.com/mishanovini/ai-helm/issues)
- 💬 [Discussions](https://github.com/mishanovini/ai-helm/discussions)

---

Made with ❤️ for the open-source community
