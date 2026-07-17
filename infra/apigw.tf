# HTTP API fronting the approval Lambda. The "Apply fix" links in the email
# point here: GET /apply renders a confirm page, POST /apply runs the fix.
resource "aws_apigatewayv2_api" "approval" {
  name          = "${var.name_prefix}-approval"
  protocol_type = "HTTP"

  # The dashboard fetches the token-gated /briefs* routes cross-origin, so allow
  # its origin + the Authorization header. localhost is included so the dashboard
  # can be run locally against the live API before DNS is cut over. The /apply*
  # routes are direct navigations, unaffected by CORS.
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

resource "aws_apigatewayv2_stage" "approval" {
  api_id      = aws_apigatewayv2_api.approval.id
  name        = "$default"
  auto_deploy = true
}

resource "aws_lambda_permission" "apigw_invoke_approval" {
  statement_id  = "AllowApiGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.approval.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.approval.execution_arn}/*/*"
}
