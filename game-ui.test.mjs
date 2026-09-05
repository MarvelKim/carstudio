import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
const gameHtml = await readFile(new URL("./game.html", import.meta.url), "utf8");
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
