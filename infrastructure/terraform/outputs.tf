# terraform/outputs.tf - Infrastructure outputs

output "active_providers" {
  description = "Currently active provider configuration"
  value = {
    compute  = var.active_compute_provider
    database = var.active_db_provider
    edge     = var.active_edge_provider
  }
}

output "api_endpoint" {
  description = "Public API endpoint"
  value       = local.active_compute_endpoint
}

output "database_url" {
  description = "Active database connection URL"
  value       = local.active_database_url
  sensitive   = true
}
