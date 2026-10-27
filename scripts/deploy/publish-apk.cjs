/* eslint-disable @typescript-eslint/no-require-imports */
// 운영 실행기에서만 실행한다. 파일 본문은 서버 디스크, 목록과 검수는 통합 관리자에서 관리한다.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {parseEnv}=require('node:util');
const postgres=require('postgres');
const root='C:/services/Bit-O/MeetingMinutes';
if(process.env.GITHUB_REPOSITORY!=='bit-O-study/MeetingMinutes'||process.env.GITHUB_REF!=='refs/heads/main')throw Error('Only main can publish APK');
const env=parseEnv(fs.readFileSync(path.join(root,'config/runtime.env'),'utf8'));
const db=postgres(env.DATABASE_URL,{ssl:'require',prepare:false,max:1,connect_timeout:15});
(async()=>{
 const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'apk.json'),'utf8'));
 if(manifest.sha!==process.env.GITHUB_SHA||!/^moa-[\w.-]+\.apk$/.test(manifest.name))throw Error('APK release identity mismatch');
 const bytes=fs.readFileSync(path.join(__dirname,manifest.name));
 const hash=crypto.createHash('sha256').update(bytes).digest('hex');if(hash!==manifest.sha256)throw Error('APK digest mismatch');
 const owners=await db`select s.id as space_id,s.owner_id from spaces s join users u on u.id=s.owner_id where s.name='모바프로젝트' and lower(u.email)='bong9468@naver.com' and s.deleted_at is null`;
 if(owners.length!==1)throw Error('Release project is not unique');const owner=owners[0];
 const previous=await db`select id,sha256 from project_files where space_id=${owner.space_id} and name=${manifest.name}`;
 if(previous.length){if(previous.length!==1||previous[0].sha256!==hash)throw Error('Release name collision');console.log('APK already registered: '+previous[0].id);return;}
 const id=crypto.randomUUID(),description=`main 자동 빌드 · ${manifest.sha} · 실행 ${process.env.GITHUB_RUN_ID}`;
 const body=Buffer.from(JSON.stringify({action:'upload',id,spaceId:owner.space_id,userId:owner.owner_id,expires:Date.now()+600000,name:manifest.name,size:bytes.length,version:manifest.version,description})).toString('base64url');
 const token=body+'.'+crypto.createHmac('sha256',env.MOA_STORAGE_SECRET).update('moa-storage-v1:'+body).digest('base64url');
 const response=await fetch('http://127.0.0.1:4192/files',{method:'PUT',headers:{Authorization:'Bearer '+token,'Content-Type':'application/octet-stream'},body:bytes,signal:AbortSignal.timeout(120000)});
 if(response.status!==201)throw Error('Storage upload HTTP '+response.status);
 const result=await response.json();if(result.sha256!==hash)throw Error('Stored hash mismatch');
 const saved=fs.readFileSync(path.join(env.MOA_UPLOAD_DIR,id));if(crypto.createHash('sha256').update(saved).digest('hex')!==hash)throw Error('Disk read-back mismatch');
 const [row]=await db`select id,sha256 from project_files where id=${id}`;if(row?.sha256!==hash)throw Error('Metadata read-back mismatch');
 console.log(JSON.stringify({fileId:id,name:manifest.name,sha256:hash,bytes:bytes.length,adminLibrary:'https://heltch-admin.vercel.app/admin/library',verified:true}));
})().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>db.end());
