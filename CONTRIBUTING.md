# Contributing

Open an issue for significant behavior changes, then submit a focused pull request with relevant tests. Do not include real news corpora, audit files, credentials or private account details. Use the fictional fixture or small self-authored samples.

Run the checks in the README. Tests must not require credentials, paid model calls or a live production endpoint. Changes to prompts, models, pricing, workflow permissions, publication and dependency versions need explicit maintainer review.

Keep actions pinned to a full commit SHA. Update `web/package-lock.json` with npm when changing dependencies. To refresh the Python lock with uv:

```sh
cd runner
uv pip compile requirements.txt --python-version 3.12 --universal --generate-hashes --output-file requirements.lock
```

Run a separate, budgeted private evaluation before adopting prompt/voice changes in production. Public CI passing does not prove editorial or speech quality. Never wire a public branch or PR directly to production secrets.

Contributions are licensed under the project's MIT license. The public repository is the reusable source distribution; live deployment operations and data remain private.
