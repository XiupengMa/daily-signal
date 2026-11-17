"""Public RSS + HN discovery; bounded article extraction and explicit source failures."""
import concurrent.futures
import datetime as dt
import ipaddress
import socket
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit, urlunsplit, parse_qsl, urlencode
import feedparser
import httpx
import trafilatura
from .core import window, engagement

FEEDS = {
 'Ars Technica':'https://feeds.arstechnica.com/arstechnica/index',
 'The Verge':'https://www.theverge.com/rss/index.xml',
 'TechCrunch':'https://techcrunch.com/feed/',
 'MIT Technology Review':'https://www.technologyreview.com/feed/',
 'Wired':'https://www.wired.com/feed/rss',
}
class FragmentText(HTMLParser):
    def __init__(self):super().__init__(convert_charrefs=True);self.parts=[]
    def handle_data(self,data):self.parts.append(data)

def comment_text(fragment):
    parser=FragmentText();parser.feed(fragment)
    return ' '.join(' '.join(parser.parts).split())

HEADERS={'User-Agent':'DailySignal/1.0 (personal news digest; source links retained)'}

def canonical(url):
    p=urlsplit(url)
    return urlunsplit((p.scheme,p.netloc.lower(),p.path.rstrip('/'),urlencode([(k,v) for k,v in parse_qsl(p.query) if not k.startswith('utm_')]),''))

def safe_url(url):
    p=urlsplit(url)
    if p.scheme != 'https' or not p.hostname or p.username or p.password or p.port not in (None,443):
        raise ValueError('Only public HTTPS sources accepted')
    for info in socket.getaddrinfo(p.hostname,443,type=socket.SOCK_STREAM):
        if not ipaddress.ip_address(info[4][0]).is_global: raise ValueError('Non-public source address')
    return url

def fetch(url, limit=2_000_000):
    for _ in range(5):
        safe_url(url)
        with httpx.stream('GET',url,headers=HEADERS,timeout=25,follow_redirects=False) as r:
            if r.is_redirect:
                url=urljoin(url,r.headers['location']); continue
            r.raise_for_status(); data=bytearray()
            for chunk in r.iter_bytes():
                data.extend(chunk)
                if len(data)>limit: raise ValueError('Source too large')
            return bytes(data),url
    raise ValueError('Too many source redirects')

def article(candidate):
    try:
        raw,url=fetch(candidate['url'])
        import json
        extracted=trafilatura.extract(raw,output_format='json',with_metadata=True,include_comments=False,include_tables=False)
        metadata=json.loads(extracted) if extracted else {}
        text=metadata.get('text','')
        if len(text)<600: raise ValueError('Full article unavailable; title/snippet alone excluded')
        return {**candidate,'url':url,'publishedAt':candidate.get('publishedAt') or metadata.get('date'),'text':text[:18000],'retrievedAt':dt.datetime.now(dt.timezone.utc).isoformat()}
    except Exception as e:
        return {**candidate,'error':type(e).__name__,'text':''}

def collect(day):
    start,end=window(day); candidates={}; failures=[]
    def add(c):
        key=canonical(c['url'])
        if key in candidates:
            old=candidates[key]
            for k in ('hnId','points','comments','hnPostedAt'):
                if c.get(k): old[k]=c[k]
        else: candidates[key]=c
    # HN submission date is discovery only. Editorial gate independently verifies event date.
    for page in range(4):
        url=f'https://hn.algolia.com/api/v1/search?tags=story&numericFilters=created_at_i>={int(start.timestamp())},created_at_i<{int(end.timestamp())}&hitsPerPage=100&page={page}'
        try:
            data=httpx.get(url,timeout=30).raise_for_status().json()
            for h in data['hits']:
                if not h.get('url','').startswith('https://'): continue
                add({'title':h['title'],'url':h['url'],'publisher':'HN-linked source','publishedAt':None,'hnPostedAt':h['created_at'],'hnId':h['objectID'],'points':h.get('points') or 0,'comments':h.get('num_comments') or 0})
            if page+1>=data['nbPages']: break
        except Exception as e: failures.append({'source':'HN','error':type(e).__name__});break
    for name,url in FEEDS.items():
        try:
            raw,_=fetch(url); feed=feedparser.parse(raw)
            if not feed.entries: raise ValueError('Empty feed')
            for e in feed.entries:
                stamp=e.get('published_parsed') or e.get('updated_parsed')
                if not stamp: continue
                published=dt.datetime(*stamp[:6],tzinfo=dt.timezone.utc)
                if start<=published<end and e.get('link','').startswith('https://'):
                    add({'title':e.get('title',''),'url':e.link,'publisher':name,'publishedAt':published.isoformat(),'hnId':None,'points':0,'comments':0})
        except Exception as e: failures.append({'source':name,'error':type(e).__name__})
    # Diversity before ranking: 18 HN + up to 4 from each publisher.
    selected=sorted([c for c in candidates.values() if c.get('hnId')],key=lambda c:engagement(c['points'],c['comments']),reverse=True)[:30]
    for name in FEEDS:
        selected.extend([c for c in candidates.values() if c['publisher']==name][:4])
    selected=list({canonical(c['url']):c for c in selected}.values())
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool: articles=list(pool.map(article,selected))
    usable=[{**c,'id':f's{i+1}'} for i,c in enumerate(articles) if c['text']]
    failures.extend({'source':c['url'],'error':c['error']} for c in articles if not c['text'])
    if len(usable)<6: raise RuntimeError(f'Only {len(usable)} usable original articles; refusing weak edition')
    return {'newsDate':day,'articles':usable,'failures':failures,'collectedAt':dt.datetime.now(dt.timezone.utc).isoformat()}

def discussion(story):
    if not story.get('hnId'): return {'sample':[], 'sampleSize':0,'note':'No matched HN thread'}
    try:
        root=httpx.get('https://hacker-news.firebaseio.com/v0/item/'+story['hnId']+'.json',timeout=20).raise_for_status().json()
        sample=[]
        for cid in (root.get('kids') or [])[:8]:
            c=httpx.get(f'https://hacker-news.firebaseio.com/v0/item/{cid}.json',timeout=15).raise_for_status().json()
            if c and not c.get('deleted') and not c.get('dead') and c.get('text'):
                text=comment_text(c['text'])[:1800]
                if text:sample.append({'id':cid,'text':text})
        return {'sample':sample,'sampleSize':len(sample),'points':root.get('score',0),'comments':root.get('descendants',0),'observedAt':dt.datetime.now(dt.timezone.utc).isoformat(),'note':'Small top-level sample, not a representative community poll'}
    except Exception as e: return {'sample':[],'sampleSize':0,'note':'Discussion unavailable: '+type(e).__name__}
