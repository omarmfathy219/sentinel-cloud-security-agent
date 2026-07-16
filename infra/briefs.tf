# --- Read API Lambda: serves the dashboard's brief data (token-gated) ---
resource "aws_iam_role" "briefs" {
  name               = "${var.name_prefix}-briefs"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

data "aws_iam_policy_document" "briefs" {
  statement {
    sid       = "ReadBriefs"
    effect    = "Allow"
    actions   = ["s3:GetObject", "s3:ListBucket"]
    resources = [aws_s3_bucket.briefs.arn, "${aws_s3_bucket.briefs.arn}/*"]
  }
  statement {
    sid       = "ReadDashboardToken"
    effect    = "Allow"
    actions   = ["ssm:GetParameter"]
    resources = [aws_ssm_parameter.dashboard_token.arn]
  }
  statement {
    sid       = "Logs"
    effect    = "Allow"
    actions   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["arn:aws:logs:${var.aws_region}:${local.account_id}:*"]
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
  filename         = data.archive_file.briefs.output_path
  source_code_hash = data.archive_file.briefs.output_base64sha256
  timeout          = 15
  memory_size      = 256

  environment {
    variables = {
      BRIEFS_BUCKET         = aws_s3_bucket.briefs.bucket
      DASHBOARD_TOKEN_PARAM = aws_ssm_parameter.dashboard_token.name
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
