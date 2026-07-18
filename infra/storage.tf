# Brief store: private bucket the scanner writes each run's JSON into, and the
# briefs read API + dashboard read from. Shared across modules, so it lives here.
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
