"""Runner: executes due jobs, records state, writes health.json. Safe to run from a timer."""

import fcntl
import logging
import os
import time
from datetime import datetime

from . import settings
from .jobs import JOBS
from .store import iso, read_state, utcnow, write_json, write_state

log = logging.getLogger(__name__)

# timer fires every 5 min; allow some slack so a 10-min job isn't skipped to 15 min
SLACK_S = 60


def _due(job, st: dict, now: float) -> bool:
    last = st.get("last_run")
    if last is None:
        return True
    # back off on repeated errors: after a failure retry on the next tick, but at most every 5 min
    if st.get("errors", 0) > 0:
        return now - last >= min(job.interval_s, 300) - SLACK_S
    return now - last >= job.interval_s - SLACK_S


def run(force: bool = False, only: list[str] | None = None) -> int:
    settings.STATE_DIR.mkdir(parents=True, exist_ok=True)
    # read-only fd is enough for flock and works even if another user created the file
    lock = os.open(settings.STATE_DIR / "bake.lock", os.O_RDONLY | os.O_CREAT, 0o664)
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        log.warning("another bake is running; exiting")
        return 0

    state = read_state()
    failures = 0
    for job in JOBS:
        if only and job.name not in only:
            continue
        st = state.setdefault(job.name, {})
        now = time.time()
        if not (force or only) and not _due(job, st, now):
            continue
        t0 = time.monotonic()
        st["last_run"] = now
        try:
            summary = job.run()
            st.update(
                last_ok=now, errors=0, last_error=None, summary=summary, duration=round(time.monotonic() - t0, 2)
            )
            log.info("%s ok %.1fs %s", job.name, st["duration"], summary)
        except Exception as e:
            failures += 1
            st.update(errors=st.get("errors", 0) + 1, last_error=f"{type(e).__name__}: {e}"[:500])
            log.exception("%s failed", job.name)
        write_state(state)

    _write_health(state)
    return 1 if failures else 0


def _write_health(state: dict) -> None:
    now = utcnow()
    jobs = {}
    for job in JOBS:
        st = state.get(job.name, {})
        last_ok = st.get("last_ok")
        age = None if last_ok is None else int(now.timestamp() - last_ok)
        jobs[job.name] = {
            "last_ok": iso(datetime.fromtimestamp(last_ok, now.tzinfo)) if last_ok else None,
            "age_s": age,
            "interval_s": job.interval_s,
            "stale": age is None or age > 3 * job.interval_s,
            "errors": st.get("errors", 0),
            "last_error": st.get("last_error"),
        }
    write_json("health.json", {"updated": iso(now), "jobs": jobs})
