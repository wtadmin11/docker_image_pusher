import asyncio
import json
import logging
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np
import requests
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from funasr import AutoModel
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "static"
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen3:14b")


class OptimizeRequest(BaseModel):
    text: str


class OptimizeResponse(BaseModel):
    markdown: str


@dataclass
class StreamSession:
    cache: dict[str, Any] = field(default_factory=dict)
    combined_text: str = ""
    audio_chunks: list[bytes] = field(default_factory=list)


class ASRService:
    def __init__(self) -> None:
        logger.info("Loading FunASR model, this may take some time...")
        self.online_model = AutoModel(
            model="iic/speech_paraformer-large_asr_nat-zh-cn-16k-common-vocab8404-online",
            disable_update=True,
        )
        self.offline_model = AutoModel(
            model="iic/speech_paraformer-large-vad-punc_asr_nat-zh-cn-16k-common-vocab8404-pytorch",
            vad_model="fsmn-vad",
            punc_model="ct-punc-c",
            disable_update=True,
        )
        self.chunk_size = [0, 10, 5]
        self.encoder_chunk_look_back = 4
        self.decoder_chunk_look_back = 1

    def infer_chunk(self, pcm_int16: bytes, session: StreamSession) -> str:
        session.audio_chunks.append(pcm_int16)
        samples = np.frombuffer(pcm_int16, dtype=np.int16).astype(np.float32) / 32768.0
        if samples.size == 0:
            return ""

        result = self.online_model.generate(
            input=samples,
            cache=session.cache,
            is_final=False,
            chunk_size=self.chunk_size,
            encoder_chunk_look_back=self.encoder_chunk_look_back,
            decoder_chunk_look_back=self.decoder_chunk_look_back,
            use_itn=True,
        )

        text = ""
        if isinstance(result, list) and result:
            text = result[0].get("text", "")
        elif isinstance(result, dict):
            text = result.get("text", "")

        if text:
            session.combined_text += text
        return text

    def infer_final(self, session: StreamSession) -> str:
        pcm = b"".join(session.audio_chunks)
        samples = np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768.0
        if samples.size == 0:
            return ""
        result = self.offline_model.generate(input=samples, use_itn=True)
        if isinstance(result, list) and result:
            return result[0].get("text", "").strip()
        if isinstance(result, dict):
            return result.get("text", "").strip()
        return session.combined_text.strip()


class OllamaService:
    def __init__(self, base_url: str = OLLAMA_BASE_URL) -> None:
        self.base_url = base_url.rstrip("/")

    def optimize(self, text: str) -> str:
        prompt = (
            "你是一名中文会议记录编辑助手。请在不丢失关键信息的前提下，对下面语音识别文本进行整理：\n"
            "1) 修正明显口语化和语病；\n"
            "2) 按主题分段，补充小标题；\n"
            "3) 输出为结构清晰的 Markdown；\n"
            "4) 如果出现听不清或不确定内容，用【待确认】标注。\n\n"
            f"原始文本：\n{text}\n"
        )
        payload = {
            "model": OLLAMA_MODEL,
            "prompt": prompt,
            "stream": False,
            "options": {"temperature": 0.2},
        }
        response = requests.post(f"{self.base_url}/api/generate", json=payload, timeout=300)
        response.raise_for_status()
        data = response.json()
        return data.get("response", "").strip()


app = FastAPI(title="FunASR + Qwen3 实时语音转文字")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

asr_service = ASRService()
ollama_service = OllamaService()

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/")
def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.websocket("/ws/transcribe")
async def ws_transcribe(websocket: WebSocket) -> None:
    await websocket.accept()
    session = StreamSession()
    loop = asyncio.get_running_loop()
    try:
        while True:
            message = await websocket.receive()
            if "bytes" in message and message["bytes"] is not None:
                text = await loop.run_in_executor(None, asr_service.infer_chunk, message["bytes"], session)
                if text:
                    await websocket.send_text(json.dumps({"type": "partial", "text": session.combined_text}))
            elif "text" in message and message["text"] is not None:
                event = json.loads(message["text"])
                if event.get("event") == "end":
                    final_text = await loop.run_in_executor(None, asr_service.infer_final, session)
                    await websocket.send_text(json.dumps({"type": "final", "text": final_text}))
                    break
    except WebSocketDisconnect:
        logger.info("Client disconnected")
    finally:
        await websocket.close()


@app.post("/api/optimize", response_model=OptimizeResponse)
def optimize(req: OptimizeRequest) -> OptimizeResponse:
    markdown = ollama_service.optimize(req.text)
    return OptimizeResponse(markdown=markdown)
