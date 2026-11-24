import { ActionSubmit } from "@/components/screens/ActionSubmit";
import { renameSpace, deleteSpace } from "@/lib/actions/spaces";
import styles from "./Form.module.css";

/** 소유자 설정을 멤버 관리와 분리해 노트 목록에서도 바로 찾을 수 있게 한다. */
export function SpaceOwnerPanel({ spaceId, name }: { spaceId: string; name: string }) {
  return (
    <details className="rounded-2xl ring-1 ring-inset ring-line bg-surface px-4 py-3">
      <summary className="cursor-pointer py-2 text-sm font-medium text-ink">프로젝트 설정</summary>
      <div className="mt-4 space-y-5">
        <form className="space-y-2" action={async (data: FormData) => {
          "use server";
          const nextName = String(data.get("name") ?? "").trim();
          if (!nextName || nextName.length > 120) throw new Error("프로젝트 이름을 1~120자로 입력해 주세요.");
          await renameSpace(spaceId, nextName);
        }}>
          <label htmlFor="rename-space" className={styles.label}>프로젝트 이름</label>
          <input id="rename-space" name="name" defaultValue={name} required maxLength={120} pattern={".*\\S.*"} title="공백이 아닌 문자를 포함해 1~120자로 입력해 주세요."
            className={styles.input} />
          <ActionSubmit>이름 변경</ActionSubmit>
        </form>
        <div className="space-y-2 border-t border-line pt-3">
          <p className="text-xs leading-relaxed text-ink-2">삭제하면 멤버 모두 이 프로젝트의 노트에 접근할 수 없게 됩니다.</p>
          <form action={deleteSpace.bind(null, spaceId)}>
            <ActionSubmit confirmation="이 프로젝트와 모든 노트를 목록에서 삭제할까요?">프로젝트 삭제</ActionSubmit>
          </form>
        </div>
      </div>
    </details>
  );
}
