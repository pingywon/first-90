// Stand-ins for local runs and end-to-end tests (MOCK_ENGINE=1). Never set in production.
const PAGES = {
  "https://example.com/": `<html><head><title>Northwind Plumbing</title></head><body><nav><a href="/about">About us</a><a href="/pricing">Pricing</a><a href="/support">Support</a></nav>
<h1>Northwind Plumbing</h1><p>Same-day plumbing repairs for homes across three counties. Call our office to book a visit between 8 a.m. and 5 p.m. on weekdays.</p>
<p>Need an estimate? Email us photos of the problem and we will reply within two business days with a written quote.</p></body></html>`,
  "https://example.com/about": `<html><head><title>About</title></head><body><nav><a href="/about">About us</a></nav><h1>About</h1><p>Founded in 1994, we have 40 licensed plumbers and 6 trucks on the road every day.</p><p>Invoices are mailed after each job and can be paid by check or by phone.</p><p>Our team covers Berks, Lancaster and Chester counties. Every plumber is licensed, insured and trained on the latest water heater and sewer line equipment.</p></body></html>`,
  "https://example.com/pricing": `<html><head><title>Pricing</title></head><body><h1>Pricing</h1><p>Service calls start at $89. Download the price sheet as a PDF and fill in the service request form by hand.</p><p>Prices cover the first hour of labor. Parts are billed at cost plus a handling fee, and weekend visits add a flat surcharge listed on the sheet.</p></body></html>`,
  "https://example.com/support": `<html><head><title>Support</title></head><body><h1>Support</h1><p>For warranty claims, print the claim form, sign it, and fax it to our office.</p><p>Claims are reviewed within ten business days. Keep your original invoice, since the claim form asks for the invoice number and the date of the first repair.</p></body></html>`,
};

export async function mockFetch(url) {
  const key = String(url);
  const body = PAGES[key] || PAGES[key.replace(/\/$/, "")];
  if (!body) return new Response("missing", { status: 404, headers: { "content-type": "text/html" } });
  return new Response(body, { status: 200, headers: { "content-type": "text/html" } });
}

export async function mockModel({ role }) {
  await new Promise((r) => setTimeout(r, 150));
  if (role === "analyst") {
    return {
      company: { name: "Northwind Plumbing", what_they_do: "Home plumbing repairs.", customers: "Homeowners in three counties.", how_they_sell: "Phone bookings and emailed quotes.", size_hints: "40 licensed plumbers, 6 trucks." },
      signals: [
        { observation: "Visits are booked by phone during office hours.", quote: "Call our office to book a visit between 8 a.m. and 5 p.m. on weekdays.", page: 1 },
        { observation: "Quotes come from emailed photos.", quote: "Email us photos of the problem and we will reply within two business days", page: 1 },
        { observation: "Invoices go out by mail.", quote: "Invoices are mailed after each job", page: 2 },
        { observation: "Warranty claims are faxed.", quote: "This sentence is not on any page.", page: 4 },
      ],
      tools: [],
    };
  }
  if (role === "planner") {
    const o = (title) => ({ title, problem: "Takes staff time.", signals: [1], approach: "Use an online form.", measure: { metric: "Time to book", baseline: "Time it for a week", target: "Under 5 minutes" }, effort: "small", impact: "large", days_30: "Pilot live", days_60: "Most bookings online", days_90: "Phone line for emergencies only" });
    return { headline: "The first thing worth automating at Northwind Plumbing is booking, because every visit starts with a phone call.", opportunities: [o("Online booking"), o("Photo quotes in a day"), o("Email invoices with a pay link"), o("Online warranty claims")] };
  }
  return {
    reviews: [
      { opportunity: 1, confidence: "high", assumption: "Most customers would book online.", ask: "How many calls a day are bookings?", keep: true },
      { opportunity: 2, confidence: "medium", assumption: "Photos are enough to quote.", ask: "How often does a quote change on site?", keep: true },
      { opportunity: 3, confidence: "medium", assumption: "Customers have email.", ask: "How many invoices go unpaid after 30 days?", keep: true },
      { opportunity: 4, confidence: "low", assumption: "Claims are frequent.", ask: "How many claims a month?", keep: false },
    ],
    caveat: "The site does not show call volumes.",
    questions: ["Who owns the booking line today?", "What software runs dispatch?", "Which step do customers complain about most?"],
  };
}
