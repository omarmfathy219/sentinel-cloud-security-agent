import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";

export interface ScannerConfig {
  region: string;
  accountId: string;
  bedrockModelId: string;
  senderEmail: string;
  recipientEmail: string;
  apiBaseUrl: string;
  hmacSecret: string;
  tokenTtlMinutes: number;
  briefsBucket: string;
  checks: { iam: boolean; network: boolean; s3: boolean; encryption: boolean };
}

export interface ApprovalConfig {
  region: string;
  hmacSecret: string;
  nonceTable: string;
  nonceTtlDays: number;
}

export interface BriefsConfig {
  region: string;
  briefsBucket: string;
  dashboardToken: string;
}

// The HMAC secret is the one true secret in the system. It lives in SSM as a
// SecureString and is fetched at cold start — never placed in a Lambda env var
// or in Terraform state.
async function getSecret(region: string, paramName: string): Promise<string> {
  const ssm = new SSMClient({ region });
  const res = await ssm.send(
    new GetParameterCommand({ Name: paramName, WithDecryption: true })
  );
  if (!res.Parameter?.Value) {
    throw new Error(`SSM parameter ${paramName} is empty or missing`);
  }
  return res.Parameter.Value;
}

export async function loadScannerConfig(): Promise<ScannerConfig> {
  const region = process.env.AWS_REGION || "us-east-1";
  return {
    region,
    accountId: required("ACCOUNT_ID"),
    bedrockModelId: process.env.BEDROCK_MODEL_ID || "amazon.nova-lite-v1:0",
    senderEmail: required("SENDER_EMAIL"),
    recipientEmail: required("RECIPIENT_EMAIL"),
    apiBaseUrl: required("API_BASE_URL").replace(/\/$/, ""),
    hmacSecret: await getSecret(region, required("HMAC_SECRET_PARAM")),
    tokenTtlMinutes: Number(process.env.TOKEN_TTL_MINUTES || "1440"),
    briefsBucket: required("BRIEFS_BUCKET"),
    checks: {
      iam: flag("CHECK_IAM", true),
      network: flag("CHECK_NETWORK", true),
      s3: flag("CHECK_S3", true),
      encryption: flag("CHECK_ENCRYPTION", true),
    },
  };
}

export async function loadApprovalConfig(): Promise<ApprovalConfig> {
  const region = process.env.AWS_REGION || "us-east-1";
  return {
    region,
    hmacSecret: await getSecret(region, required("HMAC_SECRET_PARAM")),
    nonceTable: required("NONCE_TABLE"),
    nonceTtlDays: Number(process.env.NONCE_TTL_DAYS || "30"),
  };
}

export async function loadBriefsConfig(): Promise<BriefsConfig> {
  const region = process.env.AWS_REGION || "us-east-1";
  return {
    region,
    briefsBucket: required("BRIEFS_BUCKET"),
    dashboardToken: await getSecret(region, required("DASHBOARD_TOKEN_PARAM")),
  };
}

function required(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required env var ${key}`);
  return v;
}

function flag(key: string, dflt: boolean): boolean {
  const v = process.env[key];
  if (v == null) return dflt;
  return v === "true" || v === "1";
}
