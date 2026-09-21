import { Fragment } from "react";

/**
 * 노트 본문을 읽기 전용으로 그린다.
 *
 * Tiptap을 쓰지 않고 JSON을 직접 그린다. 공유 링크로 들어온 사람에게
 * 편집기 코드를 통째로 내려보낼 이유가 없다 — 페이지가 무거워지고,
 * 편집 경로가 브라우저에 존재한다는 것만으로도 사고 여지가 생긴다.
 *
 * `.tiptap` 클래스를 그대로 씌워 편집 화면과 같은 모양을 얻는다.
 */

type Mark = { type: string; attrs?: Record<string, unknown> };
type Node = {
  type?: string;
  attrs?: Record<string, unknown>;
  text?: string;
  marks?: Mark[];
  content?: Node[];
};

export function ReadOnlyNote({ content }: { content: unknown }) {
  const doc = content as Node | null;
  if (!doc?.content?.length) {
    return <p className="text-sm text-ink-3">내용이 없습니다.</p>;
  }

  return <div className="tiptap">{doc.content.map(render)}</div>;
}

function render(node: Node, index: number): React.ReactNode {
  const key = index;
  const kids = () => node.content?.map(render);

  switch (node.type) {
    case "text":
      return <Fragment key={key}>{applyMarks(node)}</Fragment>;

    case "heading": {
      const level = Number(node.attrs?.level ?? 2);
      const Tag = (["h1", "h2", "h3", "h4", "h5", "h6"][Math.min(level, 6) - 1] ??
        "h2") as "h2";
      return <Tag key={key}>{kids()}</Tag>;
    }

    case "paragraph":
      return <p key={key}>{kids()}</p>;

    case "blockquote":
      return <blockquote key={key}>{kids()}</blockquote>;

    case "bulletList":
      return <ul key={key}>{kids()}</ul>;

    case "orderedList":
      return <ol key={key}>{kids()}</ol>;

    case "listItem":
      return <li key={key}>{kids()}</li>;

    case "taskList":
      return (
        <ul key={key} data-type="taskList">
          {kids()}
        </ul>
      );

    case "taskItem": {
      const checked = Boolean(node.attrs?.checked);
      return (
        // 체크박스는 보여 주되 누를 수 없다. 할 일 관리는 멤버의 몫이다.
        <li key={key} data-checked={checked}>
          <label>
            <input type="checkbox" checked={checked} disabled readOnly />
          </label>
          <div>{kids()}</div>
        </li>
      );
    }

    case "codeBlock":
      return (
        <pre key={key}>
          <code>{kids()}</code>
        </pre>
      );

    case "horizontalRule":
      return <hr key={key} />;

    case "hardBreak":
      return <br key={key} />;

    default:
      // 모르는 노드도 내용은 살린다. 빈 화면보다 낫다.
      return node.content ? <Fragment key={key}>{kids()}</Fragment> : null;
  }
}

function applyMarks(node: Node): React.ReactNode {
  let out: React.ReactNode = node.text ?? "";

  for (const mark of node.marks ?? []) {
    switch (mark.type) {
      case "bold":
        out = <strong>{out}</strong>;
        break;
      case "italic":
        out = <em>{out}</em>;
        break;
      case "strike":
        out = <s>{out}</s>;
        break;
      case "underline":
        out = <u>{out}</u>;
        break;
      case "code":
        out = <code>{out}</code>;
        break;
      case "link": {
        const href = String(mark.attrs?.href ?? "");
        // 외부로 나가는 링크다. 원본 탭을 조작하지 못하게 막는다.
        out = href ? (
          <a href={href} target="_blank" rel="noopener noreferrer nofollow">
            {out}
          </a>
        ) : (
          out
        );
        break;
      }
    }
  }

  return out;
}
