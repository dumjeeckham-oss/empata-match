Git hooks for this repository

Enable hooks (one-time for this clone):

```bash
git config core.hooksPath .githooks
```

Provided hooks:
- `pre-push` / `pre-push.ps1` — prevents push when `npm test` or `npm run build` fail.
- `post-commit` / `post-commit.ps1` — runs `npm test` and `npm run build` after commit, and attempts to push the current branch if both succeed.

Notes:
- These hooks are **optional**. They run locally and require dev machine to have `npm` available and valid Git credentials.
- Do NOT store secrets in hook files. For automated CI checks, use GitHub Actions in `.github/workflows/` instead.

To disable hooks temporarily:

```bash
git config core.hooksPath .githooks_disabled
```

For Windows PowerShell users, prefer the `.ps1` variants and run PowerShell with appropriate execution policy.
