import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  FLIGHT_TUNING,
  SCORE_GRADES,
  applySpeedMultiplier,
  airborneForwardVelocity,
  ballisticAirtime,
  bounceVerticalVelocity,
  itemScoreFor,
  launchVerticalVelocity,
  scoreGrade
} from "./game-physics.js";

test("reduces a representative 30 second launch to 9 seconds", () => {
  const angle = Math.PI / 6;
  const speedForThirtySeconds = 16_800;
  const originalVelocity = -speedForThirtySeconds * Math.sin(angle);
  const scaledVelocity = launchVerticalVelocity(speedForThirtySeconds, angle);

  assert.ok(Math.abs(ballisticAirtime(originalVelocity) - 30) < 1e-9);
  assert.ok(Math.abs(ballisticAirtime(scaledVelocity) - 9) < 1e-9);
  assert.ok(Math.abs(
    ballisticAirtime(scaledVelocity) / ballisticAirtime(originalVelocity) -
    FLIGHT_TUNING.AIRTIME_SCALE
  ) < 1e-9);
});

test("caps stronger launches at nine seconds", () => {
  const velocity = launchVerticalVelocity(24_800, 0.98);
  assert.equal(ballisticAirtime(velocity), FLIGHT_TUNING.MAX_LAUNCH_AIRTIME);
});

test("keeps every airborne frame moving to the right", () => {
  let speed = 10;
  for (let frame = 0; frame < 60 * 30; frame += 1) {
    speed = airborneForwardVelocity(speed, 1 / 60);
    assert.ok(speed > 0);
    assert.equal(applySpeedMultiplier(100, .30), 30);
    assert.equal(applySpeedMultiplier(30, .30), 9);
  }
});

test("reduces obstacle slowdown amounts by forty percent", async () => {
  const gameHtml = await readFile(new URL("./game.html", import.meta.url), "utf8");

  assert.match(gameHtml, /type==='trap'.*applySpeedMultiplier\(car\.vx,\.496\)/);
  assert.match(gameHtml, /type==='honey'.*applySpeedMultiplier\(car\.vx,\.73\)/);
});
test("keeps ground bounces short enough to reach nearby items", () => {
  const velocity = bounceVerticalVelocity(10_000);
  assert.equal(ballisticAirtime(velocity), FLIGHT_TUNING.MAX_BOUNCE_AIRTIME);
});

test("applies the new multiplier immediately to helpful item scores", () => {
  assert.equal(itemScoreFor("energy", 2), 200);
  assert.equal(itemScoreFor("sky", 3), 900);
  assert.equal(itemScoreFor("battery", 4), 600);
  assert.equal(itemScoreFor("trap", 99), 0);
});

test("maps final scores to the documented grade boundaries", () => {
  assert.equal(scoreGrade(0), "rookie");
  assert.equal(SCORE_GRADES.length, 15);
  assert.equal(scoreGrade(8000), "iron");
  assert.equal(scoreGrade(16000), "bronze");
  assert.equal(scoreGrade(40000), "platinum");
  assert.equal(scoreGrade(48000), "emerald");
  assert.equal(scoreGrade(56000), "tourmaline");
  assert.equal(scoreGrade(64000), "alexandrite");
  assert.equal(scoreGrade(72000), "ruby");
  assert.equal(scoreGrade(80000), "diamond-brown");
  assert.equal(scoreGrade(88000), "diamond-pink");
  assert.equal(scoreGrade(96000), "diamond-green");
  assert.equal(scoreGrade(104000), "diamond-red");
  assert.equal(scoreGrade(112000), "legend");
});

test("score HUD restores colorful Fever Time plates without resizing the card", async () => {
  const gameHtml = await readFile(new URL("./game.html", import.meta.url), "utf8");
  assert.match(gameHtml, /\.score-card\[data-grade="bronze"\]/);
  assert.match(gameHtml, /Restore the original colorful Fever Time palette/);
  assert.match(gameHtml, /\.score-card\[data-grade="legend"\]::after\{[^}]*conic-gradient/);
  assert.match(gameHtml, /animation:plate-shimmer 7s linear infinite/);
  assert.match(gameHtml, /height:66px!important;min-height:66px!important;max-height:66px!important/);
  assert.match(gameHtml, /diamond-brown.*DIAMOND.*diamond-red.*DIAMOND PINK/);
  assert.match(gameHtml, /score-card\.fever\[data-grade\^="diamond-/);
  assert.match(gameHtml, /score-card\.fever\[data-grade="legend"\]/);
  assert.match(gameHtml, /\$\('#scoreCard'\)\.dataset\.grade=grade/);
});

test("test-game HUD and fever behavior preserve layout and momentum", async () => {
  const gameHtml = await readFile(new URL("./game.html", import.meta.url), "utf8");
  assert.match(gameHtml, /class="right-game-hud"><aside class="item-queue"/);
  assert.match(gameHtml, /\.right-game-hud\{[^}]*flex-direction:column;gap:6px/);
  assert.match(gameHtml, /@media\(max-width:650px\)\{\.right-game-hud\{[^}]*gap:3px/);
  assert.match(gameHtml, /html\.mobile-landscape \.right-game-hud\{[^}]*gap:4px/);
  assert.match(gameHtml, /html\.mobile-landscape \.score-card\{height:50px!important;min-height:50px!important;max-height:50px!important;flex-basis:50px!important/);
  assert.match(gameHtml, /\.right-game-hud>\.item-queue,\.right-game-hud>\.score-card\{position:static!important/);
  assert.match(gameHtml, /if\(rolling\)\{rolling=false;car\.y=ground\(\)-carVerticalRadius/);
  assert.match(gameHtml, /feverEntrySpeed=Math\.max\(car\.vx,MIN_BOUNCE_SPEED\*4\)/);
  assert.match(gameHtml, /car\.vx=feverEntrySpeed;bounces=0;return true/);
  assert.match(gameHtml, /if\(!feverActive\)bounces\+\+/);
});

test("revive reuses the angle and power launch flow without resetting progress", async () => {
  const gameHtml = await readFile(new URL("./game.html", import.meta.url), "utf8");
  assert.match(gameHtml, /launchOriginX=car\.x/);
  assert.match(gameHtml, /phase='angle'.*\$\('#launchUi'\)\.classList\.remove\('hidden'\)/);
  assert.doesNotMatch(gameHtml, /function completeRevive\(\).*car\.vx=Math\.max\(car\.vx,9000\)/);
  assert.match(gameHtml, /id="resultRankBtn".*id="reviveBtn">📺 광고 보고 부활하기/);
  assert.match(gameHtml, /class="grade-frame"[^>]*>.*class="frame-vines".*class="frame-crown"/);
  assert.match(gameHtml, /\.score-card\{--frame:.*overflow:hidden;contain:paint/);
  assert.match(gameHtml, /class="ad-plane" viewBox="0 0 32 32"/);
  assert.match(gameHtml, /function finish\(crushed\).*\$\('#reviveBtn'\)\.hidden=reviveUsed/);
});
