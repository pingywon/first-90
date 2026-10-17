import { test } from "node:test";
import assert from "node:assert/strict";
import { runAudit } from "../src/audit/pipeline.js";
import { mockModel, mockFetch } from "../src/audit/mock.js";
import { normalizeTarget } from "../src/audit/site.js";

test("a full run reads the site, plans, challenges and checks quotes", async () => {
  const events = [];
  const calls = [];
  const model = async (args) => { calls.push(args); return mockModel(args); };
  const audit = await runAudit(normalizeTarget("example.com"), { model, fetchImpl: mockFetch, onEvent: (e) => events.push(e) });

  assert.deepEqual(events.filter((e) => e.status === "done").map((e) => e.step), ["scout", "reader", "analyst", "planner", "skeptic", "checker"]);
  assert.deepEqual(calls.map((c) => c.role), ["analyst", "planner", "skeptic"]);
  assert.match(calls[0].user, /\[P1\] https:\/\/example\.com\//);
  assert.match(calls[1].user, /1\. Visits are booked by phone/);
  assert.match(calls[2].user, /The plan:/);

  assert.equal(audit.pages.length, 4);
  assert.deepEqual(audit.stats, { quotes: 4, found: 3, words: audit.stats.words });
  assert.equal(audit.signals[3].source, null, "a quote that is not on any page is flagged");
  assert.equal(audit.signals[2].source.page, 2, "quotes are matched to their page");
  assert.equal(audit.opportunities.length, 3);
  assert.equal(audit.dropped[0].title, "Online warranty claims");
  assert.equal(audit.questions.length, 6);
});

test("number 1 is never cut and at least 3 stay", async () => {
  const model = async (args) => {
    const out = await mockModel(args);
    if (args.role === "skeptic") out.reviews = out.reviews.map((r) => ({ ...r, keep: false }));
    return out;
  };
  const audit = await runAudit(normalizeTarget("example.com"), { model, fetchImpl: mockFetch });
  assert.equal(audit.opportunities[0].title, "Online booking");
  assert.ok(audit.opportunities.length >= 3);
});

test("an unreachable site gives a plain error", async () => {
  const fetchImpl = async () => new Response("no", { status: 503, headers: { "content-type": "text/html" } });
  await assert.rejects(runAudit(normalizeTarget("example.org"), { model: mockModel, fetchImpl }), /answered 503/);
});
