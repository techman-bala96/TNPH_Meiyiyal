"""Optional LLM fallback. Only consulted when the deterministic grammar understood nothing.
Whatever it returns is validated against the lexicon, so it can never invent a profession or an action.

AGENT_LLM_PROVIDER:
  ""      off (default)
  mock    offline phrase table, for tests and demos
  openai  any OpenAI-compatible chat-completions endpoint: AGENT_LLM_URL (…/v1), AGENT_LLM_KEY, AGENT_LLM_MODEL
"""
from __future__ import annotations

import json
import os
import re
from typing import Protocol

import httpx

from .lexicon import Lexicon, norm


class LLMHook(Protocol):
    name: str

    def interpret(self, text: str, lang: str, lex: Lexicon) -> dict | None:
        """Return {"node": slug|None, "filters": {...}} or None."""


class NoLLM:
    name = "none"

    def interpret(self, text: str, lang: str, lex: Lexicon) -> dict | None:
        return None


class MockLLM:
    """Everyday phrases the grammar does not know, mapped to professions. Deterministic; no network."""
    name = "mock"
    TABLE: list[tuple[str, str]] = [
        (r"\b(dog|cat|cow|goat|hen|chicken|pet|puppy)\b|நாய்|பூனை|மாடு|ஆடு|கோழி", "professionals--doctor--veterinary"),
        (r"\b(house|building|construct\w*|plan approval|crack\w* in (the )?wall)\b|வீடு கட்ட", "professionals--engineer--civil"),
        (r"\b(divorce|custody|marriage dispute)\b|விவாகரத்து", "professionals--lawyer--family-divorce"),
        (r"\b(land|patta|property|sale deed)\b|பட்டா|நிலம்", "professionals--lawyer--property-land"),
        (r"\b(fever|cough|cold|stomach ache|headache)\b|காய்ச்சல்|இருமல்", "professionals--doctor--allopathy"),
        (r"\b(stress|anxiety|depress\w*|can'?t sleep)\b|மன அழுத்தம்", "professionals--doctor--psychology-counselling"),
    ]

    def interpret(self, text: str, lang: str, lex: Lexicon) -> dict | None:
        t = text.lower()
        for pat, slug in self.TABLE:
            if re.search(pat, t) and slug in lex.nodes:
                filters = {"online_only": True} if re.search(r"\b(now|urgent|immediately)\b|இப்போது|அவசர", t) else {}
                return {"node": slug, "filters": filters}
        return None


class OpenAICompatLLM:
    """Asks a chat model to pick one slug from the live lexicon. JSON only; 6 s timeout; any failure → None (grammar result stands)."""

    def __init__(self, url: str, key: str, model: str, timeout: float = 6.0, transport: httpx.BaseTransport | None = None):
        self.url = url.rstrip("/") + "/chat/completions"
        self.key = key
        self.model = model
        self.name = f"openai:{model}"
        self.client = httpx.Client(timeout=timeout, transport=transport)

    def _catalogue(self, lex: Lexicon) -> str:
        rows = [f"{s} = {n.name.get('en', '')}" for s, n in sorted(lex.nodes.items()) if s.count("--") >= 1]
        return "\n".join(rows[:400])

    def interpret(self, text: str, lang: str, lex: Lexicon) -> dict | None:
        system = ("You route requests on a Tamil Nadu marketplace of verified professionals. Reply with JSON only: "
                  '{"node": "<one slug from the list or null>", "filters": {"online_only": bool, "sort": "rating"|"experience"|"distance"|null}}. '
                  "Never invent slugs. If unsure, node is null.\nAllowed slugs:\n" + self._catalogue(lex))
        try:
            r = self.client.post(self.url, headers={"authorization": f"Bearer {self.key}"}, json={
                "model": self.model, "temperature": 0, "max_tokens": 120, "response_format": {"type": "json_object"},
                "messages": [{"role": "system", "content": system}, {"role": "user", "content": norm(text)[:500]}]})
            r.raise_for_status()
            content = r.json()["choices"][0]["message"]["content"]
            data = json.loads(content)
            return data if isinstance(data, dict) else None
        except (httpx.HTTPError, KeyError, IndexError, ValueError, TypeError):
            return None


def load_llm() -> LLMHook:
    provider = os.environ.get("AGENT_LLM_PROVIDER", "").strip().lower()
    if not provider or provider == "none":
        return NoLLM()
    if provider == "mock":
        return MockLLM()
    if provider == "openai":
        url, key, model = os.environ.get("AGENT_LLM_URL", ""), os.environ.get("AGENT_LLM_KEY", ""), os.environ.get("AGENT_LLM_MODEL", "")
        if not (url and key and model):
            raise RuntimeError("AGENT_LLM_PROVIDER=openai needs AGENT_LLM_URL, AGENT_LLM_KEY and AGENT_LLM_MODEL")
        return OpenAICompatLLM(url, key, model)
    raise RuntimeError(f"unknown AGENT_LLM_PROVIDER '{provider}' (use mock or openai)")


ALLOWED_FILTERS = {"online_only": bool, "sort": (str, type(None)), "show_all": bool, "max_km": (int, type(None))}


def validated(sugg: dict | None, lex: Lexicon) -> dict | None:
    if not isinstance(sugg, dict):
        return None
    node = sugg.get("node")
    if node is not None and node not in lex.nodes:
        return None
    filters = {k: v for k, v in (sugg.get("filters") or {}).items() if k in ALLOWED_FILTERS and isinstance(v, ALLOWED_FILTERS[k])}
    if filters.get("sort") not in (None, "rating", "experience", "distance"):
        filters.pop("sort")
    return {"node": node, "filters": filters}
