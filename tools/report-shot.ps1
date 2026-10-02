# Build the report in headless Edge, extract the document, then render it as a tall screenshot and as an A4-landscape PDF.
# Usage: powershell -File tools/report-shot.ps1 -Out <folder> [-Hash report] [-Port 8920]
param([string]$Out, [string]$Hash = "report", [int]$Port = 8920, [int]$H = 9000)
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
New-Item -ItemType Directory -Force $Out | Out-Null
& powershell -ExecutionPolicy Bypass -File "$root\tools\headless.ps1" -Port $Port -Hash $Hash | Select-String -Pattern 'Uncaught|selftest' | ForEach-Object { $_.Line }
$dom = Get-Content "$env:TEMP\dtmass-headless-$Port\dom.html" -Raw -Encoding UTF8
if ($dom -notmatch '<iframe id="reportFrame"[^>]*srcdoc="([^"]*)"') { "no report document"; exit 1 }
Add-Type -AssemblyName System.Web
[IO.File]::WriteAllText("$Out\report-doc.html", [System.Web.HttpUtility]::HtmlDecode($Matches[1]), [Text.Encoding]::UTF8)
$E = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"; $u = "file:///" + ($Out -replace '\\', '/') + "/report-doc.html"
$p = Start-Process -FilePath $E -ArgumentList @('--headless=new', '--disable-gpu', '--no-first-run', "--user-data-dir=$env:TEMP\dtmass-doc1", '--hide-scrollbars', '--virtual-time-budget=8000', "--window-size=1200,$H", "--screenshot=$Out\doc-tall.png", "`"$u`"") -PassThru -NoNewWindow -RedirectStandardError "$env:TEMP\dtmass-doc1.log"; $p.WaitForExit(60000) | Out-Null
$p = Start-Process -FilePath $E -ArgumentList @('--headless=new', '--disable-gpu', '--no-first-run', "--user-data-dir=$env:TEMP\dtmass-doc2", '--virtual-time-budget=8000', '--no-pdf-header-footer', "--print-to-pdf=$Out\doc.pdf", "`"$u`"") -PassThru -NoNewWindow -RedirectStandardError "$env:TEMP\dtmass-doc2.log"; $p.WaitForExit(60000) | Out-Null
$pdf = [IO.File]::ReadAllText("$Out\doc.pdf", [Text.Encoding]::GetEncoding(28591))
"pdf pages: " + ([regex]::Matches($pdf, '/Type\s*/Page[^s]')).Count
