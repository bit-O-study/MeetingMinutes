/**
 * notes.plain_text 재계산 (1회성)
 *
 *   npx tsx scripts/backfill-plain-text.mts            # 바뀔 건수만 센다(쓰지 않음)
 *   npx tsx scripts/backfill-plain-text.mts --apply    # 실제로 고친다
 *
 * docToPlainText가 서식 경계에서 단어를 쪼개던 문제("회의 록")를 고친 뒤,
 * 이미 저장된 노트의 검색용 평문을 새 규칙으로 다시 만든다. 본문(content)은 건드리지 않는다.
 *
 * 연결 대상은 .env.local / .env의 DATABASE_URL이다. 그게 운영 DB일 수 있으므로
 * 기본은 읽기만 하고, 접속한 호스트를 먼저 출력한다. --apply는 확인한 뒤에만 붙인다.
 */
import "./load-env.mjs";

import { eq } from "drizzle-orm";

import { db, sql } from "../src/lib/db";
import { notes } from "../src/lib/db/schema";
import { docToPlainText } from "../src/lib/templates";

const apply = process.argv.includes("--apply");
const host = (() => {
  try { return new URL(process.env.DATABASE_URL ?? "").host; } catch { return "(알 수 없음)"; }
})();
console.log(`대상 DB: ${host} · 모드: ${apply ? "적용" : "미리보기(쓰지 않음)"}`);

const BATCH = 200;
let offset = 0;
let checked = 0;
let changed = 0;

try {
  for (;;) {
    const rows = await db
      .select({ id: notes.id, content: notes.content, plainText: notes.plainText })
      .from(notes)
      .orderBy(notes.id)
      .limit(BATCH)
      .offset(offset);
    if (rows.length === 0) break;
    offset += rows.length;

    for (const row of rows) {
      checked++;
      const next = docToPlainText(row.content);
      if (next === row.plainText) continue;
      changed++;
      if (apply) await db.update(notes).set({ plainText: next }).where(eq(notes.id, row.id));
    }
  }
  console.log(`확인 ${checked}건 · ${apply ? "고침" : "고칠 대상"} ${changed}건`);
} finally {
  await sql.end();
}
