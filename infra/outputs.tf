output "approval_api_url" {
  description = "Base URL the 'Apply fix' links point at."
  value       = aws_apigatewayv2_stage.approval.invoke_url
}

output "scanner_function_name" {
  description = "Invoke this manually to test."
  value       = aws_lambda_function.scanner.function_name
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
  value       = aws_cloudfront_distribution.dashboard.domain_name
}

output "acm_validation_records" {
  description = "Add these CNAME record(s) at your DNS provider to validate the cert."
  value = [
    for o in aws_acm_certificate.dashboard.domain_validation_options : {
      name  = o.resource_record_name
      type  = o.resource_record_type
      value = o.resource_record_value
    }
  ]
}

output "schedule" {
  description = "When the agent runs unattended."
  value       = "${var.schedule_expression} (${var.schedule_timezone})"
}
