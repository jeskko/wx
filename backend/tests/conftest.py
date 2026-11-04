import json
from pathlib import Path

import pytest

FIX = Path(__file__).parent / "fixtures"


@pytest.fixture
def fixture_bytes():
    return lambda name: (FIX / name).read_bytes()


@pytest.fixture
def fixture_json():
    return lambda name: json.loads((FIX / name).read_text())


@pytest.fixture
def tmp_dirs(tmp_path, monkeypatch):
    from wx import settings

    data, state = tmp_path / "data", tmp_path / "state"
    monkeypatch.setattr(settings, "DATA_DIR", data)
    monkeypatch.setattr(settings, "STATE_DIR", state)
    return data, state
