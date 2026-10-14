// Phone + desktop walkthrough with real mobile emulation.
//   BASE=http://127.0.0.1:8172/ node e2e/phone.mjs      (live-plan test needs MOCK_ENGINE=1 on the server)
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE || "http://127.0.0.1:8172/";
const SHOTS = process.env.SHOTS || join(root, "shots");
const LIVE = process.env.SKIP_LIVE !== "1";
await mkdir(SHOTS, { recursive: true });

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};
const devices = [
  { name: "phone", width: 390, height: 844, mobile: true },
  { name: "small", width: 360, height: 640, mobile: true },
  { name: "desk", width: 1366, height: 900, mobile: false },
];
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/chromium", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const sideways = (page) => page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
const smallTargets = (page) => page.evaluate(() => [...document.querySelectorAll(".btn, .sample-list button, .back, .field input")]
  .filter((el) => el.offsetParent !== null)
  .map((el) => ({ t: el.textContent.trim().slice(0, 24), h: Math.round(el.getBoundingClientRect().height) }))
  .filter((x) => x.h < 40));

for (const scheme of ["light", "dark"]) {
  for (const d of devices) {
    const tag = `${d.name}-${scheme}`;
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await page.setViewport({ width: d.width, height: d.height, deviceScaleFactor: 2, isMobile: d.mobile, hasTouch: d.mobile });
    await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: scheme }]);
    const tap = (sel) => (d.mobile ? page.tap(sel) : page.click(sel));

    await page.goto(BASE, { waitUntil: "networkidle0" });
    await page.waitForSelector(".sample-list button");
    const w = await sideways(page);
    check(`${tag}: page width is the device width`, w.iw === d.width, `innerWidth ${w.iw}`);
    check(`${tag}: landing has no sideways scroll`, w.sw <= w.iw, `scrollWidth ${w.sw}`);
    check(`${tag}: landing tap targets 40px+`, (await smallTargets(page)).length === 0, JSON.stringify(await smallTargets(page)));
    check(`${tag}: 90-day board has 90 squares`, (await page.$$eval("#hero-board span", (s) => s.length)) === 90);
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    check(`${tag}: theme background`, scheme === "dark" ? bg === "rgb(18, 26, 23)" : bg === "rgb(237, 241, 238)", bg);
    const inputBg = await page.$eval("#site-input", (el) => getComputedStyle(el).backgroundColor);
    check(`${tag}: input uses the theme`, scheme === "dark" ? inputBg === "rgb(24, 34, 30)" : inputBg === "rgb(250, 251, 250)", inputBg);
    check(`${tag}: version in footer`, /v\d+\.\d+\.\d+/.test(await page.$eval("footer.site p", (el) => el.textContent)));
    await new Promise((r) => setTimeout(r, 1300));
    await page.screenshot({ path: join(SHOTS, `${tag}-landing.png`) });

    await tap(".sample-list li:first-child button");
    await page.waitForSelector(".result-head h1");
    const basis = await page.$eval(".basis", (el) => el.textContent);
    check(`${tag}: sample quotes all found`, /(\d+) of \1 quotes found/.test(basis), basis);
    const opps = await page.$$eval(".opp", (els) => els.length);
    check(`${tag}: plan has 3+ opportunities`, opps >= 3, String(opps));
    check(`${tag}: team panel shows 6 finished steps`, (await page.$$eval(".team li.done", (els) => els.length)) === 6);
    const w2 = await sideways(page);
    check(`${tag}: plan has no sideways scroll`, w2.sw <= w2.iw, `scrollWidth ${w2.sw}`);
    check(`${tag}: plan tap targets 40px+`, (await smallTargets(page)).length === 0, JSON.stringify(await smallTargets(page)));
    await page.screenshot({ path: join(SHOTS, `${tag}-plan.png`) });

    const replay = await page.$(".team .btn.quiet");
    await replay.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await tap(".team .btn.quiet");
    await new Promise((r) => setTimeout(r, 300));
    const resetOk = await page.$$eval(".team li.done", (els) => els.length);
    check(`${tag}: replay restarts the run`, resetOk < 6, `${resetOk} done right after tapping`);
    await page.waitForFunction(() => document.querySelectorAll(".team li.done").length === 6, { timeout: 20000 });
    check(`${tag}: replay finishes`, true);

    const link = await page.$(".rests a");
    if (link) {
      await link.evaluate((el) => el.scrollIntoView({ block: "center" }));
      await tap(".rests a");
      const visible = await page.waitForFunction(() => {
        const t = document.querySelector(".signals li.lit");
        if (!t) return false;
        const r = t.getBoundingClientRect();
        return r.top >= 0 && r.top < window.innerHeight * 0.4;
      }, { timeout: 3000 }).then(() => true, () => false);
      check(`${tag}: a sign link jumps to its quote`, visible);
      await page.screenshot({ path: join(SHOTS, `${tag}-signal.png`) });
    }

    if (LIVE && d.name !== "small") {
      await page.goto(BASE, { waitUntil: "networkidle0" });
      await page.type("#site-input", "example.com");
      await tap("#plan-btn");
      await page.waitForFunction(() => document.querySelector(".result-head h1")?.textContent === "Northwind Plumbing", { timeout: 20000 });
      check(`${tag}: a live plan streams in and renders`, true);
      const flagged = await page.$$eval(".signals .miss", (els) => els.length);
      check(`${tag}: a quote not on the pages is flagged`, flagged === 1, String(flagged));
    }

    check(`${tag}: no page errors`, errors.length === 0, errors.join(" | "));
    await page.close();
  }
}
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
