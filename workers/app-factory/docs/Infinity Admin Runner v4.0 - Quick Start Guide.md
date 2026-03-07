# Infinity Admin Runner v4.0 - Quick Start Guide

## Deploy in 10 Minutes (Zero Cost)

### Step 1: Get Your Free API Keys (5 minutes)

1. **HuggingFace Token** (Free, unlimited)
   - Go to: https://huggingface.co/settings/tokens
   - Create a new token with "Read" access

2. **Groq API Key** (Free, 14,400 requests/day)
   - Go to: https://console.groq.com/keys
   - Create a new API key

3. **Google Gemini API Key** (Free, 60 requests/minute)
   - Go to: https://aistudio.google.com/app/apikey
   - Create a new API key

4. **DeepSeek API Key** (Free credits)
   - Go to: https://platform.deepseek.com/
   - Sign up and get your API key

### Step 2: Deploy to Render.com (5 minutes)

1. **Push to GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial commit - Infinity Admin Runner v4.0"
   git remote add origin https://github.com/YOUR_USERNAME/infinity-admin-runner.git
   git push -u origin main
   ```

2. **Create Render Account**
   - Go to: https://render.com
   - Sign up with GitHub

3. **Create Web Service**
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Configure:
     - **Name:** infinity-admin-runner
     - **Runtime:** Docker
     - **Dockerfile Path:** ./backend/Dockerfile
     - **Docker Context:** ./backend
     - **Instance Type:** Free

4. **Add Environment Variables**
   ```
   HF_TOKEN=your_token_here
   GROQ_API_KEY=your_key_here
   GOOGLE_API_KEY=your_key_here
   DEEPSEEK_API_KEY=your_key_here
   API_TOKEN=generate_with_openssl_rand_base64_32
   ENVIRONMENT=production
   ```

5. **Deploy!**
   - Click "Create Web Service"
   - Wait 2-3 minutes for build

### Step 3: Verify Deployment

Once deployed, test these endpoints:

| Endpoint | Description |
|----------|-------------|
| `/` | Landing page (mobile-friendly) |
| `/health` | Health check |
| `/status` | System status |
| `/docs` | API documentation (dev mode) |

### What's Included

**Zero-Cost Features:**
- Multi-model AI routing (HuggingFace, Groq, Gemini, DeepSeek)
- Intelligent fallback between providers
- Rate limiting and caching
- Prometheus metrics

**Production-Ready:**
- Mobile-friendly responsive design
- Security headers
- Health checks
- Audit logging

**Compliance:**
- GDPR, ISO 27001, SOC 2 compliance options
- PII redaction
- Data retention policies

### Optional: Add Redis Caching

For better performance, add free Redis from Upstash:

1. Go to: https://upstash.com
2. Create a free Redis database
3. Add to Render environment:
   ```
   REDIS_URL=redis://default:password@endpoint:port
   ```

### Need Help?

- Full documentation: `DEPLOYMENT.md`
- API documentation: `/docs` endpoint
- Health status: `/health` endpoint

---

*Infinity Admin Runner v4.0 - Zero-Cost | Production-Ready | Mobile-Friendly*
