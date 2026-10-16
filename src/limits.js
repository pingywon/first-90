const DAY = 86_400;

export async function visitorId(request, salt = "fine-print") {
  const ip = request.headers.get("CF-Connecting-IP") || "local";
  const bytes = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function today(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

// Counts one use against a per-visitor and an all-visitors daily allowance.
// KV is eventually consistent, so the caps are soft by a few requests; that is fine for cost control.
export async function takeDailyAllowance(kv, { bucket, visitor, perVisitor, perDay, now }) {
  if (!kv) return { ok: true };
  const day = today(now);
  const mine = `limit:${bucket}:${day}:${visitor}`;
  const all = `limit:${bucket}:${day}:all`;
  const [m, a] = await Promise.all([kv.get(mine), kv.get(all)]);
  const usedMine = Number(m || 0);
  const usedAll = Number(a || 0);
  if (usedMine >= perVisitor) return { ok: false, reason: "visitor" };
  if (usedAll >= perDay) return { ok: false, reason: "day" };
  await Promise.all([
    kv.put(mine, String(usedMine + 1), { expirationTtl: 2 * DAY }),
    kv.put(all, String(usedAll + 1), { expirationTtl: 2 * DAY }),
  ]);
  return { ok: true, left: perVisitor - usedMine - 1 };
}

// Returns one use, for runs that failed before producing anything.
export async function giveBackAllowance(kv, { bucket, visitor, now }) {
  if (!kv) return;
  const day = today(now);
  await Promise.all([`limit:${bucket}:${day}:${visitor}`, `limit:${bucket}:${day}:all`].map(async (key) => {
    const used = Number((await kv.get(key)) || 0);
    if (used > 0) await kv.put(key, String(used - 1), { expirationTtl: 2 * DAY });
  }));
}
