import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTarget, htmlToText, pickLinks, dropBoilerplate, decodeEntities } from "../src/audit/site.js";

test("accepts public sites and adds https", () => {
  assert.equal(normalizeTarget("example.com").href, "https://example.com/");
  assert.equal(normalizeTarget("http://www.example.com/about?x=1#y").href, "http://www.example.com/about");
});

test("refuses private, local and odd addresses", () => {
  for (const bad of ["", "localhost", "http://127.0.0.1", "10.0.0.5", "intranet", "printer.local", "nas.lan", "https://example.com:8443", "http://[::1]/", "not a url"]) {
    assert.throws(() => normalizeTarget(bad), undefined, bad);
  }
});

test("text extraction drops code, keeps blocks, survives > inside attributes", () => {
  const { title, text } = htmlToText(`<html><head><title>Acme &amp; Co</title><style>p{}</style></head><body>
    <ul class='a [&>li]:z-1'><li>One</li><li data-x="a>b">Two</li></ul><script>if (a > b) {}</script><p>Three&nbsp;&#8217;s</p><!-- note --></body></html>`);
  assert.equal(title, "Acme & Co");
  assert.equal(text, "One\nTwo\nThree ’s");
  assert.equal(decodeEntities("&#x41;&lt;&unknown;"), "A<&unknown;");
});

test("picks telling pages on the same site and skips the rest", () => {
  const html = `
    <a href="/about-us">About</a><a href="/pricing">Pricing</a><a href="https://www.example.com/support/">Help</a>
    <a href="/careers">Jobs</a><a href="/login">Log in</a><a href="/cart">Cart</a><a href="https://other.com/about">Other</a>
    <a href="/news/2026/10/a-very-long-article-slug-about-something-that-happened-today">News</a><a href="/stories/12345">Story</a>
    <a href="/privacy">Privacy</a><a href="mailto:x@example.com">Mail</a>`;
  const { picked } = pickLinks(html, new URL("https://example.com/"));
  const paths = picked.map((u) => new URL(u).pathname);
  for (const want of ["/about-us", "/pricing", "/support", "/careers"]) assert.ok(paths.some((p) => p.startsWith(want)), want);
  for (const not of ["/login", "/cart", "/privacy", "/stories/12345"]) assert.ok(!paths.includes(not), not);
  assert.ok(picked.every((u) => new URL(u).hostname.endsWith("example.com")));
});

test("lines repeated across pages are removed as menus and footers", () => {
  const pages = [1, 2, 3, 4].map((i) => ({ text: `Home\nShop\nUnique line ${i}\nCopyright 2026` }));
  const out = dropBoilerplate(pages);
  assert.deepEqual(out.map((p) => p.text), ["Unique line 1", "Unique line 2", "Unique line 3", "Unique line 4"]);
});
