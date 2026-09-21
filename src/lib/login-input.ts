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
  // 초대 복귀만 허용해 외부 주소나 로그인 페이지로의 반복 이동을 막는다.
  return typeof value === "string" && /^\/join\/[a-zA-Z0-9_-]+$/.test(value) ? value : "/";
}
