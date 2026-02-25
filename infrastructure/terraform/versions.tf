# terraform/versions.tf - Decentralized provider ecosystem
terraform {
  required_version = ">= 1.5.0"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.25.0"
    }
    neon = {
      source  = "kislerdm/neon"
      version = "~> 0.2.2"
    }
    koyeb = {
      source  = "koyeb/koyeb"
      version = "~> 0.2.10"
    }
  }
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

provider "neon" {
  api_key = var.neon_api_key
}

provider "koyeb" {
  api_token = var.koyeb_api_token
}
