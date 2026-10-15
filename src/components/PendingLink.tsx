"use client";
import NextLink, { useLinkStatus } from "next/link";
import type { ComponentProps } from "react";
function Progress() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return <span role="status" className="fixed inset-x-0 top-0 z-[100] flex justify-center bg-indigo-600 px-3 py-2 text-sm font-bold text-white shadow-lg"><span aria-hidden="true" className="mr-2 size-4 animate-spin rounded-full border-2 border-white/40 border-t-white motion-reduce:animate-none" />불러오는 중…</span>;
}
export default function PendingLink({ children, ...props }: ComponentProps<typeof NextLink>) {
  return <NextLink {...props}>{children}<Progress /></NextLink>;
}
