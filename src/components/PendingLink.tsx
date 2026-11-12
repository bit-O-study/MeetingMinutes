"use client";
import NextLink, { useLinkStatus } from "next/link";
import type { ComponentProps } from "react";
import { LogoMark } from "./ui/Logo";
import styles from "./PendingLink.module.css";
function Progress() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  // 문구 대신 로고. 화면 리더에는 aria-label 로만 알린다.
  return <span role="status" aria-label="불러오는 중" className={`${styles.delayed} pointer-events-none fixed inset-0 z-[100] flex items-center justify-center`}><LogoMark size={56} className="animate-pulse drop-shadow-lg motion-reduce:animate-none" /></span>;
}
export default function PendingLink({ children, ...props }: ComponentProps<typeof NextLink>) {
  return <NextLink {...props}>{children}<Progress /></NextLink>;
}
