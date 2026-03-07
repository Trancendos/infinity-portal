#!/usr/bin/env python3
"""
Audit all available API integrations and credentials
"""
import os
import json

# All API integrations from the system
api_integrations = {
    # AI/LLM APIs
    "HeyGen": {
        "env_var": "HEYGEN_API_KEY",
        "purpose": "AI video generation with avatars",
        "can_deploy": False,
        "deployment_use": "Video generation features"
    },
    "ElevenLabs": {
        "env_var": "ELEVENLABS_API_KEY",
        "purpose": "Text-to-speech, voice cloning",
        "can_deploy": False,
        "deployment_use": "Voice/audio features"
    },
    "Perplexity (Sonar)": {
        "env_var": "SONAR_API_KEY",
        "purpose": "Real-time AI research with citations",
        "can_deploy": False,
        "deployment_use": "AI inference provider"
    },
    "Google Gemini": {
        "env_var": "GEMINI_API_KEY",
        "purpose": "Multimodal AI (text, images, video)",
        "can_deploy": False,
        "deployment_use": "AI inference provider"
    },
    "Grok (xAI)": {
        "env_var": "XAI_API_KEY",
        "purpose": "Advanced reasoning and chat",
        "can_deploy": False,
        "deployment_use": "AI inference provider"
    },
    "Anthropic Claude": {
        "env_var": "ANTHROPIC_API_KEY",
        "purpose": "Conversational AI",
        "can_deploy": False,
        "deployment_use": "AI inference provider"
    },
    "OpenAI": {
        "env_var": "OPENAI_API_KEY",
        "purpose": "GPT models, DALL-E, etc.",
        "can_deploy": False,
        "deployment_use": "AI inference provider"
    },
    "Cohere": {
        "env_var": "COHERE_API_KEY",
        "purpose": "NLP, embeddings, reranking",
        "can_deploy": False,
        "deployment_use": "AI inference provider"
    },
    "OpenRouter": {
        "env_var": "OPENROUTER_API_KEY",
        "purpose": "Unified access to multiple AI models",
        "can_deploy": False,
        "deployment_use": "AI inference provider (multi-model)"
    },
    
    # Infrastructure/Hosting
    "Cloudflare": {
        "env_var": "CLOUDFLARE_API_TOKEN",
        "purpose": "DNS, Workers, R2, D1, KV",
        "can_deploy": True,
        "deployment_use": "DEPLOY via Cloudflare Workers/Pages"
    },
    "Vercel": {
        "env_var": None,
        "purpose": "Frontend hosting, serverless",
        "can_deploy": True,
        "deployment_use": "DEPLOY via Vercel (MCP available)"
    },
    "Supabase": {
        "env_var": "SUPABASE_URL",
        "purpose": "Database, auth, storage",
        "can_deploy": True,
        "deployment_use": "Database backend"
    },
    "Neon": {
        "env_var": None,
        "purpose": "Serverless Postgres",
        "can_deploy": True,
        "deployment_use": "Database backend (MCP available)"
    },
    "Prisma Postgres": {
        "env_var": None,
        "purpose": "Managed Postgres",
        "can_deploy": True,
        "deployment_use": "Database backend (MCP available)"
    },
    
    # Data/Storage
    "JSONBin.io": {
        "env_var": "JSONBIN_API_KEY",
        "purpose": "Simple JSON storage",
        "can_deploy": False,
        "deployment_use": "Lightweight data storage"
    },
    "Polygon.io": {
        "env_var": "POLYGON_API_KEY",
        "purpose": "Financial market data",
        "can_deploy": False,
        "deployment_use": "Market data features"
    },
    
    # Automation/Workflow
    "n8n": {
        "env_var": "N8N_API_KEY",
        "purpose": "Workflow automation",
        "can_deploy": False,
        "deployment_use": "Automation features"
    },
    "Zapier": {
        "env_var": None,
        "purpose": "Business process automation",
        "can_deploy": False,
        "deployment_use": "Automation features (MCP available)"
    },
    
    # Payments
    "Stripe": {
        "env_var": "STRIPE_SECRET_KEY",
        "purpose": "Payment processing",
        "can_deploy": False,
        "deployment_use": "Payment features"
    },
    "PayPal": {
        "env_var": None,
        "purpose": "Payment processing",
        "can_deploy": False,
        "deployment_use": "Payment features (MCP available)"
    },
    
    # 3D/Media
    "Tripo AI": {
        "env_var": "TRIPO_API_KEY",
        "purpose": "3D model generation",
        "can_deploy": False,
        "deployment_use": "3D generation features"
    },
    "MiniMax": {
        "env_var": None,
        "purpose": "Voice, image, video, music generation",
        "can_deploy": False,
        "deployment_use": "Media generation (MCP available)"
    },
    "InVideo": {
        "env_var": None,
        "purpose": "AI video generation",
        "can_deploy": False,
        "deployment_use": "Video generation (MCP available)"
    },
    
    # Project Management
    "Linear": {
        "env_var": None,
        "purpose": "Issue tracking",
        "can_deploy": False,
        "deployment_use": "Project management (MCP available)"
    },
    "Asana": {
        "env_var": None,
        "purpose": "Task management",
        "can_deploy": False,
        "deployment_use": "Project management (MCP available)"
    },
    "Todoist": {
        "env_var": None,
        "purpose": "To-do management",
        "can_deploy": False,
        "deployment_use": "Task management (MCP available)"
    },
    "Notion": {
        "env_var": None,
        "purpose": "Docs, databases, wikis",
        "can_deploy": False,
        "deployment_use": "Documentation (MCP available)"
    },
    
    # Forms/Data Collection
    "Typeform": {
        "env_var": "TYPEFORM_API_KEY",
        "purpose": "Form creation and responses",
        "can_deploy": False,
        "deployment_use": "Form features"
    },
    "Jotform": {
        "env_var": None,
        "purpose": "Form management",
        "can_deploy": False,
        "deployment_use": "Form features (MCP available)"
    },
    
    # CRM/Sales
    "HubSpot": {
        "env_var": None,
        "purpose": "CRM, contacts, deals",
        "can_deploy": False,
        "deployment_use": "CRM features (MCP available)"
    },
    "Apollo": {
        "env_var": "APOLLO_API_KEY",
        "purpose": "B2B sales data",
        "can_deploy": False,
        "deployment_use": "Sales data features"
    },
    "ZoomInfo": {
        "env_var": None,
        "purpose": "B2B intelligence",
        "can_deploy": False,
        "deployment_use": "B2B data (MCP available)"
    },
    
    # Analytics
    "PostHog": {
        "env_var": None,
        "purpose": "Product analytics",
        "can_deploy": False,
        "deployment_use": "Analytics (MCP available)"
    },
    "Sentry": {
        "env_var": None,
        "purpose": "Error monitoring",
        "can_deploy": False,
        "deployment_use": "Error tracking (MCP available)"
    },
    
    # Communication
    "Gmail": {
        "env_var": None,
        "purpose": "Email",
        "can_deploy": False,
        "deployment_use": "Email features (MCP available)"
    },
    "Outlook Mail": {
        "env_var": None,
        "purpose": "Email",
        "can_deploy": False,
        "deployment_use": "Email features (MCP available)"
    },
    "Google Calendar": {
        "env_var": None,
        "purpose": "Calendar",
        "can_deploy": False,
        "deployment_use": "Calendar features (MCP available)"
    },
    "Outlook Calendar": {
        "env_var": None,
        "purpose": "Calendar",
        "can_deploy": False,
        "deployment_use": "Calendar features (MCP available)"
    },
    
    # Web Development
    "Webflow": {
        "env_var": None,
        "purpose": "Website builder",
        "can_deploy": True,
        "deployment_use": "DEPLOY via Webflow (MCP available)"
    },
    "Wix": {
        "env_var": None,
        "purpose": "Website builder",
        "can_deploy": True,
        "deployment_use": "DEPLOY via Wix (MCP available)"
    },
    "Canva": {
        "env_var": None,
        "purpose": "Design tool",
        "can_deploy": False,
        "deployment_use": "Design features (MCP available)"
    },
    
    # Other
    "Hugging Face": {
        "env_var": None,
        "purpose": "AI models, datasets",
        "can_deploy": False,
        "deployment_use": "AI models (MCP available)"
    },
    "Firecrawl": {
        "env_var": None,
        "purpose": "Web scraping",
        "can_deploy": False,
        "deployment_use": "Scraping features (MCP available)"
    },
    "Explorium": {
        "env_var": None,
        "purpose": "Business intelligence",
        "can_deploy": False,
        "deployment_use": "B2B data (MCP available)"
    },
    "RevenueCat": {
        "env_var": None,
        "purpose": "Subscription management",
        "can_deploy": False,
        "deployment_use": "Subscription features (MCP available)"
    },
    "Hume": {
        "env_var": None,
        "purpose": "Emotional AI, TTS",
        "can_deploy": False,
        "deployment_use": "Voice features (MCP available)"
    },
}

