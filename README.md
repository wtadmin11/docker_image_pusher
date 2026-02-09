# FunASR 局域网实时语音转文字（Windows 11）

本项目现在是 **纯 ASR 实时转写版本**（已移除本地 Qwen3/Ollama 文本整理流程），重点优化低延迟实时识别体验。

## 功能

- 麦克风实时采集音频（前端 HTML + JS）
- WebSocket 流式传输音频到后端
- FunASR 在线模型实时返回 partial 文本并刷新前端文本框
- 结束录音后输出最终识别文本，可下载 `.txt`

## 快速启动（PowerShell）

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8005
```

访问：`http://<你的服务器IP>:8005`

## 关键性能优化（本次）

- 移除了周期性离线回填逻辑，避免长语音和静音后恢复时的阻塞卡顿。
- 移除了本地 Qwen3/Ollama 整理功能，减少 CPU/GPU 与 I/O 竞争。
- 后端仅保留在线流式识别模型，`partial` 每个 chunk 都返回。
- 前端音频块从 `4096` 调整为 `2048`，提升响应速度。

## 模型检查与更换

默认在线模型（支持流式）：

- `iic/speech_paraformer-large_asr_nat-zh-cn-16k-common-vocab8404-online`

运行时检查：

```powershell
curl http://localhost:8005/api/health
```

通过环境变量替换模型：

```powershell
$env:ASR_ONLINE_MODEL="iic/speech_paraformer-large_asr_nat-zh-cn-16k-common-vocab8404-online"
$env:ASR_CHUNK_SIZE="0,10,5"
$env:ASR_ENCODER_CHUNK_LOOK_BACK="4"
$env:ASR_DECODER_CHUNK_LOOK_BACK="1"
uvicorn app.main:app --host 0.0.0.0 --port 8005
```

> 注意：如果替换为非 streaming 模型，实时 partial 刷新会明显变差。

## Windows 一键脚本

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start_windows.ps1
```
