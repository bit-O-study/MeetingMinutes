import assert from "node:assert/strict";
import { test } from "node:test";
import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import { TaskItemWithId, collectDocTasks } from "./TaskItemWithId.js";
import { ParagraphIndent } from "./EditingExtensions.js";

const schema = getSchema([StarterKit, TaskList, TaskItemWithId.configure({ nested: true }), ParagraphIndent]);
const p = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });

test("중첩 체크박스는 부모 본문에 섞이지 않고 각자의 할 일이 된다", () => {
  const doc = schema.nodeFromJSON({ type: "doc", content: [{ type: "taskList", content: [{
    type: "taskItem", attrs: { blockId: "parent", checked: false }, content: [p("부모"), p("추가 설명"), {
      type: "taskList", content: [{ type: "taskItem", attrs: { blockId: "child", checked: true }, content: [p("자식")] }],
    }],
  }] }] });
  doc.check();
  assert.deepEqual(collectDocTasks(doc), [
    { blockId: "parent", body: "부모\n추가 설명", checked: false },
    { blockId: "child", body: "자식", checked: true },
  ]);
});

test("문단과 제목의 들여쓰기가 JSON 왕복에서 유지된다", () => {
  const doc = schema.nodeFromJSON({ type: "doc", content: [
    { ...p("문단"), attrs: { indent: 2 } },
    { type: "heading", attrs: { level: 1, indent: 1 }, content: [{ type: "text", text: "제목" }] },
  ] });
  const restored = schema.nodeFromJSON(doc.toJSON());
  restored.check();
  assert.equal(restored.child(0).attrs.indent, 2);
  assert.equal(restored.child(1).attrs.indent, 1);
});