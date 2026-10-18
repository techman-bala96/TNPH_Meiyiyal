"""Meiyiyal voice agent API. Run: uvicorn agent.main:app --port 8787"""
from __future__ import annotations

import os
import time
from collections import defaultdict, deque

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .auth import current_user
from .lexicon import LexiconStore
from .llm import load_llm, validated
from .parser import parse
from .stt import MAX_BYTES, SttError, load_stt

app = FastAPI(title="Meiyiyal agent", version="1.0")
app.add_middleware(CORSMiddleware, allow_origins=[o for o in os.environ.get("AGENT_CORS", "http://localhost:8080,http://localhost:8090").split(",") if o],
                   allow_methods=["POST", "GET"], allow_headers=["authorization", "content-type"])
store = LexiconStore(ttl=int(os.environ.get("AGENT_LEXICON_TTL", "600")))
llm = load_llm()
stt = load_stt()
RATE = int(os.environ.get("AGENT_RATE_PER_HOUR", "120"))
_hits: dict[str, deque] = defaultdict(deque)


class ParseIn(BaseModel):
    text: str = Field(max_length=500)
    lang: str | None = Field(default=None, pattern="^(en|ta)$")
    pending: dict | None = None
    context: dict | None = None


def _rate(uid: str):
    q, now = _hits[uid], time.time()
    while q and q[0] < now - 3600:
        q.popleft()
    if len(q) >= RATE:
        raise HTTPException(429, "too many voice commands, try again later")
    q.append(now)


@app.get("/agent/health")
def health():
    lex = store.get()
    return {"ok": True, "nodes": len(lex.nodes), "areas": len(lex.areas), "llm": llm.name, "stt": stt.name if stt else None}


@app.post("/agent/parse")
def parse_route(body: ParseIn, user: dict = Depends(current_user)):
    _rate(user["sub"])
    lex = store.get()
    res = parse(body.text, lex, body.lang, body.pending, body.context)
    if res["action"] == "ask" and res["question"]["slot"] == "profession" and not body.pending:
        sugg = validated(llm.interpret(body.text, res["lang"], lex), lex)
        if sugg and sugg["node"]:
            res = parse(lex.name(sugg["node"]), lex, res["lang"], {"slot": "llm", "options": [], "filters": {**res["filters"], **sugg["filters"]}}, body.context)
            res["source"] = f"llm:{llm.name}"
    return res


@app.post("/agent/stt")
async def stt_route(request: Request, lang: str = Query(default="en", pattern="^(en|ta)$"), user: dict = Depends(current_user)):
    """Raw audio body (audio/webm;codecs=opus, audio/ogg or audio/mp4). Returns {"text", "provider"}; audio is not kept."""
    if stt is None:
        raise HTTPException(503, "server speech-to-text is not configured")
    _rate(user["sub"])
    mime = request.headers.get("content-type", "").split(";")[0].strip().lower()
    if not mime.startswith("audio/"):
        raise HTTPException(415, "audio body required")
    audio = b""
    async for chunk in request.stream():
        audio += chunk
        if len(audio) > MAX_BYTES:
            raise HTTPException(413, "audio too long")
    if not audio:
        raise HTTPException(400, "empty audio")
    try:
        text = stt.transcribe(audio, mime, lang)
    except SttError as e:
        raise HTTPException(502, f"speech service error: {e}") from e
    return {"text": text, "provider": stt.name}
