import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  FLIGHT_TUNING,
  SCORE_GRADES,
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
    assert.ok(speed >= FLIGHT_TUNING.MIN_FORWARD_AIR_SPEED);
  }
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
  assert.equal(scoreGrade(3000), "iron");
  assert.equal(scoreGrade(6000), "bronze");
  assert.equal(scoreGrade(15000), "platinum");
  assert.equal(scoreGrade(18000), "emerald");
  assert.equal(scoreGrade(21000), "tourmaline");
  assert.equal(scoreGrade(24000), "alexandrite");
  assert.equal(scoreGrade(27000), "ruby");
  assert.equal(scoreGrade(30000), "diamond-brown");
  assert.equal(scoreGrade(33000), "diamond-pink");
  assert.equal(scoreGrade(36000), "diamond-green");
  assert.equal(scoreGrade(39000), "diamond-red");
  assert.equal(scoreGrade(43000), "legend");
});

test("score HUD uses readable low-saturation plates without ornaments", async () => {
  const gameHtml = await readFile(new URL("./game.html", import.meta.url), "utf8");
  assert.match(gameHtml, /\.score-card\[data-grade="bronze"\]/);
  assert.match(gameHtml, /repeating-linear-gradient/);
  assert.match(gameHtml, /\.grade-frame\{display:none!important\}/);
  assert.match(gameHtml, /height:66px!important;min-height:66px!important;max-height:66px!important/);
  assert.match(gameHtml, /const gradeLabel=grade=>grade\.replaceAll\('-',' '\)\.toUpperCase\(\)/);
  assert.match(gameHtml, /\$\('#scoreCard'\)\.dataset\.grade=grade/);
});

test("test-game HUD and fever behavior preserve layout and momentum", async () => {
  const gameHtml = await readFile(new URL("./game.html", import.meta.url), "utf8");
  assert.match(gameHtml, /class="right-game-hud"><aside class="item-queue"/);
  assert.match(gameHtml, /\.right-game-hud\{[^}]*flex-direction:column;gap:16px/);
  assert.match(gameHtml, /@media\(max-width:650px\)\{\.right-game-hud\{[^}]*gap:12px/);
  assert.match(gameHtml, /html\.mobile-landscape \.right-game-hud\{[^}]*gap:10px/);
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
