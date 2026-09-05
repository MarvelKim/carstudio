import test from "node:test";
import vm from "node:vm";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const indexHtml = await readFile(new URL("./index.html", import.meta.url), "utf8");
const gameHtml = await readFile(new URL("./game.html", import.meta.url), "utf8");

test("main page protects the direct Porsche game with password then passkey", () => {
  assert.match(indexHtml, /id="testSiteButton"[^>]*>TEST<\/button>/);
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
  assert.doesNotMatch(gameHtml, /toast\('(trapHit|honeyHit|skyHit|energyHit)'\)/);
  assert.match(gameHtml, /cycle===0\?'morning':cycle===1\?'sunset':'space'/);
  assert.match(gameHtml, /function drawSpaceDetails\(alpha\)/);
});

test("game result offers a five-second rewarded revive placeholder", () => {
  assert.match(gameHtml, /id="reviveBtn">📺 광고 보고 부활하기/);
  assert.match(gameHtml, /id="adOverlay"/);
  assert.match(gameHtml, /class="ad-contact-link" href="mailto:ps8852@naver\.com"[^>]*>광고문의 .*<\/a>/);
  assert.match(gameHtml, /function openReviveAd\(\).*remaining=5/);
  assert.match(gameHtml, /function completeRevive\(\).*launchOriginX=car\.x.*phase='angle'/);
  assert.match(gameHtml, /\$\('#reviveBtn'\)\.hidden=reviveUsed/);
  assert.match(gameHtml, /reviveUsed=true/);
});


test("rapid combo rewards keep only two visible notices and expire", () => {
  const children = [], timers = [];
  const lane = { children, append(el) { children.push(el); }, get firstElementChild() { return children[0]; } };
  const context = vm.createContext({
    $: () => lane,
    document: { createElement: () => ({ remove() { const i = children.indexOf(this); if (i >= 0) children.splice(i, 1); } }) },
    setTimeout: callback => timers.push(callback),
  });
  vm.runInContext(gameHtml.split('\n').find(line => line.includes('function scorePopup(')), context);
  for (let i = 1; i <= 100; i++) context.scorePopup(i * 100, String(i));
  assert.equal(children.length, 2);
  assert.equal(children[1].textContent, '+10000  100');
  timers.forEach(callback => callback());
  assert.equal(children.length, 0);
});
