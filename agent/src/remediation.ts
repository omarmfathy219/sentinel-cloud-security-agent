import { S3Client, PutPublicAccessBlockCommand } from "@aws-sdk/client-s3";
import {
  EC2Client,
  RevokeSecurityGroupIngressCommand,
} from "@aws-sdk/client-ec2";
import { IAMClient, UpdateAccessKeyCommand } from "@aws-sdk/client-iam";
import { S3_FULL_BLOCK_PUBLIC_ACCESS } from "./scanners/s3.js";
import type { TokenPayload } from "./tokens.js";

// Executes exactly one signed, approved fix. The action + params come from the
// verified token, so this function trusts them — but it still handles only the
// three whitelisted actions and nothing else.
export async function applyRemediation(
  region: string,
  payload: TokenPayload
): Promise<string> {
  switch (payload.action) {
    case "s3_block_public_access":
      return blockS3(region, payload.params.bucket);
    case "revoke_sg_ingress":
      return revokeSg(region, payload.params);
    case "deactivate_access_key":
      return deactivateKey(region, payload.params);
    default:
      throw new Error(`Unknown remediation action: ${payload.action}`);
  }
}

async function blockS3(region: string, bucket: string): Promise<string> {
  const s3 = new S3Client({ region });
  await s3.send(
    new PutPublicAccessBlockCommand({
      Bucket: bucket,
      PublicAccessBlockConfiguration: S3_FULL_BLOCK_PUBLIC_ACCESS,
    })
  );
  return `Enabled all four Block Public Access settings on bucket "${bucket}".`;
}

async function revokeSg(
  region: string,
  p: Record<string, string>
): Promise<string> {
  const ec2 = new EC2Client({ region });
  const isV6 = p.cidr.includes(":");
  await ec2.send(
    new RevokeSecurityGroupIngressCommand({
      GroupId: p.groupId,
      IpPermissions: [
        {
          IpProtocol: p.protocol,
          FromPort: Number(p.fromPort),
          ToPort: Number(p.toPort),
          ...(isV6
            ? { Ipv6Ranges: [{ CidrIpv6: p.cidr }] }
            : { IpRanges: [{ CidrIp: p.cidr }] }),
        },
      ],
    })
  );
  return `Revoked inbound rule allowing ${p.cidr} to ${p.protocol}/${p.fromPort}-${p.toPort} on ${p.groupId}.`;
}

async function deactivateKey(
  region: string,
  p: Record<string, string>
): Promise<string> {
  const iam = new IAMClient({ region });
  await iam.send(
    new UpdateAccessKeyCommand({
      UserName: p.userName,
      AccessKeyId: p.accessKeyId,
      Status: "Inactive",
    })
  );
  return `Deactivated access key ${p.accessKeyId} for user "${p.userName}". Reactivate any time if needed.`;
}
