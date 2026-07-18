terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

provider "aws" {
  region  = var.aws_region
  profile = var.aws_profile
}

data "aws_caller_identity" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id
  # Bundled Lambda artifacts produced by `npm run build` in ../agent.
  agent_dist = "${path.module}/../agent/dist"
  site_dir   = "${path.module}/../dashboard"
}

# --- Package the three bundled handlers as Lambda zips ---
data "archive_file" "scanner" {
  type        = "zip"
  source_file = "${local.agent_dist}/scanner.mjs"
  output_path = "${path.module}/build/scanner.zip"
}

data "archive_file" "approval" {
  type        = "zip"
  source_file = "${local.agent_dist}/approval.mjs"
  output_path = "${path.module}/build/approval.zip"
}

data "archive_file" "briefs" {
  type        = "zip"
  source_file = "${local.agent_dist}/briefs.mjs"
  output_path = "${path.module}/build/briefs.zip"
}

# ---------------------------------------------------------------------------
# Module composition. Shared primitives (secrets, briefs bucket, SES) live in
# the root; each functional area is its own module.
# ---------------------------------------------------------------------------
module "api" {
  source = "./modules/api"

  name_prefix                = var.name_prefix
  region                     = var.aws_region
  account_id                 = local.account_id
  dashboard_domain           = var.dashboard_domain
  hmac_param_name            = aws_ssm_parameter.hmac_secret.name
  hmac_param_arn             = aws_ssm_parameter.hmac_secret.arn
  dashboard_token_param_name = aws_ssm_parameter.dashboard_token.name
  dashboard_token_param_arn  = aws_ssm_parameter.dashboard_token.arn
  briefs_bucket_name         = aws_s3_bucket.briefs.bucket
  briefs_bucket_arn          = aws_s3_bucket.briefs.arn
  approval_zip_file          = data.archive_file.approval.output_path
  approval_zip_hash          = data.archive_file.approval.output_base64sha256
  briefs_zip_file            = data.archive_file.briefs.output_path
  briefs_zip_hash            = data.archive_file.briefs.output_base64sha256
}

module "scanner" {
  source = "./modules/scanner"

  name_prefix         = var.name_prefix
  region              = var.aws_region
  account_id          = local.account_id
  bedrock_model_id    = var.bedrock_model_id
  sender_email        = var.sender_email
  recipient_email     = var.recipient_email
  api_base_url        = module.api.invoke_url
  hmac_param_name     = aws_ssm_parameter.hmac_secret.name
  hmac_param_arn      = aws_ssm_parameter.hmac_secret.arn
  briefs_bucket_name  = aws_s3_bucket.briefs.bucket
  briefs_bucket_arn   = aws_s3_bucket.briefs.arn
  token_ttl_minutes   = var.token_ttl_minutes
  checks              = var.checks
  schedule_expression = var.schedule_expression
  schedule_timezone   = var.schedule_timezone
  zip_file            = data.archive_file.scanner.output_path
  zip_hash            = data.archive_file.scanner.output_base64sha256
}

module "dashboard" {
  source = "./modules/dashboard"

  name_prefix      = var.name_prefix
  account_id       = local.account_id
  dashboard_domain = var.dashboard_domain
  api_invoke_url   = module.api.invoke_url
  site_dir         = local.site_dir
}
