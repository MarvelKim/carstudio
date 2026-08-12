import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("./monthly-ranking.html", import.meta.url), "utf8");

test("monthly ranking page builds a blog-ready PNG", () => {
  assert.match(html, /id="imageShare"/);
  assert.match(html, /id="imageDownload"/);
  assert.match(html, /width=1080,height=1350/);
  assert.match(html, /carstudio-ranking-\$\{period\}\.png/);
  assert.match(html, /type:'image\/png'/);
});

test("shares the ranking image as a file with a safe download fallback", () => {
  assert.match(html, /navigator\.canShare\(\{files:\[file\]\}\)/);
  assert.match(html, /navigator\.share\(data\)/);
  assert.match(html, /files:\[file\]/);
  assert.match(html, /downloadImage\(file\);openNaverShare\(\)/);
});

test("hides the placeholder car when a registered vehicle image exists", () => {
  assert.match(html, /\.car-thumb:has\(img\)::before\{content:none\}/);
});

test("monthly ranking inline script parses", () => {
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 1);
  assert.doesNotThrow(() => new Function(scripts[0][1]));
});
