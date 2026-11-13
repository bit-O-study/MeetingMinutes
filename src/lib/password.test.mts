import assert from "node:assert/strict";
import { test } from "node:test";
import { hashPassword, verifyPassword } from "./password.js";
import { loginInput, registrationInput, loginReturnTo } from "./login-input.js";

test("비밀번호는 서로 다른 salt로 저장하고 올바른 값만 검증한다", async () => {
  const password = "test-password-안전한-문장";
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.notEqual(first, second);
  assert.ok(!first.includes(password));
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword("wrong-password", first), false);
  assert.equal(await verifyPassword(password, undefined), false);
  assert.equal(await verifyPassword(password, "invalid-hash"), false);
});

test("가입 입력은 이메일을 정규화하고 비밀번호 길이·확인을 검증한다", () => {
  const input = { name: "테스터", email: " TEST@Example.COM ", password: "test-password-123", passwordConfirm: "test-password-123" };
  assert.equal(registrationInput.parse(input).email, "test@example.com");
  assert.equal(registrationInput.safeParse({ ...input, passwordConfirm: "different" }).success, false);
  assert.equal(registrationInput.safeParse({ ...input, name: " " }).success, false);
  assert.equal(loginInput.safeParse({ ...input, password: "short" }).success, false);
  assert.equal(loginInput.safeParse({ ...input, password: "x".repeat(129) }).success, false);
  assert.equal(loginInput.safeParse({ ...input, email: "not-an-email" }).success, false);
});

test("로그인 뒤에는 내부 초대 또는 메모 생성 경로로만 복귀한다", () => {
  assert.equal(loginReturnTo("/join/abc_123-xyz"), "/join/abc_123-xyz");
  const notePath = "/s/772ff139-122e-4194-bd0e-dad974d025ef/new";
  assert.equal(loginReturnTo(notePath), notePath);
  for (const path of [notePath + "?next=//evil.example", "/s/../login/new", "/s/not-a-uuid/new", notePath + "/../../login"]) assert.equal(loginReturnTo(path), "/");
  for (const input of ["https://evil.example", "//evil.example", "/\\evil.example", "/join/../login", "/join/%2f%2fevil.example", "/login", undefined, ["/join/abc"]]) {
    assert.equal(loginReturnTo(input), "/");
  }
});
