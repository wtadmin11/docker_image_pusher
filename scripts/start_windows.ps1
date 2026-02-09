Param(
  [string]$HostAddr = "0.0.0.0",
  [int]$Port = 8000,
  [string]$AsrOnlineModel = "iic/speech_paraformer-large_asr_nat-zh-cn-16k-common-vocab8404-online"
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

if (-not (Test-Path .venv\Scripts\Activate.ps1)) {
  python -m venv .venv
}

. .\.venv\Scripts\Activate.ps1
python -m pip install -U pip
pip install -r requirements.txt

$env:ASR_ONLINE_MODEL = $AsrOnlineModel

uvicorn app.main:app --host $HostAddr --port $Port
