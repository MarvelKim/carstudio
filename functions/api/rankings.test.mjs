import test from "node:test";
import assert from "node:assert/strict";
import { __test } from "./rankings.js";

test("shows one distance-sorted global top 10", () => {
  const shards = Array.from({ length: 16 }, () => []);
  for (let index = 0; index < 12; index += 1) {
    shards[index % shards.length].push({
      id: `player-${index}`,
      name: `이용자${index}`,
      score: 100_000 + index,
      car: "Test Car",
      updatedAt: index
    });
  }

  const board = __test.publicBoard(shards, "player-11");
  assert.equal(board.length, 10);
  assert.deepEqual(board.map((row) => row.score), [
    100011, 100010, 100009, 100008, 100007,
    100006, 100005, 100004, 100003, 100002
  ]);
  assert.deepEqual(board.map((row) => row.rank), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test("reveals only the current IP player's name", () => {
  const board = __test.publicBoard([[
    { id: "mine", name: "김민수", score: 103_890, car: "A", updatedAt: 1 },
    { id: "other", name: "박영희", score: 104_000, car: "B", updatedAt: 2 }
  ]], "mine");

  assert.deepEqual(board.map(({ name, isMe }) => ({ name, isMe })), [
    { name: "박**", isMe: false },
    { name: "김민수", isMe: true }
  ]);
});

test("keeps only one best record per IP", () => {
  const board = __test.publicBoard([
    [{ id: "same-ip", name: "이전", score: 10, updatedAt: 1 }],
    [{ id: "same-ip", name: "신기록", score: 20, updatedAt: 2 }]
  ], "same-ip");

  assert.equal(board.length, 1);
  assert.equal(board[0].score, 20);
  assert.equal(board[0].name, "신기록");
});
