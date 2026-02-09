const audioSource = document.getElementById('audioSource');
const refreshDevices = document.getElementById('refreshDevices');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const optimizeBtn = document.getElementById('optimizeBtn');
const downloadBtn = document.getElementById('downloadBtn');
const liveText = document.getElementById('liveText');
const mdText = document.getElementById('mdText');
const statusEl = document.getElementById('status');
const backendUrlInput = document.getElementById('backendUrl');
const saveBackendBtn = document.getElementById('saveBackendBtn');

let ws;
let audioContext;
let processor;
let mediaStream;
let sourceNode;
let finalText = '';

function setStatus(text) {
  statusEl.innerText = `状态：${text}`;
}

function normalizeBaseUrl(url) {
  return url.replace(/\/$/, '');
}

function getBackendBaseUrl() {
  const saved = localStorage.getItem('backendBaseUrl');
  return normalizeBaseUrl(saved || `${location.protocol}//${location.host}`);
}

function getWsUrl(baseUrl) {
  const u = new URL(baseUrl);
  const wsProtocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${wsProtocol}//${u.host}/ws/transcribe`;
}

function saveBackendUrl() {
  const raw = backendUrlInput.value.trim();
  if (!raw) {
    localStorage.removeItem('backendBaseUrl');
    backendUrlInput.value = `${location.protocol}//${location.host}`;
    setStatus('已恢复默认后端地址');
    return;
  }
  try {
    const parsed = new URL(raw);
    const normalized = normalizeBaseUrl(parsed.toString());
    localStorage.setItem('backendBaseUrl', normalized);
    backendUrlInput.value = normalized;
    setStatus(`后端地址已保存：${normalized}`);
  } catch {
    setStatus('后端地址格式错误，请填写 http(s)://host:port');
  }
}

async function loadDevices() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const inputs = devices.filter((d) => d.kind === 'audioinput');
  audioSource.innerHTML = '';
  inputs.forEach((device, idx) => {
    const opt = document.createElement('option');
    opt.value = device.deviceId;
    opt.innerText = device.label || `麦克风 ${idx + 1}`;
    audioSource.appendChild(opt);
  });
}

function floatTo16BitPCM(float32Array) {
  const out = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i += 1) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

function downsampleBuffer(buffer, sampleRate, outSampleRate = 16000) {
  if (outSampleRate === sampleRate) return buffer;
  const ratio = sampleRate / outSampleRate;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;
  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i += 1) {
      accum += buffer[i];
      count += 1;
    }
    result[offsetResult] = accum / count;
    offsetResult += 1;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
}

async function startRecording() {
  finalText = '';
  liveText.value = '';
  mdText.value = '';
  optimizeBtn.disabled = true;
  downloadBtn.disabled = true;

  const baseUrl = getBackendBaseUrl();
  const wsUrl = getWsUrl(baseUrl);
  setStatus(`连接语音服务：${wsUrl}`);

  ws = new WebSocket(wsUrl);
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'partial') {
      liveText.value = data.text;
    }
    if (data.type === 'final') {
      finalText = data.text || liveText.value;
      liveText.value = finalText;
      optimizeBtn.disabled = !finalText;
      setStatus('识别已完成，等待整理');
    }
  };

  ws.onerror = () => {
    setStatus('WebSocket 连接失败：请确认后端是用 uvicorn 启动，并且后端地址正确');
    stopBtn.disabled = true;
    startBtn.disabled = false;
  };

  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onclose = () => reject(new Error('socket closed'));
  }).catch(() => {
    throw new Error('WebSocket 连接建立失败');
  });

  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: audioSource.value ? { deviceId: { exact: audioSource.value } } : true,
  });

  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  sourceNode = audioContext.createMediaStreamSource(mediaStream);
  processor = audioContext.createScriptProcessor(4096, 1, 1);

  processor.onaudioprocess = (event) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const input = event.inputBuffer.getChannelData(0);
    const downsampled = downsampleBuffer(input, audioContext.sampleRate, 16000);
    const pcm16 = floatTo16BitPCM(downsampled);
    ws.send(pcm16.buffer);
  };

  sourceNode.connect(processor);
  processor.connect(audioContext.destination);

  startBtn.disabled = true;
  stopBtn.disabled = false;
  setStatus('录音中...');
}

async function stopRecording() {
  stopBtn.disabled = true;
  startBtn.disabled = false;

  if (processor) processor.disconnect();
  if (sourceNode) sourceNode.disconnect();
  if (audioContext) await audioContext.close();
  if (mediaStream) mediaStream.getTracks().forEach((t) => t.stop());

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ event: 'end' }));
  }

  setStatus('录音已停止，等待最终识别...');
}

async function optimizeText() {
  if (!finalText) return;
  optimizeBtn.disabled = true;
  setStatus('Qwen3 正在整理文本...');

  const baseUrl = getBackendBaseUrl();
  const resp = await fetch(`${baseUrl}/api/optimize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: finalText }),
  });

  if (!resp.ok) {
    setStatus('整理失败，请检查 Ollama 服务和后端地址配置');
    optimizeBtn.disabled = false;
    return;
  }

  const data = await resp.json();
  mdText.value = data.markdown || '';
  downloadBtn.disabled = !mdText.value;
  setStatus('整理完成，可下载文档');
}

function downloadMarkdown() {
  const blob = new Blob([mdText.value], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `transcript-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

refreshDevices.addEventListener('click', loadDevices);
startBtn.addEventListener('click', async () => {
  try {
    await startRecording();
  } catch {
    setStatus('无法开始录音：请检查后端地址、服务端口和浏览器麦克风权限');
  }
});
stopBtn.addEventListener('click', stopRecording);
optimizeBtn.addEventListener('click', optimizeText);
downloadBtn.addEventListener('click', downloadMarkdown);
saveBackendBtn.addEventListener('click', saveBackendUrl);

(async () => {
  backendUrlInput.value = getBackendBaseUrl();
  await navigator.mediaDevices.getUserMedia({ audio: true });
  await loadDevices();
})();
