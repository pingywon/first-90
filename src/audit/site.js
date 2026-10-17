// Reads a company's public site: the homepage plus a handful of telling pages, as plain text.
// Runs in the Worker and in Node (fetch is passed in).

export const MAX_PAGES = 7;
const PAGE_CHARS = 6500;
const TOTAL_CHARS = 32000;
const HTML_BYTES = 600_000;
const UA = "Mozilla/5.0 (compatible; First90/1.0; +https://first90.meetdominic.me/how.html)";

export class SiteError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function normalizeTarget(input) {
  let raw = String(input || "").trim();
  if (!raw) throw new SiteError("empty", "Enter a company website.");
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new SiteError("bad_url", "That does not look like a website address.");
  }
  const host = url.hostname.toLowerCase();
  if (url.port && !["80", "443"].includes(url.port)) throw new SiteError("bad_url", "Use the company's normal web address.");
  if (!host.includes(".") || /^[\d.]+$/.test(host) || host.includes(":") || /(^|\.)(localhost|local|internal|lan|home|corp)$/.test(host)) {
    throw new SiteError("bad_url", "Use a public company website, like example.com.");
  }
  url.hash = "";
  url.search = "";
  return url;
}

const siteKey = (host) => host.toLowerCase().replace(/^www\./, "");

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", mdash: "—", ndash: "–", hellip: "…", copy: "©", reg: "®", trade: "™" };

export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : " ";
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const ATTRS = `(?:[^>"']|"[^"]*"|'[^']*')*`;
const TAG = new RegExp(`<\\/?[a-zA-Z]${ATTRS}>`, "g");
const BREAK = new RegExp(`<(?:br|hr)\\b${ATTRS}>`, "gi");
const BLOCK = new RegExp(`<\\/?(?:p|div|section|article|header|footer|nav|aside|main|li|ul|ol|h[1-6]|tr|td|th|table|blockquote|dd|dt|dl|figure|figcaption|button|form|label)\\b${ATTRS}>`, "gi");

export function htmlToText(html) {
  const title = decodeEntities((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").replace(/\s+/g, " ").trim());
  let s = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|iframe|head|select)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(BREAK, "\n")
    .replace(BLOCK, "\n")
    .replace(TAG, " ");
  s = decodeEntities(s)
    .split("\n")
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .filter((l) => l.length > 1)
    .join("\n");
  return { title, text: s };
}

const WANT = [
  [/about|company|who-we-are|our-story|mission/, 9],
  [/pricing|plans|price/, 9],
  [/support|help|faq|contact|customer-service/, 8],
  [/careers|jobs|join|hiring|work-with-us/, 8],
  [/shipping|returns|exchange|delivery|warranty/, 7],
  [/services|solutions|products|features|how-it-works/, 7],
  [/book|appointment|schedule|quote|estimate|order/, 6],
  [/customers|case-stud|stories|testimonials/, 5],
  [/subscribe|subscription|membership|newsletter|e-edition/, 6],
  [/advertis|partners|wholesale|submit|obituar|classified|events/, 5],
];
const AVOID = /login|signin|sign-in|cart|checkout|privacy|terms|cookie|legal|accessibility|sitemap|\.(pdf|jpg|png|zip)$|\/(tag|category|author)\//;

export function pickLinks(html, base) {
  const home = siteKey(base.hostname);
  const seen = new Map();
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let url;
    try {
      url = new URL(decodeEntities(m[1]), base);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(url.protocol) || siteKey(url.hostname) !== home) continue;
    url.hash = "";
    url.search = "";
    const path = url.pathname.toLowerCase().replace(/\/+$/, "") || "/";
    if (path === "/" || AVOID.test(path) || path.split("/").length > 4) continue;
    if (/\/\d{4,}(\/|$)/.test(path) || path.split("/").some((seg) => seg.length > 40)) continue;
    const label = m[2].replace(/<[^>]+>/g, " ").toLowerCase();
    let score = 0;
    for (const [re, w] of WANT) if (re.test(path) || re.test(label)) score = Math.max(score, w);
    if (!score) continue;
    score -= path.split("/").length * 0.5;
    const key = url.href;
    if (!seen.has(key) || seen.get(key).score < score) seen.set(key, { url: key, score, path });
  }
  const picked = [];
  const groups = new Set();
  for (const link of [...seen.values()].sort((a, b) => b.score - a.score)) {
    const group = WANT.findIndex(([re]) => re.test(link.path));
    if (groups.has(group) && picked.length < MAX_PAGES - 2) continue;
    groups.add(group);
    picked.push(link.url);
    if (picked.length >= MAX_PAGES - 1) break;
  }
  return { found: seen.size, picked };
}

// Lines that repeat on 3 or more pages are menus and footers.
export function dropBoilerplate(pages) {
  const count = new Map();
  for (const p of pages) for (const line of new Set(p.text.split("\n"))) count.set(line, (count.get(line) || 0) + 1);
  const limit = Math.min(3, Math.max(2, Math.ceil(pages.length / 2)));
  return pages.map((p) => ({
    ...p,
    text: p.text.split("\n").filter((l) => (count.get(l) || 0) < limit || l.length > 160).join("\n"),
  }));
}

async function getHtml(fetchImpl, url) {
  const res = await fetchImpl(url, { headers: { "user-agent": UA, accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new SiteError("fetch", `${new URL(url).hostname} answered ${res.status}.`);
  if (!/html/i.test(res.headers.get("content-type") || "text/html")) throw new SiteError("fetch", "That address is not a web page.");
  const html = await res.text();
  return { html: html.slice(0, HTML_BYTES), finalUrl: res.url || url };
}

export async function readSite(target, { fetchImpl = fetch, onEvent = () => {} } = {}) {
  const started = Date.now();
  let home;
  try {
    home = await getHtml(fetchImpl, target.href);
  } catch (err) {
    if (err instanceof SiteError) throw err;
    throw new SiteError("fetch", `${target.hostname} could not be reached.`);
  }
  const base = new URL(home.finalUrl);
  const { found, picked } = pickLinks(home.html, base);
  onEvent({ step: "scout", detail: `Opened the homepage, found ${found} useful links, picked ${picked.length} pages to read.`, pages: picked, ms: Date.now() - started });

  const t1 = Date.now();
  const results = await Promise.allSettled(picked.map((u) => getHtml(fetchImpl, u)));
  const raw = [{ url: base.href, ...htmlToText(home.html) }];
  results.forEach((r, i) => { if (r.status === "fulfilled") raw.push({ url: r.value.finalUrl || picked[i], ...htmlToText(r.value.html) }); });

  let pages = dropBoilerplate(raw).filter((p) => p.text.length > 200);
  if (!pages.length) throw new SiteError("empty_site", "The site's pages had almost no readable text. It may need JavaScript to show anything.");
  let budget = TOTAL_CHARS;
  pages = pages.map((p) => {
    const text = p.text.slice(0, Math.max(0, Math.min(PAGE_CHARS, budget)));
    budget -= text.length;
    return { ...p, text };
  }).filter((p) => p.text.length > 200);
  pages.forEach((p, i) => (p.id = i + 1));
  const words = pages.reduce((n, p) => n + p.text.split(/\s+/).length, 0);
  onEvent({ step: "reader", detail: `Read ${pages.length} pages, ${words.toLocaleString("en-US")} words after removing menus and footers.`, ms: Date.now() - t1 });
  return { site: base.hostname.replace(/^www\./, ""), pages, words };
}
