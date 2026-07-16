import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { loadApprovalConfig } from "./config.js";
import { verifyToken, type TokenPayload } from "./tokens.js";
import { consumeNonce } from "./nonce.js";
import { applyRemediation } from "./remediation.js";

// API Gateway (HTTP API) handler for the "Apply fix" links.
//   GET  /apply?token=... -> a confirmation page (a mail-security scanner that
//                            prefetches the link only lands here; nothing runs).
//   POST /apply?token=... -> verify + consume the single-use nonce + run the fix.
export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  const cfg = await loadApprovalConfig();
  const method = event.requestContext.http.method;
  const token = event.queryStringParameters?.token;

  if (!token) return page(400, "Invalid link", "<p>Missing token.</p>");

  const verified = verifyToken(token, cfg.hmacSecret);
  if (!verified.ok) {
    const msg =
      verified.reason === "expired"
        ? "This approval link has expired. Trigger a fresh scan to get a new one."
        : "This link is invalid or has been tampered with.";
    return page(400, "Link not valid", `<p>${msg}</p>`);
  }
  const payload = verified.payload;

  if (method === "GET") {
    return page(
      200,
      "Confirm security fix",
      `<p>You're about to apply this fix:</p>
       <blockquote style="border-left:4px solid #1d4ed8;margin:16px 0;padding:8px 14px;background:#f8fafc;color:#334155;">${esc(describe(payload))}</blockquote>
       <form method="POST" action="/apply?token=${encodeURIComponent(token)}">
         <button type="submit" style="background:#1d4ed8;color:#fff;border:0;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">Apply this fix</button>
       </form>
       <p style="font-size:12px;color:#64748b;margin-top:14px;">This can only be applied once. Close this tab to cancel.</p>`
    );
  }

  if (method === "POST") {
    const fresh = await consumeNonce(
      cfg.region,
      cfg.nonceTable,
      payload.fid,
      cfg.nonceTtlDays * 24 * 60 * 60
    );
    if (!fresh) {
      return page(
        409,
        "Already applied",
        "<p>This fix has already been applied. No action taken.</p>"
      );
    }
    try {
      const result = await applyRemediation(cfg.region, payload);
      return page(
        200,
        "Fix applied",
        `<p style="color:#166534;font-weight:600;">✓ Done.</p><p>${esc(result)}</p>`
      );
    } catch (err) {
      console.error("[approval] remediation failed:", err);
      return page(
        500,
        "Fix failed",
        `<p>The fix could not be applied:</p><pre>${esc(String((err as Error).message))}</pre>`
      );
    }
  }

  return page(405, "Not allowed", "<p>Unsupported method.</p>");
};

function describe(p: TokenPayload): string {
  switch (p.action) {
    case "s3_block_public_access":
      return `Enable all four S3 Block Public Access settings on bucket "${p.params.bucket}".`;
    case "revoke_sg_ingress":
      return `Revoke the inbound rule allowing ${p.params.cidr} to ${p.params.protocol}/${p.params.fromPort}-${p.params.toPort} on security group ${p.params.groupId}.`;
    case "deactivate_access_key":
      return `Deactivate IAM access key ${p.params.accessKeyId} for user "${p.params.userName}".`;
    default:
      return "Apply the requested fix.";
  }
}

function page(
  statusCode: number,
  title: string,
  bodyHtml: string
): APIGatewayProxyResultV2 {
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · Sentinel</title></head>
<body style="margin:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18181b;">
<div style="max-width:520px;margin:48px auto;padding:28px;background:#fff;border:1px solid #e4e4e7;border-radius:12px;">
  <p style="margin:0 0 4px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#71717a;">Sentinel</p>
  <h1 style="font-size:20px;margin:0 0 12px;">${esc(title)}</h1>
  ${bodyHtml}
</div></body></html>`;
  return {
    statusCode,
    headers: { "content-type": "text/html; charset=utf-8" },
    body: html,
  };
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
