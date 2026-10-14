import { h, renderAudit, teamPanel, boardSquares } from "./render.js";

const landing = document.getElementById("landing");
const view = document.getElementById("result-view");
const form = document.getElementById("plan-form");
const input = document.getElementById("site-input");
const btn = document.getElementById("plan-btn");
const notice = document.getElementById("form-notice");

boardSquares(document.getElementById("hero-board"));

let meta = { live: false };
const metaReady = fetch("api/meta").then((r) => (r.ok ? r.json() : meta)).then((m) => (meta = m)).catch(() => meta);

const session = {
  get() { try { return JSON.parse(sessionStorage.getItem("f90:last") || "null"); } catch { return null; } },
  set(v) { try { sessionStorage.setItem("f90:last", JSON.stringify(v)); } catch { /* fine without it */ } },
};

function say(message, kind) {
  notice.textContent = message;
  notice.classList.toggle("error", kind === "error");
  notice.hidden = !message;
}

async function loadSamples() {
  const list = await (await fetch("samples/index.json")).json();
  document.getElementById("sample-list").replaceChildren(...list.map((s) => h("li", {},
    h("button", { type: "button", onclick: () => (location.hash = `#sample/${s.id}`) }, h("strong", {}, s.label), h("span", {}, s.kind)),
  )));
}

function showLanding() {
  view.hidden = true;
  view.replaceChildren();
  landing.hidden = false;
  document.title = "First 90";
}

function showAudit(record, source) {
  landing.hidden = true;
  view.hidden = false;
  const team = teamPanel({ recorded: true });
  renderAudit(view, { audit: record.audit, meta: record.meta, source, team });
  record.audit.run.forEach(team.apply);
  team.finish(record.audit.run);
  team.panel.append(h("button", { type: "button", class: "btn quiet", onclick: () => team.replay(record.audit.run) }, "Replay the run"));
  document.title = `${record.audit.company.name.replace(/\s*\([^)]*\)\s*$/, "")} | First 90`;
  window.scrollTo(0, 0);
}

async function readEvents(res, onEvent) {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const event = chunk.match(/^event: (.+)$/m)?.[1];
      const data = chunk.match(/^data: (.+)$/m)?.[1];
      if (event && data) onEvent(event, JSON.parse(data));
    }
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const url = input.value.trim();
  if (!url) return say("Enter a company website, like example.com.", "error");
  await metaReady;
  if (!meta.live) return say("Live plans are paused right now. Open a sample to see a full plan.", "error");

  btn.disabled = true;
  say("");
  landing.hidden = true;
  view.hidden = false;
  const team = teamPanel({ recorded: false });
  view.replaceChildren(h("div", { class: "result-head" }, h("a", { class: "back", href: "#" }, "New plan"), h("p", { class: "site" }, url), h("h1", {}, "Planning…")),
    h("div", { class: "result-grid" }, h("div", { class: "result-main" }, h("p", { class: "headline" }, "The team is reading the site. Each step shows up as it finishes.")), team.panel));
  window.scrollTo(0, 0);

  try {
    const res = await fetch("api/plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }) });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error?.message || "Something went wrong. Try again.");
    }
    let result = null;
    let failure = null;
    await readEvents(res, (event, data) => {
      if (event === "step") team.apply(data);
      else if (event === "result") result = data;
      else if (event === "failure") failure = data;
    });
    if (failure) throw new Error(failure.message);
    if (!result) throw new Error("The plan did not finish. Try again.");
    session.set(result);
    location.hash = "#plan";
    if (location.hash === "#plan") route();
  } catch (err) {
    location.hash = "";
    showLanding();
    say(err.message, "error");
  } finally {
    btn.disabled = false;
  }
});

async function route() {
  const sample = location.hash.match(/^#sample\/([\w-]+)$/);
  if (sample) {
    try {
      const res = await fetch(`samples/${sample[1]}.json`);
      if (!res.ok) throw new Error();
      return showAudit(await res.json(), "sample");
    } catch {
      location.hash = "";
      return showLanding();
    }
  }
  if (location.hash === "#plan") {
    const last = session.get();
    if (last) return showAudit(last, "live");
  }
  showLanding();
}

document.querySelectorAll("[data-home]").forEach((a) => a.addEventListener("click", (e) => {
  e.preventDefault();
  if (location.hash) location.hash = "";
  else showLanding();
}));
window.addEventListener("hashchange", route);
loadSamples().catch(() => {});
route();
