import test from "node:test";
import assert from "node:assert/strict";
import { reviewInput } from "./library-review";
test("review input restricts status, file ID and note length", () => {
  const input = {id:"11111111-1111-1111-1111-111111111111",status:"hold",note:" 확인 필요 "};
  assert.equal(reviewInput(input).note,"확인 필요");
  assert.throws(()=>reviewInput({...input,status:"approved"}));
  assert.throws(()=>reviewInput({...input,id:"../path"}));
  assert.throws(()=>reviewInput({...input,note:"a".repeat(1001)}));
});
