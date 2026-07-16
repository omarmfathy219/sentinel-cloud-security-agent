import {
  S3Client,
  ListBucketsCommand,
  GetPublicAccessBlockCommand,
  GetBucketPolicyStatusCommand,
  GetBucketEncryptionCommand,
} from "@aws-sdk/client-s3";
import type { Finding } from "../types.js";

const FULL_BPA = {
  BlockPublicAcls: true,
  IgnorePublicAcls: true,
  BlockPublicPolicy: true,
  RestrictPublicBuckets: true,
};

export async function scanS3(region: string): Promise<Finding[]> {
  const s3 = new S3Client({ region });
  const findings: Finding[] = [];

  const list = await s3.send(new ListBucketsCommand({}));
  for (const b of list.Buckets || []) {
    const bucket = b.Name!;

    // --- Block Public Access ---
    let bpaAllOn = false;
    try {
      const bpa = await s3.send(
        new GetPublicAccessBlockCommand({ Bucket: bucket })
      );
      const cfg = bpa.PublicAccessBlockConfiguration || {};
      bpaAllOn =
        !!cfg.BlockPublicAcls &&
        !!cfg.IgnorePublicAcls &&
        !!cfg.BlockPublicPolicy &&
        !!cfg.RestrictPublicBuckets;
    } catch (err: unknown) {
      if (!isName(err, "NoSuchPublicAccessBlockConfiguration")) {
        // AccessDenied / redirects etc — skip this check for the bucket.
        if (isName(err, "AccessDenied")) continue;
      }
      bpaAllOn = false;
    }
    if (!bpaAllOn) {
      findings.push({
        id: `s3.no_bpa:${bucket}`,
        check: "s3.no_bpa",
        severity: "high",
        title: `Bucket "${bucket}" is not fully blocking public access`,
        resource: `arn:aws:s3:::${bucket}`,
        detail:
          "Without all four Block Public Access settings on, a public ACL or bucket policy could expose objects to anyone.",
        manualFix: `aws s3api put-public-access-block --bucket ${bucket} --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true`,
        remediation: {
          action: "s3_block_public_access",
          params: { bucket },
          effect: `Turn on all four Block Public Access settings for bucket ${bucket}. Safe unless the bucket is intentionally serving public content (e.g. a static site).`,
        },
      });
    }

    // --- Effective public policy ---
    try {
      const status = await s3.send(
        new GetBucketPolicyStatusCommand({ Bucket: bucket })
      );
      if (status.PolicyStatus?.IsPublic) {
        findings.push({
          id: `s3.public_policy:${bucket}`,
          check: "s3.public_policy",
          severity: "critical",
          title: `Bucket "${bucket}" has a public bucket policy`,
          resource: `arn:aws:s3:::${bucket}`,
          detail:
            "The bucket policy grants access to the public. Anyone on the internet may be able to read (or write) objects.",
          manualFix: `Review and remove the public grant: aws s3api get-bucket-policy --bucket ${bucket}  then delete/replace it: aws s3api delete-bucket-policy --bucket ${bucket}`,
        });
      }
    } catch (err: unknown) {
      // NoSuchBucketPolicy / AccessDenied — nothing to report.
      void err;
    }

    // --- Default encryption ---
    try {
      await s3.send(new GetBucketEncryptionCommand({ Bucket: bucket }));
    } catch (err: unknown) {
      if (isName(err, "ServerSideEncryptionConfigurationNotFoundError")) {
        findings.push({
          id: `s3.no_encryption:${bucket}`,
          check: "s3.no_encryption",
          severity: "low",
          title: `Bucket "${bucket}" has no default encryption`,
          resource: `arn:aws:s3:::${bucket}`,
          detail:
            "New objects are not guaranteed to be encrypted at rest unless the uploader sets it explicitly.",
          manualFix: `aws s3api put-bucket-encryption --bucket ${bucket} --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'`,
        });
      }
    }
  }

  return findings;
}

// Exposed so the remediator can apply the same full-lock config.
export const S3_FULL_BLOCK_PUBLIC_ACCESS = FULL_BPA;

function isName(err: unknown, name: string): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "name" in err &&
    (err as { name: string }).name === name
  );
}
