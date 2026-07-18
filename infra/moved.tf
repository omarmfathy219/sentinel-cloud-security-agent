# Remap resources that used to live in the root module into their new modules.
# These make the modularization a no-op against existing state — Terraform
# relocates each resource rather than destroying and recreating it. Safe to
# delete once every environment has applied past this refactor.

# --- into module.api ---
moved {
  from = aws_dynamodb_table.nonce
  to   = module.api.aws_dynamodb_table.nonce
}
moved {
  from = aws_apigatewayv2_api.approval
  to   = module.api.aws_apigatewayv2_api.approval
}
moved {
  from = aws_apigatewayv2_stage.approval
  to   = module.api.aws_apigatewayv2_stage.approval
}
moved {
  from = aws_iam_role.approval
  to   = module.api.aws_iam_role.approval
}
moved {
  from = aws_iam_role_policy.approval
  to   = module.api.aws_iam_role_policy.approval
}
moved {
  from = aws_lambda_function.approval
  to   = module.api.aws_lambda_function.approval
}
moved {
  from = aws_cloudwatch_log_group.approval
  to   = module.api.aws_cloudwatch_log_group.approval
}
moved {
  from = aws_apigatewayv2_integration.approval
  to   = module.api.aws_apigatewayv2_integration.approval
}
moved {
  from = aws_apigatewayv2_route.get_apply
  to   = module.api.aws_apigatewayv2_route.get_apply
}
moved {
  from = aws_apigatewayv2_route.post_apply
  to   = module.api.aws_apigatewayv2_route.post_apply
}
moved {
  from = aws_lambda_permission.apigw_invoke_approval
  to   = module.api.aws_lambda_permission.apigw_invoke_approval
}
moved {
  from = aws_iam_role.briefs
  to   = module.api.aws_iam_role.briefs
}
moved {
  from = aws_iam_role_policy.briefs
  to   = module.api.aws_iam_role_policy.briefs
}
moved {
  from = aws_lambda_function.briefs
  to   = module.api.aws_lambda_function.briefs
}
moved {
  from = aws_cloudwatch_log_group.briefs
  to   = module.api.aws_cloudwatch_log_group.briefs
}
moved {
  from = aws_apigatewayv2_integration.briefs
  to   = module.api.aws_apigatewayv2_integration.briefs
}
moved {
  from = aws_apigatewayv2_route.briefs_latest
  to   = module.api.aws_apigatewayv2_route.briefs_latest
}
moved {
  from = aws_apigatewayv2_route.briefs_item
  to   = module.api.aws_apigatewayv2_route.briefs_item
}
moved {
  from = aws_apigatewayv2_route.briefs_list
  to   = module.api.aws_apigatewayv2_route.briefs_list
}
moved {
  from = aws_lambda_permission.apigw_invoke_briefs
  to   = module.api.aws_lambda_permission.apigw_invoke_briefs
}

# --- into module.scanner ---
moved {
  from = aws_iam_role.scanner
  to   = module.scanner.aws_iam_role.scanner
}
moved {
  from = aws_iam_role_policy.scanner
  to   = module.scanner.aws_iam_role_policy.scanner
}
moved {
  from = aws_lambda_function.scanner
  to   = module.scanner.aws_lambda_function.scanner
}
moved {
  from = aws_cloudwatch_log_group.scanner
  to   = module.scanner.aws_cloudwatch_log_group.scanner
}
moved {
  from = aws_iam_role.scheduler
  to   = module.scanner.aws_iam_role.scheduler
}
moved {
  from = aws_iam_role_policy.scheduler
  to   = module.scanner.aws_iam_role_policy.scheduler
}
moved {
  from = aws_scheduler_schedule.daily_scan
  to   = module.scanner.aws_scheduler_schedule.daily_scan
}

# --- into module.dashboard ---
moved {
  from = aws_acm_certificate.dashboard
  to   = module.dashboard.aws_acm_certificate.dashboard
}
moved {
  from = aws_acm_certificate_validation.dashboard
  to   = module.dashboard.aws_acm_certificate_validation.dashboard
}
moved {
  from = aws_cloudfront_origin_access_control.site
  to   = module.dashboard.aws_cloudfront_origin_access_control.site
}
moved {
  from = aws_cloudfront_distribution.dashboard
  to   = module.dashboard.aws_cloudfront_distribution.dashboard
}
moved {
  from = aws_s3_bucket.site
  to   = module.dashboard.aws_s3_bucket.site
}
moved {
  from = aws_s3_bucket_public_access_block.site
  to   = module.dashboard.aws_s3_bucket_public_access_block.site
}
moved {
  from = aws_s3_bucket_policy.site
  to   = module.dashboard.aws_s3_bucket_policy.site
}
moved {
  from = aws_s3_object.site
  to   = module.dashboard.aws_s3_object.site
}
moved {
  from = aws_s3_object.site_config
  to   = module.dashboard.aws_s3_object.site_config
}
