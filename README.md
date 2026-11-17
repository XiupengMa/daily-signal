# Daily Signal / 每日科技简报

A source-first English and Mandarin technology briefing: original reporting → independent scripts → review → chaptered audio and captioned video.

Daily Signal combines Hacker News discussion signals with reporting from technology publications. Each language is written directly from original sources. The Chinese edition is **not a translation of the English summary**.

中文：每天从原始报道独立撰写中英文简报，结合新闻价值与 Hacker News 讨论热度排序。先检查事实、日期、术语和文稿质量，再合成语音与字幕视频。中文口音仍有改进空间，自动评分不等于人工事实核查或听感评测。

## What it does

- Selects 4–8 distinct events from the previous day in `America/Los_Angeles`; HN submission dates alone do not establish an event date.
- Ranks 70% editorial significance and 30% logarithmic HN engagement. Comment excerpts are a small, nonrepresentative sample.
- Writes English and Chinese independently, preserving evidence and terminology. A fresh review context scores fidelity, accuracy, terminology, fluency and coverage; all must reach 90/100, with no critical errors, within five drafts.
- Targets 15–20 minutes **per language**. Validates rendered duration and transcript fidelity before publication.
- Produces MP3 audio and MP4 caption cards with chapter timestamps, sources and AI-voice labeling.
- Provides chapter navigation, a readable transcript, language switching, 15-second seeking, and playback speeds of 0.5×, 1×, 1.25×, 1.5×, 1.75× and 2×.
- Reserves estimated API charges before each request, retains uncertain charges, and refuses paid backfills or duplicate daily runs.

## Try the player without credentials

Requires Node.js 24. The demo uses **fictional, self-authored data**, short scripts and placeholder durations. It has no audio/video files and makes no paid model calls.

```sh
cd web
npm ci --ignore-scripts
npm run dev
```

Open the local URL printed by Vite. `DEMO_MODE=true` supplies a fictional edition when the archive is empty. The production player shows media only after your private runner publishes it.

## Check the code

Python 3.12 is the CI target. Tests mock model calls and use no credentials.

```sh
cd runner
python3 -m venv .venv
. .venv/bin/activate
pip install --require-hashes -r requirements.lock
python -m unittest discover -s tests -v
cd ../web
npm test
npm run typecheck
npm run build
cd ..
python3 scripts/check-public-tree.py
```

## Run your own daily briefing

Read [deployment](docs/deployment.md), [architecture and limits](docs/architecture.md), and [security](SECURITY.md).

- **Web:** Cloudflare Workers + R2, with an explicit deployment name and bucket you own.
- **Generation:** an isolated **private** repository and GitHub-hosted scheduled runner. Copy a reviewed source commit there; do not automatically execute public pull requests or the moving public branch with credentials.
- **Credentials:** OpenAI API key and a random publisher token exist only in your private secret store. The web Worker stores only the publisher token's SHA-256 hash. No key belongs in the browser.
- **Budget:** the local API ledger has a $2.40/day ceiling, leaving a planning allowance of $0.60/day for hosting/runner costs. This is not a provider billing cap; pricing, quotas and media traffic must be monitored separately.

This public repository has **no production deployment, scheduled generation, production secrets, editorial audit archives, or real news/media dataset**. Forking it does not grant access to anyone else's OpenAI account or deployment.

## Layout

| Directory | Purpose |
| --- | --- |
| `runner/` | Discovery, editorial review, budget ledger, speech, rendering and authenticated publication |
| `web/` | Player, edition validation, restricted publisher API and R2 storage |
| `web/examples/` | Fictional demo content only |
| `examples/` | Inactive private-workflow template |
| `scripts/` | Public-tree hygiene check |
| `docs/` | Deployment, architecture and maintenance guidance |

## Models and limitations

The initial configuration uses `gpt-6-luna` for writing/review, `gpt-realtime-2.1-mini` with Marin for English, and `gpt-realtime-2.1` with Cedar for Mandarin. Availability and prices depend on your account and can change. The price tables are explicit; update and verify them before changing models. There is no silent fallback to an unpriced model.

The reviewer is a separate call to the same writing model, not an independent human or independent model family. High scores can still miss errors. Mandarin pronunciation, mixed English terminology, and acoustic naturalness remain active improvement areas. A model's own transcript is a fidelity signal, not independent speech recognition or an accent score.

Fetching a public article does not grant redistribution rights. The project publishes paraphrased summaries with original links, keeps evidence excerpts private, and excludes source corpora from this repository. Operators are responsible for source terms and applicable rights.

## Contributing and license

A known upstream build-tool advisory without a released fix is tracked in [SECURITY.md](SECURITY.md#known-build-tool-advisory-2026-11-17).

See [CONTRIBUTING.md](CONTRIBUTING.md). Report vulnerabilities using [private reporting](SECURITY.md), never by posting credentials in an issue.

Project code and fictional examples: [MIT](LICENSE). See [third-party notices](THIRD_PARTY_NOTICES.md) for retained starter attribution and dependencies. News articles, publisher marks and external media are not relicensed by this project.
