import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const indexHtml = await readFile(new URL("./index.html", import.meta.url), "utf8");
const gameHtml = await readFile(new URL("./game.html", import.meta.url), "utf8");

test("main page protects the direct Porsche game with password then passkey", () => {
  assert.match(indexHtml, /TEST · PORSCHE 911 미니게임/);
  assert.match(indexHtml, /function startPorscheMiniGame\(\)/);
  assert.match(indexHtml, /name:"Porsche 911 Carrera"/);
  assert.match(indexHtml, /localStorage\.setItem\("carstudioGameCar",JSON\.stringify\(porsche\)\)/);
  assert.match(indexHtml, /location\.href="\/game\.html"/);
  assert.match(indexHtml, /testPasswordHash="34a1f239090ea33fc9f6458e3d49c41b1dba5bdfafe7fcc0aa33a384cec9c79d"/);
  assert.match(indexHtml, /authenticatorAttachment:"platform"/);
  assert.match(indexHtml, /authenticateTestPasskey/);
  assert.doesNotMatch(indexHtml, /test-vehicle-dye\.pages\.dev/);
});

test("game alerts use item-specific impact banners", () => {
  assert.match(gameHtml, /function toast\(key\)/);
  assert.match(gameHtml, /toast\('trapHit'\)/);
  assert.match(gameHtml, /toast\('skyHit'\)/);
  assert.match(gameHtml, /toast\('energyHit'\)/);
});

test("game result offers a five-second rewarded revive placeholder", () => {
  assert.match(gameHtml, /id="reviveBtn">📺 광고 보고 부활하기/);
  assert.match(gameHtml, /id="adOverlay"/);
  assert.match(gameHtml, /function openReviveAd\(\).*remaining=5/);
  assert.match(gameHtml, /function completeRevive\(\).*launchOriginX=car\.x.*phase='angle'/);
  assert.match(gameHtml, /\$\('#reviveBtn'\)\.hidden=reviveUsed/);
  assert.match(gameHtml, /reviveUsed=true/);
});
