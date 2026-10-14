export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const STEPS = [
  { step: "scout", label: "Scout", job: "Finds the pages worth reading" },
  { step: "reader", label: "Reader", job: "Turns them into plain text" },
  { step: "analyst", label: "Analyst", job: "Notes signs of manual work" },
  { step: "planner", label: "Planner", job: "Drafts the 90-day plan" },
  { step: "skeptic", label: "Skeptic", job: "Challenges every idea" },
  { step: "checker", label: "Checker", job: "Matches every quote to its page" },
];

const secs = (ms) => (ms < 1000 ? "<1s" : `${Math.round(ms / 1000)}s`);
const path = (url) => {
  try {
    const u = new URL(url);
    return u.pathname === "/" ? u.hostname.replace(/^www\./, "") : u.pathname.replace(/\/$/, "");
  } catch {
    return url;
  }
};

export function boardSquares(el, { animate = true } = {}) {
  el.replaceChildren(...Array.from({ length: 90 }, (_, i) => {
    const day = i + 1;
    const span = h("span", { class: `${day <= 30 ? "p1" : day <= 60 ? "p2" : "p3"}${day % 30 === 0 ? " mark" : ""}` });
    if (animate) span.style.animationDelay = `${i * 12}ms`;
    return span;
  }));
}

// The team panel. Returns an updater for live runs and a replay for recorded ones.
export function teamPanel({ recorded }) {
  const rows = new Map();
  const list = h("ol", {}, STEPS.map((s) => {
    const what = h("span", { class: "what" }, s.job);
    const time = h("span", { class: "secs" }, "");
    const li = h("li", { class: "waiting" }, h("span", { class: "dot", "aria-hidden": "true" }), h("div", {}, h("span", { class: "who" }, s.label), what), time);
    rows.set(s.step, { li, what, time, job: s.job });
    return li;
  }));
  const total = h("p", { class: "total" });
  const panel = h("aside", { class: "team", "aria-label": "How this plan was made" },
    h("h2", {}, "The team"),
    h("p", { class: "sub" }, recorded ? "A recorded run of this plan." : "Working on it now."),
    list, total);

  const apply = (e) => {
    const r = rows.get(e.step);
    if (!r) return;
    if (e.status === "start") {
      r.li.className = "working";
      r.what.textContent = `${r.job}…`;
    } else {
      r.li.className = "done";
      r.what.textContent = e.detail || r.job;
      if (e.ms != null) r.time.textContent = secs(e.ms);
    }
  };
  const reset = () => rows.forEach((r) => { r.li.className = "waiting"; r.what.textContent = r.job; r.time.textContent = ""; });
  const finish = (run) => {
    const ms = run.filter((e) => e.status === "done").reduce((n, e) => n + (e.ms || 0), 0);
    total.textContent = `Total ${Math.round(ms / 1000)} seconds, 3 model calls, ${STEPS.length} steps.`;
  };

  let replaying = false;
  const replay = async (run, speed = 12) => {
    if (replaying) return;
    replaying = true;
    reset();
    total.textContent = "";
    for (const e of run) {
      if (e.status === "done") await new Promise((r) => setTimeout(r, Math.min(2200, Math.max(250, (e.ms || 0) / speed))));
      apply(e);
    }
    finish(run);
    replaying = false;
  };
  return { panel, apply, finish, replay, reset };
}

