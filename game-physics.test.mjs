import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  FLIGHT_TUNING,
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
  assert.equal(scoreGrade(4500), "bronze");
  assert.equal(scoreGrade(16500), "gold");
  assert.equal(scoreGrade(43000), "legend");
});

test("score HUD styles the full plate for advanced grades", async () => {
  const gameHtml = await readFile(new URL("./game.html", import.meta.url), "utf8");
  assert.match(gameHtml, /\.score-card\[data-grade="silver"\]/);
  assert.match(gameHtml, /\.score-card\[data-grade="gold"\]::after/);
  assert.match(gameHtml, /\.score-card\[data-grade="platinum"\]::before/);
  assert.match(gameHtml, /\$\('#scoreCard'\)\.dataset\.grade=grade/);
});
