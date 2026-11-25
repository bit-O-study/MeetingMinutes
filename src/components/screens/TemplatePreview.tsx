import { buildTemplateDoc } from "@/lib/templates";
import type { TemplateKind } from "@/lib/db/schema";
import type { ReactNode } from "react";
import styles from "./TemplatePreview.module.css";

type PreviewNode = { type?: string; text?: string; content?: PreviewNode[] };

function renderNode(node: PreviewNode, key: number): ReactNode {
  const children = node.content?.map(renderNode);
  // 템플릿 문자열을 HTML로 삽입하지 않고 읽기 전용 요소로 표시한다.
  switch (node.type) {
    case "text": return node.text ?? "";
    case "heading": return <h3 key={key}>{children}</h3>;
    case "paragraph": return <p key={key}>{children || <span className={styles.placeholder}>내용을 입력할 자리</span>}</p>;
    case "blockquote": return <blockquote key={key}>{children}</blockquote>;
    case "taskList": return <ul key={key} className={styles.checklist}>{children}</ul>;
    case "taskItem": return <li key={key}><span aria-hidden="true">☐</span><div>{children}</div></li>;
    default: return <div key={key}>{children}</div>;
  }
}

export function TemplatePreview({ kind, sessionNo }: { kind: TemplateKind; sessionNo?: number }) {
  if (kind === "blank") return <p className={styles.blank}>정해진 구획 없이 빈 본문에서 자유롭게 작성합니다.</p>;
  const doc = buildTemplateDoc(kind, sessionNo);
  return <div className={styles.document}>{(doc.content as PreviewNode[]).map(renderNode)}</div>;
}
