const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });

const getTodayKey = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());

const hashText = async (value) => {
  const input = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const readCount = async (kv, key) => Number((await kv.get(key)) || 0);

const writeCount = async (kv, key, value) => {
  await kv.put(key, String(value));
  return value;
};

export async function onRequestPost({ request, env }) {
  if (!env.VISITOR_KV) {
    return json({ error: "VISITOR_KV is not configured" }, 500);
  }

  const todayKey = getTodayKey();
  const ip =
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
    "unknown";
  const hash = await hashText(`${todayKey}|${ip}`);
  const seenKey = `seen:${todayKey}:${hash}`;
  const todayCountKey = `count:today:${todayKey}`;
  const totalCountKey = "count:total";
  const alreadySeen = await env.VISITOR_KV.get(seenKey);

  let today = await readCount(env.VISITOR_KV, todayCountKey);
  let total = await readCount(env.VISITOR_KV, totalCountKey);

  if (!alreadySeen) {
    const tomorrow = new Date(Date.now() + 36 * 60 * 60 * 1000);
    await env.VISITOR_KV.put(seenKey, "1", { expiration: Math.floor(tomorrow.getTime() / 1000) });
    today = await writeCount(env.VISITOR_KV, todayCountKey, today + 1);
    total = await writeCount(env.VISITOR_KV, totalCountKey, total + 1);
  }

  return json({ today, total, counted: !alreadySeen });
}

export async function onRequestGet({ env }) {
  if (!env.VISITOR_KV) {
    return json({ error: "VISITOR_KV is not configured" }, 500);
  }

  const todayKey = getTodayKey();
  const [today, total] = await Promise.all([
    readCount(env.VISITOR_KV, `count:today:${todayKey}`),
    readCount(env.VISITOR_KV, "count:total")
  ]);

  return json({ today, total, counted: false });
}
