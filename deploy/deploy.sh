#!/usr/bin/env bash
# Deploy the wx.fi baker (and later the frontend) to the server.
# Needs no sudo: relies on the deploying user being in group "wx" with
# group-write on /opt/wx/code and /opt/wx/html/wx.
set -euo pipefail

HOST="${WX_HOST:-172.16.173.100}"
CODE=/opt/wx/code
DATA=/opt/wx/html/wx/data
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo ">> sync backend -> $HOST:$CODE/backend"
rsync -rlt --delete --chmod=D2775,F664 \
  --exclude .venv --exclude out --exclude var --exclude '__pycache__' --exclude '*.egg-info' --exclude .pytest_cache \
  "$ROOT/backend/" "$HOST:$CODE/backend/"

echo ">> systemd user units -> ~wx/.config/systemd/user"
ssh "$HOST" "umask 002; mkdir -p $CODE/.config/systemd/user; find $CODE/.config -user \$(id -un) -exec chgrp wx {} + ; find $CODE/.config -user \$(id -un) -type d -exec chmod 2775 {} +"
rsync -t --chmod=F664 "$ROOT/deploy/wx-bake.service" "$ROOT/deploy/wx-bake.timer" "$HOST:$CODE/.config/systemd/user/"

echo ">> venv + dirs"
ssh "$HOST" bash -s <<EOF
set -euo pipefail
umask 002
for d in "$DATA" "$CODE/var"; do
  mkdir -p "\$d"; chgrp wx "\$d"; chmod 2775 "\$d"
done
[ -x "$CODE/venv/bin/python" ] || python3 -m venv "$CODE/venv"
"$CODE/venv/bin/pip" install -q --upgrade pip
"$CODE/venv/bin/pip" install -q "$CODE/backend"
chgrp -R wx "$CODE/venv" "$CODE/backend" 2>/dev/null || true
echo "baker installed: \$("$CODE/venv/bin/python" -c 'import wx; print(wx.__version__)')"
EOF

if [ "${SKIP_FRONTEND:-0}" != 1 ]; then
  echo ">> build frontend"
  (cd "$ROOT/frontend" && npm run --silent build)
  echo ">> sync frontend -> /opt/wx/html/wx/app + /opt/wx/html/index.html"
  rsync -rlt --delete --chmod=D2775,F664 "$ROOT/frontend/dist/app/" "$HOST:/opt/wx/html/wx/app/"
  # only this one file at the webroot level is ours; overwrite in place (keeps wx owner/group)
  ssh "$HOST" "cat > /opt/wx/html/index.html" < "$ROOT/frontend/dist/index.html"
  echo ">> sync music -> /opt/wx/html/wx/music"
  rsync -rlt --delete --chmod=D2775,F664 "$ROOT/music/" "$HOST:/opt/wx/html/wx/music/"
fi
echo ">> done"
