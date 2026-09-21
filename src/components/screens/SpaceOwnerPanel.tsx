import { ActionSubmit } from "@/components/screens/ActionSubmit";
import { renameSpace, deleteSpace } from "@/lib/actions/spaces";

/** 소유자 설정을 멤버 관리와 분리해 노트 목록에서도 바로 찾을 수 있게 한다. */
export function SpaceOwnerPanel({ spaceId, name }: { spaceId: string; name: string }) {
  return (
    <details className="rounded border border-line bg-surface px-4 py-3">
      <summary className="cursor-pointer text-sm font-medium text-ink">스페이스 설정</summary>
      <div className="mt-4 space-y-5">
        <form className="space-y-2" action={async (data: FormData) => {
          "use server";
          const nextName = String(data.get("name") ?? "").trim();
          if (!nextName || nextName.length > 120) throw new Error("스페이스 이름을 1~120자로 입력해 주세요.");
          await renameSpace(spaceId, nextName);
        }}>
          <label htmlFor="rename-space" className="block text-xs text-ink-2">스페이스 이름</label>
          <input id="rename-space" name="name" defaultValue={name} required maxLength={120} pattern={".*\\S.*"} title="공백이 아닌 문자를 포함해 1~120자로 입력해 주세요."
            className="w-full rounded border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none" />
          <ActionSubmit>이름 변경</ActionSubmit>
        </form>
        <div className="space-y-2 border-t border-line pt-3">
          <p className="text-xs text-ink-3">삭제하면 멤버 모두 이 스페이스의 노트에 접근할 수 없게 됩니다.</p>
          <form action={deleteSpace.bind(null, spaceId)}>
            <ActionSubmit confirmation="이 스페이스와 모든 노트를 목록에서 삭제할까요?">스페이스 삭제</ActionSubmit>
          </form>
        </div>
      </div>
    </details>
  );
}
