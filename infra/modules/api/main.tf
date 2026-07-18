# HTTP API fronting the approval + briefs Lambdas, plus the single-use nonce
# table the approval flow uses for replay protection.
data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

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

resource "aws_apigatewayv2_api" "approval" {
  name          = "${var.name_prefix}-approval"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = [
      "https://${var.dashboard_domain}",
      "http://localhost:8000",
    ]
    allow_methods = ["GET"]
    allow_headers = ["authorization", "content-type"]
    max_age       = 3600
  }
}

resource "aws_apigatewayv2_stage" "approval" {
  api_id      = aws_apigatewayv2_api.approval.id
  name        = "$default"
  auto_deploy = true
}

# ---------------------------------------------------------------------------
# Approval / remediation Lambda — write-scoped to exactly the three fixes.
# ---------------------------------------------------------------------------
resource "aws_iam_role" "approval" {
  name               = "${var.name_prefix}-approval"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

data "aws_iam_policy_document" "approval" {
  statement {
    sid    = "ScopedRemediation"
    effect = "Allow"
    actions = [
      "s3:PutBucketPublicAccessBlock",
      "ec2:RevokeSecurityGroupIngress",
      "iam:UpdateAccessKey",
    ]
    resources = ["*"]
  }
  statement {
    sid       = "ConsumeNonce"
    effect    = "Allow"
    actions   = ["dynamodb:PutItem"]
    resources = [aws_dynamodb_table.nonce.arn]
  }
  statement {
    sid       = "ReadHmacSecret"
    effect    = "Allow"
    actions   = ["ssm:GetParameter"]
    resources = [var.hmac_param_arn]
  }
  statement {
    sid       = "Logs"
    effect    = "Allow"
    actions   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["arn:aws:logs:${var.region}:${var.account_id}:*"]
  }
}

resource "aws_iam_role_policy" "approval" {
  name   = "approval"
  role   = aws_iam_role.approval.id
  policy = data.aws_iam_policy_document.approval.json
}

resource "aws_lambda_function" "approval" {
  function_name    = "${var.name_prefix}-approval"
  role             = aws_iam_role.approval.arn
  runtime          = "nodejs20.x"
  handler          = "approval.handler"
  filename         = var.approval_zip_file
  source_code_hash = var.approval_zip_hash
  timeout          = 30
  memory_size      = 256

  environment {
    variables = {
      HMAC_SECRET_PARAM = var.hmac_param_name
      NONCE_TABLE       = aws_dynamodb_table.nonce.name
      NONCE_TTL_DAYS    = "30"
    }
  }
}

resource "aws_cloudwatch_log_group" "approval" {
  name              = "/aws/lambda/${aws_lambda_function.approval.function_name}"
  retention_in_days = 30
}

resource "aws_apigatewayv2_integration" "approval" {
  api_id                 = aws_apigatewayv2_api.approval.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.approval.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "get_apply" {
  api_id    = aws_apigatewayv2_api.approval.id
  route_key = "GET /apply"
  target    = "integrations/${aws_apigatewayv2_integration.approval.id}"
}

resource "aws_apigatewayv2_route" "post_apply" {
  api_id    = aws_apigatewayv2_api.approval.id
  route_key = "POST /apply"
  target    = "integrations/${aws_apigatewayv2_integration.approval.id}"
}

resource "aws_lambda_permission" "apigw_invoke_approval" {
  statement_id  = "AllowApiGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.approval.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.approval.execution_arn}/*/*"
}

# ---------------------------------------------------------------------------
# Briefs read Lambda — serves the dashboard's token-gated data.
# ---------------------------------------------------------------------------
resource "aws_iam_role" "briefs" {
  name               = "${var.name_prefix}-briefs"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

data "aws_iam_policy_document" "briefs" {
  statement {
    sid       = "ReadBriefs"
    effect    = "Allow"
    actions   = ["s3:GetObject", "s3:ListBucket"]
    resources = [var.briefs_bucket_arn, "${var.briefs_bucket_arn}/*"]
  }
  statement {
    sid       = "ReadDashboardToken"
    effect    = "Allow"
    actions   = ["ssm:GetParameter"]
    resources = [var.dashboard_token_param_arn]
  }
  statement {
    sid       = "Logs"
    effect    = "Allow"
    actions   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["arn:aws:logs:${var.region}:${var.account_id}:*"]
  }
}

resource "aws_iam_role_policy" "briefs" {
  name   = "briefs"
  role   = aws_iam_role.briefs.id
  policy = data.aws_iam_policy_document.briefs.json
}

resource "aws_lambda_function" "briefs" {
  function_name    = "${var.name_prefix}-briefs"
  role             = aws_iam_role.briefs.arn
  runtime          = "nodejs20.x"
  handler          = "briefs.handler"
  filename         = var.briefs_zip_file
  source_code_hash = var.briefs_zip_hash
  timeout          = 15
  memory_size      = 256

  environment {
    variables = {
      BRIEFS_BUCKET         = var.briefs_bucket_name
      DASHBOARD_TOKEN_PARAM = var.dashboard_token_param_name
    }
  }
}

resource "aws_cloudwatch_log_group" "briefs" {
  name              = "/aws/lambda/${aws_lambda_function.briefs.function_name}"
  retention_in_days = 30
}

resource "aws_apigatewayv2_integration" "briefs" {
  api_id                 = aws_apigatewayv2_api.approval.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.briefs.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "briefs_latest" {
  api_id    = aws_apigatewayv2_api.approval.id
  route_key = "GET /briefs/latest"
  target    = "integrations/${aws_apigatewayv2_integration.briefs.id}"
}

resource "aws_apigatewayv2_route" "briefs_item" {
  api_id    = aws_apigatewayv2_api.approval.id
  route_key = "GET /briefs/item"
  target    = "integrations/${aws_apigatewayv2_integration.briefs.id}"
}

resource "aws_apigatewayv2_route" "briefs_list" {
  api_id    = aws_apigatewayv2_api.approval.id
  route_key = "GET /briefs"
  target    = "integrations/${aws_apigatewayv2_integration.briefs.id}"
}

resource "aws_lambda_permission" "apigw_invoke_briefs" {
  statement_id  = "AllowApiGatewayInvokeBriefs"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.briefs.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.approval.execution_arn}/*/*"
}
