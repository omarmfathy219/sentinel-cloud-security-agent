import type { Finding } from "./types.js";
import { SEVERITY_ORDER } from "./types.js";
import { scanIam } from "./scanners/iam.js";
import { scanNetwork } from "./scanners/network.js";
import { scanS3 } from "./scanners/s3.js";
import { scanEncryption } from "./scanners/encryption.js";

export interface ScanConfig {
  region: string;
  checks: {
    iam: boolean;
    network: boolean;
    s3: boolean;
    encryption: boolean;
  };
}

// Run every enabled scanner. Each is isolated: one failing scanner (e.g. a
// missing permission for one service) degrades to a warning rather than sinking
// the whole run.
export async function runScan(config: ScanConfig): Promise<{
  findings: Finding[];
  errors: string[];
}> {
  const jobs: Array<[string, Promise<Finding[]>]> = [];
  if (config.checks.iam) jobs.push(["iam", scanIam(config.region)]);
  if (config.checks.network) jobs.push(["network", scanNetwork(config.region)]);
  if (config.checks.s3) jobs.push(["s3", scanS3(config.region)]);
  if (config.checks.encryption)
    jobs.push(["encryption", scanEncryption(config.region)]);

  const findings: Finding[] = [];
  const errors: string[] = [];

  const settled = await Promise.allSettled(jobs.map(([, p]) => p));
  settled.forEach((res, i) => {
    const name = jobs[i][0];
    if (res.status === "fulfilled") {
      findings.push(...res.value);
    } else {
      errors.push(`${name}: ${String(res.reason?.message ?? res.reason)}`);
      console.error(`[scan] scanner ${name} failed:`, res.reason);
    }
  });

  findings.sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
  );
  return { findings, errors };
}
