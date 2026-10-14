// Shared by the Worker and the browser. No dependencies.

const SINGLE = /[‘’‚‛′`´]/;
const DOUBLE = /[“”„‟″«»]/;
const DASH = /[‐‑‒–—―−]/;
const SPACE = /[\s  -​  　]/;

function mapped(text, keep) {
  let norm = "";
  const map = [];
  let lastSpace = true;
  for (let i = 0; i < text.length; i++) {
    let c = text[i];
    if (c === "­") continue;
    if (SINGLE.test(c)) c = "'";
    else if (DOUBLE.test(c)) c = '"';
    else if (DASH.test(c)) c = "-";
    else if (c === "…") c = "...";
    if (SPACE.test(c)) {
      if (keep === "loose" || lastSpace) continue;
      norm += " ";
      map.push(i);
      lastSpace = true;
      continue;
    }
    c = c.toLowerCase();
    for (const ch of c) {
      if (keep === "loose" && !/[\p{L}\p{N}]/u.test(ch)) continue;
      norm += ch;
      map.push(i);
    }
    lastSpace = false;
  }
  return { norm, map };
}

function cleanQuote(q) {
  return String(q || "")
    .trim()
    .replace(/^["'“‘]+|["'”’]+$/g, "")
    .replace(/^(\.\.\.|…)\s*|\s*(\.\.\.|…)$/g, "")
    .trim();
}

function words(norm) {
  return norm.split(" ").filter(Boolean);
}

export function locate(doc, quote) {
  const q = cleanQuote(quote);
  if (q.length < 4) return null;

  const d = mapped(doc, "strict");
  const nq = mapped(q, "strict").norm.trim();
  let at = d.norm.indexOf(nq);
  if (at >= 0) {
    return { start: d.map[at], end: d.map[at + nq.length - 1] + 1, match: "exact" };
  }

  const dl = mapped(doc, "loose");
  const lq = mapped(q, "loose").norm;
  if (lq.length >= 8) {
    at = dl.norm.indexOf(lq);
    if (at >= 0) {
      return { start: dl.map[at], end: dl.map[at + lq.length - 1] + 1, match: "loose" };
    }
  }

  const w = words(nq);
  if (w.length >= 10) {
    const head = w.slice(0, 5).join(" ");
    const tail = w.slice(-5).join(" ");
    let from = 0;
    while (true) {
      const h = d.norm.indexOf(head, from);
      if (h < 0) break;
      const t = d.norm.indexOf(tail, h + head.length);
      if (t >= 0 && t + tail.length - h <= nq.length * 1.5) {
        return { start: d.map[h], end: d.map[t + tail.length - 1] + 1, match: "approx" };
      }
      from = h + 1;
    }
  }
  return null;
}

// ranges: [{ start, end, id }] -> [{ text, ids: [] }] covering the whole document in order.
export function segment(text, ranges) {
  const cuts = new Set([0, text.length]);
  for (const r of ranges) {
    cuts.add(Math.max(0, Math.min(text.length, r.start)));
    cuts.add(Math.max(0, Math.min(text.length, r.end)));
  }
  const points = [...cuts].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (a === b) continue;
    const ids = ranges.filter((r) => r.start <= a && r.end >= b).map((r) => r.id);
    out.push({ text: text.slice(a, b), ids });
  }
  return out;
}

// Adds { located: {start,end,match} | null } to every quoted item, and returns the ranges to highlight.
export function verifyReading(doc, reading) {
  const ranges = [];
  const sections = ["key_terms", "push_back", "good_to_know", "dates"];
  const out = { ...reading };
  for (const key of sections) {
    out[key] = (reading[key] || []).map((item, i) => {
      const id = `${key}-${i}`;
      const located = locate(doc, item.quote);
      if (located) ranges.push({ start: located.start, end: located.end, id });
      return { ...item, id, located };
    });
  }
  const total = sections.reduce((n, k) => n + out[k].length, 0);
  const found = ranges.length;
  return { reading: out, ranges, stats: { total, found } };
}
