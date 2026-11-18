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


def restore_media(source, destination):
    """Copy only media and timing/checkpoint files; never restore a cost ledger."""
    for lang in ('en', 'zh'):
        names = [f'{lang}.{ext}' for ext in ('mp3', 'mp4', 'jpg')]
        names += [f'{lang}/timings.json']
        chunks = source / lang / 'chunks'
        if chunks.exists():
            names += [str(p.relative_to(source)) for p in chunks.iterdir()
                      if re.fullmatch(r'[a-f0-9]{64}\.(json|wav)', p.name)]
        for name in names:
            src, dst = source / name, destination / name
            if src.is_file() and not src.is_symlink():
                dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(src, dst)
