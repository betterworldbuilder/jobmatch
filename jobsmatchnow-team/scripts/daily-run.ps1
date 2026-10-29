# Unattended /daily-run for Windows Task Scheduler (task "JobsMatchNow daily-run", 07:00 daily).
#
#   powershell -ExecutionPolicy Bypass -File scripts\daily-run.ps1          run /daily-run now
#   powershell -ExecutionPolicy Bypass -File scripts\daily-run.ps1 -Test    only check that Claude Code starts and is signed in
#
# Agents draft only (CLAUDE.md rule 2): nothing is sent, posted or submitted. Edits are auto-accepted; shell commands
# are limited to `wsl ...` (the repo lives in WSL). Output goes to logs\daily-run-YYYY-MM-DD.log.
param([switch]$Test)
$ErrorActionPreference = 'Stop'
$Team = '\\wsl.localhost\UbuntuD\home\dzoan\jobmatch3\jobsmatchnow-team'
$WslTeam = '/home/dzoan/jobmatch3/jobsmatchnow-team'

# Newest Claude Code binary from the VS Code extension (its folder name changes with each update).
$claude = Get-ChildItem "$env:USERPROFILE\.vscode\extensions" -Directory -Filter 'anthropic.claude-code-*' |
  Sort-Object { [version](($_.Name -replace '^anthropic\.claude-code-', '') -replace '-.*$', '') } -Descending |
  ForEach-Object { Join-Path $_.FullName 'resources\native-binary\claude.exe' } |
  Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $claude) { throw 'Claude Code binary not found under ~/.vscode/extensions (is the VS Code extension installed?)' }

Set-Location $Team
# From here on, warnings that native commands print on stderr are logged, not treated as failures.
$ErrorActionPreference = 'Continue'
New-Item -ItemType Directory -Force (Join-Path $Team 'logs') | Out-Null
$log = Join-Path $Team ("logs\daily-run-{0}.log" -f (Get-Date -Format 'yyyy-MM-dd'))

$tools = 'Agent Read Write Edit Glob Grep WebSearch WebFetch PowerShell(wsl *)'
if ($Test) {
  & $claude -p 'Reply with exactly: daily-run ready' --allowedTools $tools 2>&1 | Tee-Object -FilePath $log
  exit $LASTEXITCODE
}

$prompt = @"
/daily-run

This run is unattended (Windows Task Scheduler). The repo lives in WSL: run shell commands as
``wsl -d UbuntuD --cd $WslTeam -- <command>`` (for example the dashboard rebuild in step 7, or git and tests in ``../``).
Never send, post, submit or push anything; drafts only.
"@
"=== /daily-run started $(Get-Date -Format s) with $claude ===" | Out-File -FilePath $log -Encoding utf8
& $claude -p $prompt --permission-mode acceptEdits --allowedTools $tools 2>&1 | Out-File -FilePath $log -Append -Encoding utf8
$code = $LASTEXITCODE

# Rebuild the dashboard whatever happened, so the founder sees today's state.
wsl -d UbuntuD --cd $WslTeam -- python3 scripts/build_dashboard.py 2>&1 | Out-File -FilePath $log -Append -Encoding utf8
"=== finished $(Get-Date -Format s), exit $code ===" | Out-File -FilePath $log -Append -Encoding utf8
exit $code
