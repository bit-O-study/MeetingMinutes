/**
 * ┌─────────────────────────────────────────────────────────────┐
 * │  S-03 · 노트 편집        담당: CLAUDE                        │
 * └─────────────────────────────────────────────────────────────┘
 *
 * 본문 + 우측 보조 패널 2분할.
 * 1차는 할 일, 2차는 댓글, 3차는 전사 타임라인이 같은 자리에 들어간다.
 * 단일 컬럼으로 바꾸지 말 것 — 기능이 늘 때마다 핵심 화면을 다시 짜게 된다.
 */
import { eq } from "drizzle-orm";

import { NoteHeader } from "@/components/editor/NoteHeader";
import { NoteWorkspace } from "@/components/editor/NoteWorkspace";
import { userColor } from "@/components/ui/Avatar";
import { requireNoteAccess } from "@/lib/access";
import { db } from "@/lib/db";
import { spaceMembers, tasks, users } from "@/lib/db/schema";
import { relativeTime } from "@/lib/utils";

export default async function NotePage({ params }: PageProps<"/s/[spaceId]/n/[noteId]">) {
  const { spaceId, noteId } = await params;
  const { note, space, userId } = await requireNoteAccess(noteId);

  const [[me], noteTasks, members] = await Promise.all([
    db.select().from(users).where(eq(users.id, userId)).limit(1),
    db.select().from(tasks).where(eq(tasks.noteId, noteId)).orderBy(tasks.sortOrder),
    // 담당자로 고를 수 있는 사람 = 이 스페이스 멤버. 권한은 위에서 이미 확인했다.
    db
      .select({ id: users.id, name: users.name, image: users.image })
      .from(spaceMembers)
      .innerJoin(users, eq(users.id, spaceMembers.userId))
      .where(eq(spaceMembers.spaceId, space.id))
      .orderBy(spaceMembers.joinedAt),
  ]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <NoteHeader
        noteId={note.id}
        spaceId={spaceId}
        spaceName={space.name}
        title={note.title}
        status={note.status}
        updatedLabel={`${relativeTime(note.updatedAt)} 수정`}
        taskCount={noteTasks.length}
      />

      <NoteWorkspace
        noteId={note.id}
        initialContent={note.content}
        initialTasks={noteTasks}
        members={members}
        me={{
          id: userId,
          name: me?.name ?? "익명",
          image: me?.image ?? null,
          color: userColor(userId),
        }}
      />
    </div>
  );
}
