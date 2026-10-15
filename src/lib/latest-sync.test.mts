import assert from "node:assert/strict";
import { test } from "node:test";
import { createLatestSync } from "./latest-sync.js";
test("같은 할 일 상태는 다시 전송하지 않는다", async () => {
 const sent: number[] = []; const sync = createLatestSync<number>(async value => { sent.push(value); }, () => {});
 await sync(1); await sync(1); await sync(2); assert.deepEqual(sent, [1,2]);
});
test("진행 중 변경은 최신 상태로 합치되 순서를 지킨다", async () => {
 const sent: number[] = []; let release!: () => void;
 const gate = new Promise<void>(resolve => { release = resolve; });
 const sync = createLatestSync<number>(async value => { sent.push(value); if (value === 1) await gate; }, () => {});
 const done = sync(1); void sync(2); void sync(3); release(); await done; assert.deepEqual(sent,[1,3]);
});
test("실패한 상태는 다음 요청에서 재시도한다", async () => {
 let calls=0, errors=0;
 const sync=createLatestSync<number>(async () => { if (++calls===1) throw Error("offline"); }, () => { errors++; });
 await sync(1); await sync(1); await sync(1); assert.equal(calls,2); assert.equal(errors,1);
});
