import json
from pathlib import Path

import pytest

from agent.lexicon import Lexicon


@pytest.fixture(scope="session")
def lex():
    return Lexicon(json.loads((Path(__file__).parent / "fixtures/lexicon.json").read_text("utf-8")))
