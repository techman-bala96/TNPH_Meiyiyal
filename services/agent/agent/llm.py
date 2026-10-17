"""Optional LLM fallback. Only consulted when the deterministic grammar understood nothing.
Whatever it returns is validated against the lexicon, so it can never invent a profession or an action."""
from __future__ import annotations

import os
from typing import Protocol

from .lexicon import Lexicon


class LLMHook(Protocol):
    name: str

    def interpret(self, text: str, lang: str, lex: Lexicon) -> dict | None:
        """Return {"node": slug|None, "filters": {...}} or None."""


class NoLLM:
    name = "none"

    def interpret(self, text: str, lang: str, lex: Lexicon) -> dict | None:
        return None


def load_llm() -> LLMHook:
    provider = os.environ.get("AGENT_LLM_PROVIDER", "").strip().lower()
    if not provider:
        return NoLLM()
    # Plug a provider here (e.g. an OpenAI-compatible endpoint via AGENT_LLM_URL / AGENT_LLM_KEY) that maps text to the schema above.
    raise RuntimeError(f"LLM provider '{provider}' is not implemented in this build")


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
