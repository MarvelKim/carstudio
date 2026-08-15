import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const indexHtml = await readFile(new URL("./index.html", import.meta.url), "utf8");
const gameHtml = await readFile(new URL("./game.html", import.meta.url), "utf8");

test("test site opens the mini-game immediately with a fixed test car", () => {
  assert.match(indexHtml, /location\.hostname === "test-vehicle-dye\.pages\.dev"/);
  assert.match(indexHtml, /localStorage\.setItem\("carstudioGameCar", JSON\.stringify\(testCar\)\)/);
  assert.match(indexHtml, /location\.replace\("\/game\.html"\)/);
});

test("game alerts use item-specific impact banners", () => {
  assert.match(gameHtml, /@keyframes toast-impact/);
  assert.match(gameHtml, /icons=\{energy:'⚡',sky:'🚀',trap:'💥',honey:'🍯',ground:'↟'\}/);
  assert.match(gameHtml, /el\.className=`toast \$\{kind\}`/);
  assert.match(gameHtml, /prefers-reduced-motion:reduce/);
});

test("game result offers a five-second rewarded revive placeholder", () => {
  assert.match(gameHtml, /id="reviveBtn"[^>]*data-t="revive"/);
  assert.match(gameHtml, /id="adOverlay"[^>]*role="dialog"/);
  assert.match(gameHtml, /data-t="adInquiry">광고문의 ✈️/);
  assert.match(gameHtml, /const AD_WAIT_SECONDS=5/);
  assert.match(gameHtml, /setTimeout\(enableAdClose,AD_WAIT_SECONDS\*1000\)/);
  assert.match(gameHtml, /function completeRevive\(\).*reset\(\)/);
});
