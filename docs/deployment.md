# Deploy your own instance

This guide uses **Cloudflare Workers + R2** for the web archive and **GitHub-hosted Actions in a private repository** for the scheduled Python process. You supply your own Cloudflare account, bucket, domain, OpenAI project and billing. Nothing in this repository targets the maintainer's production site.

## 1. Preview and test

Use Node 24 and Python 3.12. Run the README checks. `npm run dev` uses local Worker/R2 emulation; `DEMO_MODE=true` serves the fictional fixture when the archive is empty. There is deliberately no sample recording or real news data.

## 2. Deploy the web archive

In `web/wrangler.jsonc`, choose a unique Worker name and R2 bucket name. Set `DEMO_MODE` to `false` before production. Keep Cloudflare account IDs, domain routes and credentials in your private deployment copy.

Authenticate Wrangler interactively and create the bucket in **your** account:

```sh
cd web
npx wrangler login
npx wrangler r2 bucket create YOUR_BUCKET_NAME
npm ci --ignore-scripts
npm run build
npm run deploy
```

The Vite Cloudflare plugin produces `dist/server/wrangler.json`; the deploy script uses that generated configuration. Configure your domain in your Cloudflare account if desired, or use the Worker HTTPS hostname. Enable appropriate public traffic controls and monitor R2/Workers usage.

Generate a random publisher token (at least 32 random bytes) using a password manager or a local secure tool. Save it as `BRIEFING_PUBLISH_TOKEN` in the **private** generation repository's encrypted Actions Secrets. Compute its SHA-256 hex digest locally and install **only the digest** as the Worker secret `RUNNER_TOKEN_SHA256`:

```sh
npx wrangler secret put RUNNER_TOKEN_SHA256
```

Paste the digest at the private prompt. Do not put either token or digest in Git. Do not reuse a deployment API token as the publisher token. The Worker does not need an OpenAI key.

## 3. Create a separate private generation repository

Copy a reviewed commit of this monorepo into a new **private** repository you control. Record that source commit in its private deployment notes. Remove the public CI workflow if it is not needed there. Do not subscribe the private job to public branch updates.

Create these settings in the private repository:

| Setting | Storage | Value |
| --- | --- | --- |
| `OPENAI_API_KEY` | Actions Secret | Dedicated OpenAI project key |
| `BRIEFING_PUBLISH_TOKEN` | Actions Secret | Random token matching the Worker's stored hash |
| `BRIEFING_SITE_URL` | Actions Variable | Your HTTPS origin, with no path, query or credentials |

Copy `examples/private-runner.yml.example` into `.github/workflows/daily.yml` in that **private** repository. The template checks repository privacy and never runs on a PR event. The template uses explicit UTC cron `7,37 15-19 * * *`. Python admits only 08:00–11:59 `America/Los_Angeles`, yielding an 08:07 first attempt and half-hour catch-up opportunities through 11:37 in both PST and PDT. GitHub can delay or drop scheduled events; this is not an exact-time guarantee. Automatic attempts skip any existing daily claim, including failed jobs. Workflow dispatch starts a current-day run; the shared date claim prevents duplicate generation.

Install a CJK font and FFmpeg on any alternative runner. For local manual execution, inject the three settings into the process environment and run `python -m daily_signal` from `runner/`. The `.env.example` is a configuration reference; the application does not automatically load `.env` files. `--collect-only` fetches source material without model calls, but its output must remain private.

Before enabling the first paid run, confirm model availability and price tables in `editor.py` and `media.py` against your OpenAI account, configure provider alerts, and check hosting quotas. Do not remove the daily cap to force a failing edition through. The first run may fail safely if the account cannot use the configured models or quality gates cannot be met.

## 4. Recovery and maintenance

The template retains private JSON audit data for seven days and failed-run media for two days. Those artifacts contain article excerpts, comments and drafts: never upload them to public CI or releases. Delete them sooner if you do not need recovery.

For an explicitly failed run, dispatch with its numeric Actions run ID in `resume_run_id`; the job downloads the matching private audit and retains prior spend. Aborted/crashed jobs that never reached `failed` need manual reconciliation, not an automatic reset. The job restores reviewed editorial files, completed recordings and verified speech chunks from its private audit/media artifacts. It validates each recovered recording before reuse, so completed speech does not require another model call. Older runs that never saved per-segment audio cannot recover those missing bytes. All prior spending still counts against the $5 daily API cap; hosting costs are separate.

Review a fixed new upstream revision, test it without credentials, and import only approved changes into the private copy. Production keys remain in the private repository throughout. Rotate secrets promptly if exposure is suspected; a clean Git history alone does not revoke a leaked key.
