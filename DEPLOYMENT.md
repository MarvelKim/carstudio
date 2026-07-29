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
