export type Severity = "critical" | "high" | "medium" | "low";

export const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

// Machine keys for the one-click fixes the remediator Lambda knows how to run.
// Only safe, well-defined, reversible actions get a key; everything else stays
// report-only.
export type RemediationAction =
  | "s3_block_public_access"
  | "revoke_sg_ingress"
  | "deactivate_access_key";

export interface Remediation {
  action: RemediationAction;
  // Everything the remediator needs to execute the fix. Kept flat + stringy so
  // it round-trips cleanly through the signed token.
  params: Record<string, string>;
  // A one-line human description of exactly what "Apply fix" will do.
  effect: string;
}

export interface Finding {
  // Stable per-finding id (check + resource) — used as the nonce key so a given
  // fix can only be applied once.
  id: string;
  check: string;
  severity: Severity;
  title: string;
  resource: string;
  detail: string;
  // Copy-paste manual remediation, always present.
  manualFix: string;
  // Present only when the finding is safely one-click fixable.
  remediation?: Remediation;
}
