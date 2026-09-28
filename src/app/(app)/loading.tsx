export default function Loading() {
  return (
    <div role="status" className="flex flex-1 flex-col gap-4 p-6 text-sm text-ink-3">
      <p>불러오는 중…</p>
      <div aria-hidden="true" className="h-8 w-1/3 rounded bg-surface-2" />
      <div aria-hidden="true" className="h-32 rounded bg-surface-2" />
    </div>
  );
}
