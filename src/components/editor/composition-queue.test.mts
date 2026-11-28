import { test } from "node:test";
import assert from "node:assert/strict";
import { createCompositionQueue } from "./composition-queue";

test("조합 중에는 실행하지 않고 종료 후 가장 최근 작업을 반영한다", async () => {
  let composing = true;
  const calls: string[] = [];
  const queue = createCompositionQueue(() => composing);
  try {
    queue.run("db", () => calls.push("old"));
    queue.run("db", () => calls.push("latest"));
    queue.run("scroll", () => calls.push("scroll"));
    await new Promise(resolve => setTimeout(resolve, 70));
    assert.deepEqual(calls, []);
    composing = false;
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.deepEqual(calls, ["latest", "scroll"]);
  } finally { queue.cancel(); }
});

test("편집기를 닫으면 대기 작업을 취소한다", async () => {
  let composing = true;
  let calls = 0;
  const queue = createCompositionQueue(() => composing);
  queue.run("db", () => calls++);
  queue.cancel();
  composing = false;
  await new Promise(resolve => setTimeout(resolve, 70));
  assert.equal(calls, 0);
});

test("조합하지 않을 때는 즉시 반영하고 특정 작업만 취소할 수 있다", () => {
  let composing = true;
  const calls: string[] = [];
  const queue = createCompositionQueue(() => composing);
  try {
    queue.run("scroll", () => calls.push("scroll"));
    queue.cancel("scroll");
    composing = false;
    queue.run("db", () => calls.push("db"));
    assert.deepEqual(calls, ["db"]);
  } finally { queue.cancel(); }
});