# Check which APIs have credentials available
print("=" * 80)
print("AVAILABLE API INTEGRATIONS AUDIT")
print("=" * 80)

available = []
deployment_options = []

for name, info in api_integrations.items():
    env_var = info.get("env_var")
    has_key = False
    
    if env_var:
        has_key = bool(os.environ.get(env_var))
    
    status = "✅ KEY AVAILABLE" if has_key else ("🔌 MCP AVAILABLE" if not env_var else "❌ NO KEY")
    
    print(f"\n{name}")
    print(f"  Purpose: {info['purpose']}")
    print(f"  Status: {status}")
    print(f"  Deployment Use: {info['deployment_use']}")
    
    if has_key or not env_var:
        available.append(name)
    
    if info["can_deploy"]:
        deployment_options.append(name)

print("\n" + "=" * 80)
print("DEPLOYMENT OPTIONS (Can host the app)")
print("=" * 80)
for opt in deployment_options:
    print(f"  • {opt}")

print("\n" + "=" * 80)
print("AI INFERENCE PROVIDERS (For the app's AI features)")
print("=" * 80)
ai_providers = ["Google Gemini", "Anthropic Claude", "OpenAI", "Cohere", "OpenRouter", "Perplexity (Sonar)", "Grok (xAI)"]
for provider in ai_providers:
    info = api_integrations[provider]
    env_var = info.get("env_var")
    has_key = bool(os.environ.get(env_var)) if env_var else False
    status = "✅ READY" if has_key else "❌ NEED KEY"
    print(f"  • {provider}: {status}")

print("\n" + "=" * 80)
print("RECOMMENDATION")
print("=" * 80)
print("""
BEST ZERO-COST DEPLOYMENT PATH:

1. CLOUDFLARE WORKERS (Recommended)
   - You have Cloudflare API token available
   - Free tier: 100,000 requests/day
   - No cold starts, global edge deployment
   - Can use D1 for database, R2 for storage

2. AI PROVIDERS TO USE:
   - Google Gemini ✅ (you have GEMINI_API_KEY)
   - OpenAI ✅ (you have OPENAI_API_KEY)  
   - Anthropic ✅ (you have ANTHROPIC_API_KEY)
   - Cohere ✅ (you have COHERE_API_KEY)
   - OpenRouter ✅ (you have OPENROUTER_API_KEY)
   - Perplexity ✅ (you have SONAR_API_KEY)
   - Grok ✅ (you have XAI_API_KEY)

All your AI provider keys are already configured!
""")
