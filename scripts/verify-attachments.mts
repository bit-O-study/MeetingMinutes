import './load-env.mjs';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { db, sql } from '../src/lib/db/index.js';
import { users, spaces, spaceMembers, sessions, notes, shareLinks } from '../src/lib/db/schema.js';
import { hashSessionToken, hashLinkToken } from '../src/lib/token-store.js';
import { removeAttachmentFile } from '../src/lib/attachment-storage.js';
const base='http://127.0.0.1:3291';
const ids=[randomUUID(),randomUUID()], spaceId=randomUUID(), noteId=randomUUID(), copyId=randomUUID();
const tokens=ids.map(()=>randomBytes(32).toString('hex'));
const uploaded:string[]=[];
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
function apk(){ const name=Buffer.from('AndroidManifest.xml'); const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(name.length,26);const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50);central.writeUInt16LE(name.length,28);const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);end.writeUInt32LE(46+name.length,12);end.writeUInt32LE(30+name.length,16);return Buffer.concat([local,name,central,name,end]); }
async function request(path:string, user:number|null=0, init:RequestInit={}){const headers=new Headers(init.headers);if(user!==null)headers.set('Cookie',`authjs.session-token=${tokens[user]}`);return fetch(base+path,{...init,headers,signal:AbortSignal.timeout(120000)});}
async function upload(path:string,bytes:Buffer,name:string,user:number|null=0,origin=base){const form=new FormData();form.set('file',new Blob([new Uint8Array(bytes)]),name);form.set('version','테스트 1.0');return request(path,user,{method:'POST',body:form,headers:{origin}});}
async function check(response:Response,status:number){assert.equal(response.status,status,await response.clone().text());}
try{
 await db.insert(users).values(ids.map(id=>({id,name:'첨부 검증',email:`files-${id}@example.invalid`})));
 await db.insert(sessions).values(ids.map((userId,i)=>({userId,sessionToken:hashSessionToken(tokens[i]),expires:new Date(Date.now()+900000)})));
 await db.insert(spaces).values({id:spaceId,name:'첨부 회귀 전용',ownerId:ids[0]});
 await db.insert(spaceMembers).values({spaceId,userId:ids[0],role:'owner'});
 await db.insert(notes).values([noteId,copyId].map(id=>({id,spaceId,title:'첨부 검증',createdBy:ids[0],template:'blank' as const})));
 const imagePath=`/api/notes/${noteId}/attachments`,packagePath=`/api/spaces/${spaceId}/files`;
 await check(await upload(imagePath,png,'a.png',null),401);
 await check(await upload(imagePath,png,'a.png',1),404);
 await check(await upload(imagePath,png,'a.png',0,'https://other.example'),403);
 await check(await upload(imagePath,Buffer.from('<svg/>'),'a.png'),400);
 console.log('PASS 로그아웃·비회원·다른 origin·위장 사진 업로드 차단');
 const response=await upload(imagePath,png,'한글 사진.png');await check(response,201);const image=await response.json();uploaded.push(image.id);
 const binary=apk();const packResponse=await upload(packagePath,binary,'테스트.apk');await check(packResponse,201);const pack=await packResponse.json();uploaded.push(pack.id);
 for(const [file,bytes] of [[image,png],[pack,binary]] as const){const r=await request(file.url);await check(r,200);assert.deepEqual(Buffer.from(await r.arrayBuffer()),bytes);assert.equal(r.headers.get('x-content-type-options'),'nosniff');await check(await request(file.url,1),404);await check(await request(file.url,null),401);}
 console.log('PASS 사진·APK 바이트 왕복, 비회원 다운로드 차단');
 const share=randomBytes(24).toString('hex');
 await db.insert(shareLinks).values({noteId:copyId,token:share,tokenHash:hashLinkToken(share),createdBy:ids[0]});
 const sharedUrl=image.url+'?share='+share;
 await check(await request(sharedUrl,null),404);
 await db.update(notes).set({content:{type:'doc',content:[{type:'image',attrs:{src:image.url}}]}}).where(eq(notes.id,copyId));
 await check(await request(sharedUrl,null),200);
 await check(await request(pack.url+'?share='+share,null),404);
 await db.delete(notes).where(eq(notes.id,noteId));
 await check(await request(sharedUrl,null),200);
 await check(await request(image.url),200);
 console.log('PASS 공유 본문 참조만 허용·APK 공개 차단·원본 노트 삭제 후 복사 사진 유지');
 await db.update(shareLinks).set({expiresAt:new Date(Date.now()-1000)}).where(eq(shareLinks.noteId,copyId));await check(await request(sharedUrl,null),404);
 await db.update(shareLinks).set({expiresAt:null,revokedAt:new Date()}).where(eq(shareLinks.noteId,copyId));await check(await request(sharedUrl,null),404);
 await db.update(shareLinks).set({revokedAt:null}).where(eq(shareLinks.noteId,copyId));
 await db.delete(spaceMembers).where(eq(spaceMembers.spaceId,spaceId));await check(await request(sharedUrl,null),404);await check(await request(pack.url),404);
 console.log('PASS 만료·폐기·멤버 제거 즉시 다운로드 차단');
}finally{
 for(const id of uploaded)await removeAttachmentFile(id);
 await db.delete(spaces).where(eq(spaces.id,spaceId));
 await db.delete(users).where(inArray(users.id,ids));
 await sql.end({timeout:5});
}
