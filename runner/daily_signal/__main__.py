import argparse
import datetime as dt
import json
import os
import sys
import uuid
from pathlib import Path
from .core import Budget,dates,save,LANGUAGES,digest
from .sources import collect
from .editor import Editor,MAX_DRAFTS
from .recovery import restore_editorial
from .media import render
from .publish import Publisher


def main():
    p=argparse.ArgumentParser()
    p.add_argument('--collect-only',action='store_true')
    p.add_argument('--news-date')
    p.add_argument('--work',type=Path,default=Path('work'))
    args=p.parse_args(); date,day=dates()
    if args.news_date:
        if not args.collect_only: raise RuntimeError('Paid backfills are disabled to preserve daily cap')
        day=args.news_date
    folder=args.work/date;folder.mkdir(parents=True,exist_ok=True)
    if args.collect_only:
        result=collect(day);save(folder/'sources.json',result)
        print(json.dumps({'articles':len(result['articles']),'sourceFailures':len(result['failures']),'newsDate':day}));return
    if not os.environ.get('OPENAI_API_KEY') or not os.environ.get('BRIEFING_PUBLISH_TOKEN'):
        raise RuntimeError('Required encrypted secrets are not configured')
    publisher=Publisher(); run_id=os.environ.get('GITHUB_RUN_ID') or str(uuid.uuid4())
    existing=publisher.get('/api/editions?date='+date)
    if existing.status_code==200 and existing.json().get('quality',{}).get('policy')=='source-first-v1':
        print('Quality-gated edition already published; no paid work');return
    if existing.status_code not in (200,404): raise RuntimeError('Cannot verify publication state')
    prior=publisher.claim(date,run_id,os.environ.get('RESUME_RUN_ID') or None)
    budget=Budget(folder/'cost-ledger.json')
    external=float(os.environ.get('PRIOR_SPEND_USD','0')) if os.environ.get('PRIOR_SPEND_DATE')==date else 0
    carry=max(prior,external)-budget.spent
    if carry>0:budget.reserve('prior-runs-and-verification',carry)
    media_prefix=date+'/'+digest([date,run_id])[:12]
    try:
        recovered=False
        if os.environ.get('RESUME_RUN_ID') and os.environ.get('RECOVERY_DIR'):
            recovered=restore_editorial(Path(os.environ['RECOVERY_DIR'])/date,folder,day)
        print(('Restoring reviewed original sources for ' if recovered else 'Collecting original sources for ')+day,flush=True)
        evidence=json.loads((folder/'sources.json').read_text()) if recovered else collect(day)
        save(folder/'sources.json',evidence)
        editor=Editor(budget)
        stories=json.loads((folder/'selected.json').read_text()) if recovered and (folder/'selected.json').exists() else editor.select(evidence)
        save(folder/'selected.json',stories)
        drafts={};reviews={}
        for lang in LANGUAGES:
            drafts[lang],reviews[lang]=editor.write(stories,day,lang,folder)
            print(lang+' passed independent quality review',flush=True)
        publisher.status(date,run_id,'rendering',budget.spent)
        media={};starts={}
        for lang in LANGUAGES:
            media[lang],starts[lang]=render(date,lang,drafts[lang],stories,budget,folder,media_prefix,lambda message: publisher.status(date,run_id,'rendering',budget.spent,message))
            print(lang+' audio/video passed validation',flush=True)
        edition=make_edition(date,day,stories,drafts,reviews,media,starts,budget.spent,evidence['failures'])
        save(folder/'edition.json',edition);publisher.publish(edition,folder)
        publisher.status(date,run_id,'published',budget.spent)
        print(json.dumps({'published':date,'apiUsd':round(budget.spent,4),'duration':{l:media[l]['duration'] for l in LANGUAGES}}))
    except Exception as e:
        # Never put model responses, HTTP headers, or credentials into public error messages.
        message=type(e).__name__+': generation did not pass all publication gates'
        try:publisher.status(date,run_id,'failed',budget.spent,message)
        except Exception:pass
        raise

def make_edition(date,day,stories,drafts,reviews,media,starts,cost,failures):
    en,zh=drafts['en'],drafts['zh'];items=[]
    for i,s in enumerate(stories):
        links=[{'label':s['publisher'],'url':s['url']}]
        if s.get('hnId'):links.append({'label':'Hacker News discussion','url':'https://news.ycombinator.com/item?id='+s['hnId']})
        d=s['discussion']
        items.append({'id':s['id'],'title':en.chapters[i].title,'titleZh':zh.chapters[i].title,'category':'Technology','summary':en.chapters[i].summary,'summaryZh':zh.chapters[i].summary,'sources':links,'community':{'points':d.get('points',s['points']),'comments':d.get('comments',s['comments']),'sampleSize':d['sampleSize'],'observedAt':d.get('observedAt',s['retrievedAt'])},'rankScore':s['rankScore']})
    chapter_ids=['intro']+[s['id'] for s in stories]+['closing']
    chapters=[]
    for i,cid in enumerate(chapter_ids):
        c={'id':cid,'title':'Introduction' if i==0 else 'Takeaways' if i==len(chapter_ids)-1 else en.chapters[i-1].title,'titleZh':'开场' if i==0 else '总结' if i==len(chapter_ids)-1 else zh.chapters[i-1].title,'start':{l:starts[l][cid] for l in LANGUAGES},'script':{l:([drafts[l].intro]+[c.script for c in drafts[l].chapters]+[drafts[l].closing])[i] for l in LANGUAGES}}
        if cid not in ('intro','closing'):c['storyId']=cid
        chapters.append(c)
    return {'date':date,'newsDate':day,'timezone':'America/Los_Angeles','title':en.title,'titleZh':zh.title,'description':en.description,'descriptionZh':zh.description,'items':items,'takeaways':en.takeaways,'takeawaysZh':zh.takeaways,
      'coverageNotes':f'Original sources independently summarized in both languages. Ranking: 70% editorial significance, 30% log-scaled HN engagement. HN comments are a small non-representative sample. {len(failures)} source fetches were unavailable. AI-generated narration; chapter captions are synchronized by rendered audio samples.',
      'coverageNotesZh':f'两种语言分别依据原始报道撰写。排序：新闻重要性占 70%，经对数处理的 HN 参与度占 30%。社区反应来自少量评论抽样，不代表全体意见。{len(failures)} 个来源未能获取。语音由 AI 合成；章节和字幕按实际音频采样时间同步。',
      'media':media,'narration':{l:'\n\n'.join(c['script'][l] for c in chapters) for l in LANGUAGES},'chapters':chapters,
      'quality':{'policy':'source-first-v1','threshold':90,'maxDrafts':MAX_DRAFTS,'scores':{l:{k:v for k,v in reviews[l].model_dump().items() if isinstance(v,int)} for l in LANGUAGES},'apiUsd':round(cost,6)},'updatedAt':dt.datetime.now(dt.timezone.utc).isoformat()}

if __name__=='__main__':main()
