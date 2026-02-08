Param(
  [string]$HostAddr = "0.0.0.0",
  [int]$Port = 8000,
  [string]$OllamaBaseUrl = "http://127.0.0.1:11434",
  [string]$OllamaModel = "qwen3:14b"
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

if (-not (Test-Path .venv\Scripts\Activate.ps1)) {
  python -m venv .venv
}

. .\.venv\Scripts\Activate.ps1
python -m pip install -U pip
pip install -r requirements.txt

$env:OLLAMA_BASE_URL = $OllamaBaseUrl
$env:OLLAMA_MODEL = $OllamaModel

uvicorn app.main:app --host $HostAddr --port $Port
