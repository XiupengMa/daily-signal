import { env } from 'cloudflare:workers';
import {publisherAuthorized,sameOriginWrite} from './publisher-auth';
export function bucket(){if(!env.BUCKET)throw new Error('Archive storage is unavailable');return env.BUCKET}
export async function requirePublisher(request:Request,write=false){
 if(!await publisherAuthorized(request,env.RUNNER_TOKEN_SHA256))return response({error:'Publisher authorization required'},401);
 if(write&&!sameOriginWrite(request))return response({error:'Origin not allowed'},403);
 return null;
}
export function response(value:unknown,status=200){return Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'}})}
