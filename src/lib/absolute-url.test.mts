import assert from "node:assert/strict";
import { test } from "node:test";
import { absoluteUrl } from "./utils.js";

const keys = ["NEXT_PUBLIC_APP_URL", "VERCEL_PROJECT_PRODUCTION_URL", "VERCEL_URL"] as const;
function withEnvironment(values: Partial<Record<(typeof keys)[number], string>>, run: () => void) {
  const previous = keys.map((key) => process.env[key]);
  try {
    for (const key of keys) {
      if (values[key] === undefined) delete process.env[key];
      else process.env[key] = values[key];
    }
    run();
  } finally {
    keys.forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key];
      else process.env[key] = previous[index];
    });
  }
}

test("설정한 앱 도메인을 우선해 초대와 공유 주소를 만든다", () => {
  withEnvironment({ NEXT_PUBLIC_APP_URL: "https://minutes.example", VERCEL_PROJECT_PRODUCTION_URL: "minutes.vercel.app" }, () => {
    assert.equal(absoluteUrl("/join/test"), "https://minutes.example/join/test");
    assert.equal(absoluteUrl("/p/test"), "https://minutes.example/p/test");
  });
});

test("빈 앱 주소나 공백이면 Vercel 운영 도메인을 사용한다", () => {
  for (const value of [undefined, "", "  "]) {
    withEnvironment({ ...(value === undefined ? {} : { NEXT_PUBLIC_APP_URL: value }), VERCEL_PROJECT_PRODUCTION_URL: "minutes.vercel.app", VERCEL_URL: "deployment.vercel.app" }, () => {
      assert.equal(absoluteUrl("/join/test"), "https://minutes.vercel.app/join/test");
    });
  }
});

test("프로토콜 없이 입력한 도메인과 앞뒤 공백을 정리한다", () => {
  withEnvironment({ NEXT_PUBLIC_APP_URL: "  minutes.example  " }, () => {
    assert.equal(absoluteUrl("/join/test"), "https://minutes.example/join/test");
  });
});

test("잘못된 앱 주소는 배포 도메인으로 대체한다", () => {
  for (const value of ["not a url", "https://", "ftp://minutes.example", "https://user:secret@minutes.example"]) {
    withEnvironment({ NEXT_PUBLIC_APP_URL: value, VERCEL_URL: "deployment.vercel.app" }, () => {
      assert.equal(absoluteUrl("/join/test"), "https://deployment.vercel.app/join/test");
    });
  }
});

test("배포 설정이 없는 로컬에서는 localhost를 사용한다", () => {
  withEnvironment({}, () => assert.equal(absoluteUrl("/join/test"), "http://localhost:3000/join/test"));
});
