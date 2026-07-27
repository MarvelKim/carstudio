const SHARD_COUNT = 16;
const SHARD_LIMIT = 10;
const BOARD_LIMIT = 10;
const MAX_NAME_LENGTH = 40;
const MAX_SCORE = 1_000_000_000;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });

const getStore = (env) => env.GAME_RANKING_KV || env.VISITOR_KV;

const getClientIp = (request) =>
  request.headers.get("CF-Connecting-IP") ||
  request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
  "unknown";

const hashText = async (value) => {
  const input = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const getPlayerId = (request, env) =>
  hashText(`${env.RANKING_SALT || "carstudio-sky-launch-v1"}|${getClientIp(request)}`);

const normalizeName = (value) =>
  String(value || "")
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NAME_LENGTH);

const maskName = (name) => {
  const characters = Array.from(name);
  if (!characters.length) return "***";
  return characters[0] + "**";
};

const shardKey = (index) => `minigame:ranking:v1:${index.toString(16)}`;

const readShard = async (store, index) => {
  const raw = await store.get(shardKey(index));
  if (!raw) return [];
  const rows = JSON.parse(raw);
  if (!Array.isArray(rows)) throw new Error(`Invalid ranking shard: ${index}`);
  return rows;
};

const sortRows = (rows) =>
  rows.sort((a, b) => b.score - a.score || a.updatedAt - b.updatedAt);

const publicBoard = (shards, playerId) => {
  // A player can only have one global entry. De-duplicating here also protects
  // rankings created before a shard-count or hashing change.
  const bestByPlayer = new Map();
  for (const row of shards.flat()) {
    if (!row || typeof row.id !== "string" || !Number.isFinite(row.score)) continue;
    const previous = bestByPlayer.get(row.id);
    if (!previous || row.score > previous.score ||
        (row.score === previous.score && row.updatedAt < previous.updatedAt)) {
      bestByPlayer.set(row.id, row);
    }
  }

  return sortRows([...bestByPlayer.values()])
    .slice(0, BOARD_LIMIT)
    .map((row, index) => ({
      rank: index + 1,
      name: row.id === playerId ? row.name : maskName(row.name),
      score: row.score,
      car: row.car,
      isMe: row.id === playerId
    }));
};

const loadBoard = async (store, playerId, knownShardIndex = -1, knownShard = null) => {
  const shards = await Promise.all(
    Array.from({ length: SHARD_COUNT }, (_, index) =>
      index === knownShardIndex ? knownShard : readShard(store, index)
    )
  );
  return publicBoard(shards, playerId);
};

export async function onRequestGet({ request, env }) {
  const store = getStore(env);
  if (!store) return json({ error: "Ranking KV is not configured" }, 500);

  const playerId = await getPlayerId(request, env);
  return json({ rankings: await loadBoard(store, playerId) });
}

export const __test = { maskName, publicBoard };

export async function onRequestPost({ request, env }) {
  const store = getStore(env);
  if (!store) return json({ error: "Ranking KV is not configured" }, 500);

  let payload;
  try {
    payload = await request.json();
  } catch (_) {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const name = normalizeName(payload.name);
  const score = Math.round(Number(payload.score) * 10) / 10;
  const car = normalizeName(payload.car) || "Mystery Car";
  if (!name) return json({ error: "name is required" }, 400);
  if (!Number.isFinite(score) || score < 0 || score > MAX_SCORE) {
    return json({ error: "score is invalid" }, 400);
  }

  const playerId = await getPlayerId(request, env);
  const shardIndex = Number.parseInt(playerId[0], 16) % SHARD_COUNT;
  const shard = await readShard(store, shardIndex);
  const previous = shard.find((row) => row.id === playerId);
  const next = {
    id: playerId,
    name: score >= (previous?.score ?? -1) ? name : previous.name,
    score: Math.max(score, previous?.score ?? 0),
    car: score >= (previous?.score ?? -1) ? car : previous.car,
    updatedAt: Date.now()
  };
  const updatedShard = sortRows(shard.filter((row) => row.id !== playerId).concat(next)).slice(0, SHARD_LIMIT);
  await store.put(shardKey(shardIndex), JSON.stringify(updatedShard));

  return json({
    saved: next.score === score,
    best: next.score,
    rankings: await loadBoard(store, playerId, shardIndex, updatedShard)
  });
}
