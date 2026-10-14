// The audit run: scout and reader (site.js), then analyst, planner and skeptic (the model), then a quote check.
import { readSite } from "./site.js";
import { NotesSchema, PlanSchema, CheckSchema } from "./schemas.js";
import { ANALYST, PLANNER, SKEPTIC, PROMPT_VERSION, pagesMessage, notesMessage, planMessage } from "./prompts.js";
import { locate } from "../shared/quotes.js";

export const STEPS = [
  { step: "scout", label: "Scout", job: "Finds the pages worth reading" },
  { step: "reader", label: "Reader", job: "Turns them into plain text" },
  { step: "analyst", label: "Analyst", job: "Notes signs of manual work" },
  { step: "planner", label: "Planner", job: "Drafts the 90-day plan" },
  { step: "skeptic", label: "Skeptic", job: "Challenges every idea" },
  { step: "checker", label: "Checker", job: "Matches every quote to its page" },
];

function groundQuote(pages, quote, page) {
  const own = pages.find((p) => p.id === page);
  const hit = own && locate(own.text, quote);
  if (hit) return { page: own.id, url: own.url, match: hit.match };
  for (const p of pages) {
    const h = locate(p.text, quote);
    if (h) return { page: p.id, url: p.url, match: h.match };
  }
  return null;
}

// model: async ({ role, system, user, schema, effort }) => parsed object
export async function runAudit(target, { model, fetchImpl, onEvent = () => {} }) {
  const run = [];
  const emit = (e) => {
    const event = { ...e, at: new Date().toISOString() };
    run.push(event);
    onEvent(event);
  };
  const timed = async (step, fn, describe) => {
    emit({ step, status: "start" });
    const t0 = Date.now();
    const out = await fn();
    emit({ step, status: "done", detail: describe(out), ms: Date.now() - t0 });
    return out;
  };

  emit({ step: "scout", status: "start" });
  const site = await readSite(target, {
    fetchImpl,
    onEvent: (e) => {
      if (e.step === "reader") emit({ step: "reader", status: "start" });
      emit({ step: e.step, status: "done", detail: e.detail, ms: e.ms, pages: e.pages });
    },
  });

  const notes = await timed("analyst", () => model({
    role: "analyst", system: ANALYST, user: pagesMessage(site.pages), schema: NotesSchema, effort: "medium",
  }), (n) => `Noted ${n.signals.length} signs of manual work and ${n.tools.length} tools in use.`);

  const plan = await timed("planner", () => model({
    role: "planner", system: PLANNER, user: notesMessage(notes), schema: PlanSchema, effort: "high",
  }), (p) => `Drafted ${p.opportunities.length} opportunities, ranked by impact.`);

  const check = await timed("skeptic", () => model({
    role: "skeptic", system: SKEPTIC, user: `Research notes:\n\n${notesMessage(notes)}\n\nThe plan:\n\n${planMessage(plan)}`, schema: CheckSchema, effort: "medium",
  }), (c) => {
    const dropped = c.reviews.filter((r) => !r.keep && r.opportunity !== 1).length;
    const low = c.reviews.filter((r) => r.confidence === "low").length;
    return `Kept ${plan.opportunities.length - dropped} of ${plan.opportunities.length}${dropped ? `, cut ${dropped}` : ""}${low ? `, marked ${low} as low confidence` : ""}.`;
  });

  emit({ step: "checker", status: "start" });
  const t0 = Date.now();
  const signals = notes.signals.map((s, i) => ({ ...s, n: i + 1, source: groundQuote(site.pages, s.quote, s.page) }));
  const tools = notes.tools.map((t) => ({ ...t, source: groundQuote(site.pages, t.quote, t.page) }));
  const quotes = [...signals, ...tools];
  const found = quotes.filter((q) => q.source).length;
  emit({ step: "checker", status: "done", detail: `Found ${found} of ${quotes.length} quotes on the pages they came from.`, ms: Date.now() - t0 });

  const reviewOf = (i) => check.reviews.find((r) => r.opportunity === i + 1);
  const opportunities = [];
  const dropped = [];
  plan.opportunities.forEach((o, i) => {
    const r = reviewOf(i) || { confidence: "medium", assumption: "", ask: "", keep: true };
    const item = { ...o, rank: i + 1, confidence: r.confidence, assumption: r.assumption, ask: r.ask, signals: o.signals.filter((n) => n >= 1 && n <= signals.length) };
    if (r.keep === false && i > 0 && plan.opportunities.length - dropped.length > 3) dropped.push({ title: o.title, reason: r.assumption });
    else opportunities.push(item);
  });

  return {
    site: site.site,
    company: notes.company,
    headline: plan.headline,
    caveat: check.caveat,
    signals,
    tools,
    opportunities,
    dropped,
    questions: [...opportunities.map((o) => o.ask).filter(Boolean), ...check.questions],
    pages: site.pages.map((p) => ({ id: p.id, url: p.url, title: p.title, words: p.text.split(/\s+/).length, text: p.text })),
    stats: { quotes: quotes.length, found, words: site.words },
    prompt: PROMPT_VERSION,
    run,
  };
}
