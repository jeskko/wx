"""CLI: python -m wx bake [--force] [--only obs,forecast] | python -m wx jobs"""

import argparse
import logging
import sys

from . import bake, settings
from .jobs import JOBS


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="wx")
    sub = ap.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("bake", help="run due jobs")
    b.add_argument("--force", action="store_true", help="run all jobs regardless of schedule")
    b.add_argument("--only", help="comma-separated job names (implies --force for them)")
    b.add_argument("-v", "--verbose", action="store_true")
    sub.add_parser("jobs", help="list jobs")
    args = ap.parse_args(argv)

    if args.cmd == "jobs":
        for j in JOBS:
            print(f"{j.name:10s} every {j.interval_s // 60:4d} min")
        return 0

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.info("data dir %s, state dir %s", settings.DATA_DIR, settings.STATE_DIR)
    only = [s.strip() for s in args.only.split(",")] if args.only else None
    if only:
        unknown = set(only) - {j.name for j in JOBS}
        if unknown:
            ap.error(f"unknown job(s): {', '.join(sorted(unknown))}")
    return bake.run(force=args.force, only=only)


if __name__ == "__main__":
    sys.exit(main())
