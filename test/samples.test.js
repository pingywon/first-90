import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PROMPT_VERSION } from "../src/audit/prompts.js";
import { locate } from "../src/shared/quotes.js";

const manifest = JSON.parse(await readFile(new URL("../samples/manifest.json", import.meta.url), "utf8"));
const TELLS = [/—/, /;/, /!/, /\b(leverage|synergy|seamless|robust|cutting-edge|game-changer|unlock|streamline|empower)\b/i, /\b(we|our|us)\b/i];

for (const s of manifest) {
  test(`sample "${s.id}" is a complete, grounded, current plan`, async () => {
    const { audit } = JSON.parse(await readFile(new URL(`../public/samples/${s.id}.json`, import.meta.url), "utf8"));
    assert.equal(audit.prompt, PROMPT_VERSION, "made with the current prompts; run npm run samples");
    assert.ok(audit.opportunities.length >= 3);
    assert.match(audit.headline, new RegExp(`^The first thing worth automating at `));
    assert.equal(audit.stats.found, audit.stats.quotes, "every quote found");
    for (const sig of audit.signals) {
      const page = audit.pages.find((p) => p.id === sig.source.page);
      assert.ok(locate(page.text, sig.quote), `quote ${sig.n} is on page ${sig.source.page}`);
    }
    for (const o of audit.opportunities) {
      for (const field of [o.problem, o.approach, o.measure.target, o.assumption]) {
        for (const re of TELLS) assert.doesNotMatch(field, re, `${s.id}: "${field}"`);
      }
      assert.ok(o.ask.endsWith("?"));
    }
    assert.deepEqual([...new Set(audit.run.filter((e) => e.status === "done").map((e) => e.step))], ["scout", "reader", "analyst", "planner", "skeptic", "checker"]);
  });
}
