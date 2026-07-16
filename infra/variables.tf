variable "aws_profile" {
  description = "Local AWS CLI profile to deploy with (the challenge account)."
  type        = string
}

variable "aws_region" {
  description = "Region to deploy Sentinel into."
  type        = string
  default     = "us-east-1"
}

variable "sender_email" {
  description = "Verified SES sender address (the brief is sent From this)."
  type        = string
}

variable "recipient_email" {
  description = "Where the morning brief is delivered."
  type        = string
}

variable "bedrock_model_id" {
  description = "Bedrock model for the brief summary. Nova Lite by default; set to an inference-profile id (e.g. us.anthropic.claude-haiku-4-5-...) for Claude."
  type        = string
  default     = "amazon.nova-lite-v1:0"
}

variable "schedule_expression" {
  description = "EventBridge Scheduler expression for the daily scan."
  type        = string
  default     = "cron(0 7 * * ? *)" # 07:00 daily
}

variable "schedule_timezone" {
  description = "IANA timezone the schedule fires in."
  type        = string
  default     = "UTC"
}

variable "checks" {
  description = "Which posture checks to run."
  type = object({
    iam        = bool
    network    = bool
    s3         = bool
    encryption = bool
  })
  default = {
    iam        = true
    network    = true
    s3         = true
    encryption = true
  }
}

variable "token_ttl_minutes" {
  description = "How long an 'Apply fix' approval link stays valid."
  type        = number
  default     = 1440 # 24h
}

variable "name_prefix" {
  description = "Prefix for created resource names."
  type        = string
  default     = "sentinel"
}

variable "dashboard_domain" {
  description = "Custom subdomain for the dashboard (DNS managed externally)."
  type        = string
  default     = "sentinel.omarfathy.dev"
}
