const SHARD_COUNT = 16;
const SHARD_LIMIT = 10;
const BOARD_LIMIT = 10;
const MAX_NAME_LENGTH = 40;
const MAX_SCORE = 1_000_000_000;
const PLAYER_TOKEN_HEADER = "X-Player-Token";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });

const getDatabase = (env) => env.GAME_RANKING_DB;
const getKvStore = (env) => env.GAME_RANKING_KV || env.VISITOR_KV;
const databaseSchemas = new WeakMap();

const storageUnavailable = () =>
  json({
    error: "Ranking storage is not configured",
    code: "RANKING_STORAGE_UNAVAILABLE"
  }, 503);

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

const normalizePlayerToken = (value) => {
  const token = String(value || "").trim();
  return /^[A-Za-z0-9_-]{16,128}$/.test(token) ? token : "";
};

const getPlayerId = (request, env) => {
  const token = normalizePlayerToken(request.headers.get(PLAYER_TOKEN_HEADER));
  const identity = token ? `token:${token}` : `ip:${getClientIp(request)}`;
  return hashText(`${env.RANKING_SALT || "carstudio-sky-launch-v1"}|${identity}`);
};

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

const ensureDatabaseSchema = (database) => {
  let setup = databaseSchemas.get(database);
  if (!setup) {
    setup = (async () => {
      await database.prepare(`
        CREATE TABLE IF NOT EXISTS minigame_rankings (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          score REAL NOT NULL,
          car TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `).run();
      await database.prepare(`
        CREATE INDEX IF NOT EXISTS minigame_rankings_score
        ON minigame_rankings (score DESC, updated_at ASC)
      `).run();
    })();
    databaseSchemas.set(database, setup);
  }
  return setup;
};

const readShard = async (store, index) => {
  try {
    const raw = await store.get(shardKey(index));
    if (!raw) return [];
    const rows = JSON.parse(raw);
    return Array.isArray(rows) ? rows : [];
  } catch (_) {
    // One stale/corrupt KV shard must not take the entire leaderboard offline.
    return [];
  }
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

const loadKvBoard = async (store, playerId, knownShardIndex = -1, knownShard = null) => {
  const shards = await Promise.all(
    Array.from({ length: SHARD_COUNT }, (_, index) =>
      index === knownShardIndex ? knownShard : readShard(store, index)
    )
  );
  return publicBoard(shards, playerId);
};

const loadDatabaseBoard = async (database, playerId) => {
  await ensureDatabaseSchema(database);
  const result = await database.prepare(`
    SELECT id, name, score, car, updated_at AS updatedAt
    FROM minigame_rankings
    ORDER BY score DESC, updated_at ASC
    LIMIT ?
  `).bind(BOARD_LIMIT).all();
  return publicBoard([result.results || []], playerId);
};

const saveDatabaseScore = async (database, playerId, name, score, car) => {
  await ensureDatabaseSchema(database);
  const updatedAt = Date.now();
  await database.prepare(`
    INSERT INTO minigame_rankings (id, name, score, car, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = CASE
        WHEN excluded.score >= minigame_rankings.score THEN excluded.name
        ELSE minigame_rankings.name
      END,
      score = MAX(minigame_rankings.score, excluded.score),
      car = CASE
        WHEN excluded.score >= minigame_rankings.score THEN excluded.car
        ELSE minigame_rankings.car
      END,
      updated_at = CASE
        WHEN excluded.score > minigame_rankings.score THEN excluded.updated_at
        ELSE minigame_rankings.updated_at
      END
  `).bind(playerId, name, score, car, updatedAt).run();
  const best = await database.prepare(`
    SELECT score FROM minigame_rankings WHERE id = ?
  `).bind(playerId).first();
  return Number(best.score);
};

export async function onRequestGet({ request, env }) {
  const database = getDatabase(env);
  const store = getKvStore(env);
  if (!database && !store) return storageUnavailable();

  const playerId = await getPlayerId(request, env);
  const rankings = database
    ? await loadDatabaseBoard(database, playerId)
    : await loadKvBoard(store, playerId);
  return json({ rankings });
}

export const __test = { getPlayerId, maskName, normalizePlayerToken, publicBoard };

export async function onRequestPost({ request, env }) {
  const database = getDatabase(env);
  const store = getKvStore(env);
  if (!database && !store) return storageUnavailable();

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
  if (database) {
    const best = await saveDatabaseScore(database, playerId, name, score, car);
    return json({
      saved: best === score,
      best,
      rankings: await loadDatabaseBoard(database, playerId)
    });
  }

  const shardIndex = Number.parseInt(playerId[0], 16) % SHARD_COUNT;
  const shard = await readShard(store, shardIndex);
  const previous = shard.find((row) => row.id === playerId);
  const replacesBest = !previous || score >= previous.score;
  const next = {
    id: playerId,
    name: replacesBest ? name : previous.name,
    score: Math.max(score, previous?.score ?? 0),
    car: replacesBest ? car : previous.car,
    updatedAt: previous && score <= previous.score ? previous.updatedAt : Date.now()
  };
  const updatedShard = sortRows(shard.filter((row) => row.id !== playerId).concat(next)).slice(0, SHARD_LIMIT);
  await store.put(shardKey(shardIndex), JSON.stringify(updatedShard));

  return json({
    saved: next.score === score,
    best: next.score,
    rankings: await loadKvBoard(store, playerId, shardIndex, updatedShard)
  });
}
