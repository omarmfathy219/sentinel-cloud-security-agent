output "approval_api_url" {
  description = "Base URL the 'Apply fix' links point at."
  value       = module.api.invoke_url
}

output "scanner_function_name" {
  description = "Invoke this manually to test."
  value       = module.scanner.function_name
}

output "dashboard_url" {
  description = "The dashboard, once DNS is pointed at CloudFront."
  value       = "https://${var.dashboard_domain}"
}

output "dashboard_token" {
  description = "Access token for the dashboard (terraform output -raw dashboard_token)."
  value       = random_password.dashboard_token.result
  sensitive   = true
}

output "cloudfront_domain" {
  description = "CNAME target — point the dashboard subdomain at this (DNS-only)."
  value       = module.dashboard.cloudfront_domain
}

output "acm_validation_records" {
  description = "Add these CNAME record(s) at your DNS provider to validate the cert."
  value       = module.dashboard.acm_validation_records
}

output "schedule" {
  description = "When the agent runs unattended."
  value       = "${var.schedule_expression} (${var.schedule_timezone})"
}
