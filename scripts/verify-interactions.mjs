import './load-env.mjs';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { eq, inArray } from 'drizzle-orm';
import { db, sql } from '../src/lib/db/index.ts';
import { users, spaces, spaceMembers, sessions, issues, projectMessages, notes } from '../src/lib/db/schema.ts';
const require = createRequire(import.meta.url);
const { chromium } = require('../../trip/node_modules/@playwright/test');
const base = process.env.VERIFY_BASE_URL || 'http://localhost:3195';
const userId=randomUUID(), spaceId=randomUUID(), foreignSpace=randomUUID(), token=randomBytes(32).toString('hex');
let browser;
try {
 await db.insert(users).values({id:userId,name:'성능 검증',email:`perf-${userId}@example.invalid`});
 await db.insert(spaces).values([{id:spaceId,name:'성능 임시 검증',ownerId:userId},{id:foreignSpace,name:'다른 프로젝트',ownerId:userId}]);
 await db.insert(spaceMembers).values([{spaceId,userId,role:'owner'},{spaceId:foreignSpace,userId,role:'owner'}]);
 await db.insert(sessions).values({sessionToken:token,userId,expires:new Date(Date.now()+900000)});
 const msgId=randomUUID();await db.insert(projectMessages).values({id:msgId,spaceId,body:'유지할 원문',createdBy:userId});
 const fixtures=await db.insert(issues).values([
 {spaceId,title:'완료 대상',body:'유지할 원문',status:'raw',sourceMessageId:msgId,createdBy:userId},
 {spaceId,title:'삭제 대상',body:'삭제 확인',status:'raw',createdBy:userId},
 {spaceId:foreignSpace,title:'다른 프로젝트 이슈',status:'raw',createdBy:userId}
 ]).returning();
 await db.insert(notes).values(Array.from({length:31},(_,i)=>({spaceId,title:`노트 ${String(i).padStart(2,'0')}`,createdBy:userId,updatedBy:userId})));
 browser=await chromium.launch({headless:true,channel:'msedge'});
 const context=await browser.newContext({viewport:{width:390,height:844},permissions:['clipboard-read','clipboard-write']});
 await context.addCookies([{name:'authjs.session-token',value:token,domain:'localhost',path:'/',httpOnly:true,sameSite:'Lax'}]);
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${base}/s/${spaceId}?tab=issues&status=raw`);
 await page.getByRole('heading',{name:'완료 대상',exact:true}).waitFor();
 const stale=await context.newPage();await stale.goto(page.url());await stale.getByRole('heading',{name:'완료 대상',exact:true}).waitFor();
 const raw=page.locator(`#issue-${fixtures[0].id}`);
 await raw.getByRole('button',{name:'완료 처리',exact:true}).click();
 await raw.waitFor({state:'detached'});
 const [saved]=await db.select().from(issues).where(eq(issues.id,fixtures[0].id));assert.equal(saved.status,'closed');assert.equal(saved.originalBody,'유지할 원문');assert.equal(saved.version,2);
 await stale.locator(`#issue-${fixtures[0].id}`).getByRole('button',{name:'완료 처리',exact:true}).click();
 await stale.getByRole('alert').filter({hasText:'이미 변경'}).waitFor();
 console.log('PASS 완료 처리·원문 보존·동시 수정 충돌');
 const deletion=page.locator(`#issue-${fixtures[1].id}`);
 page.once('dialog',d=>d.dismiss());await deletion.getByRole('button',{name:'삭제',exact:true}).click();assert.equal((await db.select().from(issues).where(eq(issues.id,fixtures[1].id))).length,1);
 // 다른 프로젝트의 id를 주입해도 현재 프로젝트 조건으로 차단한다.
 await deletion.locator('input[name=id]').first().evaluate((el,value)=>el.value=value,fixtures[2].id);
 page.once('dialog',d=>d.accept());await deletion.getByRole('button',{name:'삭제',exact:true}).click();await deletion.getByRole('alert').waitFor();
 assert.equal((await db.select().from(issues).where(eq(issues.id,fixtures[2].id))).length,1);
 await page.reload();
 page.once('dialog',d=>d.accept());await page.locator(`#issue-${fixtures[1].id}`).getByRole('button',{name:'삭제',exact:true}).click();await page.locator(`#issue-${fixtures[1].id}`).waitFor({state:'detached'});
 assert.equal((await db.select().from(issues).where(eq(issues.id,fixtures[1].id))).length,0);assert.equal((await db.select().from(projectMessages).where(eq(projectMessages.id,msgId))).length,1);
 console.log('PASS 삭제 확인·취소·프로젝트 경계·채팅 보존');
 await page.goto(`${base}/s/${spaceId}?tab=members`);
 await page.getByRole('button',{name:'초대 링크 만들기',exact:true}).click();
 const urlInput=page.getByLabel('초대 주소 · 누르면 복사됩니다');await urlInput.waitFor();await urlInput.click();await page.getByRole('status').filter({hasText:'초대 링크를 복사했습니다.'}).waitFor();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),await urlInput.inputValue());
 console.log('PASS 초대 주소 클릭 자동 복사');
 // 응답을 지연시켜 쿼리 탭 이동에도 클릭 즉시 표시되는지 확인한다.
 await page.route('**/*',async route=>{if(route.request().url().includes('_rsc='))await new Promise(r=>setTimeout(r,1000));await route.continue();});
 await page.getByRole('link',{name:'노트',exact:true}).click();await page.getByRole('status').filter({hasText:'불러오는 중'}).first().waitFor();
 await page.getByRole('link',{name:'다음',exact:true}).waitFor();assert.equal(await page.locator('a[href*="/n/"]').count(),30);
 await page.getByRole('link',{name:'다음',exact:true}).click();await page.getByRole('link',{name:'이전',exact:true}).waitFor();assert.equal(await page.locator('a[href*="/n/"]').count(),1);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
 console.log('PASS 클릭 로딩·30건 페이지·모바일 가로 넘침 없음');
} finally {
 await browser?.close();await db.delete(spaces).where(inArray(spaces.id,[spaceId,foreignSpace]));await db.delete(users).where(eq(users.id,userId));await sql.end();console.log('Temporary fixtures removed');
}