export function renderAudit(root, { audit, meta, source, team }) {
  root.replaceChildren();
  const c = { ...audit.company, name: audit.company.name.replace(/\s*\([^)]*\)\s*$/, "").trim() || audit.company.name };
  const read = meta?.generated_at ? new Date(meta.generated_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "today";
  root.append(h("div", { class: "result-head" },
    h("a", { class: "back", href: "#" }, "New plan"),
    h("p", { class: "site" }, audit.site),
    h("h1", {}, c.name),
    h("p", { class: "basis" }, `${source === "sample" ? "Sample plan. " : ""}An outside view from ${audit.pages.length} public pages, read ${read}. ${audit.stats.found} of ${audit.stats.quotes} quotes found on their pages.`),
    h("p", { class: "headline" }, audit.headline),
  ));

  const main = h("div", { class: "result-main" });
  const grid = h("div", { class: "result-grid" }, main);
  if (team) grid.append(team.panel);
  root.append(grid);

  const block = (title, ...body) => h("section", { class: "block" }, h("h2", {}, title), ...body);

  main.append(block("What they do", h("dl", { class: "facts" },
    [["Business", c.what_they_do], ["Customers", c.customers], ["How they sell", c.how_they_sell], ["Size", c.size_hints]]
      .filter(([, v]) => v && v.trim())
      .map(([k, v]) => h("div", {}, h("dt", {}, k), h("dd", {}, v))),
  )));

  const signalLink = (n) => {
    const s = audit.signals[n - 1];
    return s ? h("a", { href: `#signal-${n}`, onclick: (e) => { e.preventDefault(); const t = root.querySelector(`#signal-${n}`); t?.scrollIntoView({ block: "start", behavior: "smooth" }); t?.classList.add("lit"); setTimeout(() => t?.classList.remove("lit"), 1600); } }, `#${n}`) : null;
  };

  main.append(block("The plan", h("ol", { class: "opps" }, audit.opportunities.map((o, i) => h("li", { class: "opp" },
    h("span", { class: "rank", "aria-hidden": "true" }, String(i + 1)),
    h("div", {},
      h("h3", {}, o.title),
      h("p", { class: "tags" },
        h("span", {}, "Impact ", h("b", {}, o.impact)),
        h("span", {}, "Effort ", h("b", {}, o.effort)),
        h("span", { class: o.confidence === "low" ? "low" : "" }, "Confidence ", h("b", {}, o.confidence)),
      ),
      h("p", {}, o.problem),
      h("p", {}, h("span", { class: "label" }, "How: "), o.approach),
      h("div", { class: "measure" }, h("dl", {},
        h("dt", {}, "Measure"), h("dd", {}, o.measure.metric),
        h("dt", {}, "Baseline in week 1"), h("dd", {}, o.measure.baseline),
        h("dt", {}, "Target by day 90"), h("dd", {}, o.measure.target),
      )),
      h("ol", { class: "phases", "aria-label": "Milestones" },
        h("li", {}, h("b", {}, "Day 30"), o.days_30),
        h("li", {}, h("b", {}, "Day 60"), o.days_60),
        h("li", {}, h("b", {}, "Day 90"), o.days_90),
      ),
      o.signals.length ? h("p", { class: "rests" }, "Based on signs ", o.signals.map(signalLink)) : null,
      o.assumption || o.ask ? h("div", { class: "assume" },
        o.assumption ? h("p", {}, h("span", { class: "label" }, "Assumes: "), o.assumption) : null,
        o.ask ? h("p", {}, h("span", { class: "label" }, "Ask: "), o.ask) : null,
      ) : null,
    ),
  )))));

  main.append(block("By day 30, 60 and 90", h("div", { class: "by-day" },
    [["By day 30", "days_30"], ["By day 60", "days_60"], ["By day 90", "days_90"]].map(([title, key]) => h("section", {},
      h("h3", {}, title),
      h("ul", {}, audit.opportunities.map((o) => h("li", {}, o[key]))),
    )),
  )));

  main.append(block("Signs of manual work", h("ol", { class: "signals" }, audit.signals.map((s) => h("li", { id: `signal-${s.n}` },
    h("span", { class: "n" }, `#${s.n}`),
    h("div", {},
      h("p", {}, s.observation),
      h("blockquote", {}, s.quote),
      h("p", { class: "src" }, s.source
        ? [h("span", { class: "ok" }, "Found on "), h("a", { href: s.source.url, rel: "noopener" }, path(s.source.url))]
        : h("span", { class: "miss" }, "Not found word for word on the pages. Treat with care.")),
    ),
  )))));

  if (audit.tools.length) {
    main.append(block("Tools they mention", h("ul", { class: "questions" }, audit.tools.map((t) => h("li", {}, h("b", {}, t.name), `: “${t.quote}”`)))));
  }

  main.append(block("Questions for the interview", h("ol", { class: "questions" }, audit.questions.map((q) => h("li", {}, q)))));

  if (audit.dropped.length) {
    main.append(block("Cut by the skeptic", h("ul", { class: "dropped" }, audit.dropped.map((d) => h("li", {}, h("b", {}, d.title), d.reason ? `. ${d.reason}` : "")))));
  }

  main.append(block("Pages read", h("ul", { class: "pages" }, audit.pages.map((p) => h("li", {},
    h("a", { href: p.url, rel: "noopener" }, path(p.url)), h("span", {}, `${p.words.toLocaleString("en-US")} words`),
  )))));

  main.append(h("p", { class: "fine" }, `${audit.caveat} Not affiliated with or reviewed by ${c.name}. Written by Claude from public pages; check the sources before relying on it.`));
}
