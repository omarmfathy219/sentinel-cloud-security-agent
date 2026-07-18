output "invoke_url" {
  value = aws_apigatewayv2_stage.approval.invoke_url
}

output "api_id" {
  value = aws_apigatewayv2_api.approval.id
}
