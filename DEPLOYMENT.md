# 本地部署文档（FunASR + Ollama qwen3:14b）

本文档给你一套可直接落地的本地/局域网部署流程，目标是：

- 浏览器采集麦克风音频（HTML + JS）
- FastAPI 后端实时调用 FunASR 转写
- 录音结束后调用本机 Ollama 的 `qwen3:14b` 做文本整理
- 输出可下载 Markdown

---

## 1. 部署架构与端口

默认服务如下：

- Web 应用（FastAPI + 静态页面）：`0.0.0.0:8000`
- Ollama API：`127.0.0.1:11434`

数据流：

1. 浏览器通过 `getUserMedia` 采集音频。
2. 前端将音频降采样到 16k，转为 PCM16，经 WebSocket 发送到 `/ws/transcribe`。
3. 后端在线模型返回实时文字；结束录音后离线模型产出最终文本。
4. 前端把最终文本发给 `/api/optimize`。
5. 后端请求 Ollama `/api/generate`，由 `qwen3:14b` 输出结构化 Markdown。

---

## 2. 主机要求

## 2.1 操作系统

推荐：Ubuntu 22.04/24.04（其他 Linux/macOS 也可运行）。

## 2.2 软件版本

- Python 3.10+
- pip 23+
- Ollama 最新稳定版

## 2.3 机器配置建议

- CPU-only（可跑，但较慢）：8 核 + 16GB 内存
- GPU（推荐）：NVIDIA 显卡 + 足够显存（14B 模型通常需要较高内存/显存）

> 说明：`qwen3:14b` 对机器要求较高，如果资源不足，整理阶段会慢或失败。

---

## 3. 安装与启动 Ollama

## 3.1 安装 Ollama

按 Ollama 官方方式安装（Linux/macOS）。安装后执行：

```bash
ollama --version
```

## 3.2 启动 Ollama 服务

通常安装后会自动作为服务运行；若未运行：

```bash
ollama serve
```

新开终端检查接口：

```bash
curl http://127.0.0.1:11434/api/tags
```

返回 JSON 则表示可用。

## 3.3 拉取模型

```bash
ollama pull qwen3:14b
```

检查是否存在：

```bash
ollama list
```

---

## 4. 部署本项目

以下命令在项目根目录执行（即包含 `app/`、`static/` 的目录）。

## 4.1 创建虚拟环境并安装依赖

```bash
python -m venv .venv
source .venv/bin/activate
pip install -U pip
pip install -r requirements.txt
```

## 4.2 首次模型下载说明

首次启动时，FunASR 可能会自动下载模型文件，需要外网。
如果你是内网机器，可在有网环境先运行一次，缓存后再迁移。

## 4.3 启动服务（局域网可访问）

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

浏览器访问：

```text
http://<服务器IP>:8000
```

---

## 5. 局域网访问与网络配置

## 5.1 查看服务机 IP

```bash
ip a
```

假设 IP 为 `192.168.1.10`，则客户端访问：

```text
http://192.168.1.10:8000
```

## 5.2 防火墙开放端口（如启用 UFW）

```bash
sudo ufw allow 8000/tcp
sudo ufw status
```

> `11434` 端口只需要本机访问（后端到 Ollama），不建议暴露到局域网。

---

## 6. 浏览器麦克风权限注意事项（非常关键）

浏览器对麦克风权限有安全策略：

- `localhost` 通常可直接授权
- 通过局域网 IP 访问时，不同浏览器策略不同
- 部分浏览器/平台要求 HTTPS 才稳定允许麦克风

如果你发现页面打不开麦克风，优先尝试：

1. 同一台机器先用 `http://localhost:8000` 验证功能。
2. 局域网访问时，手工在浏览器站点权限中允许麦克风。
3. 必要时反向代理成 HTTPS（Nginx + 证书）。

---

## 7. 运行与使用流程

1. 打开页面，选择录音设备。
2. 点“开始录音”，观察实时转写内容。
3. 点“结束录音”，等待最终文本。
4. 点“整理优化”，等待 qwen3:14b 输出。
5. 点“下载 .md”导出结果。

---

## 8. 服务化部署（可选，推荐）

你可以把 Web 应用做成 systemd 服务，开机自启。

新建文件：`/etc/systemd/system/funasr-transcribe.service`

```ini
[Unit]
Description=FunASR Realtime Transcribe Web
After=network.target

[Service]
Type=simple
User=<你的用户名>
WorkingDirectory=<项目绝对路径>
Environment="PATH=<项目绝对路径>/.venv/bin:/usr/bin:/bin"
ExecStart=<项目绝对路径>/.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

启用并启动：

```bash
sudo systemctl daemon-reload
sudo systemctl enable funasr-transcribe
sudo systemctl start funasr-transcribe
sudo systemctl status funasr-transcribe
```

查看日志：

```bash
journalctl -u funasr-transcribe -f
```

---

## 9. 健康检查与排障

## 9.1 基础自检

```bash
# 1) Python 语法
python -m py_compile app/main.py

# 2) Web首页
curl -I http://127.0.0.1:8000/

# 3) Ollama存活
curl http://127.0.0.1:11434/api/tags
```

## 9.2 常见问题

### A. 点击“整理优化”失败

原因通常是 Ollama 未启动或模型不存在。

排查：

```bash
ollama list
curl http://127.0.0.1:11434/api/tags
```

### B. 实时识别慢/卡顿

- 服务器 CPU/GPU 性能不足
- 噪声环境太大
- 局域网不稳定

建议：

- 优先在服务端使用有线网络
- 使用质量更高的麦克风
- 减少同时运行的重负载任务

### C. 麦克风无法启用

- 浏览器权限未允许
- 非 HTTPS 环境被策略限制
- 系统层音频设备未识别

---

## 10. 升级与维护建议

1. 固定依赖版本（本项目已在 `requirements.txt` 固定）。
2. 更新前先备份虚拟环境与项目目录。
3. 如需升级模型，先在测试环境验证延迟和效果。
4. 生产环境建议把 Web 服务与 Ollama 做进程监控（systemd）。

---

## 11. 快速命令清单

```bash
# 进入项目
cd /path/to/docker_image_pusher

# 虚拟环境
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 拉模型
ollama pull qwen3:14b

# 启动应用
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

访问：`http://<你的IP>:8000`
