import assert from "node:assert/strict";
import { test } from "node:test";
import { noteImageUrl } from "./note-image.js";

test("사진 URL은 내부 첨부만 허용하고 공유토큰은 외부로 보내지 않는다", () => {
  const src = "/api/attachments/12345678-1234-1234-1234-123456789abc";
  assert.equal(noteImageUrl(src), src);
  assert.equal(noteImageUrl(src, "a&b"), `${src}?share=a%26b`);
  for (const value of ["https://evil.test/a", "//evil.test/a", "data:image/png;base64,AA", `${src}?redirect=x`, `${src}/../secret`, null]) {
    assert.equal(noteImageUrl(value, "secret"), null);
  }
});
