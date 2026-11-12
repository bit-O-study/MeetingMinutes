import './load-env.mjs';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import postgres from 'postgres';
const require=createRequire(import.meta.url),{chromium}=require('../../trip/node_modules/@playwright/test');
const sql=postgres(process.env.DATABASE_URL,{ssl:'require',prepare:false,max:1});
const user=randomUUID(),space=randomUUID(),token=randomBytes(32).toString('hex'),base=process.argv[2]||process.env.VERIFY_BASE_URL||'https://meeting-minutes-orcin.vercel.app';
let browser;
try{
 await sql`insert into users(id,name,email) values(${user},'초대 검증',${'invite-check-'+user+'@example.invalid'})`;
 await sql`insert into spaces(id,name,owner_id) values(${space},'임시 초대 검증',${user})`;
 await sql`insert into space_members(space_id,user_id,role) values(${space},${user},'owner')`;
 await sql`insert into sessions(session_token,user_id,expires) values(${token},${user},${new Date(Date.now()+900000)})`;
 browser=await chromium.launch({channel:'msedge',headless:true});const ctx=await browser.newContext({viewport:{width:390,height:844}});
 await ctx.addCookies([{name:base.startsWith('https:')?'__Secure-authjs.session-token':'authjs.session-token',value:token,domain:new URL(base).hostname,path:'/',secure:base.startsWith('https:'),httpOnly:true,sameSite:'Lax'}]);
 const page=await ctx.newPage();page.on('pageerror',e=>console.log('PAGE ERROR',e.message));
 await page.goto(base+'/s/'+space+'?tab=members');
 await page.getByLabel('유효 기간',{exact:true}).first().selectOption('none');
 console.log('BEFORE',await page.getByLabel('유효 기간',{exact:true}).first().inputValue());
 await page.getByRole('button',{name:'초대 링크 만들기',exact:true}).click();
 await page.waitForTimeout(2000);
 const rows=await sql`select expires_at,revoked_at from invite_links where space_id=${space}`;
 console.log('RESULT',JSON.stringify(rows));
 console.log('AFTER',await page.getByLabel('유효 기간',{exact:true}).evaluateAll(nodes=>nodes.map(n=>n.value)));
 assert.equal(rows.length,1);assert.equal(rows[0].expires_at,null);
 await page.locator('li span').filter({hasText:/^만료 없음$/}).first().waitFor();
 if(process.argv.includes('--expect-preserved')) {
   assert.equal(await page.getByLabel('유효 기간',{exact:true}).first().inputValue(),'none');
   assert.equal(await page.getByLabel('유효 기간',{exact:true}).last().inputValue(),'none');
 }
 console.log('PASS permanent invite issued and visible');
}finally{if(browser)await browser.close();await sql`delete from spaces where id=${space}`;await sql`delete from sessions where user_id=${user}`;await sql`delete from users where id=${user}`;await sql.end();}
