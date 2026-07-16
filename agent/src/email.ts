import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import type { Finding, Severity } from "./types.js";

const SEV_COLOR: Record<Severity, string> = {
  critical: "#b91c1c",
  high: "#c2410c",
  medium: "#a16207",
  low: "#3f6212",
};
const SEV_LABEL: Record<Severity, string> = {
  critical: "CRITICAL",
  high: "HIGH",
  medium: "MEDIUM",
  low: "LOW",
};

export interface BriefEmail {
  region: string;
  sender: string;
  recipient: string;
  subject: string;
  summaryHtml: string;
  findings: Finding[];
  // finding.id -> fully-formed, signed "Apply fix" URL (only for fixable ones).
  applyLinks: Map<string, string>;
}

export async function sendBrief(opts: BriefEmail): Promise<string> {
  const html = renderEmail(opts);
  const ses = new SESv2Client({ region: opts.region });
  const res = await ses.send(
    new SendEmailCommand({
      FromEmailAddress: opts.sender,
      Destination: { ToAddresses: [opts.recipient] },
      Content: {
        Simple: {
          Subject: { Data: opts.subject, Charset: "UTF-8" },
          Body: {
            Html: { Data: html, Charset: "UTF-8" },
            Text: {
              Data: "Your Sentinel security brief is best viewed as HTML.",
              Charset: "UTF-8",
            },
          },
        },
      },
    })
  );
  return res.MessageId || "";
}

function renderEmail(opts: BriefEmail): string {
  const cards = opts.findings.map((f) => renderCard(f, opts.applyLinks.get(f.id))).join("");
  const body = opts.findings.length
    ? cards
    : `<p style="color:#3f6212;font-weight:600;">All clear — nothing to action today.</p>`;

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f4f5;">
<div style="max-width:680px;margin:0 auto;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18181b;line-height:1.5;">
  <p style="margin:0 0 4px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#71717a;">Sentinel · Morning Cloud Security Brief</p>
  <div style="background:#fff;border-radius:12px;padding:24px;border:1px solid #e4e4e7;margin-top:8px;">
    ${opts.summaryHtml}
  </div>
  <div style="margin-top:16px;">
    ${body}
  </div>
  <p style="margin:20px 4px 0;font-size:12px;color:#a1a1aa;">Generated unattended by your always-on agent. "Apply fix" links open a confirmation page and expire; each fix can be applied once.</p>
</div>
</body></html>`;
}

function renderCard(f: Finding, applyUrl: string | undefined): string {
  const color = SEV_COLOR[f.severity];
  const button = applyUrl
    ? `<p style="margin:12px 0 0;">
         <a href="${escapeAttr(applyUrl)}" style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;padding:8px 14px;border-radius:8px;font-size:13px;font-weight:600;">Review &amp; apply fix →</a>
         <span style="display:block;margin-top:6px;font-size:12px;color:#71717a;">${esc(f.remediation!.effect)}</span>
       </p>`
    : "";

  return `<div style="background:#fff;border:1px solid #e4e4e7;border-left:4px solid ${color};border-radius:10px;padding:16px 18px;margin-bottom:12px;">
    <div style="font-size:11px;font-weight:700;letter-spacing:.05em;color:${color};">${SEV_LABEL[f.severity]}</div>
    <div style="font-size:15px;font-weight:600;margin:2px 0 6px;">${esc(f.title)}</div>
    <div style="font-size:13px;color:#3f3f46;">${esc(f.detail)}</div>
    <div style="font-size:12px;color:#71717a;margin-top:8px;">Resource: <code style="background:#f4f4f5;padding:1px 5px;border-radius:4px;">${esc(f.resource)}</code></div>
    <div style="font-size:12px;color:#3f3f46;margin-top:8px;">Manual fix:</div>
    <pre style="background:#18181b;color:#e4e4e7;padding:10px 12px;border-radius:8px;font-size:12px;overflow-x:auto;white-space:pre-wrap;word-break:break-word;margin:4px 0 0;">${esc(f.manualFix)}</pre>
    ${button}
  </div>`;
}

// AWS-derived strings (bucket names, SG names, tags) are untrusted — escape
// them before they land in HTML so a crafted resource name can't inject markup.
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function escapeAttr(s: string): string {
  return esc(s).replace(/'/g, "&#39;");
}
