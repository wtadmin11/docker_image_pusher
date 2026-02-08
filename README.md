# FunASR + Ollama(Qwen3:14b) 局域网实时语音转文字

这是一个可在局域网部署的实时语音转写工具：

1. 前端（HTML + JS）实时采集麦克风音频。
2. 后端用 **FunASR** 实时识别并返回转写内容。
3. 录音结束后调用本地 **Ollama 的 qwen3:14b** 对文本进行整理优化。
4. 输出为可下载的 Markdown 文档。

## 1. 环境准备

- Python 3.10+
- 已安装并启动 Ollama
- 本地已拉取模型：

```bash
ollama pull qwen3:14b
```

- 首次运行 FunASR 会自动下载模型（需要网络）

## 2. 安装依赖

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## 3. 启动服务

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

然后在同一局域网设备浏览器访问：

```text
http://<你的服务器IP>:8000
```

## 4. 使用流程

1. 进入页面后选择录音设备。
2. 点击「开始录音」进行实时识别。
3. 点击「结束录音」后等待最终识别结果。
4. 点击「整理优化」，调用 qwen3:14b 生成结构化 Markdown。
5. 点击「下载 .md」导出文档。

## 5. 架构说明

- `app/main.py`
  - `WebSocket /ws/transcribe`：接收前端 PCM 音频流并实时回传识别文本
  - `POST /api/optimize`：将最终识别文本送入 Ollama(qwen3:14b) 优化
- `static/index.html`：页面结构
- `static/main.js`：设备枚举、录音、音频降采样、WebSocket 传输、优化与下载
- `static/styles.css`：基础页面样式

## 6. 注意事项

- 浏览器通常要求 HTTPS 或 localhost 才能启用麦克风权限；在局域网使用时，请先在同设备允许麦克风访问。
- 若优化阶段失败，请检查：
  - Ollama 是否运行（默认 `http://127.0.0.1:11434`）
  - 模型 `qwen3:14b` 是否已下载
- 实时识别精度受麦克风质量、环境噪声和网络时延影响。
