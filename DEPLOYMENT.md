# Windows 11 本地部署文档（FunASR + Ollama qwen3:14b）

本文档专门面向 **Windows 11 服务器**，目标是把项目稳定跑在局域网中：

- 浏览器采集麦克风音频（HTML + JS）
- FastAPI 后端实时调用 FunASR 转写
- 录音结束后调用本机 Ollama 的 `qwen3:14b` 整理文本
- 导出 Markdown 文档

---

## 1. 架构与端口

默认端口：

- Web 应用（FastAPI）：`0.0.0.0:8000`
- Ollama API（本机）：`127.0.0.1:11434`

数据流：

1. 浏览器 `getUserMedia` 采集麦克风。
2. 前端降采样到 16k PCM16，通过 WebSocket 发送到 `/ws/transcribe`。
3. FunASR 在线模型返回实时文本。
4. 点击结束后，离线模型返回最终文本。
5. 调 `/api/optimize`，后端转发给 Ollama `/api/generate`。
6. 返回结构化 Markdown 并支持下载。

---

## 2. Windows 11 环境准备

## 2.1 必备软件

- Windows 11（建议专业版/企业版）
- Python 3.10+（安装时勾选“Add Python to PATH”）
- Git（可选）
- Ollama for Windows

## 2.2 硬件建议

- 最低（可运行）：8 核 CPU + 16GB 内存
- 推荐：更高 CPU / GPU 资源（`qwen3:14b` 对资源需求较高）

---

## 3. 安装 Ollama（Windows）

1. 安装 Ollama Windows 版本。
2. 打开 PowerShell，验证：

```powershell
ollama --version
```

3. 拉取模型：

```powershell
ollama pull qwen3:14b
```

4. 查看模型列表：

```powershell
ollama list
```

5. 检查 API：

```powershell
curl http://127.0.0.1:11434/api/tags
```

> 如果 `curl` 返回 JSON，说明 Ollama 服务可用。

---

## 4. 部署项目（Windows 11）

假设项目路径为：`D:\projects\docker_image_pusher`

## 4.1 打开 PowerShell 进入目录

```powershell
cd D:\projects\docker_image_pusher
```

## 4.2 创建虚拟环境并安装依赖

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -U pip
pip install -r requirements.txt
```

> 首次启动 FunASR 可能下载模型，请确保该机器可联网一次。

## 4.3 启动服务

```powershell
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

---

## 5. 局域网访问（Windows 防火墙）

## 5.1 查询本机 IP

```powershell
ipconfig
```

例如 IPv4 是 `192.168.1.20`，客户端访问：

```text
http://192.168.1.20:8000
```

## 5.2 放行 8000 端口

PowerShell（管理员）执行：

```powershell
netsh advfirewall firewall add rule name="FunASR-Web-8000" dir=in action=allow protocol=TCP localport=8000
```

查看规则：

```powershell
netsh advfirewall firewall show rule name="FunASR-Web-8000"
```

> 不建议开放 11434 到局域网。Ollama 仅本机后端访问即可。

---

## 6. 浏览器麦克风权限（Windows 常见问题）

如果页面无法录音，按以下顺序排查：

1. Windows 设置 -> 隐私和安全性 -> 麦克风，允许应用访问麦克风。
2. 浏览器地址栏 -> 站点设置，允许麦克风权限。
3. 优先先用 `http://localhost:8000` 验证。
4. 若局域网 IP 下策略限制，建议反向代理 HTTPS 后再用。

---

## 7. 已做的 Windows 兼容改造

后端已适配：

1. 静态目录改为 `pathlib.Path` 拼接，避免硬编码 Linux 路径写法。
2. 增加环境变量配置项：
   - `OLLAMA_BASE_URL`（默认 `http://127.0.0.1:11434`）
   - `OLLAMA_MODEL`（默认 `qwen3:14b`）

### 7.1 示例：自定义 Ollama 地址/模型

PowerShell：

```powershell
$env:OLLAMA_BASE_URL="http://127.0.0.1:11434"
$env:OLLAMA_MODEL="qwen3:14b"
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

---

## 8. 开机自启动（Windows 任务计划）

推荐使用“任务计划程序”创建启动任务：

- 触发器：系统启动时 / 用户登录时
- 操作程序：`powershell.exe`
- 参数示例：

```text
-NoProfile -ExecutionPolicy Bypass -Command "cd D:\projects\docker_image_pusher; .\.venv\Scripts\Activate.ps1; uvicorn app.main:app --host 0.0.0.0 --port 8000"
```

---

## 9. 自检与排障

## 9.1 基础检查

```powershell
# 1) 后端语法检查
python -m py_compile app/main.py

# 2) Web 服务检查（先确认已启动）
curl -I http://127.0.0.1:8000/

# 3) Ollama 存活
curl http://127.0.0.1:11434/api/tags
```

## 9.2 常见问题

### A. “整理优化”按钮报错

通常是 Ollama 未运行或未拉模型。

```powershell
ollama list
curl http://127.0.0.1:11434/api/tags
```

### B. 识别慢

- CPU/GPU 不足
- 麦克风质量或环境噪声问题
- 同机负载过高

### C. 局域网能打开页面但不能录音

- Windows 隐私设置未放开麦克风
- 浏览器站点权限未授权
- 该浏览器对非 HTTPS 的远程地址限制更严格

---

## 9.3 一键启动脚本（可选）

项目提供 `scripts/start_windows.ps1`：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start_windows.ps1
```

可选参数：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start_windows.ps1 -HostAddr 0.0.0.0 -Port 8000 -OllamaBaseUrl "http://127.0.0.1:11434" -OllamaModel "qwen3:14b"
```

---


## 11. 你遇到的 8005 端口 WebSocket 404 问题

报错：

`WebSocket connection to 'ws://localhost:8005/ws/transcribe' failed: ... 404`

根因通常是：

1. 你用的是静态服务器（如 `python -m http.server 8005`），它不会提供 WebSocket 路由；
2. 或页面连接到了错误的后端地址/端口。

正确做法：

```powershell
uvicorn app.main:app --host 0.0.0.0 --port 8005
```

然后在页面顶部 **后端地址** 填：

```text
http://localhost:8005
```

若从局域网其它设备访问，请填：

```text
http://<Windows服务器IP>:8005
```

并确保 Windows 防火墙已放行 8005。

---
## 10. 快速命令（Windows）

```powershell
cd D:\projects\docker_image_pusher
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
ollama pull qwen3:14b
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

浏览器访问：`http://<你的Windows服务器IP>:8000`
