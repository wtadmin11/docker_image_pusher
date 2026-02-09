# Windows 11 部署文档（纯实时 ASR 版）

## 1. 说明

当前版本已移除 Qwen3/Ollama 文档整理，仅保留低延迟实时语音转文字。

## 2. 安装

```powershell
cd D:\projects\docker_image_pusher
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## 3. 启动

```powershell
uvicorn app.main:app --host 0.0.0.0 --port 8005
```

浏览器访问：

```text
http://<Windows服务器IP>:8005
```

## 4. 防火墙

```powershell
netsh advfirewall firewall add rule name="FunASR-Web-8005" dir=in action=allow protocol=TCP localport=8005
```

## 5. 健康检查

```powershell
curl http://localhost:8005/api/health
```

返回应包含：
- `ok: true`
- `ws_path: /ws/transcribe`
- `asr_online_model: ...online`

## 6. 模型更换

```powershell
$env:ASR_ONLINE_MODEL="iic/speech_paraformer-large_asr_nat-zh-cn-16k-common-vocab8404-online"
$env:ASR_CHUNK_SIZE="0,10,5"
$env:ASR_ENCODER_CHUNK_LOOK_BACK="4"
$env:ASR_DECODER_CHUNK_LOOK_BACK="1"
uvicorn app.main:app --host 0.0.0.0 --port 8005
```

## 7. 性能建议

- 使用有线网络与高质量麦克风。
- 尽量避免后台重负载任务。
- 保持 online 模型，不要换成离线模型做实时流式。

## 8. 一键启动脚本

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start_windows.ps1 -Port 8005
```
