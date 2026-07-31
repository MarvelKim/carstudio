import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { __test, onRequestGet, onRequestPost } from "./rankings.js";

class MemoryKV {
  constructor() {
    this.values = new Map();
  }

  async get(key) {
    return this.values.get(key) ?? null;
  }

  async put(key, value) {
    this.values.set(key, value);
  }
}

class MemoryD1Statement {
  constructor(statement) {
    this.statement = statement;
    this.parameters = [];
  }

  bind(...parameters) {
    this.parameters = parameters;
    return this;
  }

  async run() {
    this.statement.run(...this.parameters);
    return { success: true };
  }

  async all() {
    return { results: this.statement.all(...this.parameters) };
  }

  async first() {
    return this.statement.get(...this.parameters) ?? null;
  }
}

class MemoryD1 {
  constructor() {
    this.database = new DatabaseSync(":memory:");
  }

  prepare(sql) {
    return new MemoryD1Statement(this.database.prepare(sql));
  }
}

const request = ({ token = "player-token-00000001", body, ip = "203.0.113.1", url = "https://example.test/api/rankings" } = {}) =>
  new Request(url, {
    method: body ? "POST" : "GET",
    headers: {
      "CF-Connecting-IP": ip,
      "Content-Type": "application/json",
      "X-Player-Token": token
    },
    body: body ? JSON.stringify(body) : undefined
  });

const postScore = (env, token, name, score) =>
  onRequestPost({
    env,
    request: request({ token, body: { name, score, car: "Test Car" } })
  });

test("uses Korea time for monthly ranking boundaries", () => {
  assert.equal(__test.currentPeriod(new Date("2026-07-31T14:59:59Z")), "2026-07");
  assert.equal(__test.currentPeriod(new Date("2026-07-31T15:00:00Z")), "2026-08");
  assert.equal(__test.previousPeriod(new Date("2026-01-01T00:00:00Z")), "2025-12");
  assert.equal(__test.previousPeriod(new Date("2026-07-31T15:00:00Z")), "2026-07");
});

test("rejects invalid or future historical periods", async () => {
  const env = { GAME_RANKING_DB: new MemoryD1(), RANKING_SALT: "test" };
  const response = await onRequestGet({
    env,
    request: request({ url: "https://example.test/api/rankings?period=9999-12" })
  });
  assert.equal(response.status, 400);
});

