/**
 * 변경 이력 기록을 실제로 확인한다 (브라우저 없이).
 *
 *   REVISION_SETTLE_MS=2000 npm run collab      # 다른 터미널
 *   npm run check:revisions
 *
 * 헤드리스 Yjs 클라이언트로 공동 편집 서버에 붙어 문서를 고치고,
 * 서버가 note_revisions에 제대로 남기는지 본다.
 *
 * 매번 새 노트를 만들어 쓰고 지운다. 기존 노트를 쓰면 이전 실행이 남긴
 * 문서 상태 때문에 요약이 달라져 결과를 믿을 수 없다.
 */
import "./load-env.mjs";

import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import WebSocket from "ws";
import { asc, eq } from "drizzle-orm";

import { db, sql } from "../src/lib/db";
import { noteDocs, noteRevisions, notes, spaces, users } from "../src/lib/db/schema";

const URL = "ws://localhost:1234";
const SETTLE = 4500;

const [space] = await db.select().from(spaces).limit(1);
const [actor] = await db.select({ id: users.id, name: users.name }).from(users).limit(1);
if (!space || !actor) throw new Error("scripts/dev-session.mts를 먼저 실행하세요.");

const [note] = await db
  .insert(notes)
  .values({
    spaceId: space.id,
    title: "이력 검증용 임시 노트",
    template: "blank",
    createdBy: actor.id,
    updatedBy: actor.id,
  })
  .returning();
await db.insert(noteDocs).values({ noteId: note.id });

console.log(`임시 노트 ${note.id.slice(0, 8)} · 사용자 ${actor.name}\n`);

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`  ${ok ? "✔" : "✘"} ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures++;
};

try {
  const doc = new Y.Doc();
  const provider = new WebsocketProvider(URL, note.id, doc, {
    WebSocketPolyfill: WebSocket as never,
  });
  provider.awareness.setLocalStateField("user", {
    id: actor.id,
    name: actor.name,
    color: "#ab4e2c",
  });

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("연결 실패 — collab 서버가 떠 있나요?")), 15000);
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    if (provider.synced) done();
    else provider.once("sync", done);
  });

  const frag = doc.getXmlFragment("default");

  doc.transact(() => {
    frag.insert(0, [
      el("heading", "배운 것", { level: "2" }),
      el("paragraph", "useEffect 의존성 배열"),
      el("heading", "막힌 것 · 질문", { level: "2" }),
      el("paragraph", "cleanup 실행 시점"),
    ]);
  });
  console.log("1차 편집 — 두 구획 작성");
  await wait(SETTLE);

  doc.transact(() => {
    const p = frag.get(3) as Y.XmlElement;
    const t = p.get(0) as Y.XmlText;
    t.insert(t.length, " 과 useLayoutEffect 차이");
  });
  console.log("2차 편집 — 막힌 것 · 질문만 수정");
  await wait(SETTLE);

  // 3차: 문서는 바뀌지만 읽히는 내용은 그대로다. 이력이 늘면 안 된다.
  doc.transact(() => {
    (frag.get(0) as Y.XmlElement).setAttribute("data-noop", String(Date.now()));
  });
  console.log("3차 — 내용 변화 없는 갱신\n");
  await wait(SETTLE);

  const revs = await db
    .select()
    .from(noteRevisions)
    .where(eq(noteRevisions.noteId, note.id))
    .orderBy(asc(noteRevisions.createdAt));

  console.log(`기록된 이력 ${revs.length}건`);
  for (const r of revs) console.log(`  · ${r.summary}`);
  console.log();

  check("편집 두 번에 이력 두 건", revs.length === 2, `${revs.length}건`);
  check("첫 편집은 노트 작성", revs[0]?.summary === "노트 작성", revs[0]?.summary ?? "-");
  check(
    "둘째 편집은 바뀐 구획만 짚는다",
    revs[1]?.summary === "막힌 것 · 질문 수정",
    revs[1]?.summary ?? "-",
  );
  check("작성자가 기록된다", revs.every((r) => r.actorId === actor.id));
  check("되돌리기용 내용이 담긴다", revs.every((r) => r.content != null));
  check("되돌리기 표시는 꺼져 있다", revs.every((r) => r.isRevert === false));

  provider.destroy();
  doc.destroy();
} finally {
  await db.delete(notes).where(eq(notes.id, note.id));
  console.log("\n임시 노트 정리 완료");
}

console.log(failures === 0 ? "\n✅ 통과" : `\n❌ ${failures}건 실패`);
await sql.end({ timeout: 3 });
process.exit(failures === 0 ? 0 : 1);

/** ProseMirror 노드를 Yjs XmlElement로 만든다. */
function el(name: string, text: string, attrs: Record<string, string> = {}) {
  const node = new Y.XmlElement(name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  const t = new Y.XmlText();
  t.insert(0, text);
  node.insert(0, [t]);
  return node;
}

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
