export type ProjectFolder = { id: string; name: string };
export type ProjectFolders = { folders: ProjectFolder[]; assignments: Record<string, string> };

export function readProjectFolders(raw: string | null): ProjectFolders {
  if (!raw) return { folders: [], assignments: {} };
  const value = JSON.parse(raw);
  if (!value || !Array.isArray(value.folders) || !value.assignments || typeof value.assignments !== "object") {
    throw new Error("폴더 데이터 형식 오류");
  }
  const ids = new Set<string>();
  const folders: ProjectFolder[] = value.folders.map((folder: ProjectFolder) => {
    if (!folder || typeof folder.id !== "string" || !folder.id || ids.has(folder.id) ||
      typeof folder.name !== "string" || !folder.name.trim() || folder.name.length > 40) {
      throw new Error("폴더 데이터 형식 오류");
    }
    ids.add(folder.id);
    return { id: folder.id, name: folder.name };
  });
  // 더 이상 없는 폴더의 연결은 무시해 프로젝트가 목록에서 사라지지 않게 한다.
  const assignments = Object.fromEntries(Object.entries(value.assignments)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string" && ids.has(entry[1])));
  return { folders, assignments };
}
