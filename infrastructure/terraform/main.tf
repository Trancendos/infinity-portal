# terraform/main.tf - Dynamic multi-provider orchestration

# ═══════════════════════════════════════════════════════════════════
# 1. DATABASE LAYER (Adaptive - toggle via active_db_provider)
# ═══════════════════════════════════════════════════════════════════

module "db_neon" {
  source = "./modules/db_neon"
  count  = var.active_db_provider == "neon" ? 1 : 0

  project_name = var.project_name
  environment  = var.environment
}

# Future modules - drop in and toggle:
# module "db_supabase" {
#   source = "./modules/db_supabase"
#   count  = var.active_db_provider == "supabase" ? 1 : 0
#   ...
# }
# module "db_cockroach" {
#   source = "./modules/db_cockroach"
#   count  = var.active_db_provider == "cockroach" ? 1 : 0
#   ...
# }

locals {
  # Dynamically resolve active database URL based on toggle
  active_database_url = (
    var.active_db_provider == "neon" ? module.db_neon[0].database_url :
    "" # Add more ternaries as modules are added
  )
}

# ═══════════════════════════════════════════════════════════════════
# 2. COMPUTE LAYER (Adaptive - toggle via active_compute_provider)
# ═══════════════════════════════════════════════════════════════════

module "compute_koyeb" {
  source = "./modules/compute_koyeb"
  count  = var.active_compute_provider == "koyeb" ? 1 : 0

  app_name     = "${var.project_name}-${var.environment}"
  docker_image = var.ghcr_docker_image
  database_url = local.active_database_url
  jwt_secret   = var.jwt_secret_key
  environment  = var.environment
  region       = var.deploy_region
}

# Future modules:
# module "compute_flyio" { ... }
# module "compute_render" { ... }
# module "compute_railway" { ... }

locals {
  # Dynamically resolve compute endpoint for edge routing
  active_compute_endpoint = (
    var.active_compute_provider == "koyeb" ? module.compute_koyeb[0].app_domain :
    ""
  )
}

# ═══════════════════════════════════════════════════════════════════
# 3. EDGE / SECURITY LAYER (Adaptive - toggle via active_edge_provider)
# ═══════════════════════════════════════════════════════════════════

module "edge_cloudflare" {
  source = "./modules/edge_cloudflare"
  count  = var.active_edge_provider == "cloudflare" ? 1 : 0

  zone_id         = var.cloudflare_zone_id
  domain_name     = var.domain_name
  target_endpoint = local.active_compute_endpoint
  subdomain       = "api"
}
