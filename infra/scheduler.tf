# EventBridge Scheduler — the trigger that makes this an "always-on" agent.
# Fires the scanner Lambda on a cron, no human involved.
resource "aws_scheduler_schedule" "daily_scan" {
  name = "${var.name_prefix}-daily-scan"

  flexible_time_window {
    mode = "OFF"
  }

  schedule_expression          = var.schedule_expression
  schedule_expression_timezone = var.schedule_timezone

  target {
    arn      = aws_lambda_function.scanner.arn
    role_arn = aws_iam_role.scheduler.arn
  }
}
