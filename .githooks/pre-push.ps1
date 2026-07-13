Write-Output "Running pre-push checks: tests and build"
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-Error "npm is not available in PATH"
  exit 1
}
try {
  npm test
} catch {
  Write-Error "Tests failed. Push aborted."
  exit 1
}
try {
  npm run build
} catch {
  Write-Error "Build failed. Push aborted."
  exit 1
}
Write-Output "Pre-push checks passed."