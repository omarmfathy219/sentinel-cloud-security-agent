import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { timingSafeEqual } from "node:crypto";
import { loadBriefsConfig } from "./config.js";
import { readLatest, listHistory, getByKey } from "./storage.js";

// Read API for the dashboard. Token-gated because the payload is a list of the
// account's security weaknesses — it must never be world-readable. The static
// dashboard shell is public; this data is not.
//   GET /briefs/latest      -> most recent brief
//   GET /briefs             -> history index [{key, scannedAt}]
//   GET /briefs/item?key=.. -> one historical brief
export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  const cfg = await loadBriefsConfig();

  if (!authorized(event, cfg.dashboardToken)) {
    return json(401, { error: "unauthorized" });
  }

  const path = event.requestContext.http.path;
  try {
    if (path.endsWith("/briefs/latest")) {
      const latest = await readLatest(cfg.region, cfg.briefsBucket);
      return json(200, latest ?? { empty: true });
    }
    if (path.endsWith("/briefs/item")) {
      const key = event.queryStringParameters?.key;
      if (!key) return json(400, { error: "missing key" });
      const rec = await getByKey(cfg.region, cfg.briefsBucket, key);
      return rec ? json(200, rec) : json(404, { error: "not found" });
    }
    // /briefs
    const history = await listHistory(cfg.region, cfg.briefsBucket);
    return json(200, { history });
  } catch (err) {
    console.error("[briefs] error:", err);
    return json(500, { error: "internal error" });
  }
};

function authorized(event: APIGatewayProxyEventV2, token: string): boolean {
  const header =
    event.headers?.authorization || event.headers?.Authorization || "";
  const presented = header.replace(/^Bearer\s+/i, "").trim();
  if (!presented) return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

function json(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}
