# terraform/variables.tf - Dynamic adaptive environment controls

variable "project_name" {
  type        = string
  description = "Base name for all resources"
  default     = "infinity-os"
}

variable "environment" {
  type        = string
  description = "Deployment environment (production/staging)"
  default     = "production"
}

# ─── Dynamic Routing Toggles ───────────────────────────────────────
# Change these to instantly pivot between free-tier providers.
# No vendor lock-in. Run `terraform apply` after changing.

variable "active_compute_provider" {
  type        = string
  description = "Active compute provider: koyeb | flyio | render | railway"
  default     = "koyeb"

  validation {
    condition     = contains(["koyeb", "flyio", "render", "railway"], var.active_compute_provider)
    error_message = "Must be one of: koyeb, flyio, render, railway"
  }
}

variable "active_db_provider" {
  type        = string
  description = "Active database provider: neon | supabase | cockroach | turso"
  default     = "neon"

  validation {
    condition     = contains(["neon", "supabase", "cockroach", "turso"], var.active_db_provider)
    error_message = "Must be one of: neon, supabase, cockroach, turso"
  }
}

variable "active_edge_provider" {
  type        = string
  description = "Active edge/CDN provider: cloudflare | vercel | bunny"
  default     = "cloudflare"

  validation {
    condition     = contains(["cloudflare", "vercel", "bunny"], var.active_edge_provider)
    error_message = "Must be one of: cloudflare, vercel, bunny"
  }
}

# ─── Provider Credentials ──────────────────────────────────────────
# Pass via TF_VAR_ environment variables, never commit these.

variable "cloudflare_api_token" {
  type      = string
  sensitive = true
  default   = ""
}

variable "cloudflare_zone_id" {
  type    = string
  default = ""
}

variable "domain_name" {
  type    = string
  default = "trancendos.com"
}

variable "neon_api_key" {
  type      = string
  sensitive = true
  default   = ""
}

variable "koyeb_api_token" {
  type      = string
  sensitive = true
  default   = ""
}

variable "ghcr_docker_image" {
  type        = string
  description = "Docker image built by GitHub Actions pipeline"
  default     = "ghcr.io/trancendos/infinity-os:latest"
}

variable "jwt_secret_key" {
  type      = string
  sensitive = true
}

variable "deploy_region" {
  type        = string
  description = "Primary deployment region (fra=Frankfurt for EU/GDPR proximity)"
  default     = "fra"
}
