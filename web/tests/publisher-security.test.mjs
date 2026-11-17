import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {test} from 'node:test';
import {publisherAuthorized, sameOriginWrite, readLimitedJson} from '../lib/publisher-auth.ts';

const token = 'test-publisher-credential-not-a-real-secret-0123456789';
const hash = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))).toString('hex');
const origin = 'https://example.test';
const authorizedHeaders = {'authorization': 'Bearer '+token};

test('publisher authorization fails closed and ignores spoofed platform identity', async () => {
  for (const envHash of [undefined, '', 'invalid', hash]) {
    assert.equal(await publisherAuthorized(new Request(origin,{headers:{'oai-authenticated-user-id':'owner','OAI-Sites-Authorization':'Bearer '+token}}),envHash),false);
  }
  for (const authorization of ['', 'Bearer wrong-token-012345678901234567890123456789', 'Basic '+token, 'Bearer '+token+' extra']) {
    assert.equal(await publisherAuthorized(new Request(origin,{headers:{'authorization':authorization}}),hash),false);
  }
  assert.equal(await publisherAuthorized(new Request(origin,{headers:authorizedHeaders}),hash),true);
  assert.equal(await publisherAuthorized(new Request(origin,{headers:authorizedHeaders}),undefined),false);
});

test('origin checks are defense in depth, not publisher authentication', () => {
  assert.equal(sameOriginWrite(new Request(origin)),true);
  assert.equal(sameOriginWrite(new Request(origin,{headers:{origin}})),true);
  assert.equal(sameOriginWrite(new Request(origin,{headers:{origin:'https://attacker.test'}})),false);
  assert.equal(sameOriginWrite(new Request(origin,{headers:{'sec-fetch-site':'cross-site'}})),false);
});

test('JSON is bounded by actual UTF-8 bytes including streamed bodies', async () => {
  assert.deepEqual(await readLimitedJson(new Request(origin,{method:'POST',body:'{"a":1}'}),7),{a:1});
  await assert.rejects(readLimitedJson(new Request(origin,{method:'POST',body:'{"a":"中"}'}),10),RangeError);
  await assert.rejects(readLimitedJson(new Request(origin,{method:'POST',body:'{}',headers:{'content-length':'100'}}),5),RangeError);
  let canceled=false;
  const stream=new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(6));},cancel(){canceled=true;}});
  await assert.rejects(readLimitedJson(new Request(origin,{method:'POST',body:stream,duplex:'half'}),10),RangeError);
  assert.equal(canceled,true);
});

const records=new Map();
let reads=0,writes=0;
globalThis.__publisherTestEnv={RUNNER_TOKEN_SHA256:hash,BUCKET:{
 async head(){reads++;return {};},
 async get(key){reads++;const value=records.get(key);return value?{etag:'test',json:async()=>JSON.parse(value)}:null;},
 async put(key,body,options){if(options?.onlyIf instanceof Headers && options.onlyIf.get('If-None-Match')==='*' && records.has(key))return null;writes++;const data=typeof body==='string'?body:await new Response(body).text();records.set(key,data);return {size:Buffer.byteLength(data),etag:'test'};},
 async list(){reads++;return {objects:[{key:'editions/2026-01-02.json'},{key:'editions/private-notes.json'}],truncated:false};}
}};
registerHooks({resolve(specifier,context,nextResolve){
 if(specifier==='cloudflare:workers')return {url:'data:text/javascript,export const env=globalThis.__publisherTestEnv',shortCircuit:true};
 if(specifier.startsWith('@/'))return {url:new URL('../'+specifier.slice(2)+(specifier.endsWith('.json')?'':'.ts'),import.meta.url).href,shortCircuit:true};
 if(specifier==='./publisher-auth')return {url:new URL('../lib/publisher-auth.ts',import.meta.url).href,shortCircuit:true};
 return nextResolve(specifier,context);
},load(url,context,nextLoad){
 if(url.endsWith('/examples/edition.json'))return {format:'module',source:'export default '+readFileSync(new URL(url),'utf8'),shortCircuit:true};
 return nextLoad(url,context);
}});
const {POST}=await import('../app/api/update/route.ts');
const {PUT}=await import('../app/api/upload/route.ts');
const {GET:editions}=await import('../app/api/editions/route.ts');
const {editionSchema}=await import('../lib/edition.ts');

