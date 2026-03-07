# Infinity Admin Runner v4.0 - Production Deployment Guide

This guide provides step-by-step instructions for deploying the Infinity Admin Runner with zero cost and production-ready configuration.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Deployment Options](#deployment-options)
3. [Render.com Deployment (Recommended)](#rendercom-deployment-recommended)
4. [Google Cloud Run Deployment](#google-cloud-run-deployment)
5. [Environment Configuration](#environment-configuration)
6. [Mobile-Friendly Features](#mobile-friendly-features)
7. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before deploying, you'll need to obtain free API keys from the following providers:

| Provider | Free Tier Limits | Sign Up URL |
|----------|------------------|-------------|
| HuggingFace | Unlimited inference | https://huggingface.co/settings/tokens |
| Groq | 14,400 requests/day | https://console.groq.com/keys |
| Google Gemini | 60 requests/minute | https://aistudio.google.com/app/apikey |
| DeepSeek | Free credits | https://platform.deepseek.com/ |

**Optional but recommended:**
- Upstash Redis (10,000 commands/day free): https://upstash.com

---

## Deployment Options

The following table compares zero-cost deployment platforms:

| Platform | Free Tier | Docker Support | Cold Starts | Best For |
|----------|-----------|----------------|-------------|----------|
| Render.com | 750 hours/month | Yes | Yes (15 min idle) | Quick setup |
| Google Cloud Run | 2M req/month | Yes | Yes (scale to zero) | Production |
| Hugging Face Spaces | Unlimited | Yes | Yes | AI-focused apps |

---

## Render.com Deployment (Recommended)

Render.com offers the simplest deployment path with Docker support and a generous free tier.

### Step 1: Fork the Repository

Fork this repository to your GitHub account, or push the code to a new repository.

### Step 2: Create Render Account

Visit https://render.com and sign up with your GitHub account.

### Step 3: Create New Web Service

1. Click "New +" and select "Web Service"
2. Connect your GitHub repository
3. Configure the service:
   - **Name:** infinity-admin-runner
   - **Region:** Oregon (or closest to your users)
   - **Branch:** main
   - **Runtime:** Docker
   - **Dockerfile Path:** ./backend/Dockerfile
   - **Docker Context:** ./backend
   - **Instance Type:** Free

### Step 4: Add Environment Variables

In the Render Dashboard, add the following environment variables:

```
HF_TOKEN=your_huggingface_token
GROQ_API_KEY=your_groq_api_key
GOOGLE_API_KEY=your_google_api_key
DEEPSEEK_API_KEY=your_deepseek_api_key
API_TOKEN=your_secure_api_token
ENVIRONMENT=production
```

Generate a secure API token with:
```bash
openssl rand -base64 32
```

### Step 5: Deploy

Click "Create Web Service" and wait for the build to complete. Your service will be available at:
```
https://infinity-admin-runner.onrender.com
```

---

## Google Cloud Run Deployment

Google Cloud Run offers a generous free tier with 2 million requests per month.

### Step 1: Install Google Cloud SDK

```bash
curl https://sdk.cloud.google.com | bash
gcloud init
```

### Step 2: Build and Push Image

```bash
cd backend
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/infinity-admin-runner
```

### Step 3: Deploy to Cloud Run

```bash
gcloud run deploy infinity-admin-runner \
  --image gcr.io/YOUR_PROJECT_ID/infinity-admin-runner \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars "HF_TOKEN=xxx,GROQ_API_KEY=xxx,GOOGLE_API_KEY=xxx"
```

---

## Environment Configuration

### Required Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| HF_TOKEN | HuggingFace API token | Yes |
| GROQ_API_KEY | Groq API key | Yes |
| GOOGLE_API_KEY | Google Gemini API key | Yes |
| API_TOKEN | Authentication token | Recommended |

### Optional Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| REDIS_URL | - | Upstash Redis URL for caching |
| RATE_LIMIT | 60 | Requests per minute |
| MAX_TOKENS | 4096 | Maximum tokens per request |
| LOG_LEVEL | INFO | Logging verbosity |

---

## Mobile-Friendly Features

The platform is fully responsive and optimized for mobile devices:

- **Responsive Design:** Adapts to all screen sizes (mobile, tablet, desktop)
- **Touch-Friendly:** Large tap targets for mobile interaction
- **Fast Loading:** Optimized assets and minimal dependencies
- **PWA-Ready:** Can be installed as a Progressive Web App

### Testing on Mobile

1. Open your deployed URL on a mobile device
2. The interface automatically adjusts to screen size
3. All API endpoints work identically on mobile

---

## Troubleshooting

### Common Issues

**Service not starting:**
- Check environment variables are set correctly
- Verify API keys are valid
- Check Render logs for errors

**Cold start delays:**
- This is normal for free tier
- Consider upgrading to paid tier for production use
- Use a health check service to keep the instance warm

**Rate limiting errors:**
- Reduce request frequency
- Check your API key quotas
- Consider caching responses

### Getting Help

For issues and feature requests, please open an issue on GitHub.

---

*Last updated: January 2026*
*Version: 4.0.0*
