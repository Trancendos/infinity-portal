# terraform/modules/compute_koyeb/main.tf - Global edge container compute
terraform {
  required_providers {
    koyeb = { source = "koyeb/koyeb" }
  }
}

variable "app_name" {
  type = string
}

variable "docker_image" {
  type = string
}

variable "database_url" {
  type      = string
  sensitive = true
}

variable "jwt_secret" {
  type      = string
  sensitive = true
}

variable "environment" {
  type = string
}

variable "region" {
  type    = string
  default = "fra" # Frankfurt for EU AI Act / GDPR proximity
}

resource "koyeb_app" "api" {
  name = var.app_name
}

resource "koyeb_service" "api_service" {
  app_id = koyeb_app.api.id
  name   = "core-api"

  definition {
    type    = "DOCKER"
    regions = [var.region]

    docker {
      image = var.docker_image
    }

    ports {
      port     = 8000
      protocol = "HTTP"
    }

    routes {
      path = "/"
      port = 8000
    }

    env {
      key   = "ENVIRONMENT"
      value = var.environment
    }

    env {
      key   = "DATABASE_URL"
      value = var.database_url
    }

    env {
      key   = "JWT_SECRET_KEY"
      value = var.jwt_secret
    }

    env {
      key   = "PORT"
      value = "8000"
    }

    env {
      key   = "WORKERS"
      value = "2"
    }

    env {
      key   = "CORS_ORIGINS"
      value = "https://api.trancendos.com,https://trancendos.com"
    }

    instance_types {
      type = "free"
    }
  }
}

output "app_domain" {
  value       = koyeb_service.api_service.domain
  description = "Koyeb-assigned domain for the API service"
}

output "app_id" {
  value = koyeb_app.api.id
}
