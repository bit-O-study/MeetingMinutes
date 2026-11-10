/**
 * 모임 일정 투표·만들기·확정 화면의 상호작용 점검(개발 서버의 /dev/meeting*, 고정 데이터, 저장은 하지 않는 미리보기).
 *
 *   node scripts/verify-meeting-ui.mjs [baseUrl]   (PW_MODULE, CHROME_PATH 는 audit-layout.mjs 와 같다)
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
  if (ok) pass++;
  else fail++;
};

async function open(width, url) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, locale: "ko-KR" });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 140)));
  await page.goto(BASE + url, { waitUntil: "networkidle" });
  return { page, context, errors };
}
const cell = (page, label) => page.getByRole("gridcell", { name: new RegExp(`^${label}`) });

// ── 투표 화면(데스크톱)
{
  const { page, context, errors } = await open(1280, "/dev/meeting");
  const top = page.locator('section[aria-label="추천 구간"]');
  check((await top.innerText()).includes("11/27(금) – 11/28(토)"), "추천 1순위는 11/27~28(두 날 모두 가능한 사람이 가장 많다)");

  // 내 응답: 11/27 을 불가로 칠하면 그 구간은 추천에서 내려간다
  await page.getByRole("button", { name: "불가", exact: true }).first().click();
  await cell(page, "11/27").click();
  check((await cell(page, "11/27").getAttribute("aria-label")).includes("내 응답 불가"), "날짜를 누르면 내 응답이 칠해진다");
  check(!(await top.locator("li").first().innerText()).includes("11/27(금) – 11/28(토)"), "내 응답을 바꾸면 추천 구간이 바로 다시 계산된다");

  // 같은 값을 다시 누르면 지워진다
  await cell(page, "11/27").click();
  check((await cell(page, "11/27").getAttribute("aria-label")).includes("내 응답 없음"), "같은 값을 다시 누르면 지워진다");

  // 지우기 펜 + 가능 펜
  await page.getByRole("button", { name: "가능", exact: true }).first().click();
  await cell(page, "11/27").click();
  await cell(page, "11/28").click();
  const label = await top.innerText();
  check(label.includes("11/27(금) – 11/28(토)"), "다시 가능으로 칠하면 추천이 돌아온다");

  // 끌어서 칠하기(마우스)
  await page.getByRole("button", { name: "조건부", exact: true }).first().click();
  const a = await cell(page, "11/24").boundingBox();
  const b = await cell(page, "11/26").boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
  const marks = await Promise.all(["11/24", "11/25", "11/26"].map(async (d) => (await cell(page, d).getAttribute("aria-label")).includes("내 응답 조건부")));
  check(marks.every(Boolean), "마우스로 끌면 지나간 날짜가 모두 칠해진다", marks.join(","));

  check((await page.locator("aside").innerText()).includes("도현"), "아직 응답하지 않은 사람(도현)이 보인다");
  check((await cell(page, "11/22").getAttribute("aria-label")).includes("내 일정 가족 모임과 겹침"), "내 일정과 겹치는 날은 나에게 표시된다");

  // 확정 창
  await top.getByRole("button", { name: "이 구간으로 확정" }).first().click();
  const sheet = page.locator("dialog[open]");
  check(await sheet.count() === 1, "'이 구간으로 확정'을 누르면 확정 창이 열린다");
  check((await sheet.innerText()).includes("아직 답하지 않은 사람") && (await sheet.innerText()).includes("도현"), "확정 창에 아직 답하지 않은 사람이 먼저 보인다");
  await sheet.locator('input[type="time"]').first().fill("18:00");
  await sheet.getByRole("button", { name: "확정하기" }).last().click();
  check((await sheet.innerText()).includes("시작과 종료 시각을 함께"), "시각을 한쪽만 넣으면 안내가 나온다");
  check(errors.length === 0, "콘솔 오류 없음", errors.join(" | "));
  await context.close();
}

// ── 일반 멤버: 확정 버튼이 없다
{
  const { page, context } = await open(1280, "/dev/meeting?manager=0");
  check((await page.getByRole("button", { name: "이 구간으로 확정" }).count()) === 0, "만든 사람·소유자가 아니면 '확정' 버튼이 없다");
  check((await page.innerText("aside")).includes("만든 사람이나 스페이스 소유자"), "누가 확정하는지 안내한다");
  check((await page.getByRole("button", { name: "모임 취소" }).count()) === 0, "일반 멤버에게는 '모임 취소'도 없다");
  await context.close();
}

// ── 확정된 모임
{
  const { page, context } = await open(1280, "/dev/meeting?status=confirmed");
  check((await page.innerText("main, body")).includes("확정됨"), "확정된 모임에는 '확정됨' 안내가 있다");
  check((await page.getByRole("link", { name: "회의록 열기" }).count()) === 1, "회의록 열기 링크가 있다");
  check((await page.getByRole("button", { name: "다시 조사하기" }).count()) === 1, "관리자는 '다시 조사하기'를 쓸 수 있다");
  check((await cell(page, "11/27").isDisabled()), "확정된 뒤에는 날짜를 칠할 수 없다");
  await page.getByRole("button", { name: "모임 취소" }).click();
  check((await page.getByRole("alertdialog").count()) === 1, "'모임 취소'는 한 번 더 확인한다");
  await context.close();
}

// ── 만들기(RangePicker)
{
  const { page, context, errors } = await open(1280, "/dev/meetings?open=1");
  const dialog = page.locator("dialog[open]");
  check(await dialog.count() === 1, "?open=1 이면 만들기 창이 열려 있다");
  check((await dialog.innerText()).includes("후보 기간 11/21(토)"), "캘린더에서 넘어온 시작 날짜가 채워져 있다");
  await dialog.getByRole("gridcell", { name: /^11\/25/ }).click();
  check((await dialog.innerText()).includes("끝나는 날을 눌러"), "시작을 누르면 끝나는 날을 안내한다");
  await dialog.getByRole("gridcell", { name: /^11\/29/ }).click();
  check((await dialog.innerText()).includes("후보 기간 11/25(수) – 11/29(일) · 5일"), "끝을 누르면 기간이 정해진다", (await dialog.innerText()).match(/후보 기간 [^\n]+/)?.[0]);
  const options = await dialog.locator("select option").allInnerTexts();
  check(options.length === 5 && options[0] === "하루", "이어지는 일수 선택지는 기간 길이(5일)까지만 나온다", options.join("/"));
  await dialog.getByRole("button", { name: "일정 조사 시작" }).click();
  check((await dialog.innerText()).includes("모임 이름을 입력"), "이름이 비어 있으면 안내가 나온다");
  // 두 달 초과 거절
  await dialog.getByRole("button", { name: "다음 달" }).click();
  await dialog.getByRole("button", { name: "다음 달" }).click();
  await dialog.getByRole("gridcell", { name: /^1\/20/ }).click().catch(() => {});
  await dialog.getByRole("gridcell", { name: /^1\/25/ }).click().catch(() => {});
  check(errors.length === 0, "콘솔 오류 없음", errors.join(" | "));
  await context.close();
}

// ── 목록
{
  const { page, context } = await open(1280, "/dev/meetings");
  const t = await page.innerText("body");
  check(t.includes("투표 중") && t.includes("확정"), "목록은 '투표 중'과 '확정'으로 나뉜다");
  check(t.includes("내 응답 필요"), "내가 아직 답하지 않은 투표에 '내 응답 필요'가 붙는다");
  const empty = await open(1280, "/dev/meetings?empty=1");
  check((await empty.page.innerText("body")).includes("아직 잡은 일정이 없어요"), "비어 있으면 안내 문구가 나온다");
  await empty.context.close();
  await context.close();
}

// ── 모바일 투표
{
  const { page, context } = await open(390, "/dev/meeting");
  const box = await cell(page, "11/25").boundingBox();
  check(box && box.height >= 44 && box.width >= 44, "모바일: 날짜 칸이 손가락으로 누를 크기(44px)다", box ? `${Math.round(box.width)}×${Math.round(box.height)}` : "");
  await page.getByRole("button", { name: "불가", exact: true }).first().click();
  await cell(page, "11/25").tap().catch(() => cell(page, "11/25").click());
  check((await cell(page, "11/25").getAttribute("aria-label")).includes("내 응답 불가"), "모바일: 탭으로 칠할 수 있다");
  await context.close();
}

await browser.close();
console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
