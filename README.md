# FunASR + Ollama(Qwen3:14b) 局域网实时语音转文字

这是一个可在 **Windows 11 / 局域网** 部署的实时语音转写工具：

1. 前端（HTML + JS）实时采集麦克风音频。
2. 后端用 **FunASR** 实时识别并返回转写内容。
3. 录音结束后调用本地 **Ollama 的 qwen3:14b** 对文本进行整理优化。
4. 输出为可下载的 Markdown 文档。

---

## 完整部署文档（Windows 11）

请优先阅读：

- [Windows 11 本地部署文档（详细版）](./DEPLOYMENT.md)

---

## Windows 11 快速开始

### 1) 准备 Ollama 模型

```powershell
ollama pull qwen3:14b
```

### 2) 安装依赖（PowerShell）

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### 3) 启动服务

```powershell
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### 4) 浏览器访问

```text
http://<你的Windows服务器IP>:8000
```

### 5) 一键启动脚本（可选）

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start_windows.ps1
```

---

## 目录说明

- `app/main.py`：后端 API（WebSocket 实时转写 + 文本优化接口）
- `static/index.html`：前端页面结构
- `static/main.js`：录音、降采样、WebSocket 通信、优化和下载
- `static/styles.css`：前端样式
- `DEPLOYMENT.md`：Windows 11 详细部署手册
- `scripts/start_windows.ps1`：Windows 一键启动脚本

---

## 关键兼容说明

- 后端已改为使用 `pathlib` 处理静态路径，兼容 Windows 路径分隔符。
- 可通过环境变量覆盖 Ollama 地址和模型：
  - `OLLAMA_BASE_URL`（默认 `http://127.0.0.1:11434`）
  - `OLLAMA_MODEL`（默认 `qwen3:14b`）


## WebSocket 404 快速排查

如果你在 `8005` 端口点击“开始录音”出现：

`WebSocket connection ... /ws/transcribe ... 404`

通常是因为当前页面不是由 FastAPI(uvicorn) 提供，而是被 `python -m http.server` 等静态服务器托管，导致没有 `/ws/transcribe` 路由。

请确保使用下面命令启动：

```powershell
uvicorn app.main:app --host 0.0.0.0 --port 8005
```

并在页面“后端地址”中填写：`http://localhost:8005`（或你的服务器 IP + 端口），然后点击“保存地址”。

补充：前端现在会先检测 `GET /api/health`，并自动尝试 `ws://.../ws/transcribe` 与 `ws://.../ws/transcribe/` 两种路径，减少因为代理或尾斜杠导致的 404。

## 本次功能调整

- 后端在录音期间对每个音频分片都发送 `partial` 事件，前端会持续刷新“实时识别文本”框。
- 前端升级为现代蓝色科技风 UI。
- 录音过程中实时识别文本会持续显示在“实时识别文本”框。
- 整理结果改为纯文本输出（非 Markdown），并过滤模型思考内容（如 `<think>...</think>`）。
