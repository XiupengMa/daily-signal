"""Deterministic policies, dates, and persistent conservative cost accounting."""
import datetime as dt
import hashlib
import json
import math
import os
import re
from pathlib import Path
from zoneinfo import ZoneInfo

TZ = ZoneInfo('America/Los_Angeles')
LANGUAGES = ('en', 'zh')

def window(day):
    day = dt.date.fromisoformat(day)
    return (dt.datetime.combine(day, dt.time(), TZ), dt.datetime.combine(day + dt.timedelta(days=1), dt.time(), TZ))

def dates(now=None):
    now = (now or dt.datetime.now(dt.timezone.utc)).astimezone(TZ)
    return now.date().isoformat(), (now.date() - dt.timedelta(days=1)).isoformat()

def save(path, value):
    path = Path(path); path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
    tmp.replace(path)

def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()

def engagement(points, comments):
    return min(100, 15 * math.log1p(max(0, comments)) + 5 * math.log1p(max(0, points)))

def score(importance, points, comments):
    return round(.70 * importance + .30 * engagement(points, comments), 2)

def units(text, lang):
    return len(re.findall(r'[\u3400-\u9fff]|[A-Za-z0-9]+', text)) if lang == 'zh' else len(text.split())

class Budget:
    """Reserve the full possible request charge BEFORE sending. Unknown outcomes stay charged.
    A successful response replaces the reservation with metered usage. Unknown charges stay reserved.
    API ceiling $2.40 leaves $0.60/day for hosting/runner (provider bills remain authoritative).
    """
    def __init__(self, path, limit=2.40):
        self.path = Path(path); self.limit = min(float(limit), 2.40)
        self.entries = json.loads(self.path.read_text()) if self.path.exists() else []
    @property
    def spent(self): return sum(e['usd'] for e in self.entries)
    def reserve(self, label, usd):
        if self.spent + usd > self.limit:
            raise RuntimeError(f'Daily API budget exhausted: ${self.spent:.3f} + ${usd:.3f} > ${self.limit:.2f}')
        self.entries.append({'label': label, 'usd': usd, 'state': 'reserved'})
        save(self.path, self.entries); return len(self.entries)-1
    def settle(self, index, usd):
        if usd > self.entries[index]['usd'] + .001:
            self.entries[index].update(usd=usd, state='pricing-mismatch'); save(self.path, self.entries)
            raise RuntimeError('Metered charge exceeded reservation; pricing configuration needs review')
        self.entries[index].update(usd=usd, state='metered'); save(self.path, self.entries)
