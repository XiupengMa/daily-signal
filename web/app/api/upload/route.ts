import {bucket,response,requirePublisher} from '@/lib/storage';
export async function PUT(request:Request){
 const denied=await requirePublisher(request,true);if(denied)return denied;
 const key=new URL(request.url).searchParams.get('key');if(!key||!/^\d{4}-\d{2}-\d{2}\/(?:[a-f0-9]{12}\/)?(en|zh)\.(mp3|mp4|jpg)$/.test(key))return response({error:'Invalid media key'},400);
 const declared=request.headers.get('content-length');const size=Number(declared);if(!declared||!/^\d+$/.test(declared)||!Number.isSafeInteger(size)||size<1||size>100*1024*1024)return response({error:'A media file between 1 byte and 100 MB is required'},413);
 const contentType=key.endsWith('.mp3')?'audio/mpeg':key.endsWith('.mp4')?'video/mp4':'image/jpeg';
 if(!request.body)return response({error:'Missing media'},400);
 try{const object=await bucket().put('media/'+key,request.body,{httpMetadata:{contentType}});return response({ok:true,key,size:object.size,etag:object.etag})}catch{return response({error:'Unable to upload media'},400)}
}
