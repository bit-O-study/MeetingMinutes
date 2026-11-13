import { z } from "zod";

export const loginInput = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(12).max(128),
});

export const registrationInput = loginInput.extend({
  name: z.string().trim().min(1).max(50),
  passwordConfirm: z.string(),
}).refine((input) => input.password === input.passwordConfirm);

export function loginReturnTo(value: unknown): string {
  // 초대와 메모 생성 복귀만 허용해 외부 주소나 로그인 반복 이동을 막는다.
  if (typeof value !== "string") return "/";
  return /^\/join\/[a-zA-Z0-9_-]+$/.test(value) || /^\/s\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/new$/i.test(value) ? value : "/";
}
