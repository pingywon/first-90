import { runAudit } from "./audit/pipeline.js";
import { normalizeTarget, SiteError } from "./audit/site.js";
import { apiModel, engineReady, EngineError, MODEL } from "./audit/engine.js";
import { PROMPT_VERSION } from "./audit/prompts.js";
import { takeDailyAllowance, visitorId } from "./limits.js";
import { VERSION } from "./version.js";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
const problem = (code, message, status) => json({ error: { code, message } }, status);

export const live = (env) => engineReady(env) || env.MOCK_ENGINE === "1";

async function handlePlan(request, env, ctx, deps) {
  if (!live(env)) return problem("engine_off", "Live plans are paused. The samples show full plans.", 503);
  let body;
  try {
    body = await request.json();
  } catch {
    return problem("bad_request", "Send JSON: { \"url\": \"example.com\" }.", 400);
  }
  let target;
  try {
    target = normalizeTarget(body?.url);
  } catch (err) {
    return problem(err.code || "bad_url", err.message, 400);
  }
  const allowance = await takeDailyAllowance(env.F90_KV, {
    bucket: "plan",
    visitor: await visitorId(request, env.IP_SALT),
    perVisitor: Number(env.PLANS_PER_VISITOR || 2),
    perDay: Number(env.PLANS_PER_DAY || 25),
  });
  if (!allowance.ok) return problem("limit", "That is today's limit for live plans. The samples are always open.", 429);

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const enc = new TextEncoder();
  const send = (event, data) => writer.write(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));

  const work = (async () => {
    try {
      const audit = await runAudit(target, {
        model: deps.model || apiModel(env),
        fetchImpl: deps.fetchImpl || fetch,
        onEvent: (e) => send("step", e),
      });
      await send("result", { audit, meta: { version: VERSION, model: MODEL, generated_at: new Date().toISOString() } });
    } catch (err) {
      const known = err instanceof SiteError || err instanceof EngineError;
      await send("failure", { code: known ? err.code : "server", message: known ? err.message : "Something went wrong. Try again." });
    } finally {
      await writer.close();
    }
  })();
  ctx?.waitUntil?.(work);

  return new Response(readable, {
    headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}

export function route(request, env, ctx, deps = {}) {
  const url = new URL(request.url);
  if (url.pathname === "/api/meta" && request.method === "GET") {
    return json({ version: VERSION, live: live(env), model: MODEL, prompt: PROMPT_VERSION });
  }
  if (url.pathname === "/api/plan") {
    if (request.method !== "POST") return problem("method", "Use POST.", 405);
    return handlePlan(request, env, ctx, deps);
  }
  if (url.pathname.startsWith("/api/")) return problem("not_found", "No such endpoint.", 404);
  return null;
}
