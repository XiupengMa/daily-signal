import {bucket,response,requirePublisher} from '@/lib/storage';
import {readLimitedJson} from '@/lib/publisher-auth';
import {z} from 'zod';
const claim=z.object({date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),runId:z.string().min(1).max(100),resumeOf:z.string().max(100).optional()});
const update=claim.extend({state:z.enum(['rendering','published','failed']),apiUsd:z.number().min(0).max(10),message:z.string().max(240)});
function today(){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
export async function POST(request:Request){
 const denied=await requirePublisher(request,true);if(denied)return denied;
 try{
  const input=claim.parse(await readLimitedJson(request,2000));
  if(input.date!==today())return response({error:'Only the current Pacific run date may be claimed'},400);
  const key='jobs/'+input.date+'.json';let priorApiUsd=0;let previousEtag:string|undefined;
  if(input.resumeOf){
   const previous=await bucket().get(key);if(!previous)return response({error:'No previous run'},409);
   const saved=await previous.json<{runId:string;state:string;apiUsd:number}>();
   if(saved.runId!==input.resumeOf||saved.state!=='failed')return response({error:'Only the named failed run can be resumed'},409);
   priorApiUsd=saved.apiUsd;previousEtag=previous.etag;
  }
  const object=await bucket().put(key,JSON.stringify({...input,state:'generating',apiUsd:priorApiUsd,startedAt:new Date().toISOString()}),{onlyIf:previousEtag?{etagMatches:previousEtag}:new Headers({'If-None-Match':'*'}),httpMetadata:{contentType:'application/json'}});
  return object?response({ok:true,priorApiUsd},201):response({error:'Date already claimed'},409);
 }catch{return response({error:'Unable to claim job'},400)}
}
export async function PATCH(request:Request){
 const denied=await requirePublisher(request,true);if(denied)return denied;
 try{
  const input=update.parse(await readLimitedJson(request,3000));const key='jobs/'+input.date+'.json';
  const prior=await bucket().get(key);if(!prior)return response({error:'Claim required'},409);
  const saved=await prior.json<{runId:string;state:string;apiUsd:number}>();
  if(input.apiUsd<saved.apiUsd)return response({error:'Spend cannot decrease'},409);
  if(saved.runId!==input.runId)return response({error:'Run ownership mismatch'},409);
  if(saved.state==='published'&&input.state!=='published')return response({error:'Published runs are final'},409);
  const written=await bucket().put(key,JSON.stringify({...saved,...input,updatedAt:new Date().toISOString()}),{onlyIf:{etagMatches:prior.etag},httpMetadata:{contentType:'application/json'}});
  return written?response({ok:true}):response({error:'Concurrent update'},409);
 }catch{return response({error:'Unable to update job'},400)}
}
export async function GET(request:Request){
 const denied=await requirePublisher(request);if(denied)return denied;
 const date=new URL(request.url).searchParams.get('date')||today();
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return response({error:'Invalid date'},400);
 const job=await bucket().get('jobs/'+date+'.json');return job?response(await job.json()):response({state:'not_started',date});
}
