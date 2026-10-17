import { h, fillIcons, themeToggle } from "./kit.js";
import { renderAudit, renderPreview, teamStrip } from "./render.js";

const landing = document.getElementById("landing");
const view = document.getElementById("result-view");
const form = document.getElementById("plan-form");
const input = document.getElementById("site-input");
const btn = document.getElementById("plan-btn");
const notice = document.getElementById("form-notice");

fillIcons();
themeToggle(document.getElementById("theme"));

let meta = { live: false };
const metaReady = fetch("api/meta").then((r) => (r.ok ? r.json() : meta)).then((m) => (meta = m)).catch(() => meta);
const session = {
  get() { try { return JSON.parse(sessionStorage.getItem("f90:last") || "null"); } catch { return null; } },
  set(v) { try { sessionStorage.setItem("f90:last", JSON.stringify(v)); } catch { /* fine without it */ } },
};
const say = (m) => { notice.textContent = m; notice.hidden = !m; };

async function loadSamples() {
  const list = await (await fetch("samples/index.json")).json();
  document.getElementById("sample-list").replaceChildren(...list.map((s) => h("button", { type: "button", class: "pick", onclick: () => (location.hash = `#sample/${s.id}`) },
    h("span", { class: "ic mono" }, s.label[0]), h("span", {}, h("b", {}, s.label), h("small", {}, s.kind)))));
  const pick = list.find((s) => s.id === "casper") || list[0];
  if (pick) renderPreview(document.getElementById("preview"), await (await fetch(`samples/${pick.id}.json`)).json());
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
  const team = teamStrip({ recorded: true });
  renderAudit(view, { audit: record.audit, meta: record.meta, source, team, onBack: () => { location.hash = ""; } });
  record.audit.run.forEach(team.apply);
  team.finish(record.audit.run);
  team.replayBtn.addEventListener("click", () => team.replay(record.audit.run));
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
  if (!url) return say("Enter a site, like example.com.");
  await metaReady;
  if (!meta.live) return say("Live plans paused. Try a sample.");
  btn.disabled = true;
  say("");
  landing.hidden = true;
  view.hidden = false;
  const team = teamStrip({ recorded: false });
  view.replaceChildren(h("div", { class: "r-head" }, h("h1", { class: "r-title" }, url), h("p", { class: "r-does" }, "Planning. About two minutes.")), team.panel);
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
    if (location.hash === "#plan") route();
    else location.hash = "#plan";
  } catch (err) {
    location.hash = "";
    showLanding();
    say(err.message);
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
    }
  }
  if (location.hash === "#plan") {
    const last = session.get();
    if (last) return showAudit(last, "live");
  }
  showLanding();
  if (location.hash === "#samples") document.getElementById("samples").scrollIntoView();
}

document.querySelector("[data-home]").addEventListener("click", (e) => {
  e.preventDefault();
  if (location.hash) location.hash = "";
  else showLanding();
  window.scrollTo(0, 0);
});
window.addEventListener("hashchange", route);
loadSamples().catch(() => {});
route();
