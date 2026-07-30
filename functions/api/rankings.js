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

const padMonth = (month) => String(month).padStart(2, "0");
const currentPeriod = (now = new Date()) => {
  const koreaTime = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return `${koreaTime.getUTCFullYear()}-${padMonth(koreaTime.getUTCMonth() + 1)}`;
};
const periodYear = (period) => Number(period.slice(0, 4));
const yearPeriods = (year) =>
  Array.from({ length: 12 }, (_, month) => `${year}-${padMonth(month + 1)}`);
const shardKey = (period, index) =>
  `minigame:ranking:v2:${period}:${index.toString(16)}`;
const winnerKey = (period) => `minigame:winner:v2:${period}`;

const ensureDatabaseSchema = (database) => {
  let setup = databaseSchemas.get(database);
  if (!setup) {
    setup = (async () => {
      await database.prepare(`
        CREATE TABLE IF NOT EXISTS minigame_monthly_rankings (
          period TEXT NOT NULL,
          id TEXT NOT NULL,
          name TEXT NOT NULL,
          score REAL NOT NULL,
          car TEXT NOT NULL,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (period, id)
        )
      `).run();
      await database.prepare(`
        CREATE INDEX IF NOT EXISTS minigame_monthly_rankings_score
        ON minigame_monthly_rankings (period, score DESC, updated_at ASC)
      `).run();
    })();
    databaseSchemas.set(database, setup);
  }
  return setup;
};

const readShard = async (store, period, index) => {
  try {
    const raw = await store.get(shardKey(period, index));
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

const loadKvBoard = async (store, playerId, period, knownShardIndex = -1, knownShard = null) => {
  const shards = await Promise.all(
    Array.from({ length: SHARD_COUNT }, (_, index) =>
      index === knownShardIndex ? knownShard : readShard(store, period, index)
    )
  );
  return publicBoard(shards, playerId);
};

const loadDatabaseBoard = async (database, playerId, period) => {
  await ensureDatabaseSchema(database);
  const result = await database.prepare(`
    SELECT id, name, score, car, updated_at AS updatedAt
    FROM minigame_monthly_rankings
    WHERE period = ?
    ORDER BY score DESC, updated_at ASC
    LIMIT ?
  `).bind(period, BOARD_LIMIT).all();
  return publicBoard([result.results || []], playerId);
};

const saveDatabaseScore = async (database, playerId, name, score, car, period) => {
  await ensureDatabaseSchema(database);
  const updatedAt = Date.now();
  await database.prepare(`
    INSERT INTO minigame_monthly_rankings (period, id, name, score, car, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(period, id) DO UPDATE SET
      name = CASE
        WHEN excluded.score >= minigame_monthly_rankings.score THEN excluded.name
        ELSE minigame_monthly_rankings.name
      END,
      score = MAX(minigame_monthly_rankings.score, excluded.score),
      car = CASE
        WHEN excluded.score >= minigame_monthly_rankings.score THEN excluded.car
        ELSE minigame_monthly_rankings.car
      END,
      updated_at = CASE
        WHEN excluded.score > minigame_monthly_rankings.score THEN excluded.updated_at
        ELSE minigame_monthly_rankings.updated_at
      END
  `).bind(period, playerId, name, score, car, updatedAt).run();
  const best = await database.prepare(`
    SELECT score FROM minigame_monthly_rankings WHERE period = ? AND id = ?
  `).bind(period, playerId).first();
  return Number(best.score);
};

const loadDatabaseHallOfFame = async (database, playerId, year) => {
  await ensureDatabaseSchema(database);
  const result = await database.prepare(`
    SELECT period, id, name, score, car, updatedAt FROM (
      SELECT period, id, name, score, car, updated_at AS updatedAt,
        ROW_NUMBER() OVER (PARTITION BY period ORDER BY score DESC, updated_at ASC) AS monthly_rank
      FROM minigame_monthly_rankings
      WHERE period >= ? AND period <= ?
    )
    WHERE monthly_rank = 1
    ORDER BY period ASC
  `).bind(`${year}-01`, `${year}-12`).all();
  const winners = new Map();
  for (const row of result.results || []) if (!winners.has(row.period)) winners.set(row.period, row);
  return yearPeriods(year).map((period) => {
    const row = winners.get(period);
    return row ? { period, rank: 1, name: row.id === playerId ? row.name : maskName(row.name), score: row.score, car: row.car, isMe: row.id === playerId } : { period, rank: 1, empty: true };
  });
};

const loadKvHallOfFame = async (store, playerId, year) =>
  Promise.all(yearPeriods(year).map(async (period) => {
    let winner = null;
    try { winner = JSON.parse(await store.get(winnerKey(period))); } catch (_) {}
    return winner ? { period, rank: 1, name: winner.id === playerId ? winner.name : maskName(winner.name), score: winner.score, car: winner.car, isMe: winner.id === playerId } : { period, rank: 1, empty: true };
  }));

const responseData = async (database, store, playerId, period) => ({
  period,
  year: periodYear(period),
  rankings: database
    ? await loadDatabaseBoard(database, playerId, period)
    : await loadKvBoard(store, playerId, period),
  hallOfFame: database
    ? await loadDatabaseHallOfFame(database, playerId, periodYear(period))
    : await loadKvHallOfFame(store, playerId, periodYear(period))
});

export async function onRequestGet({ request, env }) {
  const database = getDatabase(env);
  const store = getKvStore(env);
  if (!database && !store) return storageUnavailable();

  const playerId = await getPlayerId(request, env);
  const period = currentPeriod();
  return json(await responseData(database, store, playerId, period));
}

export const __test = { currentPeriod, getPlayerId, maskName, normalizePlayerToken, publicBoard };

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
  const period = currentPeriod();
  if (database) {
    const best = await saveDatabaseScore(database, playerId, name, score, car, period);
    return json({
      saved: best === score,
      best,
      ...await responseData(database, store, playerId, period)
    });
  }

  const shardIndex = Number.parseInt(playerId[0], 16) % SHARD_COUNT;
  const shard = await readShard(store, period, shardIndex);
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
  await store.put(shardKey(period, shardIndex), JSON.stringify(updatedShard));
  let previousWinner = null;
  try { previousWinner = JSON.parse(await store.get(winnerKey(period))); } catch (_) {}
  if (!previousWinner || next.score > previousWinner.score ||
      (next.score === previousWinner.score && next.updatedAt < previousWinner.updatedAt)) {
    await store.put(winnerKey(period), JSON.stringify(next));
  }

  return json({
    saved: next.score === score,
    best: next.score,
    ...await responseData(null, store, playerId, period)
  });
}
