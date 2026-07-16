import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import type { Finding } from "./types.js";

// The persisted shape the dashboard renders. `applyUrl` is included per finding
// so the dashboard's "Apply fix" buttons reuse the same signed-token flow as
// the email (tokens expire, so buttons on old history entries naturally lapse).
export interface BriefRecord {
  scannedAt: string;
  accountId: string;
  region: string;
  summaryHtml: string;
  counts: Record<string, number>;
  findings: Array<Finding & { applyUrl?: string }>;
}

const LATEST_KEY = "briefs/latest.json";
const HISTORY_PREFIX = "briefs/history/";

export async function saveBrief(
  region: string,
  bucket: string,
  record: BriefRecord
): Promise<void> {
  const s3 = new S3Client({ region });
  const body = JSON.stringify(record);
  const epoch = Date.parse(record.scannedAt);
  await Promise.all([
    put(s3, bucket, LATEST_KEY, body),
    put(s3, bucket, `${HISTORY_PREFIX}${epoch}.json`, body),
  ]);
}

export async function readLatest(
  region: string,
  bucket: string
): Promise<BriefRecord | null> {
  return getRecord(region, bucket, LATEST_KEY);
}

export interface HistoryEntry {
  key: string;
  scannedAt: string;
}

export async function listHistory(
  region: string,
  bucket: string,
  limit = 30
): Promise<HistoryEntry[]> {
  const s3 = new S3Client({ region });
  const res = await s3.send(
    new ListObjectsV2Command({ Bucket: bucket, Prefix: HISTORY_PREFIX })
  );
  return (res.Contents || [])
    .map((o) => o.Key!)
    .filter((k) => k.endsWith(".json"))
    .sort((a, b) => epochOf(b) - epochOf(a))
    .slice(0, limit)
    .map((key) => ({ key, scannedAt: new Date(epochOf(key)).toISOString() }));
}

// Fetch one history record. The caller must validate the key prefix first so a
// crafted `key` can't read arbitrary objects.
export async function getByKey(
  region: string,
  bucket: string,
  key: string
): Promise<BriefRecord | null> {
  if (!key.startsWith(HISTORY_PREFIX)) return null;
  return getRecord(region, bucket, key);
}

async function getRecord(
  region: string,
  bucket: string,
  key: string
): Promise<BriefRecord | null> {
  const s3 = new S3Client({ region });
  try {
    const res = await s3.send(
      new GetObjectCommand({ Bucket: bucket, Key: key })
    );
    return JSON.parse(await res.Body!.transformToString()) as BriefRecord;
  } catch (err: unknown) {
    if (isName(err, "NoSuchKey")) return null;
    throw err;
  }
}

async function put(
  s3: S3Client,
  bucket: string,
  key: string,
  body: string
): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: "application/json",
    })
  );
}

function epochOf(key: string): number {
  return Number(key.slice(HISTORY_PREFIX.length).replace(".json", "")) || 0;
}

function isName(err: unknown, name: string): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "name" in err &&
    (err as { name: string }).name === name
  );
}
