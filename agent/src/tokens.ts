import { createHmac, timingSafeEqual } from "node:crypto";
import type { RemediationAction } from "./types.js";

// A signed, self-contained approval token. It encodes exactly which fix to run,
// against which resource, and when it expires. The signature (HMAC-SHA256 with
// a secret only the Lambdas hold) means the link cannot be forged or tampered
// with — you can't change the bucket name or the action without invalidating it.
export interface TokenPayload {
  fid: string; // finding id — also the single-use nonce key
  action: RemediationAction;
  params: Record<string, string>;
  exp: number; // unix seconds
}

export function signToken(payload: TokenPayload, secret: string): string {
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(hmac(body, secret));
  return `${body}.${sig}`;
}

export type VerifyResult =
  | { ok: true; payload: TokenPayload }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" };

export function verifyToken(token: string, secret: string): VerifyResult {
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, reason: "malformed" };
  const [body, sig] = parts;

  const expected = b64url(hmac(body, secret));
  if (!constantTimeEqual(sig, expected)) {
    return { ok: false, reason: "bad_signature" };
  }

  let payload: TokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true, payload };
}

function hmac(body: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(body).digest();
}

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
