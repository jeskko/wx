#!/usr/bin/env python3
"""Download the tracks listed in music/playlist.json and re-encode them to 128 kbps MP3.

Usage: python3 music/fetch.py [--force]
Files land next to playlist.json (git-ignored) and are synced to the server by deploy.sh.
Skips files that already exist unless --force.
"""

import json
import shutil
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
UA = "wx.fi music fetch (+https://wx.fi)"


def main() -> int:
    force = "--force" in sys.argv
    tracks = json.loads((HERE / "playlist.json").read_text())["tracks"]
    have_ffmpeg = shutil.which("ffmpeg") is not None
    failed = 0
    for t in tracks:
        out = HERE / t["src"]
        if out.exists() and not force:
            print(f"have  {out.name}")
            continue
        try:
            with tempfile.TemporaryDirectory() as td:
                raw = Path(td) / "in.mp3"
                req = urllib.request.Request(t["download"], headers={"User-Agent": UA})
                with urllib.request.urlopen(req, timeout=60) as r, raw.open("wb") as f:
                    shutil.copyfileobj(r, f)
                if have_ffmpeg:
                    subprocess.run(
                        ["ffmpeg", "-loglevel", "error", "-y", "-i", str(raw), "-map_metadata", "-1",
                         "-metadata", f"title={t['title']}", "-metadata", f"artist={t['artist']}",
                         "-metadata", f"comment={t['license']} {t['url']}",
                         "-vn", "-ac", "2", "-ar", "44100", "-b:a", "128k", str(out)],
                        check=True,
                    )
                else:
                    shutil.copy(raw, out)
            print(f"got   {out.name} ({out.stat().st_size // 1024} KiB)")
        except Exception as e:  # keep going; report at the end
            failed += 1
            print(f"FAIL  {t['src']}: {e}", file=sys.stderr)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
