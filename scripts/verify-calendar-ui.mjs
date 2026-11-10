/**
 * 캘린더 화면의 상호작용 점검(개발 서버의 /dev/calendar 미리보기, 고정 데이터).
 *
 *   node scripts/audit-layout.mjs 와 같은 환경변수(PW_MODULE, CHROME_PATH)를 쓴다.
 *   node scripts/verify-calendar-ui.mjs [baseUrl]
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require(process.env.PW_MODULE ?? "@playwright/test"));
} catch {
  ({ chromium } = require("playwright-core"));
}
const BASE = process.argv[2] ?? "http://localhost:3210";
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
let pass = 0;
let fail = 0;
const check = (ok, name, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  ok ? pass++ : fail++;
};

async function open(width, url = "/dev/calendar") {
  const context = await browser.newContext({ viewport: { width, height: 900 }, locale: "ko-KR" });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 140)));
  await page.goto(BASE + url, { waitUntil: "networkidle" });
  return { page, context, errors };
}

// ── 데스크톱 월 보기
{
  const { page, context, errors } = await open(1280);
  const panel = page.locator("aside");
  check((await panel.innerText()).includes("독서 기록"), "처음에는 오늘(11/10)이 선택돼 그날 목록이 보인다");

  // 칸 한가운데는 일정 칩이 덮고 있다(칩을 누르면 그 일정이 열리는 것이 정상). 날짜 숫자 쪽 빈 곳을 누른다.
  await page.getByRole("gridcell", { name: /^11\/13\(금\)/ }).click({ position: { x: 14, y: 10 } });
  check((await panel.innerText()).includes("7회차 스터디"), "날짜 칸을 누르면 오른쪽 패널이 그날로 바뀐다");

  const bars = await page.getByRole("link", { name: /부산 출장/ }).count() + await page.getByRole("button", { name: /부산 출장/ }).count();
  check(bars === 1, "기간 일정(출장 11/18~20)은 막대 하나로 그려진다", `${bars}개`);

  const hiddenBefore = await page.getByRole("button", { name: /\+\d+ 더 보기/ }).count();
  check(hiddenBefore >= 1, "항목이 많은 날은 '+N 더 보기'로 접힌다", `${hiddenBefore}곳`);
  await page.getByRole("button", { name: /\+\d+ 더 보기/ }).first().click();
  check((await panel.innerText()).includes("개"), "'+N 더 보기'를 누르면 그날 전체 목록이 패널에 열린다");

  const before = await page.getByRole("button", { name: /치과/ }).count();
  await page.getByRole("button", { name: "프론트엔드 스터디", exact: true }).click();
  await page.getByRole("button", { name: "내 일정", exact: true }).click();
  const afterHide = await page.locator("[role=grid] a[aria-label], [role=grid] button[aria-label*=', ']").count();
  check(before >= 1 && afterHide < 40, "레이어 칩을 끄면 그 레이어의 일정이 사라진다", `치과 ${before}개 → 전체 칩 ${afterHide}개`);
  await page.reload({ waitUntil: "networkidle" });
  check((await page.getByRole("button", { name: "내 일정", exact: true }).getAttribute("aria-pressed")) === "false", "꺼 둔 레이어는 새로고침해도 기억된다");
  await page.getByRole("button", { name: "프론트엔드 스터디", exact: true }).click();
  await page.getByRole("button", { name: "내 일정", exact: true }).click();

  // 일정 열기 → 기간 입력
  await page.getByRole("button", { name: /^일정, 부산 출장/ }).first().click();
  const dialog = page.locator("dialog[open]");
  check(await dialog.count() === 1, "내 일정을 누르면 편집 창이 열린다");
  check((await dialog.getByRole("button", { name: "기간", exact: true }).getAttribute("aria-pressed")) === "true", "여러 날 일정은 '기간'이 선택된 채로 열린다");
  const dates = await dialog.locator("input[type=date]").evaluateAll((a) => a.map((x) => x.value));
  check(dates.join(",") === "2026-11-18,2026-11-20", "시작일·종료일이 채워져 있다", dates.join(" ~ "));
  await dialog.getByRole("button", { name: "닫기" }).click().catch(() => {});
  await page.keyboard.press("Escape");

  // 새 일정: 하루 ↔ 기간 전환
  await page.getByRole("button", { name: "새로 만들기" }).click();
  const dlg2 = page.locator("dialog[open]");
  check(await dlg2.getByRole("button", { name: "하루", exact: true }).count() === 1, "새 일정에는 '하루 / 기간' 선택이 있다");
  await dlg2.getByRole("button", { name: "기간", exact: true }).click();
  const labels = await dlg2.locator("label").allInnerTexts();
  check(labels.some((t) => t.startsWith("시작일")) && labels.some((t) => t.startsWith("종료일")), "'기간'을 고르면 시작일·종료일 입력이 나온다");
  check(errors.length === 0, "콘솔 오류 없음", errors.join(" | "));
  await context.close();
}

// ── 할 일 편집: 딸린 일정 선택
{
  const { page, context } = await open(1280);
  // 11/12 의 항목은 칸에서 접혀 있으므로 날짜를 고른 뒤 오른쪽 패널에서 연다.
  await page.getByRole("gridcell", { name: /^11\/12\(목\)/ }).click({ position: { x: 14, y: 10 } });
  await page.locator("aside").getByRole("button", { name: /^할 일, 발표 자료 정리/ }).click();
  const dialog = page.locator("dialog[open]");
  const select = dialog.locator("select");
  check((await select.count()) === 1, "할 일 편집 창에 '딸린 일정' 선택이 있다");
  const options = await select.locator("option").allInnerTexts();
  check(options.length >= 3 && options.some((o) => o.includes("7회차 스터디")), "내 일정과 확정된 모임이 선택지로 나온다", options.join(" / "));
  check((await select.inputValue()).startsWith("meeting:"), "이미 연결된 모임이 선택돼 있다");
  await context.close();
}

// ── 모바일
{
  const { page, context, errors } = await open(390);
  await page.getByRole("gridcell", { name: /^11\/12\(목\)/ }).click();
  const list = await page.locator("section[aria-label$=' 일정']").first().innerText();
  check(list.includes("발표 자료 정리"), "모바일: 날짜를 누르면 아래 목록이 그날로 바뀐다");
  check((await page.getByRole("checkbox", { name: /발표 자료 정리 완료/ }).count()) === 1, "모바일: 할 일에 체크칸이 있다");
  const box = await page.getByRole("checkbox", { name: /발표 자료 정리 완료/ }).boundingBox();
  check(box && box.width >= 24 && box.height >= 24, "체크칸이 손가락으로 누를 크기(24px 이상)다", box ? `${Math.round(box.width)}×${Math.round(box.height)}` : "");
  const cell = await page.getByRole("gridcell", { name: /^11\/12\(목\)/ }).boundingBox();
  check(cell && cell.height >= 44, "날짜 칸 높이가 44px 이상이다", cell ? `${Math.round(cell.height)}px` : "");
  check(errors.length === 0, "콘솔 오류 없음", errors.join(" | "));
  await context.close();
}

await browser.close();
console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
