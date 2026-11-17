import {env} from 'cloudflare:workers';
import demo from '@/examples/edition.json';
import {bucket,response} from '@/lib/storage';
import {editionSchema} from '@/lib/edition';
export async function GET(request:Request){
 try {const date=new URL(request.url).searchParams.get('date');
 if(env.DEMO_MODE==='true'&&!env.BUCKET)return date ? (date===demo.date?response(editionSchema.parse(demo)):response({error:'Edition not found'},404)):response({dates:[demo.date]});
 if(date){if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return response({error:'Invalid date'},400);const o=await bucket().get(`editions/${date}.json`);if(!o&&env.DEMO_MODE==='true'&&date===demo.date)return response(editionSchema.parse(demo));return o?response(editionSchema.parse(await o.json())):response({error:'Edition not found'},404)}
 const all=[];let cursor:string|undefined;
 do{const page=await bucket().list({prefix:'editions/',cursor,limit:1000});all.push(...page.objects);cursor=page.truncated?page.cursor:undefined}while(cursor);
 const dates=all.filter(o=>/^editions\/\d{4}-\d{2}-\d{2}\.json$/.test(o.key)).map(o=>o.key.slice(9,-5)).sort().reverse();return response({dates:dates.length||env.DEMO_MODE!=='true'?dates:[demo.date]});
 }catch{return response({error:'The archive is temporarily unavailable. Please try again.'},503)}
}
