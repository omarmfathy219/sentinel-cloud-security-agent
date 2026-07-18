output "cloudfront_domain" {
  value = aws_cloudfront_distribution.dashboard.domain_name
}

output "acm_validation_records" {
  value = [
    for o in aws_acm_certificate.dashboard.domain_validation_options : {
      name  = o.resource_record_name
      type  = o.resource_record_type
      value = o.resource_record_value
    }
  ]
}
