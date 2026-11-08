$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$pythonPath = Join-Path $projectRoot 'node_modules/.qa/pdf2zh-venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $pythonPath)) {
    throw 'Local PDF environment is missing. See tools/literature/README.md for setup.'
}
Write-Host 'MediTerm local literature: http://127.0.0.1:7868/ (keep this process running)'
& $pythonPath (Join-Path $PSScriptRoot 'local_server.py')
