import { h, icon } from "./kit.js";

export const STEPS = [
  { step: "scout", label: "Scout" },
  { step: "reader", label: "Reader" },
  { step: "analyst", label: "Analyst" },
  { step: "planner", label: "Planner" },
  { step: "skeptic", label: "Skeptic" },
  { step: "checker", label: "Checker" },
];

const secs = (ms) => (ms == null ? "" : ms < 1000 ? "<1s" : `${Math.round(ms / 1000)}s`);
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const cleanName = (n) => n.replace(/\s*\([^)]*\)\s*$/, "").trim() || n;
const path = (url) => {
  try { const u = new URL(url); return u.pathname === "/" ? "home" : u.pathname.replace(/\/$/, ""); } catch { return url; }
};

// The AI team strip. Live runs update it step by step; recorded runs can replay.
export function teamStrip({ recorded }) {
  const rows = new Map();
  const list = h("ol", {}, STEPS.map((s) => {
    const time = h("small", {}, "Waiting");
    const li = h("li", { class: "waiting" }, h("b", {}, s.label), time);
    rows.set(s.step, { li, time });
    return li;
  }));
  const total = h("span", { class: "count" }, "");
  const replayBtn = h("button", { type: "button", class: "btn ghost sm", hidden: !recorded }, icon("play"), "Replay");
  const panel = h("section", { class: "card team", "aria-label": "AI team" },
    h("div", { class: "card-h" }, h("h2", {}, icon("users"), "AI team ", total), replayBtn), list);
  const apply = (e) => {
    const r = rows.get(e.step);
    if (!r) return;
    r.li.className = e.status === "start" ? "working" : "done";
    r.time.textContent = e.status === "start" ? "Working" : secs(e.ms);
  };
  const reset = () => rows.forEach((r) => { r.li.className = "waiting"; r.time.textContent = "Waiting"; });
  const finish = (run) => {
    const ms = run.filter((e) => e.status === "done").reduce((n, e) => n + (e.ms || 0), 0);
    total.textContent = `${Math.round(ms / 1000)}s`;
  };
  let busy = false;
  const replay = async (run) => {
    if (busy) return;
    busy = true;
    reset();
    total.textContent = "";
    for (const e of run) {
      if (e.status === "done") await new Promise((r) => setTimeout(r, Math.min(1800, Math.max(250, (e.ms || 0) / 14))));
      apply(e);
    }
    finish(run);
    busy = false;
  };
  return { panel, apply, finish, replay, replayBtn };
}

const EFFORT = { small: 0.18, medium: 0.4, large: 0.8 };
const IMPACT = { small: 0.18, medium: 0.6, large: 0.84 };

function matrix(opps) {
  const W = 320, H = 240, pad = 26;
  const cw = (W - pad) / 2, ch = (H - pad) / 2;
  const svg = h("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Impact versus effort chart" });
  const quads = [
    { x: pad, y: 0, label: "Quick wins", win: true },
    { x: pad + cw, y: 0, label: "Big bets" },
    { x: pad, y: ch, label: "Fill-ins" },
    { x: pad + cw, y: ch, label: "Skip" },
  ];
  for (const q of quads) {
    svg.append(h("rect", { class: `q${q.win ? " win" : ""}`, x: q.x + 1, y: q.y + 1, width: cw - 2, height: ch - 2, rx: 8 }));
    svg.append(h("text", { class: "ql", x: q.x + 10, y: q.y + 18 }, q.label));
  }
  svg.append(h("text", { class: "ax", x: pad + cw, y: H - 6, "text-anchor": "middle" }, "Effort"));
  svg.append(h("text", { class: "ax", x: 12, y: ch, "text-anchor": "middle", transform: `rotate(-90 12 ${ch})` }, "Impact"));
  const used = new Map();
  opps.forEach((o, i) => {
    const ex = EFFORT[o.effort] ?? 0.4;
    const im = IMPACT[o.impact] ?? 0.6;
    const key = `${ex}-${im}`;
    const k = used.get(key) || 0;
    used.set(key, k + 1);
    const x = pad + ex * (W - pad) + k * 28;
    const y = (1 - im) * (H - pad) + k * 4;
    svg.append(h("circle", { class: "dot", cx: x, cy: y, r: 13 }));
    svg.append(h("text", { class: "dot-n", x, y: y + 4.5, "text-anchor": "middle" }, String(i + 1)));
  });
  return svg;
}

const tile = (k, v, cls, ic) => h("div", { class: `tile ${cls || ""}` }, h("span", { class: "k" }, icon(ic), k), h("span", { class: "v small" }, v));

export function renderPreview(root, record) {
  const a = record.audit;
  const o = a.opportunities[0];
  root.replaceChildren(h("div", { class: "card stack-4" },
    h("div", { class: "pv-head" }, h("b", {}, cleanName(a.company.name)), h("span", { class: "chip ok" }, icon("check"), `${a.stats.found}/${a.stats.quotes} quotes`)),
    h("div", { class: "pv-one" }, h("span", { class: "rk" }, "#1"), h("div", {}, h("b", {}, o.title), h("small", {}, o.measure.target))),
    h("div", { class: "matrix" }, matrix(a.opportunities)),
  ));
}

