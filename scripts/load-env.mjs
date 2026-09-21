/**
 * 스크립트·개발 서버용 환경변수 로더.
 *
 * Next는 `.env.local`과 `.env`를 둘 다 읽는다(앞이 이긴다). 반면 node의
 * `--env-file`은 파일 하나만 받고, 없는 파일을 주면 그대로 죽는다. 그래서
 * DATABASE_URL이 `.env`에 있으면 `npm run collab`도 drizzle-kit도
 * 연결 문자열을 못 찾는다 — 앱은 멀쩡한데 도구만 죽어서 원인을 찾기 어렵다.
 *
 * db 모듈을 import 하기 전에 환경변수가 올라와 있어야 해서 별도 모듈로 뺐다.
 * ESM은 본문보다 import 된 모듈을 먼저 실행하므로, 맨 위에 두기만 하면 된다.
 */
import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });
