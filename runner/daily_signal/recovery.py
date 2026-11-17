"""Restore same-day editorial checkpoints from this repository's private audit."""
import json
import re
import shutil

def restore_editorial(source,destination,day):
    evidence=source/'sources.json'
    if not evidence.exists():return False
    if json.loads(evidence.read_text()).get('newsDate')!=day:
        raise RuntimeError('Recovery evidence is for a different news day')
    allowed=re.compile(r'(sources|selected|selection-audit|(?:en|zh)-(?:approved|draft-\d+|review-\d+))\.json')
    destination.mkdir(parents=True,exist_ok=True)
    for path in source.iterdir():
        if path.is_file() and allowed.fullmatch(path.name):shutil.copyfile(path,destination/path.name)
    return True
