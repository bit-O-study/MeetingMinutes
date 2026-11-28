/** 한글 조합 중에는 앱의 부수적인 편집 작업이 입력 DOM을 건드리지 않게 한다. */
export function createCompositionQueue(isComposing: () => boolean) {
  const jobs = new Map<string, () => void>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  function flush() {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!jobs.size) return;
    if (isComposing()) {
      timer = setTimeout(flush, 50);
      return;
    }
    const ready = [...jobs.values()];
    jobs.clear();
    for (const job of ready) job();
  }

  return {
    run(key: string, job: () => void) {
      // 연속으로 받은 체크 상태나 화면 크기는 마지막 값만 반영한다.
      jobs.set(key, job);
      flush();
    },
    cancel(key?: string) {
      if (key === undefined) jobs.clear();
      else jobs.delete(key);
      if (!jobs.size && timer) { clearTimeout(timer); timer = null; }
    },
  };
}
