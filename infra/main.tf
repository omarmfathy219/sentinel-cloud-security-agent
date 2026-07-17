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
}

# --- Package the two bundled handlers as Lambda zips ---
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

# --- The one secret in the system: the HMAC signing key for approval tokens ---
resource "random_password" "hmac" {
  length  = 48
  special = false
}

resource "aws_ssm_parameter" "hmac_secret" {
  name        = "/${var.name_prefix}/hmac-secret"
  description = "HMAC key signing Sentinel approval tokens"
  type        = "SecureString"
  value       = random_password.hmac.result
}

# --- Single-use guard for approval tokens ---
resource "aws_dynamodb_table" "nonce" {
  name         = "${var.name_prefix}-applied-fixes"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "finding_id"

  attribute {
    name = "finding_id"
    type = "S"
  }

  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }
}
