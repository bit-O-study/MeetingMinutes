/**
 * 화면 깨짐 점검: 여러 화면 폭에서 겹침·넘침·잘림·가로 스크롤을 측정한다.
 *
 *   node scripts/audit-layout.mjs [baseUrl] [경로...]
 *
 * 기본은 개발 서버의 /dev/* 미리보기 경로다(DB·로그인 없이 고정 데이터로 그린다).
 * 문제가 하나라도 있으면 종료 코드 1. 사람이 보기 전에 기계가 먼저 걸러 낸다.
 */
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
/** moa 에는 Playwright 가 의존성으로 없다. PW_MODULE(패키지 경로)과 CHROME_PATH(브라우저 실행 파일)로 지정할 수 있다. */
let chromium;
try {
  ({ chromium } = require(process.env.PW_MODULE ?? "@playwright/test"));
} catch {
  ({ chromium } = require("playwright-core"));
}

const BASE = process.argv[2] ?? "http://localhost:3210";
const PATHS = process.argv.slice(3).length ? process.argv.slice(3) : ["/dev/calendar", "/dev/calendar?view=week&day=2026-11-12"];
const WIDTHS = [1440, 1240, 1024, 768, 390, 360];
const SHOTS = process.env.SHOT_DIR;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

/** 브라우저 안에서 실행: 문제 목록을 돌려준다. */
function measure() {
  const problems = [];
  const rect = (e) => e.getBoundingClientRect();
  const visible = (e) => e.offsetParent !== null && rect(e).width > 0 && rect(e).height > 0;
  const label = (e) => `${e.tagName.toLowerCase()}[${(e.getAttribute("aria-label") || e.textContent || "").replace(/\s+/g, " ").trim().slice(0, 28)}]`;

  if (document.documentElement.scrollWidth > window.innerWidth + 1) problems.push(`가로 스크롤: scrollWidth=${document.documentElement.scrollWidth} > ${window.innerWidth}`);

  // 1) 같은 격자 안에서 서로 겹친 칩·블록
  const chips = [...document.querySelectorAll("a[aria-label],button[aria-label]")].filter((e) => visible(e) && e.closest("[role=grid]") && !e.matches("[role=gridcell],[role=columnheader]"));
  for (let i = 0; i < chips.length; i++) {
    for (let j = i + 1; j < chips.length; j++) {
      const a = rect(chips[i]);
      const b = rect(chips[j]);
      const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ox > 2 && oy > 2) problems.push(`겹침: ${label(chips[i])} × ${label(chips[j])} (${Math.round(ox)}×${Math.round(oy)}px)`);
    }
  }

  // 2) 칩 글자가 칩 밖으로 삐져나오거나 세로로 잘린 경우(줄바꿈 칩은 두 줄까지 허용)
  for (const e of chips) {
    if (e.scrollHeight > e.clientHeight + 2) problems.push(`세로 잘림: ${label(e)} (scrollH=${e.scrollHeight} > ${e.clientHeight})`);
  }

  // 3) 칸 밖으로 나간 칩
  for (const week of document.querySelectorAll("[role=grid] [role=row]")) {
    const wr = rect(week);
    for (const child of week.querySelectorAll("a[aria-label],button[aria-label]")) {
      if (!visible(child) || child.matches("[role=columnheader]")) continue;
      const r = rect(child);
      if (r.right > wr.right + 1 || r.left < wr.left - 1) problems.push(`격자 밖: ${label(child)} (${Math.round(r.left - wr.left)} ~ ${Math.round(r.right - wr.right)})`);
    }
  }

  // 4) 보이는 글자가 부모 상자 밖으로 흘러 넘침(말줄임/숨김 처리가 없는 경우만)
  for (const e of document.querySelectorAll("main *, body > div *")) {
    if (!visible(e) || e.children.length > 0) continue;
    const s = getComputedStyle(e);
    if (e.scrollWidth > e.clientWidth + 1 && s.overflowX === "visible" && s.display !== "inline" && !e.closest("[role=grid]") && e.clientWidth > 0) problems.push(`가로 넘침: ${label(e)}`);
  }

  // 5) 서로 다른 시간 블록 간 겹침은 1)에서 이미 잡힌다. 주간 시간표 블록이 열 밖으로 나갔는지
  for (const cell of document.querySelectorAll("[role=gridcell]")) {
    if (!visible(cell)) continue;
    const cr = rect(cell);
    for (const block of cell.querySelectorAll("a[aria-label],button[aria-label]")) {
      const r = rect(block);
      if (r.right > cr.right + 1 || r.left < cr.left - 1 || r.bottom > cr.bottom + 1) problems.push(`열 밖 블록: ${label(block)}`);
    }
  }
  return [...new Set(problems)];
}

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
let failed = 0;
for (const url of PATHS) {
  for (const scheme of ["light", "dark"]) {
    for (const width of WIDTHS) {
      if (scheme === "dark" && ![1440, 390].includes(width)) continue;
      const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: scheme });
      const page = await context.newPage();
      await page.goto(BASE + url, { waitUntil: "networkidle" });
      await page.waitForTimeout(400);
      const problems = await page.evaluate(measure);
      const tag = `${url} @${width} ${scheme}`;
      if (problems.length) {
        failed += problems.length;
        console.log(`FAIL ${tag}: ${problems.length}건`);
        for (const p of problems.slice(0, 12)) console.log(`     - ${p}`);
      } else console.log(`ok   ${tag}`);
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${url.replace(/[^a-z0-9]+/gi, "_")}-${width}-${scheme}.png`), fullPage: true });
      await context.close();
    }
  }
}
await browser.close();
console.log(failed ? `\n문제 ${failed}건` : "\n모든 화면 폭에서 겹침·넘침·잘림 없음");
process.exit(failed ? 1 : 0);
