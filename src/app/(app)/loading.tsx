import { LogoMark } from "@/components/ui/Logo";

// 글자 대신 로고를 보여 준다. 탭 이동마다 "불러오는 중" 문구가 번쩍이면 거슬려서(2026-11-11).
export default function Loading() {
  return (
    <div role="status" aria-label="불러오는 중" className="flex flex-1 items-center justify-center p-6">
      <LogoMark size={56} className="animate-pulse motion-reduce:animate-none" />
    </div>
  );
}
