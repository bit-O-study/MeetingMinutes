import "./load-env.mjs";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { eq, inArray } from "drizzle-orm";
import { db, sql } from "../src/lib/db/index.ts";
import { users, spaces, spaceMembers, sessions, issues } from "../src/lib/db/schema.ts";

const require=createRequire(import.meta.url);
const { chromium }=require(process.env.PLAYWRIGHT_MODULE ?? "../../trip/node_modules/@playwright/test");
const base=process.env.ISSUES_TEST_URL ?? "http://localhost:3125";
const ids=[randomUUID(),randomUUID(),randomUUID()], spaceIds=[randomUUID(),randomUUID()];
const tokens=ids.map(()=>randomBytes(32).toString('hex'));
let browser;
try {
  await db.insert(users).values(ids.map((id,index)=>({id,name:['이슈 소유자','이슈 멤버','외부 사용자'][index],email:`issues-${id}@example.invalid`})));
  await db.insert(spaces).values(spaceIds.map((id,index)=>({id,name:`이슈 검증 ${index}`,ownerId:ids[index===0?0:2]})));
  await db.insert(spaceMembers).values([{spaceId:spaceIds[0],userId:ids[0],role:'owner'},{spaceId:spaceIds[0],userId:ids[1],role:'member'},{spaceId:spaceIds[1],userId:ids[2],role:'owner'}]);
  await db.insert(sessions).values(tokens.map((sessionToken,index)=>({sessionToken,userId:ids[index],expires:new Date(Date.now()+900000)})));
  const [foreign]=await db.insert(issues).values({spaceId:spaceIds[1],title:'외부 비공개 이슈',createdBy:ids[2]}).returning();
  browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL ?? 'msedge'});
  const context=await browser.newContext({viewport:{width:390,height:844}});
  await context.addCookies([{name:'__Secure-authjs.session-token',value:tokens[0],domain:new URL(base).hostname,path:"/",secure:true,httpOnly:true,sameSite:'Lax'}]);
  const page=await context.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  const route=`${base}/s/${spaceIds[0]}?tab=issues`;
  await page.goto(route); await page.getByRole('button',{name:'+ 새 이슈',exact:true}).click();
  const form=page.locator('form').filter({has:page.getByRole('button',{name:'이슈 등록',exact:true})});
  await form.getByLabel('제목',{exact:true}).fill('모바일 일정 오류');
  await form.getByLabel('내용',{exact:true}).fill('작은 화면에서 버튼이 겹치는 문제');
  await form.getByLabel('우선순위').selectOption('high');
  await form.getByLabel('담당자').selectOption(ids[1]);
  await form.getByRole('button',{name:'이슈 등록',exact:true}).click();
  await page.getByRole('heading',{name:'모바일 일정 오류',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.setViewportSize({width:320,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.getByRole('button',{name:'등록 닫기'}).click();
  let [saved]=await db.select().from(issues).where(eq(issues.spaceId,spaceIds[0]));
  assert.equal(saved.assigneeId,ids[1]); assert.equal(saved.priority,'high');
  console.log('PASS 새 스페이스 이슈 등록·담당자·모바일 레이아웃');

  await page.getByText('이슈 편집',{exact:true}).click();
  const edit=page.locator('form').filter({has:page.getByRole('button',{name:'이슈 수정',exact:true})});
  await edit.locator('select[name="status"]').selectOption('in_progress');
  await edit.getByRole('button',{name:'이슈 수정',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('input[name="version"]')?.value==='2');
  const stale=await context.newPage(); await stale.goto(route); await stale.getByText('이슈 편집',{exact:true}).click();
  await edit.locator('select[name="status"]').selectOption('closed');
  await edit.getByRole('button',{name:'이슈 수정',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('input[name="version"]')?.value==='3');
  await stale.getByRole('button',{name:'이슈 수정',exact:true}).click();
  await stale.getByRole('alert').filter({hasText:'이슈가 변경되었거나'}).waitFor();
  await page.getByRole('link',{name:'열림',exact:true}).click();
  await page.getByText('표시할 이슈가 없습니다.').waitFor();
  console.log('PASS 상태 필터·수정·동시 수정 충돌');

  const outsider=await browser.newContext();
  await outsider.addCookies([{name:'__Secure-authjs.session-token',value:tokens[2],domain:new URL(base).hostname,path:"/",secure:true,httpOnly:true,sameSite:'Lax'}]);
  const denied=await outsider.newPage(); const response=await denied.goto(route);
  assert.ok([200,404].includes(response.status())); await denied.getByText('접근할 수 없습니다',{exact:true}).waitFor(); assert.equal(await denied.getByText('모바일 일정 오류',{exact:true}).count(),0);
  await page.goto(route); await page.getByText('이슈 편집',{exact:true}).click();
  await page.locator('input[name="id"]').evaluate((el,value)=>{el.value=value},foreign.id);
  await page.locator('input[name="version"]').evaluate(el=>{el.value='1'});
  await page.getByRole('button',{name:'이슈 수정',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'접근할 수 없습니다'}).waitFor();
  const [unchanged]=await db.select().from(issues).where(eq(issues.id,foreign.id));
  assert.equal(unchanged.title,'외부 비공개 이슈'); assert.equal(unchanged.version,1);
  console.log('PASS 비멤버 조회 차단·다른 스페이스 이슈 변경 차단');
  const timings=[];
  for(let i=0;i<3;i++){const start=performance.now(); await page.goto(route,{waitUntil:'domcontentloaded'});await page.getByRole('heading',{name:'모바일 일정 오류',exact:true}).waitFor();timings.push(Math.round(performance.now()-start));}
  console.log(JSON.stringify({localProductionPageMs:timings}));
  assert.deepEqual(errors,[]);
} finally {
  await browser?.close();
  await db.delete(spaces).where(inArray(spaces.id,spaceIds));
  await db.delete(users).where(inArray(users.id,ids));
  await sql.end();
}
