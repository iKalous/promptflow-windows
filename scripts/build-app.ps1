$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$csc = Get-ChildItem "C:\Windows\Microsoft.NET\Framework64\v4*\csc.exe" | Select-Object -Last 1 -ExpandProperty FullName
if (-not $csc) { throw "csc.exe was not found" }
$outDir = Join-Path $root "dist"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
& $csc /nologo /target:winexe /utf8output /r:System.Windows.Forms.dll /out:"$outDir\PromptFlow.exe" (Join-Path $root "launcher\PromptFlowLauncher.cs")
if ($LASTEXITCODE -ne 0) { throw "csc failed: $LASTEXITCODE" }
Write-Output "built $outDir\PromptFlow.exe"
