import {
  EC2Client,
  DescribeSecurityGroupsCommand,
  DescribeInstancesCommand,
  type IpPermission,
} from "@aws-sdk/client-ec2";
import type { Finding, Severity } from "../types.js";

// Ports we consider dangerous to expose to the whole internet.
const SENSITIVE_PORTS: Record<number, { name: string; severity: Severity }> = {
  22: { name: "SSH", severity: "high" },
  3389: { name: "RDP", severity: "high" },
  3306: { name: "MySQL", severity: "critical" },
  5432: { name: "PostgreSQL", severity: "critical" },
  6379: { name: "Redis", severity: "critical" },
  27017: { name: "MongoDB", severity: "critical" },
  1433: { name: "MSSQL", severity: "critical" },
  9200: { name: "Elasticsearch", severity: "critical" },
};

const OPEN_CIDRS = new Set(["0.0.0.0/0", "::/0"]);

export async function scanNetwork(region: string): Promise<Finding[]> {
  const ec2 = new EC2Client({ region });
  const findings: Finding[] = [];

  // --- Security groups open to the world on sensitive ports ---
  let sgToken: string | undefined;
  do {
    const page = await ec2.send(
      new DescribeSecurityGroupsCommand({ NextToken: sgToken })
    );
    for (const sg of page.SecurityGroups || []) {
      for (const perm of sg.IpPermissions || []) {
        const openCidr = findOpenCidr(perm);
        if (!openCidr) continue;
        for (const port of expandPorts(perm)) {
          const sens = SENSITIVE_PORTS[port];
          if (!sens) continue;
          const proto = perm.IpProtocol === "-1" ? "tcp" : perm.IpProtocol!;
          findings.push({
            id: `ec2.open_sg:${sg.GroupId}:${proto}:${port}:${openCidr}`,
            check: "ec2.open_sg",
            severity: sens.severity,
            title: `${sens.name} (port ${port}) open to ${openCidr}`,
            resource: sg.GroupId!,
            detail: `Security group "${sg.GroupName}" allows ${openCidr} inbound to ${sens.name}. This exposes the service to the entire internet.`,
            manualFix: `Restrict the rule to known IPs: aws ec2 revoke-security-group-ingress --group-id ${sg.GroupId} --protocol ${proto} --port ${port} --cidr ${openCidr}  (then re-add a scoped CIDR)`,
            remediation: {
              action: "revoke_sg_ingress",
              params: {
                groupId: sg.GroupId!,
                protocol: proto,
                fromPort: String(perm.FromPort ?? port),
                toPort: String(perm.ToPort ?? port),
                cidr: openCidr,
              },
              effect: `Revoke the inbound rule allowing ${openCidr} to ${sens.name} (port ${port}) on ${sg.GroupId}. If you rely on this access from a fixed IP, re-add a scoped rule afterwards.`,
            },
          });
        }
      }
    }
    sgToken = page.NextToken;
  } while (sgToken);

  // --- EC2 instances with public IPs (report-only) ---
  let insToken: string | undefined;
  do {
    const page = await ec2.send(
      new DescribeInstancesCommand({ NextToken: insToken })
    );
    for (const res of page.Reservations || []) {
      for (const inst of res.Instances || []) {
        if (inst.State?.Name === "terminated") continue;
        if (inst.PublicIpAddress) {
          findings.push({
            id: `ec2.public_instance:${inst.InstanceId}`,
            check: "ec2.public_instance",
            severity: "low",
            title: `EC2 instance ${inst.InstanceId} has a public IP`,
            resource: inst.InstanceId!,
            detail: `Instance is directly reachable at ${inst.PublicIpAddress}. Confirm this is intentional; prefer private subnets behind a load balancer or bastion.`,
            manualFix:
              "If it doesn't need to be public, move it to a private subnet or remove the auto-assigned public IP and place it behind an ALB/NAT.",
          });
        }
      }
    }
    insToken = page.NextToken;
  } while (insToken);

  return findings;
}

function findOpenCidr(perm: IpPermission): string | undefined {
  const v4 = (perm.IpRanges || []).find((r) => r.CidrIp && OPEN_CIDRS.has(r.CidrIp));
  if (v4?.CidrIp) return v4.CidrIp;
  const v6 = (perm.Ipv6Ranges || []).find(
    (r) => r.CidrIpv6 && OPEN_CIDRS.has(r.CidrIpv6)
  );
  return v6?.CidrIpv6;
}

// Expand a permission's port range into the sensitive ports it covers. `-1`
// (all traffic) or a null range means "everything", so we test all sensitive
// ports.
function expandPorts(perm: IpPermission): number[] {
  if (perm.IpProtocol === "-1" || perm.FromPort == null || perm.ToPort == null) {
    return Object.keys(SENSITIVE_PORTS).map(Number);
  }
  const ports: number[] = [];
  for (const p of Object.keys(SENSITIVE_PORTS).map(Number)) {
    if (p >= perm.FromPort && p <= perm.ToPort) ports.push(p);
  }
  return ports;
}
