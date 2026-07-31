import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { onRequestPost, __test } from "./monthly-report.js";

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

const reportRequest = (period, token = "report-secret", force = false) =>
  new Request("https://carstudio.example/api/monthly-report", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ period, force })
  });

test("formats Telegram-safe monthly ranking text", () => {
  const text = __test.formatReport("2026-07", [{
    name: "A&B <Driver>",
    score: 17700,
    car: "Roadster"
  }]);

  assert.match(text, /2026년 7월 TOP 10/);
  assert.match(text, /17\.70 km/);
  assert.match(text, /A&amp;B &lt;Driver&gt;/);
  assert.match(text, /2026\.07\.31/);
});

test("recognizes Korea calendar dates", () => {
  assert.equal(__test.koreaDay(new Date("2026-07-31T14:59:59Z")), 31);
  assert.equal(__test.koreaDay(new Date("2026-07-31T15:00:00Z")), 1);
});

test("delivers once and includes the Naver handoff button", async (context) => {
  const database = new MemoryD1();
  const env = {
    GAME_RANKING_DB: database,
    REPORTING_SECRET: "report-secret",
    TELEGRAM_BOT_TOKEN: "telegram-token",
    TELEGRAM_CHAT_ID: "123456"
  };
  const requests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 77 } }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };
  context.after(() => { globalThis.fetch = originalFetch; });

  const first = await onRequestPost({
    env,
    request: reportRequest("2026-06")
  });
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { sent: true, period: "2026-06", count: 0 });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].body.chat_id, "123456");
  assert.match(requests[0].body.reply_markup.inline_keyboard[0][1].url, /blog\.naver\.com\/openapi\/share/);

  const duplicate = await onRequestPost({
    env,
    request: reportRequest("2026-06")
  });
  assert.deepEqual(await duplicate.json(), {
    skipped: true,
    reason: "already_sent",
    period: "2026-06"
  });
  assert.equal(requests.length, 1);
});

test("requires the reporting secret", async () => {
  const response = await onRequestPost({
    env: { REPORTING_SECRET: "expected" },
    request: reportRequest("2026-06", "wrong")
  });
  assert.equal(response.status, 401);
});
