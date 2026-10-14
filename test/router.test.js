import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { route } from "../src/router.js";
import { VERSION } from "../src/version.js";
import { mockModel, mockFetch } from "../src/audit/mock.js";

const deps = { model: mockModel, fetchImpl: mockFetch };
const plan = (url, ip = "203.0.113.7") => new Request("https://first90.test/api/plan", {
  method: "POST", headers: { "content-type": "application/json", "CF-Connecting-IP": ip }, body: JSON.stringify({ url }),
});
function fakeKV() {
  const m = new Map();
  return { get: async (k) => m.get(k) ?? null, put: async (k, v) => void m.set(k, v) };
}

test("version file matches package.json", async () => {
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(VERSION, pkg.version);
});

test("meta and the engine switch", async () => {
  assert.equal((await (await route(new Request("https://first90.test/api/meta"), {})).json()).live, false);
  assert.equal((await (await route(new Request("https://first90.test/api/meta"), { ANTHROPIC_API_KEY: "k" })).json()).live, true);
  const off = await route(plan("example.com"), {}, null, deps);
  assert.equal(off.status, 503);
});

test("bad addresses are refused before any work", async () => {
  const env = { MOCK_ENGINE: "1" };
  assert.equal((await route(plan("localhost"), env, null, deps)).status, 400);
  assert.equal((await route(plan(""), env, null, deps)).status, 400);
  assert.equal((await route(new Request("https://first90.test/api/plan"), env, null, deps)).status, 405);
  assert.equal((await route(new Request("https://first90.test/api/nope"), env, null, deps)).status, 404);
});

test("a plan streams each step and then the result", async () => {
  const res = await route(plan("example.com"), { MOCK_ENGINE: "1" }, null, deps);
  assert.equal(res.headers.get("content-type"), "text/event-stream; charset=utf-8");
  const text = await res.text();
  const steps = [...text.matchAll(/event: step\ndata: (.+)/g)].map((m) => JSON.parse(m[1]));
  assert.deepEqual([...new Set(steps.map((s) => s.step))], ["scout", "reader", "analyst", "planner", "skeptic", "checker"]);
  const result = JSON.parse(text.match(/event: result\ndata: (.+)/)[1]);
  assert.equal(result.audit.company.name, "Northwind Plumbing");
  assert.equal(result.meta.version, VERSION);
});

test("failures arrive as a plain message in the stream", async () => {
  const broken = { ...deps, fetchImpl: async () => { throw new TypeError("network down"); } };
  const text = await (await route(plan("example.com"), { MOCK_ENGINE: "1" }, null, broken)).text();
  const failure = JSON.parse(text.match(/event: failure\ndata: (.+)/)[1]);
  assert.equal(failure.code, "fetch");
  assert.doesNotMatch(failure.message, /network down/);
});

test("each visitor gets a daily allowance", async () => {
  const env = { MOCK_ENGINE: "1", F90_KV: fakeKV(), PLANS_PER_VISITOR: "1", PLANS_PER_DAY: "2" };
  assert.equal((await route(plan("example.com", "198.51.100.1"), env, null, deps)).status, 200);
  assert.equal((await route(plan("example.com", "198.51.100.1"), env, null, deps)).status, 429);
  assert.equal((await route(plan("example.com", "198.51.100.2"), env, null, deps)).status, 200);
  assert.equal((await route(plan("example.com", "198.51.100.3"), env, null, deps)).status, 429);
});
