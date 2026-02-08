# FunASR + Ollama(Qwen3:14b) 局域网实时语音转文字

这是一个可在局域网部署的实时语音转写工具：

1. 前端（HTML + JS）实时采集麦克风音频。
2. 后端用 **FunASR** 实时识别并返回转写内容。
3. 录音结束后调用本地 **Ollama 的 qwen3:14b** 对文本进行整理优化。
4. 输出为可下载的 Markdown 文档。

---

## 完整部署文档

请优先阅读：

- [本地部署文档（详细版）](./DEPLOYMENT.md)

包含：
- 主机要求与资源建议
- Ollama 安装/启动/模型拉取
- 项目安装、局域网访问、防火墙设置
- 麦克风权限与 HTTPS 注意事项
- systemd 开机自启配置
- 健康检查与故障排查

---

## 快速开始

### 1) 准备模型

```bash
ollama pull qwen3:14b
```

### 2) 安装依赖

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 3) 启动服务

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### 4) 浏览器访问

```text
http://<你的服务器IP>:8000
```

---

## 目录说明

- `app/main.py`：后端 API（WebSocket 实时转写 + 文本优化接口）
- `static/index.html`：前端页面结构
- `static/main.js`：录音、降采样、WebSocket 通信、优化和下载
- `static/styles.css`：前端样式
- `DEPLOYMENT.md`：详细部署手册

---

## 注意事项

- 首次运行 FunASR 会自动下载模型，需要外网。
- 若优化失败，请检查 Ollama 服务是否在 `127.0.0.1:11434` 运行。
- 局域网下麦克风权限可能受浏览器策略影响，请按部署文档中的“麦克风权限注意事项”处理。
