import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";

/** 목록은 기본 Tab 동작을 쓰고 일반 문단·제목만 여백으로 들여쓴다. */
export const ParagraphIndent = Extension.create({
  name: "paragraphIndent",
  priority: 50,
  addGlobalAttributes() {
    return [{
      types: ["paragraph", "heading"],
      attributes: {
        indent: {
          default: 0,
          parseHTML: (element) => Math.min(8, Math.max(0, Number(element.dataset.indent) || 0)),
          renderHTML: ({ indent }) => indent > 0
            ? { "data-indent": indent, style: `margin-left: ${Math.min(8, indent) * 2}em` }
            : {},
        },
      },
    }];
  },
  addKeyboardShortcuts() {
    const changeIndent = (delta: number) => {
      if (["listItem", "taskItem", "codeBlock"].some((name) => this.editor.isActive(name))) return false;
      const { state, view } = this.editor;
      const tr = state.tr;
      state.doc.nodesBetween(state.selection.from, state.selection.to, (node, pos) => {
        if (!["paragraph", "heading"].includes(node.type.name)) return;
        tr.setNodeAttribute(pos, "indent", Math.max(0, Math.min(8, (Number(node.attrs.indent) || 0) + delta)));
      });
      if (!tr.docChanged) return false;
      view.dispatch(tr);
      return true;
    };
    return { Tab: () => changeIndent(1), "Shift-Tab": () => changeIndent(-1) };
  },
});

/** HTML 서식은 기본 파서로 보존하고, 서식 없는 마크다운만 변환한다. */
export const PasteMarkdown = Extension.create({
  name: "pasteMarkdown",
  addProseMirrorPlugins() {
    let plainPaste = false;
    return [new Plugin({
      props: {
        handleKeyDown: (_view, event) => {
          plainPaste = event.shiftKey;
          return false;
        },
        handleDOMEvents: { keyup: () => { plainPaste = false; return false; } },
        handlePaste: (_view, event) => {
          if (plainPaste || this.editor.isActive("codeBlock")) return false;
          if (event.clipboardData?.getData("text/html")) return false;
          const text = event.clipboardData?.getData("text/plain") ?? "";
          if (!this.editor.markdown || !/(^|\n)\s*(#{1,6} |[-*+] |\d+[.)] |> |```)|\*\*[^*]+\*\*/.test(text)) return false;
          return this.editor.commands.insertContent(this.editor.markdown.parse(text));
        },
      },
    })];
  },
});
