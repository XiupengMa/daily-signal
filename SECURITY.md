# Security policy

## Report privately

Use [GitHub private vulnerability reporting](https://github.com/XiupengMa/daily-signal/security/advisories/new). Do not publish live keys, tokens, raw article archives or reproduction steps against someone else's deployment. If private reporting is unavailable, open an issue asking for a private contact without including exploit details.

Only the current `main` branch is maintained. This is an early project, with no security-response SLA.

## Trust boundaries

- Public CI runs tests/builds only, with read-only repository permissions and no application secrets. It does not deploy or generate news. Dependencies/actions are pinned; Python installation checks hashes. Pinning is reproducibility, not proof that upstream code is safe.
- Production runs belong in a separate private repository. The inactive template refuses execution in a public repository. Public contributions must be reviewed and tested before a fixed source revision is imported into production.
- Never use `pull_request_target` to check out and execute contributor code with credentials. Do not provide secrets to public build previews, fork workflows or self-hosted runners processing untrusted contributions.
- The publisher token authorizes data writes and job management, not code deployment. Generate a separate random token per deployment. Only its SHA-256 hash belongs on the web Worker.
- The runner requires an explicitly configured public HTTPS publishing origin; it rejects userinfo, paths, query strings, private resolved addresses and nonstandard ports. It does not follow credential-bearing redirects or inherit HTTP proxy configuration for publication. DNS validation is a defense-in-depth check, not a network sandbox or protection against every DNS rebinding attack.
- Article requests are bounded, validate public HTTPS destinations at each redirect, and carry no publisher/API credentials. Source text and HN comments are untrusted model input. Models have no tools and cannot choose publication URLs or execute commands. Prompt injection can still contaminate generated prose; review is not a formal safety guarantee.
- Publisher routes fail closed when the token hash is absent, check origin on browser writes, bound bodies, validate media keys and edition schema, and use conditional job claims. Public GET routes serve editions and allowed media only; they cannot trigger a paid model call.

## What must remain private

`.env*`, `.dev.vars*`, access tokens, deployment credentials, source article text, sampled comments, evidence quotes, drafts/reviews, cost ledgers, job recovery archives and provider logs. `.gitignore` is only a guardrail: it does not erase files from Git history or make an already tracked file private.

Do not change a production repository to public. Publish an allowlisted export into a new repository with fresh history. Review *all* tracked files, commit history, Actions logs/artifacts and release assets. The hygiene script is an additional heuristic, not an exhaustive credential detector.

## Response to a leak

1. Revoke/rotate the exposed credential at its provider first; removing a Git commit is insufficient.
2. Rotate both the private runner's publisher token and the Worker's stored hash if publication credentials were exposed.
3. Check provider usage, published editions, repository access and Actions logs/artifacts.
4. Remove affected artifacts and coordinate history cleanup if needed. Assume previous public copies remain available.

Use separate projects/credentials with minimum permissions, provider-side spending alerts, and private operational monitoring. Media access is public and can incur traffic/storage costs. Add provider rate limits and traffic controls appropriate to your audience; the Python ledger cannot cap hosting bills or spending by another program using the same API key.

## Known build-tool advisory (2026-11-17)

[GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf) affects Picomatch's processing of attacker-controlled repeated extglob patterns. Upstream currently lists no patched version. It is a transitive development/build dependency here; this app does not accept visitor-provided glob patterns. Keep development servers bound to loopback, never run contributor builds with production secrets, and retain CI timeouts. These measures limit exposure; they do not fix the upstream regular-expression flaw. Full `npm audit` therefore still reports this advisory and dependent packages, while `npm audit --omit=dev` reports no known runtime advisories at this release. Recheck before deployment.

Patched Esbuild and Satori versions are explicitly overridden in `web/package.json`. Do not run an automatic force-fix that downgrades or replaces the app framework; review compatibility and rebuild instead.
