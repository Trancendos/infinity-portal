# terraform/modules/db_neon/main.tf - Serverless PostgreSQL (scale-to-zero)
terraform {
  required_providers {
    neon = { source = "kislerdm/neon" }
  }
}

variable "project_name" {
  type = string
}

variable "environment" {
  type = string
}

resource "neon_project" "main" {
  name                      = "${var.project_name}-${var.environment}"
  history_retention_seconds = 86400 # 24hr point-in-time recovery
}

output "database_url" {
  value       = replace(
    neon_project.main.database_url,
    "postgres://",
    "postgresql+asyncpg://"
  )
  sensitive   = true
  description = "AsyncPG-compatible connection string for FastAPI"
}

output "project_id" {
  value = neon_project.main.id
}
