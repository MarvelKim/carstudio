# Car Studio ranking deployment

The ranking API needs one persistent Cloudflare binding. D1 is preferred because
score updates use an atomic upsert, so simultaneous submissions cannot overwrite
another player's row. The existing KV implementation remains available only as a
compatibility fallback.

## Required production binding

1. In Cloudflare, create a D1 database (for example, `carstudio-game-ranking`).
2. Open **Workers & Pages > carstudio-dye > Settings > Bindings**.
3. Add the D1 database with the variable name `GAME_RANKING_DB` to Production.
4. Add a secret named `RANKING_SALT` with a long random value.
5. Redeploy the latest `main` commit. The API creates its table and score index
   automatically on the first request.

If D1 cannot be used, bind a KV namespace as `GAME_RANKING_KV`. Do not leave both
bindings absent: `/api/rankings` will intentionally return HTTP 503 with
`RANKING_STORAGE_UNAVAILABLE` instead of pretending that an empty ranking loaded.

## Production verification

Use a token of at least 16 letters, numbers, `_`, or `-` characters:

```sh
curl -i -H "X-Player-Token: deployment-check-0001" \
  https://carstudio-dye.pages.dev/api/rankings

curl -i -X POST \
  -H "Content-Type: application/json" \
  -H "X-Player-Token: deployment-check-0001" \
  --data '{"name":"Deploy Check","score":1,"car":"Test Car"}' \
  https://carstudio-dye.pages.dev/api/rankings
```

Both responses must be HTTP 200 and contain a `rankings` array. Delete the
`Deploy Check` row from D1 after verification if it should not remain visible.

## Monthly Telegram TOP 10 report

The workflow in `.github/workflows/monthly-ranking-report.yml` runs at 00:20
Korea time around each month boundary. The API only sends on the first day in
Korea, so the report contains the finalized ranking from the first through the
last day of the previous month. A delivery marker in D1/KV prevents duplicates.

Telegram bots address a private conversation by chat ID, not by telephone
number. Do not put a telephone number, bot token, or chat ID in this repository.

1. In Telegram, create a bot with `@BotFather` and copy its bot token.
2. Open the new bot from the Telegram account that should receive the report and
   send `/start` once.
3. Call the bot's `getUpdates` method locally and copy `message.chat.id` from the
   `/start` update. Keep both values private.
4. In **Cloudflare > Workers & Pages > carstudio-dye > Settings > Variables and
   Secrets**, add these encrypted Production secrets:
   - `TELEGRAM_BOT_TOKEN`: token issued by BotFather
   - `TELEGRAM_CHAT_ID`: numeric chat ID from the update
   - `REPORTING_SECRET`: a new, long random value
5. In **GitHub > carstudio > Settings > Secrets and variables > Actions**, add
   `MONTHLY_REPORT_SECRET` with exactly the same value as Cloudflare's
   `REPORTING_SECRET`.
6. If the production host changes, add a GitHub Actions repository variable
   named `MONTHLY_REPORT_ENDPOINT` containing the full endpoint, for example
   `https://example.com/api/monthly-report`.
7. Redeploy, then run **Actions > Monthly ranking report > Run workflow** once.
   Leave the period blank to use the last completed month. Select `force` only
   when an already delivered report intentionally needs to be sent again.

The Telegram message includes the masked TOP 10 and buttons for the public
monthly ranking page and the Naver Blog share handoff.

## Naver Blog publishing

Naver ended its login-based Blog writing API on 2020-05-06 and ended the Blog
app writing URL scheme on 2022-12-23. There is therefore no supported API for
unattended publishing into a chosen category on `blog.naver.com/ps8852`.

This project uses Naver's supported Blog sharing page instead. The monthly
Telegram report includes **네이버 블로그에 공유**, and
`monthly-ranking.html` also provides that button plus **랭킹 내용 복사**. Log
in as `ps8852`, choose the desired category, review the post, and publish it in
Naver. Category selection and the final publish action cannot be preselected by
the supported share interface.
