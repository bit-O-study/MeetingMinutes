import { Card, SectionHeading } from "@/components/ui/Panels";
import { CreateSpaceForm } from "@/components/screens/CreateSpaceForm";
import { createSpace } from "@/lib/actions/spaces";

export default function NewSpacePage() {
  async function submit(_state: { error: string }, data: FormData) {
    "use server";
    const name = String(data.get("name") ?? "").trim();
    const kind = data.get("kind");
    // 빈 이름과 변조된 용도는 데이터 액션에 전달하기 전에 입력 화면에서 설명한다.
    if (!name || name.length > 120) return { error: "스페이스 이름을 1~120자로 입력해 주세요." };
    if (kind !== "study" && kind !== "handover" && kind !== "general") return { error: "용도를 선택해 주세요." };
    await createSpace({ name, kind });
    return { error: "" };
  }
  return <div className="mx-auto w-full max-w-xl px-5 py-8">
    <SectionHeading>새 스페이스</SectionHeading>
    <Card><CreateSpaceForm action={submit} /></Card>
  </div>;
}
