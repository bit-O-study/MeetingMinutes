import TaskItem from "@tiptap/extension-task-item";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { nanoid } from "nanoid";

/**
 * 본문 체크박스에 안정적인 id를 붙인다.
 *
 * 이 id가 tasks 레코드와의 유일한 연결 고리다(tasks.blockId).
 * 없으면 "세 번째 체크박스" 같은 위치 기반으로 맞춰야 하는데,
 * 위에 항목이 하나 추가되는 순간 전부 어긋난다.
 */
export const TaskItemWithId = TaskItem.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      blockId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-block-id"),
        renderHTML: (attributes) =>
          attributes.blockId ? { "data-block-id": attributes.blockId } : {},
        // 항목을 쪼개면 새 항목은 새 id를 받아야 한다. 물려받으면 둘이 같은 tasks 행을 본다.
        keepOnSplit: false,
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      ...(this.parent?.() ?? []),
      new Plugin({
        key: new PluginKey("taskItemBlockId"),

        /**
         * id가 없거나 중복인 체크박스에 id를 부여한다.
         * 복사·붙여넣기로 같은 id가 둘이 되면 한쪽을 새로 발급한다.
         *
         * 공동 편집에서는 여러 클라이언트가 동시에 id를 매길 수 있지만,
         * Yjs가 속성 변경을 병합하면서 하나로 수렴한다.
         */
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some((tr) => tr.docChanged)) return null;

          const tr = newState.tr;
          const seen = new Set<string>();
          let changed = false;

          newState.doc.descendants((node, pos) => {
            if (node.type.name !== this.name) return;

            const id: string | null = node.attrs.blockId;
            if (!id || seen.has(id)) {
              const fresh = nanoid(10);
              tr.setNodeAttribute(pos, "blockId", fresh);
              seen.add(fresh);
              changed = true;
            } else {
              seen.add(id);
            }
          });

          return changed ? tr : null;
        },
      }),
    ];
  },
});

export type DocTask = {
  blockId: string;
  body: string;
  checked: boolean;
};

/** 문서에서 체크박스를 순서대로 읽어 낸다. 순서가 곧 tasks.sortOrder다. */
export function collectDocTasks(doc: {
  descendants: (fn: (node: DocNode) => void) => void;
}): DocTask[] {
  const out: DocTask[] = [];

  doc.descendants((node) => {
    if (node.type.name !== "taskItem") return;
    const blockId = node.attrs.blockId;
    if (!blockId) return;
    out.push({
      blockId,
      body: node.textContent.trim(),
      checked: Boolean(node.attrs.checked),
    });
  });

  return out;
}

type DocNode = {
  type: { name: string };
  attrs: Record<string, unknown> & { blockId?: string | null; checked?: boolean };
  textContent: string;
};
