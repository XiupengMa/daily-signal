import {bucket} from '@/lib/storage';
export async function GET(request:Request){
 let key:string;try{key=decodeURIComponent(new URL(request.url).pathname.split('/api/media/')[1]||'')}catch{return new Response('Not found',{status:404})}if(!/^\d{4}-\d{2}-\d{2}\/(?:[a-f0-9]{12}\/)?(en|zh)\.(mp3|mp4|jpg)$/.test(key))return new Response('Not found',{status:404});
 const file=await bucket().get('media/'+key,{range:request.headers});if(!file)return new Response('Not found',{status:404});
 const headers=new Headers({'Accept-Ranges':'bytes','Cache-Control':'private, max-age=3600','X-Content-Type-Options':'nosniff','ETag':file.httpEtag});file.writeHttpMetadata(headers);
 let status=200;if(file.range){const range=file.range as {offset?:number,length?:number};const start=range.offset||0;const length=range.length||file.size;headers.set('Content-Range',`bytes ${start}-${start+length-1}/${file.size}`);headers.set('Content-Length',String(length));status=206}else headers.set('Content-Length',String(file.size));
 return new Response(file.body,{status,headers});
}