test("shows one distance-sorted global top 10", () => {
  const shards = Array.from({ length: 16 }, () => []);
  for (let index = 0; index < 12; index += 1) {
    shards[index % shards.length].push({
      id: `player-${index}`,
      name: `Driver ${index}`,
      score: 100_000 + index,
      car: "Test Car",
      updatedAt: index
    });
  }

  const board = __test.publicBoard(shards, "player-11");
  assert.equal(board.length, 10);
  assert.deepEqual(board.map((row) => row.score), [
    100011, 100010, 100009, 100008, 100007,
    100006, 100005, 100004, 100003, 100002
  ]);
  assert.deepEqual(board.map((row) => row.rank), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test("reveals only the current player's name", () => {
  const board = __test.publicBoard([[
    { id: "mine", name: "Alice", score: 103_890, car: "A", updatedAt: 1 },
    { id: "other", name: "Bob", score: 104_000, car: "B", updatedAt: 2 }
  ]], "mine");

  assert.deepEqual(board.map(({ name, isMe }) => ({ name, isMe })), [
    { name: "B**", isMe: false },
    { name: "Alice", isMe: true }
  ]);
});

test("keeps only one best record per player", () => {
  const board = __test.publicBoard([
    [{ id: "same-player", name: "Before", score: 10, updatedAt: 1 }],
    [{ id: "same-player", name: "Record", score: 20, updatedAt: 2 }]
  ], "same-player");

  assert.equal(board.length, 1);
  assert.equal(board[0].score, 20);
  assert.equal(board[0].name, "Record");
});

test("returns an actionable service error when KV is missing", async () => {
  const response = await onRequestGet({ env: {}, request: request() });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: "Ranking storage is not configured",
    code: "RANKING_STORAGE_UNAVAILABLE"
  });
});

test("separates players on the same IP by stable browser token", async () => {
  const env = { GAME_RANKING_DB: new MemoryD1(), RANKING_SALT: "test" };
  await postScore(env, "same-network-player-a", "Alice", 120);
  const response = await postScore(env, "same-network-player-b", "Bob", 150);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(payload.rankings.map(({ name, score, isMe }) => ({ name, score, isMe })), [
    { name: "Bob", score: 150, isMe: true },
    { name: "A**", score: 120, isMe: false }
  ]);
});

test("does not replace a player's best score with a lower retry", async () => {
  const env = { GAME_RANKING_DB: new MemoryD1(), RANKING_SALT: "test" };
  await postScore(env, "returning-player-0001", "Driver", 200);
  const response = await postScore(env, "returning-player-0001", "Driver", 90);
  const payload = await response.json();

  assert.equal(payload.saved, false);
  assert.equal(payload.best, 200);
  assert.equal(payload.rankings[0].score, 200);
  assert.equal(payload.rankings[0].isMe, true);
});

test("loads a completed month for the public report page", async () => {
  const env = { GAME_RANKING_DB: new MemoryD1(), RANKING_SALT: "test" };
  await postScore(env, "schema-player-token", "Current", 1);
  const period = __test.previousPeriod();
  env.GAME_RANKING_DB.database.prepare(`
    INSERT INTO minigame_monthly_rankings (period, id, name, score, car, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(period, "historical-player", "Archive Driver", 4321, "Archive Car", 1);

  const response = await onRequestGet({
    env,
    request: request({ url: `https://example.test/api/rankings?period=${period}` })
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.period, period);
  assert.equal(payload.rankings[0].name, "A**");
  assert.equal(payload.rankings[0].score, 4321);
});

test("keeps concurrent submissions without overwriting another player", async () => {
  const env = { GAME_RANKING_DB: new MemoryD1(), RANKING_SALT: "test" };
  await Promise.all(Array.from({ length: 20 }, (_, index) =>
    postScore(
      env,
      `concurrent-player-${String(index).padStart(4, "0")}`,
      `Driver ${index}`,
      index
    )
  ));

  const count = env.GAME_RANKING_DB.database
    .prepare("SELECT COUNT(*) AS count FROM minigame_monthly_rankings")
    .get().count;
  const response = await onRequestGet({ env, request: request() });
  const payload = await response.json();

  assert.equal(count, 20);
  assert.equal(payload.rankings.length, 10);
  assert.deepEqual(payload.rankings.map((row) => row.score), [
    19, 18, 17, 16, 15, 14, 13, 12, 11, 10
  ]);
});

test("keeps KV as a compatible fallback", async () => {
  const env = { GAME_RANKING_KV: new MemoryKV(), RANKING_SALT: "test" };
  const response = await postScore(env, "kv-fallback-player-01", "KV Driver", 42);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.rankings[0].name, "KV Driver");
  assert.equal(payload.rankings[0].score, 42);
  assert.equal(payload.period, __test.currentPeriod());
  assert.equal(payload.hallOfFame.length, 12);
  const currentMonth = Number(payload.period.slice(5, 7)) - 1;
  assert.equal(payload.hallOfFame[currentMonth].name, "KV Driver");
  assert.equal(payload.hallOfFame[currentMonth].rank, 1);
});

test("returns twelve monthly hall-of-fame slots and the current winner", async () => {
  const env = { GAME_RANKING_DB: new MemoryD1(), RANKING_SALT: "test" };
  const response = await postScore(env, "hall-of-fame-player", "Champion", 777);
  const payload = await response.json();
  const currentMonth = Number(payload.period.slice(5, 7)) - 1;

  assert.equal(payload.hallOfFame.length, 12);
  assert.deepEqual(payload.hallOfFame.map((row) => row.period),
    Array.from({ length: 12 }, (_, index) => `${payload.year}-${String(index + 1).padStart(2, "0")}`));
  assert.equal(payload.hallOfFame[currentMonth].name, "Champion");
  assert.equal(payload.hallOfFame[currentMonth].score, 777);
  assert.equal(payload.hallOfFame.filter((row) => row.empty).length, 11);
});
