import { z } from 'zod';
const key=z.string().regex(/^\d{4}-\d{2}-\d{2}\/(?:[a-f0-9]{12}\/)?(en|zh)\.(mp3|mp4|jpg)$/);
const source=z.object({label:z.string().min(1).max(100),url:z.string().max(2000).url().refine(v=>{
 let u:URL;try{u=new URL(v)}catch{return false}const host=u.hostname.toLowerCase();
 const privateHost=host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||/^\d+\.\d+\.\d+\.\d+$/.test(host)||host.includes(':')||/(chatgpt\.com|oaiusercontent\.com|blob\.core\.windows\.net)$/.test(host);
 const signed=[...u.searchParams.keys()].some(k=>/^(?:access_token|api_key|apikey|token|signature|sig|x-amz-signature|x-amz-credential|x-goog-signature|x-goog-credential)$/i.test(k));
 return u.protocol==='https:'&&!u.username&&!u.password&&!privateHost&&!signed;
},'Use original public source links, never credentials or private file URLs')});
const media=z.object({audio:key.optional(),video:key.optional(),poster:key.optional(),duration:z.number().positive()});
const chapter=z.object({id:z.string().min(1).max(80),title:z.string().min(1).max(300),titleZh:z.string().min(1).max(300),storyId:z.string().optional(),script:z.object({en:z.string().max(25000),zh:z.string().max(25000)}).optional(),start:z.object({en:z.number().finite().nonnegative(),zh:z.number().finite().nonnegative()})});
export const editionSchema=z.object({date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),newsDate:z.string(),timezone:z.string(),title:z.string().min(1).max(300),titleZh:z.string().min(1).max(300),description:z.string().max(1500),descriptionZh:z.string().max(1500),items:z.array(z.object({id:z.string(),title:z.string(),titleZh:z.string(),category:z.string(),summary:z.string(),summaryZh:z.string(),community:z.object({points:z.number().nonnegative(),comments:z.number().nonnegative(),sampleSize:z.number().nonnegative(),observedAt:z.string()}).optional(),rankScore:z.number().optional(),sources:z.array(source).min(1)})).min(1).max(30),takeaways:z.array(z.string()),takeawaysZh:z.array(z.string()),coverageNotes:z.string(),coverageNotesZh:z.string(),media:z.object({en:media,zh:media}),narration:z.object({en:z.string().trim().min(1).max(80000),zh:z.string().trim().min(1).max(80000)}).optional(),chapters:z.array(chapter).min(1).max(50).optional(),quality:z.object({policy:z.string(),threshold:z.number(),maxDrafts:z.number(),scores:z.object({en:z.record(z.string(),z.number()),zh:z.record(z.string(),z.number())}),apiUsd:z.number().nonnegative()}).optional(),updatedAt:z.string()}).superRefine((edition,ctx)=>{
 const ids=new Set<string>();
 for(const [i,c] of (edition.chapters||[]).entries()){
  if(ids.has(c.id))ctx.addIssue({code:'custom',path:['chapters',i,'id'],message:'Chapter IDs must be unique'});ids.add(c.id);
  if(c.storyId&&!edition.items.some(s=>s.id===c.storyId))ctx.addIssue({code:'custom',path:['chapters',i,'storyId'],message:'Chapter story must exist in the edition'});
  for(const language of ['en','zh'] as const){
   if(c.start[language]>=edition.media[language].duration)ctx.addIssue({code:'custom',path:['chapters',i,'start',language],message:'Chapter must begin before the recording ends'});
   if(i>0&&c.start[language]<=edition.chapters![i-1].start[language])ctx.addIssue({code:'custom',path:['chapters',i,'start',language],message:'Chapter starts must increase in each language'});
  }
 }
});
export type Edition=z.infer<typeof editionSchema>;
