import assert from 'node:assert/strict';
import {randomUUID, randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import {inArray} from 'drizzle-orm';
import {db} from '../src/lib/db/index';
import {users, spaces, spaceMembers, sessions, issues} from '../src/lib/db/schema';
const require=createRequire(import.meta.url);
const {chromium, expect: baseExpect}=require('../../health_app/node_modules/@playwright/test');
const expect=baseExpect.configure({timeout:20000});
const base=process.env.TEST_BASE_URL ?? 'http://localhost:3129';
const ids=[randomUUID(),randomUUID()], projectIds=[randomUUID(),randomUUID(),randomUUID()];
const token=randomBytes(32).toString('hex');
let browser;
try {
 await db.insert(users).values(ids.map((id,i)=>({id,name:`할당 검증 ${i}`,email:`assigned-${id}@example.invalid`})));
 await db.insert(spaces).values(projectIds.map((id,i)=>({id,name:`할당 검증 프로젝트 ${i}`,ownerId:i===1?ids[1]:ids[0],deletedAt:i===2?new Date():null})));
 await db.insert(spaceMembers).values([{spaceId:projectIds[0],userId:ids[0],role:'owner'},{spaceId:projectIds[0],userId:ids[1],role:'member'},{spaceId:projectIds[1],userId:ids[1],role:'owner'},{spaceId:projectIds[2],userId:ids[0],role:'owner'}]);
 await db.insert(sessions).values({sessionToken:token,userId:ids[0],expires:new Date(Date.now()+900000)});
 const [open]=await db.insert(issues).values({spaceId:projectIds[0],title:'내 열린 이슈',assigneeId:ids[0],status:'open',createdBy:ids[0],updatedAt:new Date('2026-01-01')}).returning();
 await db.insert(issues).values([
  {spaceId:projectIds[0],title:'내 진행 이슈',assigneeId:ids[0],status:'in_progress'},
  {spaceId:projectIds[0],title:'내 완료 이슈',assigneeId:ids[0],status:'closed'},
  {spaceId:projectIds[0],title:'내 미가공 이슈',assigneeId:ids[0],status:'raw'},
  {spaceId:projectIds[0],title:'다른 담당 이슈',assigneeId:ids[1],status:'open'},
  {spaceId:projectIds[1],title:'접근 금지 이슈',assigneeId:ids[0],status:'open'},
  {spaceId:projectIds[2],title:'삭제 프로젝트 이슈',assigneeId:ids[0],status:'open'},
  ...Array.from({length:31},(_,i)=>({spaceId:projectIds[0],title:`공용 이슈 ${i}`,status:'open' as const})),
 ]);
 browser=await chromium.launch({channel:'msedge',headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.addCookies([{name:'authjs.session-token',value:token,domain:new URL(base).hostname,path:'/',httpOnly:true,sameSite:'Lax'}]);
 const page=await context.newPage();
 await page.goto(base+'/tasks');
 await expect(page.getByText('내 열린 이슈',{exact:true})).toBeVisible();
 await expect(page.getByText('내 진행 이슈',{exact:true})).toBeVisible();
 await expect(page.getByText('내 미가공 이슈',{exact:true})).toBeVisible();
 for(const name of ['내 완료 이슈','다른 담당 이슈','접근 금지 이슈','삭제 프로젝트 이슈','공용 이슈 0'])await expect(page.getByText(name,{exact:true})).toHaveCount(0);
 await mkdir('.verify-shots/assigned-issues',{recursive:true});
 await page.screenshot({path:'.verify-shots/assigned-issues/tasks.png',fullPage:true});
 await page.getByRole('link',{name:'완료',exact:true}).click();
 await expect(page.getByText('내 완료 이슈',{exact:true})).toBeVisible();
 await expect(page.getByText('내 열린 이슈',{exact:true})).toHaveCount(0);
 await page.getByRole('link',{name:'전체',exact:true}).click();
 await expect(page.getByText('내 열린 이슈',{exact:true})).toBeVisible();
 await page.getByText('내 열린 이슈',{exact:true}).click();
 const card=page.locator(`#issue-${open.id}`);
 await expect(card).toBeVisible();
 await card.locator('summary').click();
  await card.locator('select[name="status"]').selectOption('closed');
 await card.getByRole('button',{name:'이슈 수정',exact:true}).click();
  await expect(card.getByText('해결됨',{exact:true}).first()).toBeVisible();
 await page.goto(base+'/tasks');
 await expect(page.getByText('내 열린 이슈',{exact:true})).toHaveCount(0);
 await page.goto(base+'/tasks?status=done');
 await expect(page.getByText('내 열린 이슈',{exact:true})).toBeVisible();
 await page.goto(base+'/');
 await expect(page.getByText('내 진행 이슈',{exact:true})).toBeVisible();
 await page.getByText('내 진행 이슈',{exact:true}).click();
 const progress=page.locator('li[id^="issue-"]').filter({has:page.getByRole('heading',{name:'내 진행 이슈',exact:true})});
 await progress.locator('summary').click();
  await progress.locator('select[name="assigneeId"]').selectOption(ids[1]);
 await progress.getByRole('button',{name:'이슈 수정',exact:true}).click();
  await expect(progress.locator('span').filter({hasText:/^할당 검증 1$/})).toBeVisible();
 await page.goto(base+'/tasks');
 await expect(page.getByText('내 진행 이슈',{exact:true})).toHaveCount(0);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 console.log('PASS: 담당 이슈 미완료/완료/전체, 타인·미배정·비멤버·삭제 프로젝트 제외, 30개 이후 직접 이동, 상태변경·재할당·홈 반영, 모바일 폭');
} finally {
 await browser?.close();
 await db.delete(spaces).where(inArray(spaces.id,projectIds));
 await db.delete(users).where(inArray(users.id,ids));
 await globalThis.__mmSql?.end();
 console.log('테스트 계정·프로젝트 정리 완료');
}
