import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

await import("./car-model-image.js");

const indexHtml = await readFile(new URL("./index.html", import.meta.url), "utf8");
const gameHtml = await readFile(new URL("./game.html", import.meta.url), "utf8");
const monthlyRankingHtml = await readFile(new URL("./monthly-ranking.html", import.meta.url), "utf8");
const catalogMatch = indexHtml.match(/const cars = (\[[^\n]+\]);/);

test("reconstructs every catalog image from its stored ranking car name", () => {
  assert.ok(catalogMatch, "car catalog should be embedded in index.html");
  const catalog = JSON.parse(catalogMatch[1]);

  for (const car of catalog) {
    assert.equal(globalThis.carModelImageUrl(car.name), car.image, car.name);
  }
});

test("does not create an image URL for an unknown ranking car", () => {
  assert.equal(globalThis.carModelImageUrl("Mystery Car"), "");
});

test("ranking screens render name, car image, car name, and distance in order", () => {
  assert.match(gameHtml, /item\.append\(position,name,carImage,carName,score\)/);
  assert.match(monthlyRankingHtml, /item\.append\(position,name,carImage,carName,score\)/);
  assert.match(gameHtml, /className='ranking-car-image'/);
  assert.match(monthlyRankingHtml, /className='car-thumb'/);
});

test("game module script parses after its static import", () => {
  const moduleScript = gameHtml.match(/<script type="module">([\s\S]*?)<\/script>/);
  assert.ok(moduleScript, "game module script should exist");
  const executableBody = moduleScript[1].replace(/^\s*import\s+[^;]+;\s*/, "");
  assert.doesNotThrow(() => new Function(executableBody));
});
