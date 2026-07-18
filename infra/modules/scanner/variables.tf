variable "name_prefix" { type = string }
variable "region" { type = string }
variable "account_id" { type = string }
variable "bedrock_model_id" { type = string }
variable "sender_email" { type = string }
variable "recipient_email" { type = string }
variable "api_base_url" { type = string }
variable "hmac_param_name" { type = string }
variable "hmac_param_arn" { type = string }
variable "briefs_bucket_name" { type = string }
variable "briefs_bucket_arn" { type = string }
variable "token_ttl_minutes" { type = number }
variable "schedule_expression" { type = string }
variable "schedule_timezone" { type = string }
variable "zip_file" { type = string }
variable "zip_hash" { type = string }

variable "checks" {
  type = object({
    iam        = bool
    network    = bool
    s3         = bool
    encryption = bool
  })
}
