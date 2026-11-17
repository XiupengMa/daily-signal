"""Authenticated data-only publication. No redirects with credentials; no secrets in logs."""
import json
import os
import httpx
from urllib.parse import urlsplit
from .sources import safe_url
from .core import save

def publication_origin(value):
    """Require an explicit public HTTPS origin before attaching credentials."""
    if not value or value != value.strip():
        raise ValueError('Set BRIEFING_SITE_URL to your HTTPS origin')
    parsed = urlsplit(value)
    if parsed.path not in ('', '/') or parsed.query or parsed.fragment:
        raise ValueError('BRIEFING_SITE_URL must be an origin, without a path or query')
    safe_url(value)  # Reject private addresses, userinfo and nonstandard ports.
    return value.rstrip('/')

class Publisher:
    def __init__(self):
        self.client=httpx.Client(base_url=publication_origin(os.environ.get('BRIEFING_SITE_URL','')),headers={'Authorization':'Bearer '+os.environ['BRIEFING_PUBLISH_TOKEN']},timeout=180,follow_redirects=False,trust_env=False)
    def get(self,path): return self.client.get(path)
    def claim(self,date,run_id,resume_of=None):
        r=self.client.post('/api/jobs',json={'date':date,'runId':run_id,**({'resumeOf':resume_of} if resume_of else {})})
        if r.status_code==409: raise RuntimeError('This date already has a run; no duplicate paid generation allowed')
        r.raise_for_status(); return r.json().get('priorApiUsd',0)
    def status(self,date,run_id,state,cost=0,message=''):
        self.client.patch('/api/jobs',json={'date':date,'runId':run_id,'state':state,'apiUsd':cost,'message':message[:240]}).raise_for_status()
    def publish(self,edition,folder,languages=None):
        for lang,track in edition['media'].items():
            if languages is not None and lang not in languages:continue
            for kind,ext,ctype in [('audio','mp3','audio/mpeg'),('video','mp4','video/mp4'),('poster','jpg','image/jpeg')]:
                data=(folder/f'{lang}.{ext}').read_bytes()
                r=self.client.put('/api/upload',params={'key':track[kind]},content=data,headers={'Content-Type':ctype})
                r.raise_for_status()
                if r.json().get('size')!=len(data): raise RuntimeError('Media upload byte count mismatch')
        r=self.client.post('/api/update',json=edition);r.raise_for_status()
        saved=self.get('/api/editions?date='+edition['date']);saved.raise_for_status()
        if saved.json()!=edition: raise RuntimeError('Published metadata differs from source')
        for lang in ('en','zh'):
            r=self.client.get('/api/media/'+edition['media'][lang]['video'],headers={'Range':'bytes=0-1023'})
            if r.status_code!=206: raise RuntimeError('Video byte-range playback failed')
