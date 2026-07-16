import { build } from "esbuild";

// Two Lambda entry points, each bundled into a self-contained ESM file (AWS SDK
// bundled in for version-pinning). ESM output (`export { handler }`) avoids the
// CJS interop wrapper that, with the AWS SDK bundled in, dropped the exported
// handler binding. Node 20 Lambda runs `.mjs` handlers natively.
const shared = {
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  minify: false,
  sourcemap: false,
  // esbuild emits a `require(...)` shim for any CJS-only deps; define it via
  // createRequire so the ESM bundle can still load them at runtime.
  banner: {
    js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);",
  },
};

await build({
  ...shared,
  entryPoints: ["src/scanner-handler.ts"],
  outfile: "dist/scanner.mjs",
});

await build({
  ...shared,
  entryPoints: ["src/approval-handler.ts"],
  outfile: "dist/approval.mjs",
});

await build({
  ...shared,
  entryPoints: ["src/briefs-handler.ts"],
  outfile: "dist/briefs.mjs",
});

console.log("Built dist/scanner.mjs, dist/approval.mjs and dist/briefs.mjs");
