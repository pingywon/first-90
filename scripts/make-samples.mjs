// Runs the real audit pipeline on the sample companies and records each run, timings included.
//   node scripts/make-samples.mjs --engine claude-code [--only basecamp]
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runAudit } from "../src/audit/pipeline.js";
import { normalizeTarget } from "../src/audit/site.js";
import { jsonSchema } from "../src/audit/schemas.js";
import { apiModel, MODEL } from "../src/audit/engine.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const engine = flag("--engine") || "api";
const only = flag("--only");

function claudeCode({ system, user, schema, effort }) {
  return new Promise((resolve, reject) => {
    const child = spawn("claude", ["-p", "--tools", "", "--setting-sources", "local", "--strict-mcp-config", "--no-session-persistence",
      "--model", MODEL, "--effort", effort, "--output-format", "json", "--system-prompt", system, "--json-schema", JSON.stringify(jsonSchema(schema))],
      { cwd: process.env.SAMPLE_CWD || root, stdio: ["pipe", "pipe", "inherit"] });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`claude exited ${code}`));
      const parsed = JSON.parse(out);
      const result = Array.isArray(parsed) ? parsed.find((e) => e.type === "result") : parsed;
      if (!result?.structured_output) return reject(new Error("no structured output"));
      resolve(schema.parse(result.structured_output));
    });
    child.stdin.end(user);
  });
}

const manifest = JSON.parse(await readFile(join(root, "samples/manifest.json"), "utf8"));
await mkdir(join(root, "public/samples"), { recursive: true });
for (const s of manifest) {
  if (only && s.id !== only) continue;
  const model = engine === "claude-code" ? claudeCode : apiModel(process.env);
  const started = Date.now();
  const audit = await runAudit(normalizeTarget(s.url), {
    model,
    fetchImpl: fetch,
    onEvent: (e) => e.status === "done" && console.log(`${s.id} ${e.step}: ${e.detail} (${Math.round(e.ms / 1000)}s)`),
  });
  const record = { id: s.id, label: s.label, kind: s.kind, audit, meta: { engine, model: MODEL, generated_at: new Date().toISOString(), seconds: Math.round((Date.now() - started) / 1000) } };
  await writeFile(join(root, "public/samples", `${s.id}.json`), JSON.stringify(record, null, 1) + "\n");
  console.log(`${s.id}: ${audit.opportunities.length} opportunities, quotes ${audit.stats.found}/${audit.stats.quotes}, ${record.meta.seconds}s`);
}
