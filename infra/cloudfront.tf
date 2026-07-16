# ACM cert for the dashboard domain. CloudFront requires certs in us-east-1,
# which is where this provider is pinned. DNS validation — because omarfathy.dev
# is managed externally, Terraform emits the validation record (see outputs) for
# you to add at your DNS provider; validation then completes on the next apply.
resource "aws_acm_certificate" "dashboard" {
  domain_name       = var.dashboard_domain
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_acm_certificate_validation" "dashboard" {
  certificate_arn = aws_acm_certificate.dashboard.arn
}

# --- CloudFront serves the private S3 site bucket via Origin Access Control ---
resource "aws_cloudfront_origin_access_control" "site" {
  name                              = "${var.name_prefix}-site-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

data "aws_cloudfront_cache_policy" "optimized" {
  name = "Managed-CachingOptimized"
}

resource "aws_cloudfront_distribution" "dashboard" {
  enabled             = true
  default_root_object = "index.html"
  aliases             = [var.dashboard_domain]
  comment             = "Sentinel dashboard"

  origin {
    domain_name              = aws_s3_bucket.site.bucket_regional_domain_name
    origin_id                = "site"
    origin_access_control_id = aws_cloudfront_origin_access_control.site.id
  }

  default_cache_behavior {
    target_origin_id       = "site"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = data.aws_cloudfront_cache_policy.optimized.id
    compress               = true
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.dashboard.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  price_class = "PriceClass_100"
}

# Allow only this distribution to read the site bucket.
data "aws_iam_policy_document" "site_bucket" {
  statement {
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.site.arn}/*"]
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.dashboard.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "site" {
  bucket = aws_s3_bucket.site.id
  policy = data.aws_iam_policy_document.site_bucket.json
}

# --- Upload the static site + a generated config.js pointing at the API ---
locals {
  site_dir = "${path.module}/../dashboard"
  site_files = {
    "index.html" = "text/html"
    "styles.css" = "text/css"
    "app.js"     = "application/javascript"
  }
}

resource "aws_s3_object" "site" {
  for_each     = local.site_files
  bucket       = aws_s3_bucket.site.id
  key          = each.key
  source       = "${local.site_dir}/${each.key}"
  etag         = filemd5("${local.site_dir}/${each.key}")
  content_type = each.value
}

resource "aws_s3_object" "site_config" {
  bucket       = aws_s3_bucket.site.id
  key          = "config.js"
  content      = "window.SENTINEL_CONFIG = { apiBaseUrl: \"${aws_apigatewayv2_stage.approval.invoke_url}\" };\n"
  content_type = "application/javascript"
  etag         = md5("${aws_apigatewayv2_stage.approval.invoke_url}")
}
