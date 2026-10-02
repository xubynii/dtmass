# Boot the tool in headless Edge against the local server; dump console + DOM markers or take a screenshot.
# Usage: powershell -File tools/headless.ps1 [-Hash "plan"] [-Shot path.png] [-W 1500] [-H 950]
param([string]$Hash = "", [string]$Shot = "", [int]$W = 1500, [int]$H = 950, [int]$Port = 8771, [switch]$Dark)
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$sp = Join-Path $env:TEMP ("dtmass-headless-" + $Port); New-Item -ItemType Directory -Force $sp | Out-Null
Remove-Item -Recurse -Force "$sp\prof" -ErrorAction SilentlyContinue
$srv = Start-Process -FilePath python -ArgumentList @("$root\tools\serve.py", "$Port") -PassThru -NoNewWindow -RedirectStandardError "$sp\serve.log"
Start-Sleep -Seconds 1
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$url = "http://127.0.0.1:$Port/index.html"; if ($Hash) { $url += "#$Hash" }
$a = @('--headless=new','--disable-gpu','--use-angle=swiftshader','--enable-logging=stderr','--v=0','--virtual-time-budget=20000','--no-first-run','--no-sandbox',"--user-data-dir=$sp\prof",'--hide-scrollbars','--disable-http-cache','--enable-unsafe-swiftshader',"--window-size=$W,$H")
if ($Dark) { $a += "--force-dark-mode" }
if ($Shot) { $a += "--screenshot=$Shot" } else { $a += "--dump-dom" }
$a += "`"$url`""
$p = Start-Process -FilePath $edge -ArgumentList $a -RedirectStandardError "$sp\edge.log" -RedirectStandardOutput "$sp\dom.html" -PassThru -NoNewWindow
$p.WaitForExit(90000) | Out-Null; if (-not $p.HasExited) { $p.Kill() }
Stop-Process -Id $srv.Id -Force -ErrorAction SilentlyContinue
"dom: $((Get-Item "$sp\dom.html").Length) B  shot: $Shot"
Get-Content "$sp\edge.log" | Where-Object { $_ -match 'CONSOLE|Uncaught' } | ForEach-Object { ($_ -replace '^.*CONSOLE\(\d+\)\] ','') } | Select-Object -First 40
$dom = Get-Content "$sp\dom.html" -Raw
if ($dom -match 'data-selftest="([^"]*)"') { "selftest: " + ($Matches[1] -replace '&quot;','"') }
if ($dom -match 'data-opstest="([^"]*)"') { "opstest: " + ($Matches[1] -replace '&quot;','"' -replace ' \| ',"`n") }
