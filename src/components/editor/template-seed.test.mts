import assert from "node:assert/strict";
import { test } from "node:test";
import * as Y from "yjs";
import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import { yXmlFragmentToProsemirrorJSON } from "y-prosemirror";
import { TaskItemWithId } from "./TaskItemWithId.js";
import { COLLAB_FIELD, templateSeedUpdate } from "./template-seed.js";
import { buildTemplateDoc } from "../../lib/templates.js";

const schema = getSchema([StarterKit, TaskList, TaskItemWithId.configure({ nested: true })]);

test("두 사람이 동시에 템플릿을 심어도 한 벌만 남는다", () => {
  // 회귀: 새 노트를 둘이 동시에 처음 열면 템플릿이 두 번 들어갔다.
  const content = buildTemplateDoc("study", 3);
  const a = new Y.Doc();
  const b = new Y.Doc();
  Y.applyUpdate(a, templateSeedUpdate(schema, content, "note-1"));
  Y.applyUpdate(b, templateSeedUpdate(schema, content, "note-1"));
  // 서로의 업데이트를 주고받는다.
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));

  const once = new Y.Doc();
  Y.applyUpdate(once, templateSeedUpdate(schema, content, "note-1"));
  const expected = yXmlFragmentToProsemirrorJSON(once.getXmlFragment(COLLAB_FIELD));
  assert.deepEqual(yXmlFragmentToProsemirrorJSON(a.getXmlFragment(COLLAB_FIELD)), expected);
  assert.deepEqual(yXmlFragmentToProsemirrorJSON(b.getXmlFragment(COLLAB_FIELD)), expected);
  assert.equal(a.getXmlFragment(COLLAB_FIELD).length, content.content.length);
});

test("다른 노트는 다른 clientID로 심는다", () => {
  const content = buildTemplateDoc("blank");
  const a = Y.decodeUpdate(templateSeedUpdate(schema, content, "note-1"));
  const b = Y.decodeUpdate(templateSeedUpdate(schema, content, "note-2"));
  assert.notEqual(a.structs[0].id.client, b.structs[0].id.client);
});
