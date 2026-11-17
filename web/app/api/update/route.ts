import {bucket,response,requirePublisher} from '@/lib/storage';
import {editionSchema} from '@/lib/edition';
import {readLimitedJson} from '@/lib/publisher-auth';
export async function POST(request:Request){
 const denied=await requirePublisher(request,true);if(denied)return denied;
 if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')return response({error:'JSON required'},415);
 try{const parsed=editionSchema.safeParse(await readLimitedJson(request,200000));if(!parsed.success)return response({error:'Invalid edition'},400);const edition=parsed.data;
 for(const track of Object.values(edition.media)){for(const key of [track.audio,track.video,track.poster].filter(Boolean) as string[]){if(!key.startsWith(edition.date+'/'))return response({error:'Media date does not match edition'},400);if(!await bucket().head('media/'+key))return response({error:'Upload media before publishing',missing:key},409)}}
 await bucket().put(`editions/${edition.date}.json`,JSON.stringify(edition),{httpMetadata:{contentType:'application/json'}});const saved=await bucket().get(`editions/${edition.date}.json`);return response({ok:true,date:edition.date,saved:await saved!.json()});
 }catch(error){return response({error:error instanceof RangeError?'Edition too large':'Unable to save edition'},error instanceof RangeError?413:400)}
}
