const audioSource = document.getElementById('audioSource');
const refreshDevices = document.getElementById('refreshDevices');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const downloadBtn = document.getElementById('downloadBtn');
const liveText = document.getElementById('liveText');
const statusEl = document.getElementById('status');
const backendUrlInput = document.getElementById('backendUrl');
const saveBackendBtn = document.getElementById('saveBackendBtn');

const TARGET_SAMPLE_RATE = 16000;
const SEND_CHUNK_SAMPLES = 9600; // 约600ms，匹配 FunASR 在线模型常见步长

let ws;
let audioContext;
let processor;
let mediaStream;
let sourceNode;
let finalText = '';
let sendBuffer = new Int16Array(0);

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

function getWsUrls(baseUrl) {
  const u = new URL(baseUrl);
  const wsProtocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  return [`${wsProtocol}//${u.host}/ws/transcribe`, `${wsProtocol}//${u.host}/ws/transcribe/`];
}

async function probeBackend(baseUrl) {
  const res = await fetch(`${baseUrl}/api/health`, { method: 'GET' });
  if (!res.ok) throw new Error('health check failed');
  const data = await res.json();
  if (!data.ok) throw new Error('backend not ready');
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

function downsampleBuffer(buffer, sampleRate, outSampleRate = TARGET_SAMPLE_RATE) {
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
    result[offsetResult] = accum / Math.max(1, count);
    offsetResult += 1;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
}

function appendInt16Buffer(base, addon) {
  const merged = new Int16Array(base.length + addon.length);
  merged.set(base, 0);
  merged.set(addon, base.length);
  return merged;
}

function flushSendBuffer(force = false) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const chunkCount = force ? Math.floor(sendBuffer.length / 1) : Math.floor(sendBuffer.length / SEND_CHUNK_SAMPLES);
  if (chunkCount <= 0) return;

  if (!force) {
    for (let i = 0; i < chunkCount; i += 1) {
      const start = i * SEND_CHUNK_SAMPLES;
      const end = start + SEND_CHUNK_SAMPLES;
      ws.send(sendBuffer.slice(start, end).buffer);
    }
    sendBuffer = sendBuffer.slice(chunkCount * SEND_CHUNK_SAMPLES);
  } else {
    ws.send(sendBuffer.buffer);
    sendBuffer = new Int16Array(0);
  }
}

async function openWebSocketWithFallback(baseUrl) {
  const wsUrls = getWsUrls(baseUrl);
  for (const wsUrl of wsUrls) {
    setStatus(`连接语音服务：${wsUrl}`);
    const socket = new WebSocket(wsUrl);
    const opened = await new Promise((resolve) => {
      let done = false;
      socket.onopen = () => {
        if (!done) {
          done = true;
          resolve(true);
        }
      };
      socket.onerror = () => {
        if (!done) {
          done = true;
          resolve(false);
        }
      };
      socket.onclose = () => {
        if (!done) {
          done = true;
          resolve(false);
        }
      };
      setTimeout(() => {
        if (!done) {
          done = true;
          resolve(false);
        }
      }, 2500);
    });
    if (opened) return socket;
    try {
      socket.close();
    } catch {
      // ignore
    }
  }
  throw new Error('WebSocket 连接建立失败');
}

async function startRecording() {
  finalText = '';
  sendBuffer = new Int16Array(0);
  liveText.value = '';
  downloadBtn.disabled = true;

  const baseUrl = getBackendBaseUrl();
  await probeBackend(baseUrl);
  ws = await openWebSocketWithFallback(baseUrl);

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'partial') {
      if (typeof data.text === 'string') liveText.value = data.text;
      if (data.changed) setStatus('录音中... 正在实时识别');
    }
    if (data.type === 'final') {
      finalText = data.text || liveText.value;
      liveText.value = finalText;
      downloadBtn.disabled = !finalText;
      setStatus('识别完成，可下载文本');
    }
  };

  ws.onerror = () => {
    setStatus('WebSocket 连接失败：请确认后端用 uvicorn 启动且地址正确');
    stopBtn.disabled = true;
    startBtn.disabled = false;
  };

  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: audioSource.value ? { deviceId: { exact: audioSource.value } } : true,
  });

  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  sourceNode = audioContext.createMediaStreamSource(mediaStream);
  processor = audioContext.createScriptProcessor(2048, 1, 1);

  processor.onaudioprocess = (event) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const input = event.inputBuffer.getChannelData(0);
    const downsampled = downsampleBuffer(input, audioContext.sampleRate, TARGET_SAMPLE_RATE);
    const pcm16 = floatTo16BitPCM(downsampled);
    sendBuffer = appendInt16Buffer(sendBuffer, pcm16);
    flushSendBuffer(false);
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

  flushSendBuffer(true);
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ event: 'end' }));
  setStatus('录音已停止，等待最终识别...');
}

function downloadTranscript() {
  const text = finalText || liveText.value;
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `transcript-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

refreshDevices.addEventListener('click', loadDevices);
startBtn.addEventListener('click', async () => {
  try {
    await startRecording();
  } catch {
    setStatus('无法开始录音：请确认后端地址可访问且 /api/health 正常');
  }
});
stopBtn.addEventListener('click', stopRecording);
downloadBtn.addEventListener('click', downloadTranscript);
saveBackendBtn.addEventListener('click', saveBackendUrl);

(async () => {
  backendUrlInput.value = getBackendBaseUrl();
  await navigator.mediaDevices.getUserMedia({ audio: true });
  await loadDevices();
})();
