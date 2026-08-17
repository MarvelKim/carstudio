import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const indexHtml = await readFile(new URL("./index.html", import.meta.url), "utf8");
const gameHtml = await readFile(new URL("./game.html", import.meta.url), "utf8");

test("test site opens the mini-game immediately with a fixed test car", () => {
  assert.match(indexHtml, /location\.hostname === "test-vehicle-dye\.pages\.dev"/);
  assert.match(indexHtml, /localStorage\.setItem\("carstudioGameCar", JSON\.stringify\(testCar\)\)/);
  assert.match(indexHtml, /location\.replace\("\/game\.html\?v=revive-hud-v4"\)/);
  assert.match(indexHtml, /const testGameUrl = testSiteOrigin \+ "\/game\.html\?v=revive-hud-v4"/);
  assert.match(indexHtml, /authenticateTestPasskey\(\)\)\{location\.href=testGameUrl/);
  assert.match(indexHtml, /__test-access\?next=%2Fgame\.html%3Fv%3Drevive-hud-v4/);
});

test("mobile test access registers and reuses a platform passkey", () => {
  assert.match(indexHtml, /authenticatorAttachment:\s*"platform"/);
  assert.match(indexHtml, /userVerification:\s*"required"/);
  assert.match(indexHtml, /registerTestPasskey/);
  assert.match(indexHtml, /authenticateTestPasskey/);
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
