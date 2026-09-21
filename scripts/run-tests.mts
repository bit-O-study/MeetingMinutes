/**
 * 테스트 러너.
 *
 *   npm run test
 *
 * 셸 글롭을 인자로 넘기는 방식으로는 돌지 않는다. 펼치는 주체가 없어서다 —
 * node의 테스트 러너가 경로 글롭을 직접 받는 건 Node 22부터고(여기는 20),
 * npm 스크립트는 Windows에서 cmd.exe로 실행돼 셸 글롭도 펼쳐지지 않는다.
 * 그래서 파일을 직접 찾아 한 프로세스에서 import 한다. node:test가 알아서
 * 모아 실행하고, 하나라도 실패하면 종료 코드가 0이 아니다.
 */
import { readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(import.meta.dirname, "..", "src");

function findTests(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...findTests(full));
    else if (entry.name.endsWith(".test.mts")) found.push(full);
  }
  return found.sort();
}

const files = findTests(ROOT);
if (files.length === 0) {
  console.error(`테스트 파일이 없다: ${ROOT}`);
  process.exit(1);
}

for (const file of files) {
  await import(pathToFileURL(file).href);
}
