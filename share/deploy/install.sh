#!/usr/bin/env bash
# Review then run with sudo from a checked-out repository. Does not touch other vhosts.
set -euo pipefail
source_dir="$(cd "$(dirname "$0")/.." && pwd)"
if [[ "$(id -u)" != 0 ]]; then echo "Run with sudo" >&2; exit 1; fi
command -v nginx >/dev/null
python3 -m venv --help >/dev/null
if ! id mypage-share >/dev/null 2>&1; then
  useradd --system --home-dir /var/lib/mypage-share --shell /usr/sbin/nologin mypage-share
fi
install -d -m 755 /opt/mypage-share /opt/mypage-share/web
install -d -m 700 -o mypage-share -g mypage-share /var/lib/mypage-share
install -m 644 "$source_dir/server.py" "$source_dir/requirements.txt" /opt/mypage-share/
install -m 644 "$source_dir/web/"* /opt/mypage-share/web/
python3 -m venv /opt/mypage-share/.venv
/opt/mypage-share/.venv/bin/pip install -r /opt/mypage-share/requirements.txt
install -m 644 "$source_dir/deploy/mypage-share.service" /etc/systemd/system/mypage-share.service
if [[ ! -e /etc/nginx/sites-available/mypage-share ]]; then
  install -m 644 "$source_dir/deploy/nginx-http.conf" /etc/nginx/sites-available/mypage-share
fi
if [[ ! -e /etc/nginx/sites-enabled/mypage-share ]]; then
  ln -s /etc/nginx/sites-available/mypage-share /etc/nginx/sites-enabled/mypage-share
fi
nginx -t
systemctl daemon-reload
systemctl enable --now mypage-share
systemctl restart mypage-share
systemctl reload nginx
echo "Service installed on loopback 3230. Configure HTTPS before pairing devices."
