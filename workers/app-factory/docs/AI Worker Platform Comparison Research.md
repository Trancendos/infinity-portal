# AI Worker Platform Comparison Research

## 1. bolt.diy (18.9k stars, 10.3k forks)

### Core Features
- **19+ AI Provider Integrations**: OpenAI, Anthropic, Google, Groq, xAI, DeepSeek, Mistral, Cohere, Together, Perplexity, HuggingFace, Ollama, LM Studio, OpenRouter, Moonshot, Hyperbolic, GitHub Models, Amazon Bedrock, OpenAI-like
- **Full-stack web development**: NodeJS-based applications directly in browser
- **Attach images to prompts**: Better contextual understanding
- **Integrated terminal**: View output of LLM-run commands
- **Code version control**: Revert code to earlier versions
- **Download projects as ZIP**: Easy portability
- **Multi-platform deployment**: Netlify, Vercel, GitHub Pages
- **Electron desktop app**: Native desktop experience
- **Data visualization**: Integrated charts and graphs
- **Git integration**: Clone, import, deployment
- **MCP (Model Context Protocol)**: Enhanced AI tool integration
- **Codebase search**: Search through your codebase
- **File locking system**: Prevents conflicts during AI code generation
- **Diff view**: See changes made by AI
- **Supabase integration**: Database management
- **Expo app creation**: React Native development
- **Voice prompting**: Audio input for prompts
- **Bulk chat operations**: Delete multiple chats
- **Project snapshot restoration**: Restore from snapshots

### In Progress/Planned
- Backend Agent Architecture (move from single model calls to agent-based system)
- LLM Prompt Optimization for smaller models
- Project Planning Documentation (LLM-generated markdown plans)
- VSCode Integration
- Document Upload for Knowledge (reference materials, coding style guides)
- Azure OpenAI, Vertex AI, Granite providers

### Tech Stack
- Frontend: React + Vite
- Cloudflare Workers support
- Docker support
- Vercel AI SDK

---

## 2. Cloudflare VibeSDK (4.7k stars, 1.1k forks)

### Core Features
- **AI Code Generation**: Phase-wise development with intelligent error correction
- **Live Previews**: App previews running in sandboxed containers
- **Interactive Chat**: Guide development through natural conversation
- **Modern Stack**: Generates React + TypeScript + Tailwind apps
- **One-Click Deploy**: Deploy to Workers for Platforms
- **GitHub Integration**: Export code directly to repositories
- **SDK for Programmatic Access**: TypeScript SDK (@cf-vibesdk/sdk)

### Architecture
- **Frontend**: React + Vite with modern UI components
- **Backend**: Workers with Durable Objects for AI agents
- **Database**: D1 (SQLite) with Drizzle ORM
- **AI**: Multiple LLM providers via AI Gateway
- **Containers**: Sandboxed app previews and execution
- **Storage**: R2 buckets for templates, KV for sessions
- **Deployment**: Workers for Platforms with dispatch namespaces

### Phase-based Code Generation
1. Planning Phase: Analyzes requirements, creates file structure
2. Foundation Phase: Generates package.json, basic setup files
3. Core Phase: Creates main components and logic
4. Styling Phase: Adds CSS and visual design
5. Integration Phase: Connects APIs and external services
6. Optimization Phase: Performance improvements and error fixes

### Key Differentiators
- Durable Objects for stateful AI agents
- Workers for Platforms deployment
- Zero-knowledge vault for secrets
- Presentation and documentation preview modes

---

## 3. Infinity Admin Runner v4.0 (Current)

### Current Features
- **Multi-AI provider support**: Gemini, OpenAI, Anthropic, Groq, DeepSeek (configured)
- **Scout Analysis**: Pre-flight analysis before AI calls
- **Cognitive Enhancement**: Enhanced reasoning capabilities
- **Compliance Framework**: GDPR, ISO 27001, SOC 2
- **Rate Limiting**: SlowAPI integration
- **Caching**: Redis-based (optional) + local cache
- **Health monitoring**: Component status tracking
- **Security headers**: XSS, CSRF, CSP protection
- **Mobile-friendly UI**: Responsive design

### Missing Features (Compared to bolt.diy & VibeSDK)
1. No code generation capability
2. No file system management
3. No project scaffolding
4. No live preview
5. No Git integration
6. No deployment automation
7. No MCP support
8. No image attachment to prompts
9. No voice input
10. No diff view
11. No codebase search
12. No SDK for programmatic access
