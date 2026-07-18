/*
 * Sample data for the public Sentinel dashboard.
 *
 * This is intentionally SYNTHETIC. The live dashboard is public, so it never
 * displays a real account's findings — that would be a roadmap for an attacker.
 * Real audit results are delivered privately to the operator's inbox. Everything
 * here is illustrative demo data with fictional resource names.
 */
window.SENTINEL_DATA = (function () {
  "use strict";

  const iso = (d) => d.toISOString();
  // Anchor all sample dates to a fixed reference day so nothing drifts with today.
  const anchor = new Date("2026-07-17T12:00:00.000Z");
  const anchorAgo = (n) => new Date(anchor.getTime() - n * 86400000);

  // --- 30-day trend: total issues detected per daily run (gently improving) ---
  const trend = [];
  for (let i = 29; i >= 0; i--) {
    const base = 20 - (29 - i) * 0.28; // trending down as fixes land
    const jitter = Math.round(Math.sin(i * 1.3) * 2);
    const issues = Math.max(6, Math.round(base) + jitter);
    trend.push({ date: iso(anchorAgo(i)).slice(0, 10), issues });
  }

  // --- Current findings (what the most recent scan surfaced) ---
  const findings = [
    {
      id: "s3.public_policy:acme-public-backups",
      severity: "critical", category: "S3", check: "s3.public_policy",
      title: 'Bucket "acme-public-backups" has a public bucket policy',
      resource: "arn:aws:s3:::acme-public-backups",
      detail: "The bucket policy grants access to the public. Anyone on the internet may be able to read objects.",
      manualFix: "aws s3api delete-bucket-policy --bucket acme-public-backups",
      fixable: true,
    },
    {
      id: "iam.root_no_mfa",
      severity: "critical", category: "IAM", check: "iam.root_no_mfa",
      title: "Root account has no MFA",
      resource: "account:root",
      detail: "The root user can do anything in the account. Without MFA a single leaked password is a full compromise.",
      manualFix: "Enable MFA on the root user from the Security Credentials page while signed in as root.",
      fixable: false,
    },
    {
      id: "ec2.open_sg:sg-0a1b2c3d:5432",
      severity: "critical", category: "Network", check: "ec2.open_sg",
      title: "PostgreSQL (5432) open to 0.0.0.0/0",
      resource: "sg-0a1b2c3d",
      detail: 'Security group "db-tier" allows the entire internet inbound to PostgreSQL.',
      manualFix: "aws ec2 revoke-security-group-ingress --group-id sg-0a1b2c3d --protocol tcp --port 5432 --cidr 0.0.0.0/0",
      fixable: true,
    },
    {
      id: "iam.no_mfa:ci-deploy",
      severity: "high", category: "IAM", check: "iam.no_mfa",
      title: 'IAM user "ci-deploy" has no MFA',
      resource: "arn:aws:iam::acct:user/ci-deploy",
      detail: "This user can authenticate with a password alone. A leaked password is enough to take over the account.",
      manualFix: "Assign an MFA device to the user, or migrate the workload to a role with short-lived credentials.",
      fixable: false,
    },
    {
      id: "ec2.open_sg:sg-0d4e5f6a:22",
      severity: "high", category: "Network", check: "ec2.open_sg",
      title: "SSH (22) open to 0.0.0.0/0",
      resource: "sg-0d4e5f6a",
      detail: 'Security group "bastion" exposes SSH to the entire internet. Restrict to known IPs.',
      manualFix: "aws ec2 revoke-security-group-ingress --group-id sg-0d4e5f6a --protocol tcp --port 22 --cidr 0.0.0.0/0",
      fixable: true,
    },
    {
      id: "s3.no_bpa:acme-assets",
      severity: "high", category: "S3", check: "s3.no_bpa",
      title: 'Bucket "acme-assets" is not fully blocking public access',
      resource: "arn:aws:s3:::acme-assets",
      detail: "Without all four Block Public Access settings on, a public ACL or policy could expose objects.",
      manualFix: "aws s3api put-public-access-block --bucket acme-assets --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true",
      fixable: true,
    },
    {
      id: "rds.unencrypted:prod-analytics",
      severity: "high", category: "Encryption", check: "rds.unencrypted",
      title: 'RDS instance "prod-analytics" is not encrypted',
      resource: "arn:aws:rds:us-east-1:acct:db:prod-analytics",
      detail: "The database storage is unencrypted at rest. Encryption must be enabled at creation.",
      manualFix: "Snapshot, copy the snapshot with encryption enabled, restore a new encrypted instance, then cut over.",
      fixable: false,
    },
    {
      id: "ec2.open_sg:sg-0b2c3d4e:3389",
      severity: "high", category: "Network", check: "ec2.open_sg",
      title: "RDP (3389) open to 0.0.0.0/0",
      resource: "sg-0b2c3d4e",
      detail: 'Security group "win-admin" exposes RDP to the entire internet.',
      manualFix: "aws ec2 revoke-security-group-ingress --group-id sg-0b2c3d4e --protocol tcp --port 3389 --cidr 0.0.0.0/0",
      fixable: true,
    },
    {
      id: "iam.old_key:svc-backup",
      severity: "medium", category: "IAM", check: "iam.old_key",
      title: 'Access key for "svc-backup" is 214 days old',
      resource: "AKIA••••••••EXAMPLE",
      detail: "Long-lived keys widen the window for a leaked credential to be abused. Rotate at least every 90 days.",
      manualFix: "Create a new key, update apps, then deactivate the old one.",
      fixable: true,
    },
    {
      id: "iam.no_password_policy",
      severity: "medium", category: "IAM", check: "iam.no_password_policy",
      title: "Account has no IAM password policy",
      resource: "account:password-policy",
      detail: "No minimum length, complexity, or rotation requirement for IAM users.",
      manualFix: "aws iam update-account-password-policy --minimum-password-length 14 --require-symbols --require-numbers",
      fixable: false,
    },
    {
      id: "ebs.unencrypted:vol-0f1e2d3c",
      severity: "medium", category: "Encryption", check: "ebs.unencrypted",
      title: "EBS volume vol-0f1e2d3c is not encrypted",
      resource: "vol-0f1e2d3c",
      detail: "Data at rest on this volume is stored unencrypted. A snapshot would expose it in cleartext.",
      manualFix: "Snapshot, copy with --encrypted, create a new volume, and swap it in. Enable EBS encryption-by-default.",
      fixable: false,
    },
    {
      id: "ec2.public_instance:i-0c9b8a7d",
      severity: "low", category: "Network", check: "ec2.public_instance",
      title: "EC2 instance i-0c9b8a7d has a public IP",
      resource: "i-0c9b8a7d",
      detail: "Instance is directly reachable from the internet. Confirm this is intentional.",
      manualFix: "If it doesn't need to be public, move it to a private subnet behind an ALB/NAT.",
      fixable: false,
    },
  ];

  const severityBreakdown = { critical: 0, high: 0, medium: 0, low: 0 };
  findings.forEach((f) => (severityBreakdown[f.severity] += 1));

  const categoryBreakdown = {};
  findings.forEach((f) => (categoryBreakdown[f.category] = (categoryBreakdown[f.category] || 0) + 1));

  // --- Agent run history: a single pinned run ---
  const runs = [
    { at: "2026-07-17T07:00:00.000Z", status: "success", findings: 12, durationMs: 8300 },
  ];

  const totalIssuesDetected = trend.reduce((s, t) => s + t.issues, 0);

  const stats = {
    totalRuns: 42,
    successRate: 100,
    openIssues: findings.length,
    totalIssuesDetected,
    lastRun: runs[0],
    avgPerRun: Math.round(totalIssuesDetected / trend.length),
  };

  // --- Threat-intel fallback: real, notable CVEs (used if the live feed is
  //     unreachable). Accurate summaries + real NVD links. ---
  const cvesFallback = [
    { id: "CVE-2023-4966", badge: "Exploited", title: "Citrix Bleed — NetScaler ADC/Gateway session token disclosure", published: "2023-10-10", summary: "Sensitive information disclosure lets attackers hijack authenticated sessions and bypass MFA on Citrix NetScaler appliances.", source: "Citrix NetScaler", url: "https://nvd.nist.gov/vuln/detail/CVE-2023-4966" },
    { id: "CVE-2023-34362", badge: "Exploited", title: "MOVEit Transfer SQL injection", published: "2023-06-02", summary: "SQL injection in Progress MOVEit Transfer enabled mass data theft (Cl0p campaign) across thousands of organizations.", source: "Progress MOVEit", url: "https://nvd.nist.gov/vuln/detail/CVE-2023-34362" },
    { id: "CVE-2021-44228", badge: "Critical", title: "Log4Shell — Apache Log4j2 JNDI remote code execution", published: "2021-12-10", summary: "Unauthenticated RCE via crafted log messages that trigger JNDI lookups; one of the most widespread vulnerabilities ever.", source: "Apache Log4j", url: "https://nvd.nist.gov/vuln/detail/CVE-2021-44228" },
    { id: "CVE-2022-22965", badge: "Critical", title: "Spring4Shell — Spring Framework RCE", published: "2022-03-31", summary: "Data-binding flaw in Spring MVC/WebFlux on JDK 9+ allows remote code execution under certain deployments.", source: "Spring Framework", url: "https://nvd.nist.gov/vuln/detail/CVE-2022-22965" },
    { id: "CVE-2020-1472", badge: "Critical", title: "Zerologon — Netlogon elevation of privilege", published: "2020-08-17", summary: "Cryptographic flaw in Netlogon lets an attacker on the network take over a Windows domain controller.", source: "Microsoft Windows", url: "https://nvd.nist.gov/vuln/detail/CVE-2020-1472" },
    { id: "CVE-2021-34527", badge: "Critical", title: "PrintNightmare — Windows Print Spooler RCE", published: "2021-07-01", summary: "Remote code execution in the Windows Print Spooler service, exploitable to gain SYSTEM privileges.", source: "Microsoft Windows", url: "https://nvd.nist.gov/vuln/detail/CVE-2021-34527" },
    { id: "CVE-2019-0708", badge: "Critical", title: "BlueKeep — Remote Desktop Services RCE", published: "2019-05-14", summary: "Wormable pre-auth RCE in Windows RDP; capable of spreading without user interaction.", source: "Microsoft RDP", url: "https://nvd.nist.gov/vuln/detail/CVE-2019-0708" },
    { id: "CVE-2014-0160", badge: "High", title: "Heartbleed — OpenSSL heartbeat memory disclosure", published: "2014-04-07", summary: "Buffer over-read in OpenSSL's TLS heartbeat leaks server memory, including private keys and credentials.", source: "OpenSSL", url: "https://nvd.nist.gov/vuln/detail/CVE-2014-0160" },
  ];

  return { stats, trend, findings, severityBreakdown, categoryBreakdown, runs, cvesFallback };
})();
