# --- Scanner Lambda: the scheduled agent ---
resource "aws_lambda_function" "scanner" {
  function_name    = "${var.name_prefix}-scanner"
  role             = aws_iam_role.scanner.arn
  runtime          = "nodejs20.x"
  handler          = "scanner.handler"
  filename         = data.archive_file.scanner.output_path
  source_code_hash = data.archive_file.scanner.output_base64sha256
  timeout          = 120
  memory_size      = 256

  environment {
    variables = {
      ACCOUNT_ID        = local.account_id
      BEDROCK_MODEL_ID  = var.bedrock_model_id
      SENDER_EMAIL      = var.sender_email
      RECIPIENT_EMAIL   = var.recipient_email
      API_BASE_URL      = aws_apigatewayv2_stage.approval.invoke_url
      HMAC_SECRET_PARAM = aws_ssm_parameter.hmac_secret.name
      TOKEN_TTL_MINUTES = tostring(var.token_ttl_minutes)
      BRIEFS_BUCKET     = aws_s3_bucket.briefs.bucket
      CHECK_IAM         = tostring(var.checks.iam)
      CHECK_NETWORK     = tostring(var.checks.network)
      CHECK_S3          = tostring(var.checks.s3)
      CHECK_ENCRYPTION  = tostring(var.checks.encryption)
    }
  }
}

resource "aws_cloudwatch_log_group" "scanner" {
  name              = "/aws/lambda/${aws_lambda_function.scanner.function_name}"
  retention_in_days = 30
}

# --- Approval Lambda: runs one scoped fix after you click + confirm ---
resource "aws_lambda_function" "approval" {
  function_name    = "${var.name_prefix}-approval"
  role             = aws_iam_role.approval.arn
  runtime          = "nodejs20.x"
  handler          = "approval.handler"
  filename         = data.archive_file.approval.output_path
  source_code_hash = data.archive_file.approval.output_base64sha256
  timeout          = 30
  memory_size      = 256

  environment {
    variables = {
      HMAC_SECRET_PARAM = aws_ssm_parameter.hmac_secret.name
      NONCE_TABLE       = aws_dynamodb_table.nonce.name
      NONCE_TTL_DAYS    = "30"
    }
  }
}

resource "aws_cloudwatch_log_group" "approval" {
  name              = "/aws/lambda/${aws_lambda_function.approval.function_name}"
  retention_in_days = 30
}
