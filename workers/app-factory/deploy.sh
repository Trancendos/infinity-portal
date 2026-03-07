#!/bin/bash

# ============================================================================
# INFINITY ADMIN IMPLEMENTATION RUNNER - ONE-CLICK DEPLOYMENT
# ============================================================================
# Zero-Cost | Production-Ready | Multi-Platform
# Supports: Railway, Render, Fly.io, Cloud Run, Self-Hosted
# ============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ASCII Art Banner
echo -e "${PURPLE}"
cat << "EOF"
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   ██╗███╗   ██╗███████╗██╗███╗   ██╗██╗████████╗██╗   ██╗   ║
║   ██║████╗  ██║██╔════╝██║████╗  ██║██║╚══██╔══╝╚██╗ ██╔╝   ║
║   ██║██╔██╗ ██║█████╗  ██║██╔██╗ ██║██║   ██║    ╚████╔╝    ║
║   ██║██║╚██╗██║██╔══╝  ██║██║╚██╗██║██║   ██║     ╚██╔╝     ║
║   ██║██║ ╚████║██║     ██║██║ ╚████║██║   ██║      ██║      ║
║   ╚═╝╚═╝  ╚═══╝╚═╝     ╚═╝╚═╝  ╚═══╝╚═╝   ╚═╝      ╚═╝      ║
║                                                               ║
║        ADMIN IMPLEMENTATION RUNNER v4.0                       ║
║        Enterprise AI Orchestration Platform                   ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
EOF
echo -e "${NC}"

echo -e "${CYAN}🚀 Starting deployment process...${NC}\n"

# ============================================================================
# PREREQUISITE CHECKS
# ============================================================================

echo -e "${BLUE}📋 Checking prerequisites...${NC}"

check_command() {
    if command -v $1 &> /dev/null; then
        echo -e "${GREEN}✓${NC} $1 is installed"
    else
        echo -e "${RED}✗${NC} $1 is not installed"
        echo -e "${YELLOW}   Please install $1 to continue${NC}"
        exit 1
    fi
}

check_command "docker"
check_command "docker-compose"
check_command "git"

echo ""

# ============================================================================
# ENVIRONMENT SETUP
# ============================================================================

echo -e "${BLUE}🔧 Setting up environment...${NC}"

# Check if .env.production exists
if [ ! -f "backend/.env.production" ]; then
    echo -e "${YELLOW}⚠️  .env.production not found. Creating from template...${NC}"
    
    if [ -f "backend/.env.example" ]; then
        cp backend/.env.example backend/.env.production
        echo -e "${GREEN}✓${NC} Created .env.production from template"
        echo -e "${YELLOW}⚠️  IMPORTANT: Edit backend/.env.production and add your API keys!${NC}"
        echo ""
        echo "Required API keys (all free tier):"
        echo "  • HF_TOKEN - HuggingFace (https://huggingface.co/settings/tokens)"
        echo "  • GROQ_API_KEY - Groq (https://console.groq.com/keys)"
        echo "  • GOOGLE_API_KEY - Google Gemini (https://aistudio.google.com/app/apikey)"
        echo "  • DEEPSEEK_API_KEY - DeepSeek (https://platform.deepseek.com/)"
        echo ""
        
        read -p "Press Enter after adding your API keys to .env.production..."
    else
        echo -e "${RED}✗${NC} .env.example not found!"
        exit 1
    fi
else
    echo -e "${GREEN}✓${NC} .env.production exists"
fi

# Generate API token if not set
if ! grep -q "API_TOKEN=.\+" backend/.env.production; then
    echo -e "${YELLOW}⚠️  No API_TOKEN found. Generating secure token...${NC}"
    API_TOKEN=$(openssl rand -base64 32)
    echo "API_TOKEN=$API_TOKEN" >> backend/.env.production
    echo -e "${GREEN}✓${NC} Generated API_TOKEN: ${API_TOKEN}"
fi

echo ""

# ============================================================================
# DEPLOYMENT TARGET SELECTION
# ============================================================================

echo -e "${PURPLE}🎯 Select deployment target:${NC}"
echo "  1) Local Docker (Development)"
echo "  2) Local Docker (Production)"
echo "  3) Railway.app (Recommended - Free tier)"
echo "  4) Render.com (Free tier)"
echo "  5) Fly.io (Free tier)"
echo "  6) Google Cloud Run"
echo "  7) Self-Hosted VPS"
echo ""
read -p "Enter your choice (1-7): " deployment_choice

