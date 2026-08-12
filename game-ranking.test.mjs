import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("./game.html", import.meta.url), "utf8");

test("ranking and hall of fame hide the placeholder for registered vehicle images", () => {
  assert.match(html, /\.ranking-car-image:has\(img\)::before\{content:none\}/);
  assert.match(html, /image\.onerror=\(\)=>image\.remove\(\)/);
});
