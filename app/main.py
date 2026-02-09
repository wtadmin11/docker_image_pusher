import asyncio
import json
import logging
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np
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

ASR_ONLINE_MODEL = os.getenv(
    "ASR_ONLINE_MODEL",
    "iic/speech_paraformer-large_asr_nat-zh-cn-16k-common-vocab8404-online",
)
ASR_CHUNK_SIZE = [int(x) for x in os.getenv("ASR_CHUNK_SIZE", "0,10,5").split(",")]
ASR_ENCODER_LOOKBACK = int(os.getenv("ASR_ENCODER_CHUNK_LOOK_BACK", "4"))
ASR_DECODER_LOOKBACK = int(os.getenv("ASR_DECODER_CHUNK_LOOK_BACK", "1"))


class HealthResponse(BaseModel):
    ok: bool
    ws_path: str
    asr_online_model: str


@dataclass
class StreamSession:
    cache: dict[str, Any] = field(default_factory=dict)
    combined_text: str = ""


class ASRService:
    def __init__(self) -> None:
        logger.info("Loading FunASR streaming model: %s", ASR_ONLINE_MODEL)
        self.online_model = AutoModel(
            model=ASR_ONLINE_MODEL,
            disable_update=True,
        )
        self.chunk_size = ASR_CHUNK_SIZE
        self.encoder_chunk_look_back = ASR_ENCODER_LOOKBACK
        self.decoder_chunk_look_back = ASR_DECODER_LOOKBACK

    def infer_chunk(self, pcm_int16: bytes, session: StreamSession) -> str:
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


app = FastAPI(title="FunASR 实时语音转文字")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

asr_service = ASRService()

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/")
def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(ok=True, ws_path="/ws/transcribe", asr_online_model=ASR_ONLINE_MODEL)


@app.websocket("/ws/transcribe")
@app.websocket("/ws/transcribe/")
async def ws_transcribe(websocket: WebSocket) -> None:
    await websocket.accept()
    session = StreamSession()
    loop = asyncio.get_running_loop()
    try:
        while True:
            message = await websocket.receive()
            if "bytes" in message and message["bytes"] is not None:
                previous = session.combined_text
                text = await loop.run_in_executor(None, asr_service.infer_chunk, message["bytes"], session)
                await websocket.send_text(
                    json.dumps(
                        {
                            "type": "partial",
                            "text": session.combined_text,
                            "delta": text,
                            "changed": session.combined_text != previous,
                        }
                    )
                )
            elif "text" in message and message["text"] is not None:
                event = json.loads(message["text"])
                if event.get("event") == "end":
                    await websocket.send_text(json.dumps({"type": "final", "text": session.combined_text.strip()}))
                    break
    except WebSocketDisconnect:
        logger.info("Client disconnected")
    finally:
        await websocket.close()
