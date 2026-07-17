import { loadScannerConfig } from "./config.js";
import { runScan } from "./scan.js";
import { generateSummary } from "./bedrock.js";
import { sendBrief } from "./email.js";
import { signToken } from "./tokens.js";
import { saveBrief, type BriefRecord } from "./storage.js";
import type { Finding } from "./types.js";

export interface ScanReport {
  findings: number;
  fixable: number;
  scannerErrors: string[];
  messageId: string;
}

// Scheduled entry point. EventBridge Scheduler invokes this once a day with an
// empty event.
export const handler = async (): Promise<ScanReport> => {
  const cfg = await loadScannerConfig();
  console.log(
    `[sentinel] account=${cfg.accountId} region=${cfg.region} checks=${JSON.stringify(cfg.checks)}`
  );

  const { findings, errors } = await runScan({
    region: cfg.region,
    checks: cfg.checks,
  });
  console.log(
    `[sentinel] findings=${findings.length} scannerErrors=${errors.length}`
  );

  // Sign an approval token per fixable finding and turn it into a full URL. The
  // token expires and is single-use; the link is the only way to trigger a fix.
  const exp = Math.floor(Date.now() / 1000) + cfg.tokenTtlMinutes * 60;
  const applyLinks = new Map<string, string>();
  for (const f of findings) {
    if (!f.remediation) continue;
    const token = signToken(
      { fid: f.id, action: f.remediation.action, params: f.remediation.params, exp },
      cfg.hmacSecret
    );
    applyLinks.set(
      f.id,
      `${cfg.apiBaseUrl}/apply?token=${encodeURIComponent(token)}`
    );
  }

  const summaryHtml = await generateSummary(
    cfg.region,
    cfg.bedrockModelId,
    findings
  );

  const messageId = await sendBrief({
    region: cfg.region,
    sender: cfg.senderEmail,
    recipient: cfg.recipientEmail,
    subject: buildSubject(findings, cfg.accountId),
    summaryHtml,
    findings,
    applyLinks,
  });

  // Persist the brief so the dashboard can render it (latest + history).
  const record: BriefRecord = {
    scannedAt: new Date().toISOString(),
    accountId: cfg.accountId,
    region: cfg.region,
    summaryHtml,
    counts: countBySeverity(findings),
    findings: findings.map((f) => ({ ...f, applyUrl: applyLinks.get(f.id) })),
  };
  try {
    await saveBrief(cfg.region, cfg.briefsBucket, record);
  } catch (err) {
    console.error("[sentinel] failed to persist brief:", err);
  }

  const report: ScanReport = {
    findings: findings.length,
    fixable: applyLinks.size,
    scannerErrors: errors,
    messageId,
  };
  console.log("[sentinel] done", JSON.stringify(report));
  return report;
};

function countBySeverity(findings: Finding[]): Record<string, number> {
  const c: Record<string, number> = {};
  for (const f of findings) c[f.severity] = (c[f.severity] || 0) + 1;
  return c;
}

function buildSubject(findings: Finding[], accountId: string): string {
  const date = new Date().toISOString().slice(0, 10);
  if (findings.length === 0) {
    return `Sentinel · ${date} · all clear (${accountId})`;
  }
  const crit = findings.filter((f) => f.severity === "critical").length;
  const high = findings.filter((f) => f.severity === "high").length;
  const tag =
    crit > 0 ? `${crit} critical` : high > 0 ? `${high} high` : `${findings.length} findings`;
  return `Sentinel · ${date} · ${findings.length} findings (${tag})`;
}
