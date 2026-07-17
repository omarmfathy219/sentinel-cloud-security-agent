# Weekend Agent Challenge: Sentinel — Your Morning Cloud Security Brief

**Tag:** #agents

> _Draft for AWS Builder Center. Replace the bracketed placeholders with your
> repo link and screenshots before publishing._

## Vision & What the Agent Does

Most of us don't audit our own AWS account nearly often enough. A bucket gets
made public "just for a minute," a security group ends up open to `0.0.0.0/0`, an
access key quietly turns 200 days old. Nothing tells you — until something goes
wrong. The best time to catch these is before you've had coffee, not after an
incident.

**Sentinel** is a personal always-on agent that audits my AWS account while I
sleep and has a prioritized security brief waiting in my inbox every morning. I
never open a console to run it. At 07:00 it wakes itself up, runs a battery of
read-only checks across IAM, networking, S3, and encryption, and sends the
findings to a Bedrock model, which ranks them by severity and writes a calm,
plain-English summary: what's on fire, what to deal with first, and why it
matters.

The part I'm proudest of is the remediation loop. Every finding includes a
copy-paste fix, and the ones that are safe to automate come with an **"Apply
fix"** button. Click it and you get a confirmation page describing exactly what
will change; confirm, and a separate, tightly-scoped function runs that single
fix — enabling S3 Block Public Access, revoking an open ingress rule, or
deactivating an aging access key. Nothing is ever changed without my explicit
approval, one fix at a time.

It's triggered entirely by a schedule, does real work unattended, and reports a
result back — a personal security analyst that runs itself.

## How You Built It

I started from the trigger and worked outward. **EventBridge Scheduler** fires a
**Lambda** on a daily cron — that's what makes it "always-on" rather than a tool
I have to remember to run. The scanner Lambda (TypeScript, bundled with esbuild)
runs four independent check modules, each isolated so one missing permission
degrades to a warning instead of sinking the whole run.

The most interesting design decisions were all about **security**, since a
scheduled function that can touch your whole account is itself a juicy target:

- **Two roles, least privilege.** The scanner is strictly read-only. It
  physically cannot change anything. Only a second Lambda can write, and its IAM
  policy allows exactly three actions — the ones the supported fixes need.
- **Signed, single-use approval links.** Each "Apply fix" link carries an
  HMAC-SHA256 token encoding the finding, resource, and an expiry. The signing
  key lives in SSM Parameter Store as a SecureString. A forged or tampered link
  fails signature verification; a replayed link fails a DynamoDB conditional
  write that guarantees each fix runs at most once.
- **GET confirms, POST executes.** Email clients and security scanners
  pre-fetch links. If clicking a link ran the fix, a scanner could trigger it. So
  GET only renders a confirmation page; the fix runs on POST from that page.
- **Prompt-injection boundary.** Resource names and tags are attacker-influenceable
  strings. The Bedrock model writes only the human summary — it never generates
  links or actions — and all resource-derived text is HTML-escaped before it
  reaches the email.

**Challenges:** the fiddliest one was bundling. esbuild's minified CommonJS
output silently dropped the exported Lambda handler once the AWS SDK was bundled
in, so Lambda couldn't find it. I switched the bundle to ESM (`.mjs`), which
Node 20 runs natively and which keeps the `export { handler }` intact.

## AWS Services Used / Architecture Overview

- **EventBridge Scheduler** — the daily trigger.
- **Lambda ×2** — the read-only scanner, and the write-scoped approval/remediator.
- **Amazon Bedrock** — ranks findings and writes the brief (Nova by default;
  swappable to Claude via one variable).
- **Amazon SES** — delivers the brief.
- **API Gateway (HTTP API)** — fronts the approval Lambda for the fix links.
- **DynamoDB** — single-use nonce store (replay protection).
- **SSM Parameter Store** — the HMAC signing secret (SecureString).
- **IAM + CloudWatch Logs** — least-privilege roles and the run trail.

```
EventBridge Scheduler → Scanner Lambda → (read-only scans) → Bedrock → SES email
                                                                   │
        API Gateway → Approval Lambda → one scoped fix ←──── you click + confirm
                          (DynamoDB nonce, SSM secret)
```

Everything is defined in Terraform — one `terraform apply` stands the whole
thing up.

## What You Learned

Two things stuck. First, **the schedule is the feature.** Moving from "a script I
run" to "a thing that runs itself and hands me the result" changes how useful it
feels far more than any single check does. Second, **an agent that can act needs
its own threat model.** The moment you give automation write access, you've
built something that can be abused — so the interesting engineering wasn't the
scanning, it was making approval unforgeable, un-replayable, and immune to link
pre-fetching. I also got hands-on with the Bedrock Converse API for the first
time and appreciated how model-agnostic it is: swapping Nova for Claude is a
one-line change.

## Link to App or Repo

- **Repo:** [ADD YOUR PUBLIC GITHUB LINK]
- **Evidence:** [screenshot of the EventBridge schedule firing + the brief email
  it produced]