export function renderAudit(root, { audit, meta, source, team, onBack }) {
  const name = cleanName(audit.company.name);
  const flash = (n) => {
    const t = root.querySelector(`#signal-${n}`);
    if (!t) return;
    const box = root.querySelector("#evidence");
    if (box && !box.open) box.open = true;
    t.scrollIntoView({ block: "start", behavior: "smooth" });
    t.classList.add("lit");
    setTimeout(() => t.classList.remove("lit"), 1800);
  };
  const read = meta?.generated_at ? new Date(meta.generated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "today";
  root.replaceChildren(h("div", { class: "r-head" },
    h("div", { class: "bar" },
      h("button", { type: "button", class: "btn ghost sm", onclick: onBack }, icon("arrowLeft"), "New"),
      h("span", { class: "chip accent" }, icon("globe"), audit.site),
      source === "sample" ? h("span", { class: "chip" }, "Sample") : null,
    ),
    h("h1", { class: "r-title" }, name),
    audit.company.what_they_do ? h("p", { class: "r-does" }, audit.company.what_they_do) : null,
  ));

  if (team) root.append(team.panel);

  const one = audit.opportunities[0];
  root.append(h("section", { class: "card top" },
    h("span", { class: "rk" }, "1"),
    h("div", {}, h("span", { class: "lbl" }, "Automate first"), h("h2", { class: "top-title" }, one.title), h("p", {}, one.problem)),
    h("div", { class: "goal" }, h("small", {}, "90-day goal"), h("b", {}, one.measure.target)),
  ));

  root.append(h("div", { class: "tiles" },
    tile("Ideas", String(audit.opportunities.length), "accent", "bolt"),
    tile("Pages read", String(audit.pages.length), "", "doc"),
    tile("Signs found", String(audit.signals.length), "", "eye"),
    tile("Quotes checked", `${audit.stats.found}/${audit.stats.quotes}`, audit.stats.found === audit.stats.quotes ? "ok" : "bad", "shield"),
  ));

  root.append(h("div", { class: "grid two" },
    h("section", { class: "card matrix" }, h("div", { class: "card-h" }, h("h2", {}, icon("target"), "Impact vs effort")), matrix(audit.opportunities)),
    h("section", { class: "card" }, h("div", { class: "card-h" }, h("h2", {}, icon("calendar"), "90-day roadmap")),
      h("div", { class: "road" }, [["Day 30", "days_30"], ["Day 60", "days_60"], ["Day 90", "days_90"]].map(([t, k]) => h("section", {},
        h("h3", {}, t), h("ul", {}, audit.opportunities.map((o, i) => h("li", {}, h("i", {}, String(i + 1)), h("span", {}, o[k]))))))),
    ),
  ));

  root.append(h("section", { class: "section" },
    h("div", { class: "section-h" }, h("h2", {}, "The plan")),
    h("div", { class: "grid three" }, audit.opportunities.map((o, i) => h("article", { class: "card opp" },
      h("div", { class: "opp-h" }, h("span", { class: "rk" }, String(i + 1)), h("h3", {}, o.title)),
      h("div", { class: "chips" },
        h("span", { class: "chip accent" }, `Impact ${o.impact}`),
        h("span", { class: "chip" }, `Effort ${o.effort}`),
        h("span", { class: `chip ${o.confidence === "low" ? "warn" : o.confidence === "high" ? "ok" : ""}` }, `${cap(o.confidence)} confidence`),
      ),
      h("dl", { class: "kv" },
        h("div", {}, h("dt", {}, "Today"), h("dd", {}, o.problem)),
        h("div", {}, h("dt", {}, "Fix"), h("dd", {}, o.approach)),
        h("div", {}, h("dt", {}, "Measure"), h("dd", {}, o.measure.metric)),
        h("div", {}, h("dt", {}, "Goal"), h("dd", {}, h("b", {}, o.measure.target))),
      ),
      o.ask ? h("p", { class: "ask" }, h("b", {}, "Ask: "), o.ask) : null,
      o.signals.length ? h("p", { class: "evid" }, "Evidence", o.signals.map((n) => h("a", { href: `#signal-${n}`, onclick: (e) => { e.preventDefault(); flash(n); } }, `#${n}`))) : null,
    ))),
  ));

  root.append(h("div", { class: "grid two" },
    h("section", { class: "card" }, h("div", { class: "card-h" }, h("h2", {}, icon("chat"), "Interview questions")),
      h("ol", { class: "qs" }, audit.questions.slice(0, 6).map((q) => h("li", {}, q)))),
    h("details", { class: "card more", id: "evidence" },
      h("summary", {}, h("span", {}, "Evidence ", h("span", { class: "count" }, `(${audit.signals.length})`))),
      h("ol", { class: "signals" }, audit.signals.map((s) => h("li", { id: `signal-${s.n}` },
        h("span", { class: "n" }, `#${s.n}`),
        h("div", {},
          h("p", {}, s.observation),
          h("q", {}, s.quote),
          s.source
            ? h("span", { class: "src" }, icon("check"), "Found on", h("a", { href: s.source.url, rel: "noopener" }, path(s.source.url)))
            : h("span", { class: "src miss" }, "Not found word for word"),
        ),
      )))),
  ));

  root.append(h("p", { class: "fine" }, `${source === "sample" ? "Sample. " : ""}Read ${read} from ${audit.pages.length} public pages. ${audit.caveat} Not affiliated with ${name}.`));
}
