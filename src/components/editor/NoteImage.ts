import { Node, mergeAttributes } from "@tiptap/core";
import { noteImageUrl } from "@/lib/note-image";

export const NoteImage = Node.create({
  name: "image",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return { src: { default: null }, alt: { default: "" }, title: { default: null } };
  },
  parseHTML() {
    return [{ tag: "img[src]", getAttrs: (element) => noteImageUrl(element.getAttribute("src")) ? {} : false }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["img", mergeAttributes(HTMLAttributes, {
      src: noteImageUrl(HTMLAttributes.src) ?? undefined,
      loading: "lazy",
      class: "note-image",
    })];
  },
});
