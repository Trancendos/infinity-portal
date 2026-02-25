# terraform/modules/edge_cloudflare/main.tf - Edge security layer
terraform {
  required_providers {
    cloudflare = { source = "cloudflare/cloudflare" }
  }
}

variable "zone_id" {
  type = string
}

variable "domain_name" {
  type = string
}

variable "target_endpoint" {
  type        = string
  description = "Compute provider domain to CNAME to"
}

variable "subdomain" {
  type    = string
  default = "api"
}

# CNAME: api.trancendos.com -> dynamic compute provider
resource "cloudflare_record" "api_cname" {
  zone_id = var.zone_id
  name    = var.subdomain
  value   = var.target_endpoint
  type    = "CNAME"
  proxied = true # Enables WAF + DDoS protection
}

# Strict SSL and security hardening at the edge
resource "cloudflare_zone_settings_override" "security" {
  zone_id = var.zone_id

  settings {
    ssl                      = "strict"
    always_use_https         = "on"
    min_tls_version          = "1.3"
    opportunistic_encryption = "on"
    browser_check            = "on"
    security_level           = "high"
  }
}

output "api_fqdn" {
  value       = "${var.subdomain}.${var.domain_name}"
  description = "Fully qualified domain name for the API"
}
