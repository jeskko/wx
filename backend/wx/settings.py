"""Runtime settings, overridable with environment variables."""

import os
from pathlib import Path

from . import __version__

# Where the static JSON goes. On the server: /opt/wx/html/wx/data
DATA_DIR = Path(os.environ.get("WX_DATA_DIR", "out/wx/data")).resolve()
# Scheduler state, lock file. On the server: /opt/wx/code/var
STATE_DIR = Path(os.environ.get("WX_STATE_DIR", "var")).resolve()

USER_AGENT = os.environ.get("WX_USER_AGENT", f"wx.fi/{__version__} (+https://wx.fi)")
HTTP_TIMEOUT = float(os.environ.get("WX_HTTP_TIMEOUT", "30"))
