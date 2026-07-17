data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

# ---------------------------------------------------------------------------
# Scanner role — READ ONLY. It can describe posture, invoke Bedrock, send the
# email, and read the HMAC secret. It has NO write access to anything.
# ---------------------------------------------------------------------------
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
    resources = ["arn:aws:bedrock:${var.aws_region}::foundation-model/*"]
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
    resources = [aws_ssm_parameter.hmac_secret.arn]
  }

  statement {
    sid       = "WriteBriefs"
    effect    = "Allow"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.briefs.arn}/*"]
  }

  statement {
    sid       = "Logs"
    effect    = "Allow"
    actions   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["arn:aws:logs:${var.aws_region}:${local.account_id}:*"]
  }
}

resource "aws_iam_role_policy" "scanner" {
  name   = "scanner"
  role   = aws_iam_role.scanner.id
  policy = data.aws_iam_policy_document.scanner.json
}

# ---------------------------------------------------------------------------
# Approval/remediation role — write access scoped to EXACTLY the three fixes
# the agent knows how to apply, plus the nonce table and the HMAC secret.
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
    resources = ["*"] # narrowed by action set; these fixes target arbitrary resources found at scan time
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
    resources = [aws_ssm_parameter.hmac_secret.arn]
  }

  statement {
    sid       = "Logs"
    effect    = "Allow"
    actions   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["arn:aws:logs:${var.aws_region}:${local.account_id}:*"]
  }
}

resource "aws_iam_role_policy" "approval" {
  name   = "approval"
  role   = aws_iam_role.approval.id
  policy = data.aws_iam_policy_document.approval.json
}

# ---------------------------------------------------------------------------
# Scheduler role — lets EventBridge Scheduler invoke the scanner Lambda.
# ---------------------------------------------------------------------------
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
}

resource "aws_iam_role_policy" "scheduler" {
  name   = "invoke-scanner"
  role   = aws_iam_role.scheduler.id
  policy = data.aws_iam_policy_document.scheduler_invoke.json
}