case $deployment_choice in
    1)
        echo -e "\n${CYAN}🐳 Deploying to Local Docker (Development)...${NC}\n"
        
        # Build and start services
        docker-compose build
        docker-compose up -d
        
        echo -e "\n${GREEN}✅ Deployment complete!${NC}"
        echo -e "${CYAN}📊 Services running:${NC}"
        echo "  • API: http://localhost:8000"
        echo "  • API Docs: http://localhost:8000/docs"
        echo "  • Health: http://localhost:8000/health"
        echo "  • Metrics: http://localhost:8000/metrics"
        echo ""
        echo -e "${YELLOW}📝 View logs:${NC} docker-compose logs -f"
        echo -e "${YELLOW}🛑 Stop services:${NC} docker-compose down"
        ;;
        
    2)
        echo -e "\n${CYAN}🐳 Deploying to Local Docker (Production)...${NC}\n"
        
        # Build with production settings
        docker-compose --env-file backend/.env.production build --no-cache
        docker-compose --env-file backend/.env.production up -d
        
        # Wait for services to be healthy
        echo -e "${YELLOW}⏳ Waiting for services to be healthy...${NC}"
        sleep 10
        
        # Health check
        if curl -f http://localhost:8000/health > /dev/null 2>&1; then
            echo -e "\n${GREEN}✅ Deployment complete and healthy!${NC}"
        else
            echo -e "\n${RED}⚠️  Deployment complete but health check failed${NC}"
            echo "Check logs with: docker-compose logs -f"
        fi
        
        echo -e "${CYAN}📊 Services running:${NC}"
        echo "  • API: http://localhost:8000"
        echo "  • API Docs: http://localhost:8000/docs"
        echo "  • Health: http://localhost:8000/health"
        ;;
        
    3)
        echo -e "\n${CYAN}🚂 Deploying to Railway...${NC}\n"
        
        if ! command -v railway &> /dev/null; then
            echo -e "${YELLOW}Installing Railway CLI...${NC}"
            npm install -g @railway/cli
        fi
        
        echo "1. Visit: https://railway.app/new"
        echo "2. Connect your GitHub repository"
        echo "3. Add environment variables from .env.production"
        echo "4. Deploy!"
        echo ""
        echo "Alternative: Use Railway CLI"
        echo "  railway login"
        echo "  railway init"
        echo "  railway up"
        ;;
        
    4)
        echo -e "\n${CYAN}🎨 Deploying to Render...${NC}\n"
        
        echo "1. Visit: https://render.com/deploy"
        echo "2. Connect your GitHub repository"
        echo "3. Create Web Service from Dockerfile"
        echo "4. Add environment variables from .env.production"
        echo "5. Deploy!"
        ;;
        
    5)
        echo -e "\n${CYAN}✈️  Deploying to Fly.io...${NC}\n"
        
        if ! command -v flyctl &> /dev/null; then
            echo -e "${YELLOW}Installing Fly.io CLI...${NC}"
            curl -L https://fly.io/install.sh | sh
        fi
        
        echo "Running Fly.io deployment..."
        cd backend
        flyctl launch --dockerfile Dockerfile --now
        cd ..
        ;;
        
    6)
        echo -e "\n${CYAN}☁️  Deploying to Google Cloud Run...${NC}\n"
        
        if ! command -v gcloud &> /dev/null; then
            echo -e "${RED}✗${NC} Google Cloud SDK not installed"
            echo "Install from: https://cloud.google.com/sdk/install"
            exit 1
        fi
        
        read -p "Enter your GCP project ID: " GCP_PROJECT
        read -p "Enter region (e.g., us-central1): " GCP_REGION
        
        # Build and push to Container Registry
        gcloud builds submit --tag gcr.io/$GCP_PROJECT/infinity-admin-runner backend/
        
        # Deploy to Cloud Run
        gcloud run deploy infinity-admin-runner \
            --image gcr.io/$GCP_PROJECT/infinity-admin-runner \
            --platform managed \
            --region $GCP_REGION \
            --allow-unauthenticated \
            --set-env-vars "$(cat backend/.env.production | grep -v '^#' | xargs)"
        ;;
        
    7)
        echo -e "\n${CYAN}🖥️  Self-Hosted VPS Deployment${NC}\n"
        
        read -p "Enter your VPS IP address: " VPS_IP
        read -p "Enter SSH user (default: root): " SSH_USER
        SSH_USER=${SSH_USER:-root}
        
        echo -e "${YELLOW}📦 Packaging deployment...${NC}"
        
        # Create deployment package
        tar -czf infinity-deploy.tar.gz \
            backend/ \
            docker-compose.yml \
            deployment/ \
            --exclude=backend/node_modules \
            --exclude=backend/__pycache__ \
            --exclude=.git
        
        echo -e "${YELLOW}📤 Uploading to VPS...${NC}"
        scp infinity-deploy.tar.gz $SSH_USER@$VPS_IP:/tmp/
        
        echo -e "${YELLOW}🚀 Deploying on VPS...${NC}"
        ssh $SSH_USER@$VPS_IP << 'ENDSSH'
            cd /opt
            mkdir -p infinity-admin-runner
            cd infinity-admin-runner
            tar -xzf /tmp/infinity-deploy.tar.gz
            
            # Install Docker if not present
            if ! command -v docker &> /dev/null; then
                curl -fsSL https://get.docker.com | sh
                systemctl enable docker
                systemctl start docker
            fi
            
            # Install Docker Compose if not present
            if ! command -v docker-compose &> /dev/null; then
                curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
                chmod +x /usr/local/bin/docker-compose
            fi
            
            # Deploy
            docker-compose down
            docker-compose build --no-cache
            docker-compose up -d
            
            echo "✅ Deployment complete!"
            echo "API available at: http://$(hostname -I | awk '{print $1}'):8000"
ENDSSH
        
        rm infinity-deploy.tar.gz
        echo -e "${GREEN}✅ VPS deployment complete!${NC}"
        ;;
        
    *)
        echo -e "${RED}Invalid choice!${NC}"
        exit 1
        ;;
esac

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                  🎉 DEPLOYMENT SUCCESSFUL! 🎉                 ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}📚 Next steps:${NC}"
echo "  1. Test your deployment"
echo "  2. Configure monitoring (optional)"
echo "  3. Set up custom domain (optional)"
echo "  4. Review security settings"
echo ""
echo -e "${PURPLE}📖 Documentation: ./docs/README.md${NC}"
echo -e "${PURPLE}🐛 Issues: https://github.com/yourusername/infinity-admin-runner/issues${NC}"
echo ""
