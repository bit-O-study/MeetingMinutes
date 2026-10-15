/** 같은 상태의 중복 전송을 생략하고, 진행 중에는 가장 최근 상태만 이어서 보낸다. */
export function createLatestSync<T>(save: (value: T) => Promise<void>, onError: (error: unknown) => void) {
  let latest: { value: T; key: string } | undefined;
  let savedKey: string | undefined;
  let running = false;
  let completion: Promise<void> = Promise.resolve();
  async function drain() {
    try { while (latest) {
      const next = latest;
      latest = undefined;
      if (next.key === savedKey) continue;
      try { await save(next.value); savedKey = next.key; }
      catch (error) { onError(error); }
    } } finally { running = false; }
  }
  return (value: T): Promise<void> => {
    latest = { value, key: JSON.stringify(value) };
    if (!running) { running = true; completion = drain(); }
    return completion;
  };
}
