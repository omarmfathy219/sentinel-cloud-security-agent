import {
  EC2Client,
  DescribeVolumesCommand,
} from "@aws-sdk/client-ec2";
import {
  RDSClient,
  DescribeDBInstancesCommand,
} from "@aws-sdk/client-rds";
import type { Finding } from "../types.js";

// Encryption-at-rest checks for EBS and RDS. These are report-only: you cannot
// encrypt an existing unencrypted volume/instance in place, so there is no safe
// one-click fix.
export async function scanEncryption(region: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  const ec2 = new EC2Client({ region });
  const rds = new RDSClient({ region });

  let volToken: string | undefined;
  do {
    const page = await ec2.send(
      new DescribeVolumesCommand({ NextToken: volToken })
    );
    for (const v of page.Volumes || []) {
      if (v.Encrypted === false) {
        findings.push({
          id: `ebs.unencrypted:${v.VolumeId}`,
          check: "ebs.unencrypted",
          severity: "medium",
          title: `EBS volume ${v.VolumeId} is not encrypted`,
          resource: v.VolumeId!,
          detail:
            "Data at rest on this volume is stored unencrypted. A snapshot or disk copy would expose it in cleartext.",
          manualFix:
            "Snapshot the volume, copy the snapshot with --encrypted, create a new volume from the encrypted snapshot, and swap it in. Also enable EBS encryption-by-default for the region.",
        });
      }
    }
    volToken = page.NextToken;
  } while (volToken);

  let dbMarker: string | undefined;
  do {
    const page = await rds.send(
      new DescribeDBInstancesCommand({ Marker: dbMarker })
    );
    for (const db of page.DBInstances || []) {
      if (db.StorageEncrypted === false) {
        findings.push({
          id: `rds.unencrypted:${db.DBInstanceIdentifier}`,
          check: "rds.unencrypted",
          severity: "high",
          title: `RDS instance "${db.DBInstanceIdentifier}" is not encrypted`,
          resource: db.DBInstanceArn || db.DBInstanceIdentifier!,
          detail:
            "The database storage is unencrypted at rest. Encryption must be enabled at creation and cannot be toggled in place.",
          manualFix:
            "Take a snapshot, copy it with encryption enabled, restore a new encrypted instance from the encrypted snapshot, then cut over.",
        });
      }
    }
    dbMarker = page.Marker;
  } while (dbMarker);

  return findings;
}