test('source URLs reject credentials, signed private links and local destinations',async()=>{
 const edition=JSON.parse(await readFile(new URL('../examples/edition.json',import.meta.url),'utf8'));
 for(const url of ['not-a-url','javascript:alert(1)','https://user:password@example.com/','https://example.com/?access_token=private','https://bucket.s3.amazonaws.com/a?X-Amz-Signature=private','https://files.oaiusercontent.com/a','https://localhost/private','https://127.0.0.1/private','https://[::1]/private']){
  const candidate=structuredClone(edition);candidate.items[0].sources[0].url=url;
  assert.equal(editionSchema.safeParse(candidate).success,false,url);
 }
 const candidate=structuredClone(edition);candidate.privateMetadata='not for publishing';
 assert.equal('privateMetadata' in editionSchema.parse(candidate),false);
});

test('unauthenticated and forged writes return 401 before accessing storage', async () => {
  const before=[reads,writes];
  for(const handler of [POST,PUT])for(const headers of [{},{origin},{...authorizedHeaders,'authorization':'Bearer invalid'},{'oai-authenticated-user-id':'owner'}]){
    const response=await handler(new Request(origin+'/api/update',{method:handler===POST?'POST':'PUT',headers,body:'{}'}));
    assert.equal(response.status,401);
  }
  assert.deepEqual([reads,writes],before);
});

test('authenticated cross-origin writes remain rejected', async () => {
  const response=await POST(new Request(origin+'/api/update',{method:'POST',headers:{...authorizedHeaders,origin:'https://attacker.test'},body:'{}'}));
  assert.equal(response.status,403);
});


test('authorized update validates, persists and reads back the exact news edition', async () => {
  const edition=JSON.parse(await readFile(new URL('../examples/edition.json',import.meta.url),'utf8'));
  const response=await POST(new Request(origin+'/api/update',{method:'POST',headers:{...authorizedHeaders,'content-type':'application/json'},body:JSON.stringify(edition)}));
  assert.equal(response.status,200);
  assert.deepEqual((await response.json()).saved,edition);
  assert.deepEqual(await (await editions(new Request(origin+'/api/editions?date='+edition.date))).json(),edition);
  assert.deepEqual(await (await editions(new Request(origin+'/api/editions'))).json(),{dates:['2026-01-02']});
});

test('authorized uploads require exact bounded size and allowed media keys', async () => {
  for(const length of ['', '-1', '1.5', 'NaN','104857601']){
    assert.equal((await PUT(new Request(origin+'/api/upload?key=2026-01-02/en.mp3',{method:'PUT',headers:{...authorizedHeaders,'content-length':length},body:'abc'}))).status,413);
  }
  const response=await PUT(new Request(origin+'/api/upload?key=2026-01-02/en.mp3',{method:'PUT',headers:{...authorizedHeaders,'content-length':'3'},body:'abc'}));
  assert.equal(response.status,200);
  assert.equal((await response.json()).size,3);
});

const {POST:claimJob,PATCH:updateJob}=await import('../app/api/jobs/route.ts');
test('daily job claim is exclusive, authenticated, and bound to run owner',async()=>{
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const request=(method,payload,auth=true)=>new Request(origin+'/api/jobs',{method,headers:auth?authorizedHeaders:{},body:JSON.stringify(payload)});
 assert.equal((await claimJob(request('POST',{date,runId:'one'},false))).status,401);
 assert.equal((await claimJob(request('POST',{date,runId:'one'}))).status,201);
 assert.equal((await claimJob(request('POST',{date,runId:'two'}))).status,409);
 assert.equal((await updateJob(request('PATCH',{date,runId:'two',state:'rendering',apiUsd:0,message:''}))).status,409);
 assert.equal((await updateJob(request('PATCH',{date,runId:'one',state:'published',apiUsd:1,message:''}))).status,200);
 assert.equal((await updateJob(request('PATCH',{date,runId:'one',state:'failed',apiUsd:1,message:''}))).status,409);
});

test('explicit recovery carries prior cost and cannot resume an active or completed job',async()=>{
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 records.set('jobs/'+date+'.json',JSON.stringify({date,runId:'failed-1',state:'failed',apiUsd:1.75}));
 const req=(method,data)=>new Request(origin+'/api/jobs',{method,headers:authorizedHeaders,body:JSON.stringify(data)});
 assert.equal((await claimJob(req('POST',{date,runId:'new',resumeOf:'wrong'}))).status,409);
 const accepted=await claimJob(req('POST',{date,runId:'new',resumeOf:'failed-1'}));
 assert.equal(accepted.status,201);assert.equal((await accepted.json()).priorApiUsd,1.75);
 assert.equal((await claimJob(req('POST',{date,runId:'other',resumeOf:'new'}))).status,409);
 assert.equal((await updateJob(req('PATCH',{date,runId:'new',state:'failed',apiUsd:0,message:''}))).status,409);
});
