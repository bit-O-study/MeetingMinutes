export type LatestSync<T> = ((value: T) => Promise<void>) & {
  /**
   * 마지막으로 저장한 상태를 잊는다. DB 쪽이 따로 바뀌었을 때(패널에서 체크,
   * 다른 화면에서 완료) 부른다. 안 부르면 본문이 예전 상태로 "돌아온" 순간
   * 이전 저장과 같은 값이라며 전송을 건너뛰어, DB에 반영되지 않는다.
   */
  reset: () => void;
};

/** 같은 상태의 중복 전송을 생략하고, 진행 중에는 가장 최근 상태만 이어서 보낸다. */
export function createLatestSync<T>(save: (value: T) => Promise<void>, onError: (error: unknown) => void): LatestSync<T> {
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
  const sync = (value: T): Promise<void> => {
    latest = { value, key: JSON.stringify(value) };
    if (!running) { running = true; completion = drain(); }
    return completion;
  };
  sync.reset = () => { savedKey = undefined; };
  return sync;
}
