"""Atomic writers for the static output tree and the scheduler state."""

import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from . import settings


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _atomic_write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
        os.chmod(tmp, 0o644)
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except FileNotFoundError:
            pass
        raise


def write_json(rel: str, obj, base: Path | None = None) -> Path:
    """Write obj as compact JSON to DATA_DIR/rel atomically."""
    path = (base or settings.DATA_DIR) / rel
    data = json.dumps(obj, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode()
    _atomic_write(path, data)
    return path


def write_bytes(rel: str, data: bytes, base: Path | None = None) -> Path:
    path = (base or settings.DATA_DIR) / rel
    _atomic_write(path, data)
    return path


def read_state() -> dict:
    p = settings.STATE_DIR / "state.json"
    try:
        return json.loads(p.read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def write_state(state: dict) -> None:
    _atomic_write(settings.STATE_DIR / "state.json", json.dumps(state, indent=1).encode())
