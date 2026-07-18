# The scheduled agent: a read-only Lambda fired daily by EventBridge Scheduler.
data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "scanner" {
  name               = "${var.name_prefix}-scanner"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

data "aws_iam_policy_document" "scanner" {
  statement {
    sid    = "PostureReadOnly"
    effect = "Allow"
    actions = [
      "iam:ListUsers",
      "iam:ListMFADevices",
      "iam:ListAccessKeys",
      "iam:ListAttachedUserPolicies",
      "iam:GetAccountPasswordPolicy",
      "iam:GetAccountSummary",
      "ec2:DescribeSecurityGroups",
      "ec2:DescribeInstances",
      "ec2:DescribeVolumes",
      "rds:DescribeDBInstances",
      "s3:ListAllMyBuckets",
      "s3:GetBucketPublicAccessBlock",
      "s3:GetBucketPolicyStatus",
      "s3:GetEncryptionConfiguration",
    ]
    resources = ["*"] # these describe/list actions do not support resource scoping
  }

  statement {
    sid       = "InvokeBedrock"
    effect    = "Allow"
    actions   = ["bedrock:InvokeModel"]
    resources = ["arn:aws:bedrock:${var.region}::foundation-model/*"]
  }

  statement {
    sid       = "SendBrief"
    effect    = "Allow"
    actions   = ["ses:SendEmail"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "ses:FromAddress"
      values   = [var.sender_email]
    }
  }

  statement {
    sid       = "ReadHmacSecret"
    effect    = "Allow"
    actions   = ["ssm:GetParameter"]
    resources = [var.hmac_param_arn]
  }

  statement {
    sid       = "WriteBriefs"
    effect    = "Allow"
    actions   = ["s3:PutObject"]
    resources = ["${var.briefs_bucket_arn}/*"]
  }

  statement {
    sid       = "SendToDlq"
    effect    = "Allow"
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.dlq.arn]
  }

  statement {
    sid       = "Logs"
    effect    = "Allow"
    actions   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["arn:aws:logs:${var.region}:${var.account_id}:*"]
  }
}

resource "aws_iam_role_policy" "scanner" {
  name   = "scanner"
  role   = aws_iam_role.scanner.id
  policy = data.aws_iam_policy_document.scanner.json
}

resource "aws_lambda_function" "scanner" {
  function_name    = "${var.name_prefix}-scanner"
  role             = aws_iam_role.scanner.arn
  runtime          = "nodejs20.x"
  handler          = "scanner.handler"
  filename         = var.zip_file
  source_code_hash = var.zip_hash
  timeout          = 120
  memory_size      = 256

  environment {
    variables = {
      ACCOUNT_ID        = var.account_id
      BEDROCK_MODEL_ID  = var.bedrock_model_id
      SENDER_EMAIL      = var.sender_email
      RECIPIENT_EMAIL   = var.recipient_email
      API_BASE_URL      = var.api_base_url
      HMAC_SECRET_PARAM = var.hmac_param_name
      TOKEN_TTL_MINUTES = tostring(var.token_ttl_minutes)
      BRIEFS_BUCKET     = var.briefs_bucket_name
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

# --- Scheduler role + daily trigger ---
data "aws_iam_policy_document" "scheduler_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["scheduler.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "scheduler" {
  name               = "${var.name_prefix}-scheduler"
  assume_role_policy = data.aws_iam_policy_document.scheduler_assume.json
}

data "aws_iam_policy_document" "scheduler_invoke" {
  statement {
    effect    = "Allow"
    actions   = ["lambda:InvokeFunction"]
    resources = [aws_lambda_function.scanner.arn]
  }
  statement {
    effect    = "Allow"
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.dlq.arn]
  }
}

resource "aws_iam_role_policy" "scheduler" {
  name   = "invoke-scanner"
  role   = aws_iam_role.scheduler.id
  policy = data.aws_iam_policy_document.scheduler_invoke.json
}

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

    # Failed scheduled invocations land in the DLQ instead of vanishing.
    dead_letter_config {
      arn = aws_sqs_queue.dlq.arn
    }
  }
}

# --- Dead-letter queue for failed scans (scheduler delivery + Lambda async) ---
resource "aws_sqs_queue" "dlq" {
  name                      = "${var.name_prefix}-dlq"
  message_retention_seconds = 1209600 # 14 days
}

resource "aws_lambda_function_event_invoke_config" "scanner" {
  function_name          = aws_lambda_function.scanner.function_name
  maximum_retry_attempts = 1

  destination_config {
    on_failure {
      destination = aws_sqs_queue.dlq.arn
    }
  }
}

# --- Failure alerting: SNS topic emailed on scan errors or a non-empty DLQ ---
resource "aws_sns_topic" "alerts" {
  name = "${var.name_prefix}-alerts"
}

resource "aws_sns_topic_subscription" "email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.recipient_email
}

resource "aws_cloudwatch_metric_alarm" "scanner_errors" {
  alarm_name          = "${var.name_prefix}-scanner-errors"
  alarm_description   = "The daily Sentinel scan raised a Lambda error."
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  statistic           = "Sum"
  period              = 86400
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  dimensions          = { FunctionName = aws_lambda_function.scanner.function_name }
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "dlq_not_empty" {
  alarm_name          = "${var.name_prefix}-dlq-not-empty"
  alarm_description   = "A scan invocation failed and landed in the dead-letter queue."
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateNumberOfMessagesVisible"
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  dimensions          = { QueueName = aws_sqs_queue.dlq.name }
  alarm_actions       = [aws_sns_topic.alerts.arn]
}
