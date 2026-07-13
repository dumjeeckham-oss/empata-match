Write-Output "Running post-commit: tests and build, then auto-push if OK"
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-Error "npm is not available in PATH"
  exit 1
}
try {
  npm test
  npm run build
} catch {
  Write-Error "Tests or build failed; aborting auto-push."
  exit 1
}
$branch = (git symbolic-ref --short HEAD 2>$null) -as [string]
if (-not $branch) { $branch = "main" }
git push origin $branch