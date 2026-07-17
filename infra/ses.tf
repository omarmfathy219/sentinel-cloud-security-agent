# SES identities. A brand-new account's SES is in the sandbox, so BOTH the
# sender and the recipient must be verified. Creating these identities triggers
# a verification email from AWS — click the link in each before the first run.
resource "aws_sesv2_email_identity" "sender" {
  email_identity = var.sender_email
}

resource "aws_sesv2_email_identity" "recipient" {
  count          = var.recipient_email == var.sender_email ? 0 : 1
  email_identity = var.recipient_email
}
