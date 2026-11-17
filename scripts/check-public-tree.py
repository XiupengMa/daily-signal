#!/usr/bin/env python3
"""Fail on common secrets, private outputs, mutable Actions or secret-bearing CI.

This is a heuristic guard, not a substitute for reviewing the complete release.
It scans tracked files and never prints matching values.
"""
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
SECRET_PATTERNS = [
    re.compile(rb'sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{24,}'),
    re.compile(rb'gh[pousr]_[A-Za-z0-9]{25,}'),
    re.compile(rb'github_pat_[A-Za-z0-9_]{30,}'),
    re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
    re.compile(rb'AKIA[0-9A-Z]{16}'),
]
FORBIDDEN_PARTS = {'.openai', '.git', '.sites-runtime', 'work', 'recovery', 'audit',
                   'outputs', 'node_modules', '.venv', 'dist', '.wrangler'}
FORBIDDEN_SUFFIXES = {'.mp3', '.mp4', '.wav', '.pcm', '.pem', '.key', '.log', '.zip'}

def violations(path, data):
    errors=[]
    if set(path.parts) & FORBIDDEN_PARTS or path.suffix in FORBIDDEN_SUFFIXES:
        errors.append('private data, credentials or generated output path')
    if path.name.startswith(('.env', '.dev.vars')) and path.name != '.env.example':
        errors.append('local credential configuration')
    if any(pattern.search(data) for pattern in SECRET_PATTERNS):
        errors.append('possible secret pattern')
    if len(data)>1_000_000: errors.append('unexpectedly large tracked file')
    # The public source must have no default connection to a production instance.
    if (b'daily.'+b'cheeseapps.com') in data or (b'/'+b'Users/') in data:
        errors.append('production endpoint or personal filesystem path')
    if path.as_posix().startswith('.github/workflows/'):
        text=data.decode()
        for action in re.findall(r'uses:\s*([^\s#]+)',text):
            if not re.fullmatch(r'[\w.-]+/[\w./-]+@[a-f0-9]{40}',action):
                errors.append('Action is not pinned to a full commit')
        for term in ('secrets.', 'pull_request_target', 'schedule:', 'upload-artifact', 'self-hosted'):
            if term in text: errors.append('public CI contains a privileged or data-retaining operation')
    return errors

def main():
    names=subprocess.check_output(['git','ls-files','-z'],cwd=ROOT).split(b'\0')
    paths=[Path(n.decode()) for n in names if n]
    if not paths: raise SystemExit('No tracked files; stage the candidate release before scanning.')
    findings=[]
    for path in paths:
        target=ROOT/path
        if target.is_symlink(): findings.append((path,'symlink requires manual release review'));continue
        for issue in violations(path,target.read_bytes()): findings.append((path,issue))
    for path,issue in findings: print(f'{path}: {issue}',file=sys.stderr)
    if findings: raise SystemExit(1)
    print(f'Public-tree checks passed: {len(paths)} tracked files; no matches. Review remains required.')

if __name__=='__main__':main()
