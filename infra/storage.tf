# --- Brief store: private bucket the scanner writes each run's JSON into ---
resource "aws_s3_bucket" "briefs" {
  bucket = "${var.name_prefix}-briefs-${local.account_id}"
}

resource "aws_s3_bucket_public_access_block" "briefs" {
  bucket                  = aws_s3_bucket.briefs.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "briefs" {
  bucket = aws_s3_bucket.briefs.id
  rule {
    id     = "expire-history"
    status = "Enabled"
    filter { prefix = "briefs/history/" }
    expiration { days = 90 }
  }
}

# --- Dashboard access token (bearer token the read API checks) ---
resource "random_password" "dashboard_token" {
  length  = 40
  special = false
}

resource "aws_ssm_parameter" "dashboard_token" {
  name        = "/${var.name_prefix}/dashboard-token"
  description = "Bearer token gating the Sentinel dashboard read API"
  type        = "SecureString"
  value       = random_password.dashboard_token.result
}

# --- Static site bucket (served only via CloudFront, never public directly) ---
resource "aws_s3_bucket" "site" {
  bucket = "${var.name_prefix}-dashboard-${local.account_id}"
}

resource "aws_s3_bucket_public_access_block" "site" {
  bucket                  = aws_s3_bucket.site.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
