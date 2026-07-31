import { __reporting } from "./rankings.js";

const REPORT_KEY_PREFIX = "minigame:monthly-report:v1:";
const reportSchemas = new WeakMap();

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });

const secureEqual = (left, right) => {
  const a = String(left || "");
  const b = String(right || "");
  if (!a || a.length !== b.length) return false;
  let different = 0;
  for (let index = 0; index < a.length; index += 1) {
    different |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return different === 0;
};

const koreaDay = (now = new Date()) =>
  new Date(now.getTime() + 9 * 60 * 60 * 1000).getUTCDate();

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const formatScore = (value) => {
  const score = Math.max(0, Number(value) || 0);
  return score < 1000
    ? `${score.toFixed(score < 100 ? 1 : 0)} m`
    : `${(score / 1000).toFixed(2)} km`;
};

const monthRange = (period) => {
  const [year, month] = period.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}.${String(month).padStart(2, "0")}.01 ~ ${year}.${String(month).padStart(2, "0")}.${lastDay} (KST)`;
};

const formatReport = (period, rankings) => {
  const [year, month] = period.split("-");
  const medals = ["🥇", "🥈", "🥉"];
  const rows = rankings.length
    ? rankings.map((row, index) => {
      const medal = medals[index] || `${index + 1}.`;
      return `${medal} <b>${index + 1}위</b>  ${escapeHtml(row.name)} · ${formatScore(row.score)} · ${escapeHtml(row.car)}`;
    })
    : ["이번 달에는 등록된 기록이 없습니다."];
  return [
    `<b>🚗 Car Studio ${year}년 ${Number(month)}월 TOP 10</b>`,
    `집계 기간: ${monthRange(period)}`,
    "",
    ...rows,
    "",
    "월말 기준으로 확정된 전체 사용자 랭킹입니다."
  ].join("\n");
};

const ensureReportSchema = (database) => {
  let setup = reportSchemas.get(database);
  if (!setup) {
    setup = database.prepare(`
      CREATE TABLE IF NOT EXISTS minigame_monthly_reports (
        period TEXT PRIMARY KEY,
        sent_at INTEGER NOT NULL,
        telegram_message_id TEXT NOT NULL
      )
    `).run();
    reportSchemas.set(database, setup);
  }
  return setup;
};

const wasSent = async (database, store, period) => {
  if (database) {
    await ensureReportSchema(database);
    return Boolean(await database.prepare(
      "SELECT period FROM minigame_monthly_reports WHERE period = ?"
    ).bind(period).first());
  }
  return Boolean(await store.get(`${REPORT_KEY_PREFIX}${period}`));
};

const markSent = async (database, store, period, messageId) => {
  if (database) {
    await ensureReportSchema(database);
    await database.prepare(`
      INSERT INTO minigame_monthly_reports (period, sent_at, telegram_message_id)
      VALUES (?, ?, ?)
      ON CONFLICT(period) DO UPDATE SET
        sent_at = excluded.sent_at,
        telegram_message_id = excluded.telegram_message_id
    `).bind(period, Date.now(), String(messageId || "unknown")).run();
    return;
  }
  await store.put(`${REPORT_KEY_PREFIX}${period}`, JSON.stringify({
    sentAt: Date.now(),
    telegramMessageId: messageId || null
  }));
};

const readPayload = async (request) => {
  if (!request.headers.get("Content-Type")?.includes("application/json")) return {};
  return request.json();
};

export async function onRequestPost({ request, env }) {
  if (!env.REPORTING_SECRET) {
    return json({ error: "REPORTING_SECRET is not configured" }, 503);
  }
  const authorization = request.headers.get("Authorization") || "";
  if (!secureEqual(authorization, `Bearer ${env.REPORTING_SECRET}`)) {
    return json({ error: "Unauthorized" }, 401);
  }

  let payload;
  try {
    payload = await readPayload(request);
  } catch (_) {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const manuallySelected = typeof payload.period === "string" && payload.period.length > 0;
  if (!manuallySelected && koreaDay() !== 1) {
    return json({ skipped: true, reason: "not_first_day_in_korea" });
  }

  const period = manuallySelected ? payload.period : __reporting.previousPeriod();
  if (!__reporting.isValidPeriod(period) || period >= __reporting.currentPeriod()) {
    return json({ error: "period must be a completed month in YYYY-MM format" }, 400);
  }

  const database = __reporting.getDatabase(env);
  const store = __reporting.getKvStore(env);
  if (!database && !store) {
    return json({ error: "Ranking storage is not configured" }, 503);
  }
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    return json({ error: "Telegram bot token and chat ID are not configured" }, 503);
  }

  if (!payload.force && await wasSent(database, store, period)) {
    return json({ skipped: true, reason: "already_sent", period });
  }

  const rankings = database
    ? await __reporting.loadDatabaseBoard(database, null, period)
    : await __reporting.loadKvBoard(store, null, period);
  const reportUrl = new URL("/monthly-ranking.html", request.url);
  reportUrl.searchParams.set("period", period);
  const naverShareUrl = new URL("https://blog.naver.com/openapi/share");
  naverShareUrl.searchParams.set("url", reportUrl.href);
  naverShareUrl.searchParams.set("title", `Car Studio ${period} 월간 TOP 10`);

  let telegramResponse;
  try {
    telegramResponse = await fetch(
      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: env.TELEGRAM_CHAT_ID,
          text: formatReport(period, rankings),
          parse_mode: "HTML",
          link_preview_options: { is_disabled: true },
          reply_markup: {
            inline_keyboard: [[
              { text: "월간 랭킹 보기", url: reportUrl.href },
              { text: "네이버 블로그에 공유", url: naverShareUrl.href }
            ]]
          }
        })
      }
    );
  } catch (_) {
    return json({ error: "Telegram delivery failed", detail: "Network request failed" }, 502);
  }
  let telegramResult = null;
  try {
    telegramResult = await telegramResponse.json();
  } catch (_) {}
  if (!telegramResponse.ok || !telegramResult?.ok) {
    return json({
      error: "Telegram delivery failed",
      detail: telegramResult?.description || `HTTP ${telegramResponse.status}`
    }, 502);
  }

  await markSent(database, store, period, telegramResult.result?.message_id);
  return json({ sent: true, period, count: rankings.length });
}

export const __test = { escapeHtml, formatReport, formatScore, koreaDay, monthRange, secureEqual };
