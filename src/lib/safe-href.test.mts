import assert from "node:assert/strict";
import { test } from "node:test";

import { safeLinkHref } from "./safe-href.js";

test("http·https·mailto 링크만 통과한다", () => {
  assert.equal(safeLinkHref("https://example.com/a?b=1"), "https://example.com/a?b=1");
  assert.equal(safeLinkHref("http://example.com"), "http://example.com/");
  assert.equal(safeLinkHref("mailto:someone@example.com"), "mailto:someone@example.com");
});

test("스크립트 실행·상대 주소·이상한 값은 막는다", () => {
  for (const value of [
    "javascript:alert(1)",
    " JavaScript:alert(1)",
    "java\nscript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "/relative/path",
    "//evil.example",
    "",
    null,
    undefined,
    42,
    { toString: () => "javascript:alert(1)" },
    "https://" + "a".repeat(3000),
  ]) {
    assert.equal(safeLinkHref(value), null, String(value));
  }
});
